import * as React from 'react';
import Link from 'fnext/link';

export default function Component(props: FNext.PageProps) {
  return (
    <div>
      <h1>Goodbye, World!</h1>
      <Link href="/page1.tsx" as="/">
        go back
      </Link>
    </div>
  );
}
