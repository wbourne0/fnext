import * as React from 'react';

export default function () {
  return <p>Oh hi</p>;
}

export function getServerSideProps() {
  return { abc: 'def' };
}
