import * as React from 'react';
import type { InternalProps, RouterData } from './types';

export interface BodyProps {
  pageContent: string;
}

function Body({ pageContent }: BodyProps) {
  return (
    <body>
      {/* we know deps ahead of time, so append them here */}
      <div
        id="fnext-page-content"
        dangerouslySetInnerHTML={{ __html: pageContent }}
      />
    </body>
  );
}

const headCtx = React.createContext<Array<React.Component>>([]);

// function Head

export interface DocumentProps extends BodyProps {
  // alias: string;
  pagePath: string;
  appPath: string;

  pageContent: string;
  // a list of imports so the browser can start loading everything immediately
  // after it receives the html doc.
  imports: Array<string>;
  props: object & { __fnext_data: InternalProps };
  domPath: string;
  devHooksPath?: string;
}
export default function ({
  pagePath,
  imports,
  props,
  appPath,
  domPath,
  pageContent,
  devHooksPath,
}: React.PropsWithChildren<DocumentProps>) {
  return (
    <html>
      <head>
        <title>Hello There</title>
        {devHooksPath ? <script src={devHooksPath} type="module" /> : null}
        <script type="module" src={domPath} />
        <script type="module" src={pagePath} />
        <script type="module" src={appPath} />

        {imports.map((imp, i) => (
          <script type="module" src={imp} key={i} />
        ))}
        <script
          type="module"
          dangerouslySetInnerHTML={{
            __html:
              // i: init
              `import{i}from"${domPath}";` +
              // p: page component
              // m: page markup / html
              `import{default as p}from"${pagePath}";` +
              // a: app component
              `import{default as a}from"${appPath}";` +
              `i(p,a,${JSON.stringify(props)})`,
          }}
        />
      </head>
      <Body pageContent={pageContent} />
      <body></body>
    </html>
  );
}
