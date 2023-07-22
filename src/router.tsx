import * as React from 'react';
import fetch from 'cross-fetch';
import type { Root } from 'react-dom/client';
import { createElement } from 'react';
import createQueue from './util/queue';
import type { InternalProps, RouterData } from './types';

const enqueue = createQueue();

let root: Root;
let App: typeof import('./app')['default'];
// @internal
export let internalProps: InternalProps;

export interface Router extends RouterData {
  push(page: string, as?: string, options?: PushOptions): void;
  preload(page: string): void;
}

let RouterCTX: React.Context<Router>;

//@internal
export function __setRouterData(data: RouterData) {
  RouterCTX = React.createContext({
    ...data,
    preload,
    push,
  });
}

// @internal
export function __initRouter(
  r: Root,
  a: typeof import('./app')['default'],
  p: InternalProps
) {
  root = r;
  App = a;
  internalProps = p;
}

declare global {
  // @internal
  namespace FNext.internal {
    export interface PageMeta {
      path: string;
      imports: Array<string>;
      props: object;
    }
  }
}

export function fetchComponent(path: string) {
  if (!/^\//.test(path)) {
    throw new Error('expected path to start with /');
  }

  return import(path);
}

function assertValidPageMeta(
  meta: any
): asserts meta is FNext.internal.PageMeta {
  const abort = () => {
    throw new TypeError('Invalid metadata for page');
  };

  if (typeof meta !== 'object' || Array.isArray(meta)) {
    abort();
  }

  if (typeof meta.path !== 'string') {
    abort();
  }

  if (typeof meta.imports !== 'object' || !Array.isArray(meta.imports)) {
    abort();
  }

  if (typeof meta.props !== 'object') {
    abort();
  }
}

const metaMapping: Record<string, FNext.internal.PageMeta> = {};

export async function getPageMeta(
  path: string
): Promise<FNext.internal.PageMeta> {
  if (metaMapping[path]) {
    return metaMapping[path];
  }

  const { headers, status } = await fetch(path, {
    method: 'head',
  });

  if (status !== 200) {
    throw new Error('Unable to fetch props');
  }

  const props = headers.get('x-fnext-page-props');
  const imports = headers.get('x-fnext-page-imports');
  const pagePath = headers.get('x-fnext-page-path');

  if (!(props && imports && pagePath)) {
    throw new Error('Missing headers from server; unable to load page');
  }

  const pageMeta: FNext.internal.PageMeta = {
    props: JSON.parse(decodeURIComponent(props)),
    imports: JSON.parse(decodeURIComponent(imports)),
    path: decodeURIComponent(pagePath),
  };

  assertValidPageMeta(pageMeta);

  return pageMeta;
}

export async function load(meta: FNext.internal.PageMeta) {
  const [page] = await Promise.all([
    import('/' + meta.path),
    meta.imports.map((imp) => import('/' + imp)),
  ]);

  if (!page.default) {
    throw new Error('Not a page: ' + meta.path);
  }

  return page;
}

export async function loadAndSwap(
  meta: FNext.internal.PageMeta,
  didCancel: () => boolean
) {
  const content = document.getElementById('fnext-page-content');

  if (!content) {
    throw new Error('expected content node');
  }

  const page = await load(meta);

  if (!didCancel()) {
    root.render(<App {...meta.props} Component={page.default} />);
  }
}

export async function hotLoad(page: string, didCancel: () => boolean) {
  const meta = await getPageMeta(page);

  if (didCancel()) {
    return;
  }

  await loadAndSwap(meta, didCancel);
}

export interface PushOptions {
  scroll?: boolean;
  shallow?: boolean;
}

let isLoading: boolean;

function updateScrollPosition() {
  window.history.replaceState(
    {
      ...window.history.state,
      __fnext_data: {
        ...window.history.state.__fnext_data,
        left: window.scrollX,
        top: window.scrollY,
      },
    },
    ''
  );
}

if (typeof window !== 'undefined') {
  // TODO: make it so this doesn't need to be async.
  window.addEventListener('popstate', (event) => {
    if (event.state.__fnext_data) {
      const { left, top } = event.state.__fnext_data;

      window.history.scrollRestoration = 'manual';

      navigateTo(document.location.pathname)
        .then(() => {
          if (left != null && top != null) {
            setTimeout(() => window.scrollTo({ left, top }), 1);
          }
        })
        .catch(console.error);
    }
  });
}

function navigateTo(page: string) {
  if (typeof window === 'undefined') {
    throw new Error('Unable to switch pages from the server');
  }

  isLoading = true;
  let didCancel: boolean;
  const setDidCancelTrue = (event: PopStateEvent) => {
    didCancel = true;
    event.stopPropagation();
  };

  window.addEventListener('popstate', setDidCancelTrue);

  return hotLoad(page, () => didCancel).finally(() => {
    window.removeEventListener('popstate', setDidCancelTrue);
    isLoading = false;
  });
}

function preload(page: string) {
  if (typeof window === 'undefined') {
    throw new Error('Unexpected call to Router.push from serverside code');
  }

  enqueue(async () => {
    const meta = await getPageMeta(page);
    await load(meta);
  }).catch((err) => {
    console.error('unable to preload page:', err);
  });
}

function push(
  page: string,
  alias: string = page,
  { scroll = true, shallow = false }: PushOptions = {}
) {
  if (typeof window === 'undefined') {
    throw new Error('Unexpected call to Router.push from serverside code');
  }

  if (isLoading) return;
  updateScrollPosition();

  // const changeState =

  // If the user tries to go back to the previous page
  window.history.pushState(
    {
      ...window.history.state,
      __fnext_data: {
        page,
      },
    },
    '',
    alias
  );

  if (!shallow) {
    enqueue(async () => {
      try {
        await navigateTo(alias);
        if (scroll) {
          window.scrollTo({ left: 0, top: 0 });
        }
      } catch (err) {
        console.error('unable to navigate to page:', err);
      }
    });
  }
}

export default function useRouter() {
  return React.useContext(RouterCTX);
}
