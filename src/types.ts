import type { ParsedQs } from 'qs';

export interface RouterData {
  url: string;
  query: ParsedQs;
  asPath: string;
}

export interface GetInitialPropsContext<SSP extends object = never>
  extends FNext.GetInitialPropsUserContext {
  serverSideProps: SSP;
}

export interface GetServerSidePropsContext
  extends FNext.GetServerSidePropsUserContext {}

export interface PageComponent<P = {}, S = {}, SS = {}>
  extends React.ComponentFactory<P, React.Component<P, S, SS>> {
  getInitialProps?(props: GetInitialPropsContext<any>): Promise<object>;
}

declare global {
  namespace FNext {
    export interface GetServerSidePropsUserContext {}
    export interface RequestExtras {}
    export interface GetInitialPropsUserContext {}
  }
}

//@internal
export interface InternalProps {
  devHooksListenEndpoint?: string;
  routerData: RouterData;
}
