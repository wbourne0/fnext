// import 'raf/polyfill'; // ignore this, only here since this is poc
import * as React from 'react';
import Clicker from '../app/components/clicker';
import Link from 'next/link';

// interface PageProps extends fnext.ServersideProps {
//   reqNum: number;
// }

async function wat(cb: () => Promise<number>, opt: boolean): Promise<number> {
  return opt ? cb() : 3;
}

export default function myThing({ reqNum }: { reqNum: number }) {
  console.log('wtf');

  (async function () {
    console.log(await wat(async () => 0, false));
    console.log(
      await wat(async () => {
        return new Promise((resolve) => setTimeout(() => resolve(5), 1000));
      }, true)
    );
  })();

  return (
    <>
      <Clicker />

      <Link href="/page2" as="/my-other-page">
        hm
      </Link>
      <p>Hello, World! {reqNum}</p>
      <div style={{ height: '500vh' }}></div>
      <Link href="/page2" as="/my-other-page">
        hm
      </Link>
    </>
  );
}

export const getServerSideProps = () => {
  global.reqNum ??= 0;

  return { props: {reqNum: global.reqNum++} };
};

// myThing.getInitialProps = (args: { pageProps: { reqNum: number } }) => {
//   console.log('getInitialProps', args);
//   return { reqNum: args.pageProps.reqNum + 1 };
// };

// Removed this for now since it was a bit of a PITA to work with while fighting HMR

// export function getServerSideProps(props): PageProps {
//   const kReqNum = Symbol.for('reqNum');
//   global[kReqNum] ??= 0;
//   return { ...props, reqNum: ++global[kReqNum] };
// }
