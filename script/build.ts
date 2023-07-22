import glob from 'fast-glob';
import { build } from 'esbuild';
import { access, rm, readdir } from 'fs/promises';
import { join, relative } from 'path';

const files = glob('./src/**/*');

const srcDir = join(process.cwd(), 'src');

async function doBuild(format: 'cjs' | 'esm') {
  return build({
    target: 'node16',
    format,
    outdir: `build/${format}`,
    outbase: 'src/',
    define: {
      __IS_ESM__: format === 'esm' ? 'true' : 'false',
      __IS_DEV__: process.env.DEV_BUILD === '1' ? 'true' : 'false',
    },
    sourcemap: 'both',
    entryPoints: await files,
    bundle: true,
    platform: 'node',
    outExtension: format === 'esm' ? { '.js': '.mjs' } : undefined,
    treeShaking: true,

    plugins: [
      {
        name: 'abs path resolver',
        setup(ctx) {
          ctx.onResolve(
            {
              filter: /.*/,
            },
            ({ importer, path, resolveDir }) => {
              if (resolveDir.startsWith(srcDir)) {
                if (/^fnext\//.test(path)) {
                  let rel = relative(
                    resolveDir,
                    join(srcDir, path.slice('fnext/'.length))
                  );

                  if (rel[0] !== '.') {
                    rel = `./${rel}`;
                  }

                  return {
                    external: true,
                    path: format === 'esm' ? rel + '.mjs' : rel,
                  };
                }
              }

              return {
                // namespace: (/^\./.test(path) && importer) ? 'blah' : undefined,
                path:
                  format === 'esm' && /^\./.test(path) && importer
                    ? path + '.mjs'
                    : undefined,
                external: Boolean(importer),
              };
            }
          );
        },
      },
    ],
  });
}

async function main() {
  await rm('build', { force: true, recursive: true });

  await Promise.all([doBuild('cjs'), doBuild('esm')]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
