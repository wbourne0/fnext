// import 'raf/polyfill'; // ignore this, only here since this is poc
import * as React from 'react';
import Clicker from 'app/components/clicker';
import Link from 'fnext/link';

// interface PageProps extends fnext.ServersideProps {
//   reqNum: number;
// }

export default function myThing({ reqNum }: { reqNum: number }) {
  return (
    <>
      <Clicker />

      <Link href="/page2.tsx" as="/my-other-page">
        hm
      </Link>
      <p>Hello, World! {reqNum}</p>
      <div style={{ height: '500vh' }}></div>
      <Link href="/page2.tsx" as="/my-other-page">
        hm
      </Link>
    </>
  );
}

export function getServerSideProps() {
  global.reqNum ??= 0;

  return { reqNum: global.reqNum++ };
}

// myThing.getInitialProps = (args: { pageProps: { reqNum: number } }) => {
//   console.log('getInitialProps', args);
//   return { reqNum: args.pageProps.reqNum + 1 };
// };

// Removed this for now since it was a bit of a PITA to work with while fighting HMR
