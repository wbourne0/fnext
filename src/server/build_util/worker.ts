import { Request } from 'express';
import {
  parentPort as _parentPort,
  workerData as untypedWorkerData,
} from 'worker_threads';
import type { BuildMeta } from './types';
import type { DocumentProps } from 'fnext/document';
import type { PageComponent } from 'fnext/types';

if (!_parentPort) {
  throw new Error('expected to run as worker');
}

const parentPort = _parentPort;

export interface WorkerResponseReady {
  type: 'ready';
}

export interface WorkerResponseData {
  type: 'data';
  data: string;
}

export interface WorkerResponseError {
  type: 'error';
  error: any;
}

export type WorkerResponse =
  | WorkerResponseData
  | WorkerResponseError
  | WorkerResponseReady;

const { documentPath, entrypointPath, appPath }: BuildMeta = untypedWorkerData;

function sendResponse(resp: WorkerResponse) {
  parentPort.postMessage(resp);
}

let Document: typeof import('fnext/document');
let App: typeof import('fnext/app');
let entrypoint: typeof import('__fnext_injected/node_entrypoint');

Promise.all([
  import(documentPath).then((result: typeof import('fnext/document')) => {
    Document = result;
  }),
  import(entrypointPath).then(
    (results: typeof import('__fnext_injected/node_entrypoint')) => {
      entrypoint = results;
    }
  ),
  import(appPath).then((results: typeof import('fnext/app')) => {
    App = results;
  }),
]).then(() => {
  sendResponse({ type: 'ready' });
});

export interface WorkerRequest
  extends Omit<DocumentProps, 'pageContent' | 'props' | keyof BuildMeta> {
  pageHttpPath: string;
  isHotLoad: boolean;
  routerData: {
    url: string;
    query: Request['query'];
    asPath: string;
  };
  appHttpPath: string;
  domHttpPath: string;
  devHooksHttpPath?: string;
  devHooksListenEndpoint?: string;
}

parentPort.on(
  'message',
  async ({
    imports,
    pagePath,
    isHotLoad,
    routerData,
    appHttpPath,
    domHttpPath,
    pageHttpPath,
    devHooksHttpPath,
    devHooksListenEndpoint,
  }: WorkerRequest) => {
    try {
      const exports = await import(`file://${pagePath}`);

      // at this point the component must be valid (as it must be rendered once at compile time)
      const component: PageComponent =
        (typeof exports === 'object' && exports.default) || exports;

      let serverProps: { pageProps: {} };

      // Each worker should only process one job at a time and are in isolated contexts
      entrypoint.__setRouterData(routerData);

      if (App.getServerSideProps) {
        serverProps = await App.getServerSideProps({
          ctx: {},
          AppTree: component,
          getServerSidePageProps: exports.getServerSideProps,
        });
      } else {
        serverProps = {
          pageProps: exports.getServerSideProps
            ? await exports.getServerSideProps({})
            : {},
        };
      }

      if (isHotLoad) {
        sendResponse({
          type: 'data',
          data: JSON.stringify({ serverSideProps: serverProps }),
        });

        return;
      }

      const props = await App.default.getInitialProps({
        ctx: {
          serverSideProps: serverProps.pageProps,
        },
        serverSideProps: serverProps,
        AppTree: component,
      });

      const html = entrypoint.renderToString(
        entrypoint.createElement(App.default, {
          ...props,
          Component: component,
        })
      );

      sendResponse({
        type: 'data',
        data:
          '<!DOCTYPE html>' +
          entrypoint.renderToString(
            entrypoint.createElement(Document.default, {
              appPath: appHttpPath,
              imports,
              pagePath: pageHttpPath,
              props: {
                ...props,
                __fnext_data: { devHooksListenEndpoint, routerData },
              },
              devHooksPath: devHooksHttpPath,
              pageContent: html,
              domPath: domHttpPath,
            })
          ),
      });
    } catch (error) {
      sendResponse({
        type: 'error',
        error,
      });
    }
  }
);
