import { dirname, join, extname, relative } from 'path';

const moduleDirname = __IS_ESM__
  ? dirname(import.meta.url.slice('file://'.length))
  : __dirname;

export const fnextBuildDir = join(moduleDirname, '../..');
export const fnextRootDir = join(fnextBuildDir, '../..');
export const fnextInjectedPath = join(fnextRootDir, 'injected');

export const rootDir = process.env.FNEXT_ROOT_DIR || process.cwd();
export const pagesSrcDir = join(rootDir, 'pages');
export const distName = '.fnext';
export const distDir = process.env.FNEXT_DIST_DIR || join(rootDir, distName);
export const chunkDir = join(distDir, 'chunks');
export const nodeModulesPath = join(rootDir, 'node_modules');

export function isChildOf(path: string, parent: string) {
  return path.startsWith(parent + '/');
}

export function replaceExt(path: string, newExt: string): string {
  return path.slice(0, -extname(path).length) + newExt;
}

export function relativeWithDot(from: string, to: string) {
  const path = relative(from, to);

  if (path[0] !== '.') {
    return `./${path}`;
  }

  return path;
}
