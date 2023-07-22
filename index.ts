import { createServer, IncomingMessage, ServerResponse } from 'http';
import { renderToString } from 'react-dom/server';
import { createReadStream } from 'fs';
import { join, extname, basename } from 'path';
import { onReload, resolveTemplate, getDomPath, getModule } from './build_dev';

const rootDir = process.cwd();

// const path = require.resolve('./dist/ssr/_document');
const path = require.resolve('./dist/ssr/_document');

const metaJSONPath = require.resolve('./meta.json');

function getMeta() {
  delete require.cache[metaJSONPath];
  return require(metaJSONPath);
}

function getTemplate() {
  delete require.cache[path];
  return require(path).default;
}

// function getInputMeta(entryPoint: string) {
//   console.log(entryPoint);
//   return Object.entries(getMeta().outputs).find(
//     ([, output]) => output.entryPoint === entryPoint
//   );
// }

function loadServersideProps(path, req) {
  // const abs = require.resolve(
  //   join(__dirname, 'dist/ssr', basename(path, extname(path)))
  // );

  // console.log(abs, path);

  // delete require.cache[abs];

  // const { getServerSideProps } = require(abs);

  // return getServerSideProps
  //   ? getServerSideProps({ url: req.url }, req)
  // : { url: req.url };
  return { url: req.url };
}

const domEntrypoint = 'pages/_dom.tsx'; //`fnext.precompile:${join(__dirname, 'dist/static/assets/pages', '_dom.js')}`;

// console.

function renderPage(page, req, res) {
  // const entryPoint = `fnext.pages:${join(__dirname, 'pages', page)}`;
  // console.log(entryPoint);

  const path = resolveTemplate(page);
  const domPath = getDomPath();
  //   const props = getServersideProps();

  res.setHeader('Content-Type', 'text/html');
  res.writeHead(200);
  res.write('<!DOCTYPE html>');
  res.end(
    renderToString(
      getTemplate()({
        path,
        domPath,
        props: loadServersideProps(page, req),
      })
    )
  );
}

const contentTypeMap = {
  '.js': 'text/javascript',
  '.tsx': 'text/javascript',
};

function listen(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, 'ok', {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
  });
  res.flushHeaders();

  const dispose = onReload((path, moduleID) => {
    res.cork();
    process.nextTick(() => res.uncork());
    res.write('event: refresh\n');
    res.write(`data: ${JSON.stringify({ path, moduleID })}\n\n`);
    console.log('reload');
  });

  process.on('SIGINT', () => res.end(process.exit));

  req.on('close', dispose);
}

const server = createServer(function (req, res) {
  if (req.url === '/listen') {
    return listen(req, res);
  }

  if (req.url && /^\/module\/\d+(\?|$)/.test(req.url)) {
    const [num] = req.url.match(/\d+/);

    const path = getModule(Number(num));

    const stream = createReadStream(join(__dirname, path));

    res.writeHead(200, 'ok', { 'Content-Type': 'text/javascript' });

    return stream.pipe(res);
  }

  if (req.url && /^\/dist\//.test(req.url)) {
    [req.url] = req.url.split('?');
    const distPath = req.url.slice(1);
    if (!(distPath in getMeta().outputs)) {
      console.log('not found', distPath);
      res.writeHead(404, 'not found');
      return res.end();
    }

    console.log(extname(req.url));
    res.setHeader('Content-Type', contentTypeMap[extname(req.url)]);
    // res.writeHead(200, { "Content-Type": req.headers["content-type"] });
    const path = createReadStream(join(__dirname, distPath));

    return path.pipe(res);
  }

  //   console.log(req.url);

  //   res.setHeader('Content-Type', 'text/html');
  //   res.writeHead(200);
  //   res.end(renderToString(template({ path: '/dist/pages/page2.js' })));

  console.log('renderPage');
  renderPage('page1.tsx', req, res);
});

server.listen(3010);
