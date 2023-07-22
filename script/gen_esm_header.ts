import { isAbsolute, resolve } from 'path';
if (process.argv.length !== 4) {
  console.log('Usage:', 'gen_esm_headers', 'alias', 'path');
  console.log('alias:', 'The alias for the package (eg `react`)');
  console.log('path:', 'The path to the index file');
  process.exit(1);
}

const [, , alias, path] = process.argv;

const absPath = isAbsolute(path) ? path : resolve(process.cwd(), path);

const exported = require(absPath);

const str = `// Generated.  Do not edit.
import * as __cjs__exports from '${alias}';
export const {${Object.keys(exported).join(',')}} = __cjs__exports;
`;

console.log(str);
process.exit();
