export default function createQueue() {
  const queue = (function* (): Generator<any, any, () => Promise<any>> {
    let p = Promise.resolve();
    let res: Promise<any>;
    for (let cb = yield; ; cb = yield res) {
      res = p.then(cb);
      p = new Promise((resolve) => res.finally(resolve));
    }
  })();

  // prime the queue
  queue.next();

  return <T>(cb: () => Promise<T>): Promise<T> => queue.next(cb).value;
}
