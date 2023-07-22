import * as React from 'react';

export default function ShowNumber({ num }: { num: number }) {
  return (
    <>
      <p>Number: {num}</p>
      {/* <h1>OH btw hi</h1> */}
    </>
  );
}

export { ShowNumber };
