import { join, relative } from 'path';
import { createReadStream, readFileSync } from 'fs';
import { addAsync } from '@awaitjs/express';
import type { ParsedQs } from 'qs';
// import document from './dist/ssr/_document';
import { renderToNodeStream, renderToStaticMarkup } from 'react-dom/server';
import createApp, { Router, Request, Response, urlencoded } from 'express';

import React from 'react';
import { readFile } from 'fs/promises';

interface PageProps {}

declare global {
  const __IS_PROD__: boolean;

  namespace FNext {
    interface RouterProps {
      url: string;
      query: ParsedQs;
      asPath: string;
    }

    interface PageComponent<P = {}, S = {}, SS = {}>
      extends React.ComponentFactory<P, React.Component<P, S, SS>> {
      getInitialProps?(props: GetInitialPropsUserContext): Promise<object>;
    }
    

  }
}

const rootDir = process.cwd();
const distDir = join(rootDir, 'dist');

const chunkDir = join(distDir, 'chunks');
const pagesDir = join(distDir, 'pages');

let meta: Record<string, Omit<FNext.internal.PageMeta, 'props'>> = {};
let Document: typeof import('../document')['default'];
let App: typeof import('../app')['default'];
let createElement: typeof import('../../injected/node_entrypoint')['createElement'];

let appMeta: Omit<FNext.internal.PageMeta, 'props'>;
let docMeta: Omit<FNext.internal.PageMeta, 'props'>;

// This file is likely to be highly requested, so we'll keep it in memory.
let domFile: Buffer;

async function setup() {
  try {
    const metaRaw = readFileSync(join(distDir, 'meta.json'), {
      encoding: 'utf-8',
    });

    meta = JSON.parse(metaRaw);
  } catch {
    throw new Error(
      'Unable to read meta.json, is this a valid production build?'
    );
  }

  domFile = await readFile(
    join(rootDir, meta['__fnext_injected:dom.tsx'].path)
  );

  // TODO: clean up the extensions mess
  appMeta =
    'pages/_app.tsx' in meta
      ? meta['pages/_app.tsx']
      : meta['__fnext_injected:_app.tsx'];
  docMeta =
    'pages/_document.tsx' in meta
      ? meta['pages/_document.tsx']
      : meta['__fnext_injected:_document.tsx'];

  if (!appMeta || !docMeta) {
    throw new Error('Not a valid production build');
  }

  const [appExports, docExports, entrypoint] = await Promise.all([
    import(join(rootDir, appMeta.path)),
    import(join(rootDir, docMeta.path)),
    import(
      join(rootDir, meta['__fnext_injected:node_entrypoint.ts'].path)
    ) as Promise<typeof import('__fnext_injected/node_entrypoint')>,
  ]);

  if (!appExports) {
    throw new Error('Unable to fetch exports for _app.tsx, aborting.');
  }

  if (!docExports) {
    throw new Error('Unable to fetch exports for _document.tsx, aborting.');
  }

  App = 'default' in appExports ? appExports.default : appExports;
  Document = 'default' in docExports ? docExports.default : docExports;
  createElement = entrypoint.createElement;
}

const initPromise = setup().catch((err) => {
  console.error(err);
  process.exit(1);
});

// if (meta['pages/_app.tsx'])

const app = createApp();
const router = addAsync(Router());

type PageName = RemovePrefix<
  Exclude<keyof typeof meta, `__fnext_injected:${any}`>,
  'pages/'
>;

type RemovePrefix<
  Str extends string,
  Prefix extends string
> = Str extends `${Prefix}${infer T}` ? T : Str;

function resolve(page: PageName) {
  console.log(page);
  const pageMeta = meta[`pages/${page}`];
  return {
    abs: join(rootDir, pageMeta.path),
    path: relative('dist', pageMeta.path),
    imports: pageMeta.imports.map((path) => relative('dist', path)),
  };
}

function isPage(path: string): path is PageName {
  console.log(path, join('pages', path));
  return join('pages', path) in meta;
}

async function getProps(
  req: Request,
  absPath: string,
  isHotLoad: boolean
): Promise<object> {
  const exports = await import(`file://${absPath}`);

  // at this point the component must be valid (as it must be rendered once at compile time)
  const component: FNext.PageComponent =
    (typeof exports === 'object' && exports.default) || exports;

  let serverProps = await App.getServerSideProps({ req, AppTree: component });

  if (!isHotLoad) {
    return App.getInitialProps({
      pageProps: serverProps.props,
      req,
      AppTree: component,
    });
  }

  return {
    ...serverProps,
    pageProps: serverProps,
  };
}

async function handle(req: Request, res: Response, page: PageName) {
  await initPromise;

  const pageMeta = resolve(page);

  console.log(pageMeta);
  const isHotLoad = req.method === 'HEAD';
  const props = await getProps(req, pageMeta.abs, isHotLoad);

  res.status(200);

  if (isHotLoad) {
    res
      .setHeader(
        'x-fnext-page-props',
        encodeURIComponent(JSON.stringify(props))
      )
      .setHeader(
        'x-fnext-page-imports',
        encodeURIComponent(JSON.stringify(pageMeta.imports))
      )
      .setHeader('x-fnext-page-path', encodeURIComponent(pageMeta.path))
      .end();
    return;
  }

  res.contentType('text/html');
  res.flushHeaders();

  res.write(
    '<!DOCTYPE html>' +
      renderToStaticMarkup(
        createElement(Document, {
          alias: page,
          appPath: relative('dist', appMeta.path),
          imports: pageMeta.imports,
          pagePath: pageMeta.path,
          props,
          routerData: { url: req.url, query: req.query, asPath: page },
        })
      )
  );
  res.end();
}

router.getAsync('/resolve/:path*', async (req: Request, res: Response) => {
  if (!isPage(req.params.path)) {
    res.status(404);
    res.end();
    return;
  }

  res.status(200);

  res.json(resolve(req.params.path));
  res.end();
});

router.getAsync('/chunks/:filename', async (req: Request, res: Response) => {
  const stream = createReadStream(join(chunkDir, req.params.filename));

  res.status(200);
  res.contentType('text/javascript');
  res.flushHeaders();
  stream.pipe(res);
});

router.getAsync('/pages/:filename', async (req: Request, res: Response) => {
  const stream = createReadStream(join(pagesDir, req.params.filename));

  res.status(200);
  res.contentType('text/javascript');
  res.flushHeaders();
  stream.pipe(res);
});

router.getAsync('/dom', async (_req: Request, res: Response) => {
  res.status(200);
  res.contentType('text/javascript');
  res.flushHeaders();

  res.write(domFile);
  res.end();
});

router.getAsync('/', async (req: Request, res: Response) => {
  // const path = resolveTemplate('page1.tsx')
  return handle(req, res, 'page1.tsx');
});

router.getAsync('/my-other-page', async (req: Request, res: Response) => {
  return handle(req, res, 'page2.tsx');
});

app.use(router);

app.listen(3010);

// onceReady(() =>
//   app.listen(3010, () => {
//     console.log('listening');
//   })
// );
