import sane from 'sane';
import { readFile, stat, writeFile, access } from 'fs/promises';
import glob from 'fast-glob';
import { build, BuildIncremental, Metafile } from 'esbuild';
import { join, dirname, relative, extname } from 'path';
import { EventEmitter } from 'events';
import { BuildMeta, PluginData } from './types';
import { Stats, writeFileSync } from 'fs';
import { transform } from './swc';
import {
  rootDir,
  distDir,
  pagesSrcDir,
  replaceExt,
  fnextInjectedPath,
  relativeWithDot,
  distName,
} from './paths';
import createQueue from 'fnext/util/queue';

const _enqueue = createQueue();
const enqueue = <T>(cb: () => Promise<T>) =>
  _enqueue<T | null>(() => {
    return cb().catch((err) => {
      console.error('fnext build error:', err);
      return null;
    });
  });

const pagesDir = join(rootDir, 'pages');
const appDir = join(rootDir, 'app');
const emitter = new EventEmitter();

let metafile: Metafile;

interface WatcherHandlers {
  del(path: string, root: string): void;
  add(path: string, root: string, stat: Stats): void;
  change(path: string, root: string, stat: Stats): void;
}

function createWatcher(
  path: string,
  { add, change, del }: WatcherHandlers
): Promise<() => void> {
  return new Promise((resolve) => {
    const watcher: sane.Watcher = sane(path, {
      ignored: /^\.\/_/,
    })
      .on('add', add)
      .on('change', change)
      .on('delete', del)
      .on('error', (err) => {
        console.error('Error watching files:', err);
        process.exit(1);
      })
      .on('ready', () => resolve(() => watcher.close()));
  });
}

// let rebuildHandlers =
let rebuild: BuildIncremental['rebuild'] | null = null;

