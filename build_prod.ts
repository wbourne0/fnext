import './registerEsbuild';
import { inspect } from 'util';
import glob from 'fast-glob';
import { basename, extname, join, relative, dirname } from 'path';
import { build, OnResolveResult, transform } from 'esbuild';
import { readFile, rm, writeFile } from 'fs/promises';
import { builtinModules, Module } from 'module';
import { transformFileAsync } from '@babel/core';

// addAlias('dist/')

const rootDir = process.cwd();
const pagesDir = join(rootDir, 'pages');
const outDir = join(rootDir, 'dist');

const injectedDir = join(__dirname, 'injected');
const reactHeader = join(injectedDir, 'react_header.ts');

const babelConfigPath = join(rootDir, 'babel.config.js');

async function doBuild() {
  const entryPoints = await glob('pages/**/*.{js,ts,jsx,tsx}', {
    absolute: true,
    onlyFiles: true,
  });

  await rm(outDir, { recursive: true, force: true });

  const { metafile } = await build({
    entryPoints: entryPoints.concat(
      '__fnext_injected/dom.tsx',
      '__fnext_injected/node_entrypoint.ts'
    ),
    minify: true,
    bundle: true,
    format: 'esm',
    metafile: true,
    outdir: outDir,
    splitting: true,
    treeShaking: true,
    outbase: pagesDir,
    logLevel: 'warning',
    sourcemap: 'both', //TODO: change to external
    entryNames: 'pages/[hash]',
    chunkNames: 'chunks/[hash]',
    platform: 'browser',
    external: [...builtinModules],
    target: 'es6',

    outExtension: { '.js': '.mjs' },

    plugins: [
      {
        name: 'fnext',
        setup(ctx) {
          // Because react is cjs, not esm, esbuild plays it safe and doesn't deconstruct exports from react.
          // However, it is completely safe to deconstruct exports from react, so we instead will resolve react to a file
          // which directly imports react
          ctx.onResolve({ filter: /^react$/ }, ({ importer }) =>
            importer === reactHeader
              ? {} // resolve react as normal if loading from the esm proxy
              : {
                  path: reactHeader,
                }
          );

          // ctx.onResolve({ filter: /^vscode$/ }, ({ path: _, ...rest }) =>
          //   ctx.resolve('monaco-languageclient/lib/vscode-compatibility', rest)
          // );

          ctx.onResolve(
            { filter: /^next\/(link|router|document|app)$/ },
            async ({ path, ...args }) => {
              switch (path) {
                case 'next/link':
                case 'next/router':
                  const result = await ctx.resolve('f' + path, args);

                  return { ...result };
                case 'next/document':
                case 'next/app':
                  return ctx.resolve(
                    `${__dirname}/pages/_${relative('next', path)}.tsx`,
                    args
                  );
              }
            }
          );

          // ctx.onResolve({ filter: /^next\/(link|router)$/})

          ctx.onResolve({ filter: /^__fnext_injected\// }, ({ path }) => {
            const rel = relative('__fnext_injected/', path);
            const abs = require.resolve('./' + join('injected', rel));

            return {
              path: relative('__fnext_injected/', path),
              namespace: '__fnext_injected',
              pluginData: abs,
            };
          });

          ctx.onLoad(
            { filter: /\.*/, namespace: '__fnext_injected' },
            async ({ path, pluginData }) => ({
              contents: await readFile(pluginData, { encoding: 'binary' }),
              resolveDir: dirname(pluginData),
              loader: /x$/.test(path) ? 'tsx' : 'ts',
            })
          );
        },
      },
    ],
    define: {
      'process.env.NODE_ENV': '"production"',
      __IS_PROD__: 'true',
    },
  });

  // console.log(inspect(metafile, { depth: 1000, colors: true }));

  let sensibleMetaMap: Record<
    string,
    { path: string; imports: Array<string> }
  > = {};

  // await writeFile(join(outDir, 'meta.json'), JSON.stringify(metafile, null, 4));

  for (const [outPath, data] of Object.entries(metafile.outputs)) {
    if (!data.entryPoint) continue;

    sensibleMetaMap[data.entryPoint] = {
      path: outPath,
      imports: data.imports.map((imp) => imp.path),
    };
  }

  await writeFile(
    join(outDir, 'meta.json'),
    JSON.stringify(sensibleMetaMap, null, 4)
  );

  // console.log(join(rootDir, sensibleMetaMap['pages/_document_prod.tsx']));
  const { createElement, renderToString } = (await import(
    join(rootDir, sensibleMetaMap['__fnext_injected:node_entrypoint.ts'].path)
  )) as typeof import('./injected/node_entrypoint');

  for (const [page, meta] of Object.entries(sensibleMetaMap)) {
    const pageName = basename(page, extname(page));

    if (/^_/.test(page) || /^_/.test(pageName)) continue;

    const { default: PageComponent } = await import(join(rootDir, meta.path));

    console.log('PageComponent', createElement(PageComponent))

    const abs = join(rootDir, meta.path);

    console.log(page);

    // TODO: this could be sped up via building in parallel
    await build({
      outfile: abs,
      entryPoints: [abs],
      sourcemap: 'external',
      // sourcemap: 'inline',
      allowOverwrite: true,
      minify: true,
      outExtension: { '.js': '.mjs' },
      format: 'esm',
      target: 'es6',
      bundle: true,
      plugins: [
        {
          name: 'html injector',
          setup(ctx) {
            ctx.onResolve({ filter: /.*/ }, ({ importer, path }) =>
              path === '__fnext_html'
                ? { path, external: false, namespace: 'html' }
                : { external: Boolean(importer) }
            );
            ctx.onLoad({ filter: /.*/, namespace: 'html' }, () => ({
              contents: renderToString(createElement(PageComponent)),
              loader: 'text',
            }));
            ctx.onLoad({ filter: /.*/ }, async ({ path }) => ({
              resolveDir: dirname(path),
              contents:
                (await readFile(path, { encoding: 'binary' })) +
                ';export {default as m} from "__fnext_html"',
              loader: 'js',
            }));
          },
        },
      ],
    });

    // await writeFile(
    //   join(rootDir, meta.path.replace(/\.js$/, '.html.js')),
    //   code
    // );

    // .pipe(
    //   createWriteStream(join(outDir, `${pageName}.html`))
    // );
  }

  // renderToNodeStream(
  //   createElement(
  //     document,
  //     {
  //       domPath: sensibleMetaMap['pages/_dom.tsx'].path,
  //       pagePath: page.path,
  //       imports: page.imports,
  //     },
  //     createElement(page1)
  //   )
  // ).pipe(createWriteStream(join(outDir, 'page1.html')));
}

doBuild()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

// Goals:
// 1. No SSR
// 2. The ONLY request the user makes to the server is the initial one, everything else should be handled via cdn. (excluding API, ofc)
// 3. Express server shouldn't be sending large files.
