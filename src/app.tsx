import * as React from 'react';
import {
  PageComponent,
  GetInitialPropsContext,
  GetServerSidePropsContext,
} from './types';

export interface AppRenderProps {}
interface AppTreeProps {
  pageProps: object;
  [name: string]: any;
}

export interface AppProps<PageProps = {}> {
  pageProps: PageProps;
  Component: PageComponent<PageProps>;
}

export interface AppGetServerSidePropsContext
  extends FNext.GetServerSidePropsUserContext {
  AppTree: PageComponent;
  ctx: GetServerSidePropsContext;
  getServerSidePageProps?(ctx: GetServerSidePropsContext): Promise<object>;
}

// type b = Pick<Request, 'headers' | 'cookies'>

export interface AppGetInitialPropsContext<SSP extends AppServerSideProps> {
  AppTree: PageComponent;
  ctx: GetInitialPropsContext<SSP['pageProps']>;
  serverSideProps: SSP;
}

export { App };

export interface AppServerSideProps {
  pageProps: {};
}

class App<
  ServerSideProps extends AppServerSideProps = AppServerSideProps,
  State = {}
> extends React.Component<AppProps<object>, State> {
  // TODO: implement.
  // @internal
  static getStaticProps?(): Promise<object>;

  static async origGetInitialProps<SSP extends AppServerSideProps>({
    AppTree,
    ctx: childCtx,
    serverSideProps,
  }: AppGetInitialPropsContext<SSP>) {
    if (AppTree.getInitialProps) {
      return {
        pageProps: await AppTree.getInitialProps(childCtx),
      };
    }

    return serverSideProps;
  }

  static getInitialProps: <SSP extends AppServerSideProps>(
    props: AppGetInitialPropsContext<SSP>
  ) => Promise<{ pageProps: object }> = this.origGetInitialProps;

  render(): React.ReactNode {
    const { Component, pageProps } = this.props as AppProps;

    return <Component {...pageProps} />;
  }
}

export async function getServerSideProps({
  getServerSidePageProps,
  ctx,
}: AppGetServerSidePropsContext): Promise<AppServerSideProps> {
  if (getServerSidePageProps) {
    return {
      pageProps: await getServerSidePageProps(ctx),
    };
  }

  return { pageProps: {} };
}

export default App;
