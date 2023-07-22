import * as React from 'react';
import { internalProps } from 'fnext/router';
// import { Container, render } from 'react-dom';

const recv = Symbol('recursive');
// function clone(obj: object, parents: Array<any> = []) {
//   const copy = Object.create(Reflect.getPrototypeOf(obj));
//   const keys = Reflect.ownKeys(obj);

//   for (const key of keys) {
//     const value = obj[key];
//     if (typeof value === 'object' && parents.includes(value)) {
//       copy[key] = recv;
//       continue;
//     }

//     if (typeof value === 'object' && value != null) {
//       copy[key] = clone(value, parents.concat(obj));
//     } else {
//       copy[key] = value;
//     }
//   }

//   return copy;
// }

interface Module {
  willRequireHardRefresh: boolean;
  exports: {
    [key: string]: {
      listeners: Array<
        (revision: React.FunctionComponent | React.ComponentClass) => void
      >;
      value: unknown;
    };
  };
}

let moduleRegistry = new Map<string, Module>();

const exportInvalid = Symbol('fnext: invalid export');

// typeof window !== 'undefined' && window.thing = moduleRegistry;
// let emptyDomNode: Container | null = null;

// function getDomNode(): Container {
//   if (emptyDomNode) return emptyDomNode;

//   emptyDomNode = document.getElementById('fnext.empty');

//   return emptyDomNode;
// }

function useComponent<T>(
  mod: Module,
  name: string
): React.FunctionComponent<T> | React.ComponentClass<T> {
  const [Component, setComponent] = React.useState<
    React.FunctionComponent<T> | React.ComponentClass<T>
  >(
    () =>
      mod.exports[name].value as
        | React.FunctionComponent<T>
        | React.ComponentClass<T>
  );
  React.useEffect(() => {
    const exp = mod.exports[name];
    exp.listeners.push((c) => setComponent(() => c as typeof Component));
    return () => {
      exp.listeners = exp.listeners.filter((l) => l !== setComponent);
    };
  }, [setComponent]);

  return Component;
}

window[Symbol.for('fnext.register-page')] = function fnextRegisterPage(
  srcPath: string
) {
  moduleRegistry.set(srcPath, {
    willRequireHardRefresh: true,
    exports: {},
  });
};

window[Symbol.for('fnext.register')] = function fnextRegister<
  T extends unknown
