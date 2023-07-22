import React from 'react';
import { hydrateRoot, Root } from 'react-dom/client';
import {  __initRouter } from 'fnext/router';
import type { InternalProps } from 'fnext/types';
import type { App, AppProps } from 'fnext/app';

export let root: Root | undefined;

function initPage<T = {}>(
  PageComponent: React.FC<T> | React.ComponentClass<T>,
  AppComponent: typeof App,
  props: Omit<AppProps<T>, 'Component'> & { __fnext_data: InternalProps }
) {
  if (typeof window === 'undefined') {
    throw new Error('clientside only');
  }

  window.history.replaceState(
    {
      ...window.history.state,
      __fnext_data: {
        page: window.location.pathname,
        props,
      },
    },
    ''
  );

  const content = document.getElementById('fnext-page-content')!;
  // content.innerHTML = initialHTML;
  // console.log(PageComponent, AppComponent);

  // __initRouterContext(props.__fnext_data.routerData);

  __initRouter(
    hydrateRoot(
      content,
      <AppComponent {...props} Component={PageComponent} />,
      {}
    ),
    AppComponent,
    props.__fnext_data
  );

  // document.body.onload = function () {
  //   // hydrate(<AppComponent {...props} Component={PageComponent} />, content);
  //   render(<AppComponent {...props} Component={PageComponent} />, content);

  // };
}

export { initPage as i };
