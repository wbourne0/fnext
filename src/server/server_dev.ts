import { join, relative } from 'path';
import { stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { addAsync } from '@awaitjs/express';
// import document from './dist/ssr/_document';
import createApp, { Router, Request, Response } from 'express';
import { readyPromise, onReload, resolveTemplate } from './build_util/dev';
import * as pool from './build_util/worker_pool';
import type { WorkerRequest } from './build_util/worker';
import { chunkDir, distDir } from './build_util/paths';

const app = addAsync(createApp());

onReload(() => {
  pool.reset();
});

interface CreateRouterOptions {
  cdn?: string;
  endpoint?: string;
  isDev?: boolean;
}

let appPath: string;

const ready = readyPromise.then((meta) => {
  pool.init({
    ...meta,
  });

  return meta;
});

function fnext({ endpoint = '/fnext/', isDev }: CreateRouterOptions = {}) {
  const router = addAsync(Router());

  let domHttpPath: string | undefined;
  let appHttpPath: string | undefined;
  let devHooksHttpPath: string | undefined;
  const devHooksListenEndpoint = isDev ? join(endpoint, 'listen') : undefined;

  async function handle(req: Request, res: Response, page: string) {
    // await initPromise;
    const { appPath, devHookPath, domPath } = await ready;

    if (!domHttpPath || !appHttpPath) {
      domHttpPath = join(endpoint, domPath);
      appHttpPath = join(endpoint, relative(distDir, appPath));
      devHooksHttpPath = devHookPath && join(endpoint, devHookPath);
    }

    const resolved = resolveTemplate(page);

    if (!resolved) {
      throw new Error('invalid page');
    }

    const [pagePath, pageBuildPath, imports] = resolved;

    const isHotLoad = req.method === 'HEAD';

    const workerReq: WorkerRequest = {
      imports: imports.map((imp) => join(endpoint, imp)),
      pagePath,
      isHotLoad,
      pageHttpPath: join(endpoint, pageBuildPath),
      domHttpPath,
      devHooksHttpPath,
      appHttpPath,
      routerData: { url: req.url, query: req.query, asPath: req.path },
      devHooksListenEndpoint,
    };

    if (isHotLoad) {
      const data = await pool.request(workerReq);

      res
        .status(200)
        .setHeader('x-fnext-page-props', encodeURIComponent(data))
        .setHeader(
          'x-fnext-page-imports',
          encodeURIComponent(JSON.stringify(imports))
        )
        .setHeader('x-fnext-page-path', encodeURIComponent(pageBuildPath))
        .end();
      return;
    }

    const pageContent = await pool.request(workerReq);

    res.status(200);
    res.contentType('text/html');
    res.flushHeaders();

    res.write(pageContent);
    res.end();
  }

  router.getAsync(
    join(endpoint, 'assets/*'),
    async (req: Request, res: Response) => {
      await ready;
      // const path = req.params.path;
      // if (!/^\d+$/.test(id)) {
      //   res.status(400);

      // return void res.end();
      // }

      const path = join(distDir, 'assets', req.params[0]);

      if (!path) {
        res.status(404);

        return void res.end();
      }

      const stream = createReadStream(path);

      res.status(200);
      res.contentType('text/javascript');
      res.flushHeaders();
      stream.pipe(res);
    }
  );

  router.getAsync(
    join(endpoint, 'listen'),
    async (_req: Request, res: Response) => {
      await ready;
      res.status(200);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const dispose = onReload((srcPath) => {
        res.cork();
        res.write('event: refresh\n');
        res.write(`data: ${srcPath ?? '*'}\n\n`);
        res.uncork();
      });

      res.once('close', dispose);
    }
  );

  router.getAsync(
    join(endpoint, 'chunks/:chunkName'),
    async (req: Request, res: Response) => {
      await ready;
      const chunk = req.params.chunkName;
      const path = join(chunkDir, chunk);

      if (!path.startsWith(chunkDir + '/')) {
        res.status(403);
        res.flushHeaders();

        res.write('nice try');
        res.end();
      }

      // const s = await stat(path);
      // if (s.isDirectory()) {
      //   res.status(404);
      //   res.send(`not found: ${chunk}`);
      //   res.end();
      //   return;
      // }

      res.status(200);
      res.contentType('text/javascript');
      res.flushHeaders();

      createReadStream(path).pipe(res);
    }
  );

  return { router, handle };
}

// router.getAsync('/module/:id', async (req: Request, res: Response) => {
//   const id = req.params.id;
//   if (!/^\d+$/.test(id)) {
//     res.status(400);

//     return void res.end();
//   }

//   console.log('getModule', id);
//   const path = getModule(Number(id));

//   if (!path) {
//     res.status(404);

//     return void res.end();
//   }

//   const stream = createReadStream(path).on('error',console.error);

//   res.status(200);
//   res.contentType('text/javascript');
//   res.flushHeaders();
//   stream.pipe(res);
// });

const { router, handle } = fnext({ isDev: true });

app.getAsync('/', async (req: Request, res: Response) => {
  return handle(req, res, './page1.tsx');
});

router.getAsync('/my-other-page', async (req: Request, res: Response) => {
  return handle(req, res, './page2.tsx');
});

app.use(router);

app.listen(3010);
