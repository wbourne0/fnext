const path = require('path');

if (!process.env.ROOT_DIR) {
  // note that if this file is moved, this will need to be updated!
  process.env.ROOT_DIR = path.join(__dirname, '../..');
}

// const moduleAlias = require('module-alias');
// moduleAlias.addAliases({
//   shared: path.join(process.env.ROOT_DIR, 'shared'),
//   server: path.join(process.env.ROOT_DIR, 'server'),
//   app: path.join(process.env.ROOT_DIR, 'app'),
//   config: path.join(process.env.ROOT_DIR, 'config'),
//   'generated-gql': path.join(process.env.ROOT_DIR, '__generated__'),
//   '@replit/languages': path.join(process.env.ROOT_DIR, 'shared/languages'),
// });

// Copied from https://github.com/babel/babel/edit/main/packages/babel-register/src/nodeWrapper.js with `./node` changed to `./registerEsbuild`.
const Module = require('module');

const globalModuleCache = Module._cache;
const internalModuleCache = Object.create(null);

Module._cache = internalModuleCache;
const node = require('./registerEsbuild');
Module._cache = globalModuleCache;

// Add source-map-support to global cache as it's stateful
// const smsPath = require.resolve('source-map-support');
// globalModuleCache[smsPath] = internalModuleCache[smsPath];

node.register();
// require('app/lib/datadog').initTestingProxy();

module.exports = node;
