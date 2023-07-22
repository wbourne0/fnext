// import clone from '../lib/clone';
import * as React from 'react';
import ShowNumber from './number';

export default function Clicker() {
  const [num, setNum] = React.useState(0);

  return (
    <>
      <ShowNumber num={num} />
      <p>click me</p>
      <button onClick={() => setNum((current) => ++current)}>Click Me</button>
    </>
  );
}