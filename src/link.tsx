import * as React from 'react';
import useRouter from './router';

interface LinkProps {
  href: string;
  as?: string;
  passHref?: boolean;
  /**
   * Unusued
   */
  prefetch?: boolean;
  scroll?: boolean;
  children: React.ReactChild | React.ReactFragment | React.ReactPortal;
}

// this global variable is used to ensure that we don't try to load another page when we're already loading one.
let isLoading: boolean;

export default function Link({
  href: page,
  as: alias = page,
  passHref = false,
  prefetch = true,
  scroll = true,
  children,
}: LinkProps) {
  if (typeof children === 'string') {
    children = <a>{children}</a>;
  }

  const child = React.Children.only(children);

  const childRef: React.Ref<any> | false | null | undefined =
    child && typeof child === 'object' && (child as any).ref;

  const refCB = React.useCallback(
    (el: any) => {
      if (childRef) {
        if (typeof childRef === 'function') {
          childRef(el);
        } else {
          // @ts-expect-error this kinda breaks the rules of react, but should be fine
          // since React.cloneElement forces a re-render.
          childRef.current = el;
        }
      }
    },
    [childRef]
  );

  const router = useRouter();

  const originalProps =
    child && typeof child === 'object' && 'props' in child && child.props;

  const childProps: React.DetailedHTMLProps<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    HTMLAnchorElement
  > = {
    ref: refCB,
    onClick(event) {
      let willPropagate: boolean | undefined = undefined;
      if (
        originalProps &&
        typeof originalProps === 'object' &&
        originalProps.onClick &&
        typeof originalProps.onClick === 'function'
      ) {
        willPropagate = originalProps.apply(this, arguments);
      }

      if (!event.defaultPrevented && !isLoading) {
        event.preventDefault();

        router.push(page, alias, { scroll });

        return false;
      }

      return willPropagate;
    },
  };

  if (
    passHref ||
    (child &&
      typeof child === 'object' &&
      'type' in child &&
      child.type === 'a' &&
      !('href' in child.props))
  ) {
    childProps.href = alias;
  }

  return React.cloneElement(child as any, childProps);
}