>(srcPath: string, name: string, exported: T): T {
  // console.log('hot-reload');
  if (!moduleRegistry.has(srcPath)) {
    // let s: boolean = false;
    moduleRegistry.set(srcPath, {
      // get willRequireHardRefresh() {
      //   return s;
      // },
      // set willRequireHardRefresh(value) {
      //   console.trace();
      //   s = value;
      // },

      willRequireHardRefresh: false,
      exports: Object.create(null),
    });
  }

  const mod = moduleRegistry.get(srcPath)!;
  if (mod.willRequireHardRefresh) {
    return exported;
  }

  if (typeof exported !== 'function') {
    mod.willRequireHardRefresh = true;
    return exported;
  }

  if (name in mod.exports) {
    const exp = mod.exports[name];
    exp.value = exported;
    for (const setComponent of exp.listeners) {
      setComponent(() => null);
      setComponent(exported as any);
    }
  } else {
    mod.exports[name] = { value: exported, listeners: [] };
  }

  if (exported.prototype instanceof React.Component) {
    return function <T>(props: T) {
      const Component = useComponent<T>(mod, name);
      // console.log(Component);

      return <Component {...props} />;
    } as T;
  }

  // We'll assume that if the exported item is a component, its first letter is capitalized.
  // However, it may also be a constructor - if so we don't want to hook it since it isn't a react class
  const handler: ProxyHandler<typeof exported> = {
    // exported is a class, but not a component.
    construct(target, args, newTarget) {
      delete this.construct;
      delete this.apply;

      return Reflect.construct(target, args, newTarget);
    },
  };

  if (/^[A-Z]/.test(name[0]) && /\.createElement/.test(String(exported))) {
    handler.apply = function <T>(_target: any, _thisArg: any, [props]: [T]) {
      const Component = useComponent<T>(mod, name);

      // console.log(name, Component);

      return <Component {...props} />;
    };

    return new Proxy(exported, handler);
  }

  // This MAY be safe for hook calls,
  // else if (/^use(?![a-z])/.test(name)) {
  //   let latestValid = exported;
  //   // react hook
  //   handler.apply = function (_target, thisArg, args) {
  //     const isPending = useIsPending(mod);

  //     let useHook = mod.exports[name] as Function;

  //     if (isPending) {
  //       useHook = latestValid;
  //     } else if ((useHook as any) === exportInvalid) {
  //       throw new TypeError(
  //         `Removed export ${name} was accessed but is no longer exported.`
  //       );
  //     }

  //     let result;
  //     render(
  //       React.createElement(CallHookSafe, {
  //         cb(val) {
  //           result = val;
  //         },
  //         thisArg,
  //         args,
  //         useHook: useHook as any,
  //       }),
  //       getDomNode()
  //     );

  //     return result;
  //   };

  //   return new Proxy(exported, handler);
  // }
  // console.log('wrhr', srcPath);
  mod.willRequireHardRefresh = true;
  return exported;

  // return new Proxy(exported, {
  //   // exported is a class, but not a component.
  //   construct(target, args, newTarget) {
  //     delete this.construct;
  //     delete this.apply;

  //     return Reflect.construct(target, args, newTarget);
  //   },
  //   apply(_target, thisArg, args) {
  //     let setIsPending: (cb: boolean) => void;
  //     const latest = mod.exports[name];

  //     // console.trace(clone(React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED))

  //     try {
  //       [, setIsPending] = React.useState<boolean>(false);
  //       React.useEffect(() => {
  //         mod.listeners.push(setIsPending);
  //         return () => {
  //           mod.listeners = mod.listeners.filter((l) => l != setIsPending);
  //         };
  //       }, [setIsPending]);
  //     } catch (err) {
  //       setImmediate(() => console.error('damn', err));
  //       console.error('damn', err);
  //       // delete this.apply;
  //       mod.willRequireHardRefresh = true;

  //       return Reflect.apply(latest, thisArg, args);
  //     }

  //     return Reflect.apply(latest as Function, thisArg, args);
  //   },
  // });
};

const es = new EventSource(internalProps.devHooksListenEndpoint!);

es.addEventListener('error', console.error);

interface RefreshData {
  path: string;
  moduleID?: number;
}

let refNum = 0;

let refreshPromise = Promise.resolve();

es.addEventListener('refresh', (event: Event) => {
  const { data: srcPath } = event as any;

  // console.log('reload', srcPath);
  if (srcPath === '*') {
    // likely this file or a page
    return window.location.reload();
  }

  refreshPromise.then(async () => {
    const mod = moduleRegistry.get(srcPath);

    if (!mod) {
      // console.log('no mod', srcPath);
      return; //window.location.reload();
    }

    if (mod.willRequireHardRefresh) {
      // console.log('requires hard refresh', mod);
      return window.location.reload();
    }

    // for (const setIsPending of mod.listeners) {
    //   // unload mounted components / free state of other components
    //   setIsPending(true);
    // }

    // const newExportsProto = Object.create(null);

    // // The new version of the module may be missing some exports that are still being used.
    // // Instead of just removing them we'll default them to a unique symbol - this way we can
    // // print an error instead of just failing on reload.
    // for (const key of Object.keys(mod.exports)) {
    //   newExportsProto[key] = exportInvalid;
    // }

    // const oldExports = mod.exports;

    try {
      await import(`/assets/${srcPath}?ref=${refNum++}`);
    } catch (err) {
      // mod.exports = oldExports;
      console.error(
        `Unable to reload module ${srcPath}; re-using previous state.`,
        err
      );
    } finally {
      // for (const setIsPending of mod.listeners) {
      //   // unload mounted components / free state of other components
      //   setIsPending(false);
      // }
    }
  });
});