async function doBuild(entryPoints: Array<string>, full: boolean = false) {
  if (full) {
    rebuild?.dispose();
  } else if (rebuild) {
    return rebuild();
  }

  const tsconfigPath = join(rootDir, 'tsconfig.json');
  let doesHaveTsConfig = true;

  try {
    await stat(tsconfigPath);
  } catch {
    doesHaveTsConfig = false;
  }

  const start = performance.now();
  const filesCompiled = new Set<string>();

  const result = await build({
    incremental: true,
    minify: true,
    // minifyIdentifiers: true,
    // minifySyntax: true,
    // minifyWhitespace: true,
    sourcemap: 'both',
    bundle: true,
    splitting: true,
    format: 'esm',
    entryNames: 'assets/[dir]/[name]',
    chunkNames: 'chunks/[hash]',
    entryPoints: Array.from(entryPoints),
    metafile: true,
    outbase: rootDir,
    outdir: distDir,
    outExtension: { '.js': '.mjs' },
    // platform: 'node',
    tsconfig: doesHaveTsConfig ? tsconfigPath : undefined,
    loader: { '.cjs': 'js', '.mjs': 'js' },
    plugins: [
      {
        name: 'fnext internals',
        setup(ctx) {
          ctx.onResolve(
            { filter: /^__fnext_injected\// },
            async ({ path, importer }) => {
              if (importer) {
                return {
                  errors: [
                    { text: 'fnext injected should not be directly imported' },
                  ],
                };
              }

              const rel = relative('__fnext_injected/', path);
              const abs = join(fnextInjectedPath, rel);

              return {
                path: rel,
                namespace: '__fnext_injected',
                pluginData: abs,
              };
            }
          );

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
      {
        name: 'fnext dev hooks',
        setup(build) {
          build.onResolve(
            { filter: /.*/, namespace: 'fnext.precompile' },
            async ({ path, importer, resolveDir, pluginData }) => {
              const results = await build.resolve(path, {
                importer: pluginData.absPath,
                resolveDir: dirname(pluginData.absPath),
                namespace: 'file',
              });

              return {
                ...results,
                watchFiles: [results.path],
              };
            }
          );
          build.onResolve(
            {
              filter: /.*/,
              namespace: 'file',
            },
            async ({ path, importer, resolveDir }) => {
              const result = await build.resolve(path, {
                namespace: "namespace which doesn't exist",
                importer,
                resolveDir,
              });

              const abs = result.path;

              filesCompiled.add(abs);
              if (
                abs.startsWith(join(rootDir, 'node_modules')) ||
                (__IS_DEV__ &&
                  abs.startsWith(join(rootDir, 'src' || /^fnext\//.test(path))))
              ) {
                return { ...result, namespace: 'file' };
              }

              const match = abs.match(/[tj]sx?$/);

              if (!match) {
                return result;
              }
              const [ext] = match;

              const relPath = relative(rootDir, abs);
              const pluginData: PluginData = {
                absPath: abs,
                relPath,
                isPage: abs.startsWith(join(rootDir, 'pages')),
                isTS: ext[0] === 't',
                isJSX: ext[ext.length - 1] == 'x',
              };

              if (pluginData.isPage) {
                // target is an entrypoint
                return {
                  // path: abs,
                  path: relPath,
                  namespace: 'fnext.pages',
                  pluginData,
                  watchDirs: [dirname(path)],
                  watchFiles: [path, abs],
                  external: false,
                };
              }

              return {
                ...result,
                // path: abs,
                path: importer
                  ? relativeWithDot(resolveDir, replaceExt(abs, '.mjs'))
                  : relPath,
                pluginData,
                // watchFiles: [abs],
                // watchDirs: [dirname(path)],
                namespace: 'fnext.precompile',
                external: Boolean(importer),
              };
            }
          );

          build.onLoad(
            { namespace: 'fnext.pages', filter: /.*/ },
            ({ pluginData }) => {
              const dat: PluginData = pluginData;
              return {
                contents: `export { default } from 'fnext-virtual:${
                  dat.relPath
                }';
                export * from 'fnext-virtual:${dat.relPath}';
                typeof window !== 'undefined' && window[Symbol.for('fnext.register-page')](${JSON.stringify(
                  replaceExt(dat.relPath, '.mjs')
                )});
                `,
                loader: 'js',
                pluginData,
              };
            }
          );

          build.onResolve(
            { filter: /^fnext-virtual:.+/ },
            ({ pluginData, path }) => ({
              path,
              pluginData,
              namespace: 'fnext.precompile',
            })
          );

          build.onLoad(
            { namespace: 'fnext.precompile', filter: /.*/ },
            async ({ pluginData }) => {
              const dat = pluginData as PluginData;
              const path = dat.absPath;

              return {
                resolveDir: dirname(path),
                contents: dat.isPage
                  ? await readFile(path, { encoding: 'binary' })
                  : await transform(path, dat),
                // loader: `${dat.isTS ? 't' : 'j'}s${dat.isJSX ? 'x' : ''}`,
                // loader: 'tsx',
                loader: dat.isTS ? (dat.isJSX ? 'tsx' : 'ts') : 'tsx',
                // pluginName: 'fnext',
                pluginData,
              };
            }
          );
        },
      },
    ],

    define: {
      __IS_PROD__: 'false',
    },
  });

  const time = performance.now() - start;
  console.log(`Compiled ${filesCompiled.size} files in ${time}ms`);

  metafile = result.metafile;

  writeFileSync('./metafile.json', JSON.stringify(metafile));

  rebuild = result.rebuild;
}

let customDocument: string | undefined;
let customApp: string | undefined;

async function main() {
  // console.log(rootDir);
  const entryPoints = new Set(
    await glob('{pages,app}/**/*.{js,jsx,ts,tsx}', {
      onlyFiles: true,
      absolute: true,
    })
  );

  for (const path of Array.from(entryPoints)) {
    if (/\.d\.ts$/.test(path)) {
      entryPoints.delete(path);
      continue;
    }

    if (path.startsWith(pagesSrcDir + '/')) {
      const pathInPages = path.slice(pagesSrcDir.length + 1);

      if (/^_document.[tj]sx?$/.test(pathInPages)) {
        customDocument = relative(rootDir, path);
        continue;
      }

      if (/^_app.[tj]sx?$/.test(pathInPages)) {
        customApp = relative(rootDir, path);
        continue;
      }
    }
  }

  entryPoints.add('__fnext_injected/dom.tsx');
  entryPoints.add('__fnext_injected/dev_hooks.tsx');
  entryPoints.add('__fnext_injected/node_entrypoint.ts');

  if (!customDocument) {
    entryPoints.add('__fnext_injected/document.ts');
  }

  if (!customApp) {
    entryPoints.add('__fnext_injected/app.ts');
  }

  // await this - if it fails we should throw.
  await doBuild(Array.from(entryPoints)).then(() => emitter.emit('ready'));

  const fsHandlers: WatcherHandlers = {
    add(path, root, stat) {
      if (stat.isDirectory()) return;

      const abs = join(path, root);
      entryPoints.add(abs);

      enqueue(() => doBuild(Array.from(entryPoints), true));
    },
    del(path, root) {
      entryPoints.delete(join(root, path));
      // TODO: maybe this should trigger a reload?
      // It could also be annoying though if a page is deleted then the user is forcibly reloaded to a 404
      enqueue(() => doBuild(Array.from(entryPoints), true));
    },
    change(path, root) {
      enqueue(async () => {
        await doBuild(Array.from(entryPoints));
      });
      enqueue(async () => {
        await doBuild(Array.from(entryPoints));
        emitter.emit(
          'reload',
          relative(
            join(distDir, 'assets'),
            resolveDistFile(relative(rootDir, join(root, path)))
          )
        );
      });
    },
  };

  await Promise.all([
    createWatcher(pagesDir, fsHandlers),
    createWatcher(appDir, fsHandlers),
  ]);
}

main(); //.catch(console.error).finally(process.exit);

export function onReload(cb: (srcPath: string) => void): () => void {
  emitter.on('reload', cb);

  return () => emitter.off('reload', cb);
}

// export function getModule(moduleID: number): string | null {
//   let srcPath = modules[moduleID];
//   if (!srcPath) {
//     return null;
//   }

//   return resolveDistFile(srcPath);
// }

export function resolveDistFile(relPath: string): string | null {
  const entries = Object.entries(metafile.outputs);

  // console.log(entries);
  const entry = entries.find(
    ([, { entryPoint }]) =>
      entryPoint === `fnext.precompile:${relPath}` ||
      entryPoint === `fnext.pages:${relPath}`
  );

  if (!entry) {
    return null;
  }

  return entry[0];
}

function getRecursiveImports(outfile: string, files: Set<string> = new Set()) {
  const meta = metafile.outputs[outfile];

  files.add(outfile);

  for (const imp of meta.imports) {
    if (
      imp.kind === 'require-call' ||
      imp.kind === 'import-statement' ||
      imp.kind === 'import-rule'
    ) {
      getRecursiveImports(imp.path, files);
    }
  }

  return files;
}

export function resolveTemplate(
  name: string
): [filename: string, httpPath: string, imports: Array<string>] | null {
  const relPath = join('pages', name);

  const filename = resolveDistFile(relPath);

  if (filename == null) {
    return null;
  }

  return [
    join(rootDir, filename),
    relative(distName, filename),
    Array.from(getRecursiveImports(filename)).map((v) => relative(distName, v)),
  ];
}

export const readyPromise = new Promise<BuildMeta>((resolve) =>
  emitter.on('ready', async () => {
    resolve({
      documentPath: customDocument
        ? join(rootDir, resolveDistFile(customDocument)!)
        : join(distDir, 'assets/__fnext_injected/document.mjs'),
      appPath: customApp
        ? join(rootDir, resolveDistFile(customApp)!)
        : join(distDir, 'assets/__fnext_injected/app.mjs'),
      entrypointPath: join(
        distDir,
        'assets/__fnext_injected/node_entrypoint.mjs'
      ),
      domPath: 'assets/__fnext_injected/dom.mjs',
      devHookPath: 'assets/__fnext_injected/dev_hooks.mjs',
    });
  })
);
