const { transformSync } = require('esbuild');
const BuiltinModule = require('module');

const sourceMapSupport = require('source-map-support');

const Module =
  module.constructor.length > 1 ? module.constructor : BuiltinModule;

const maps = {};

// // Copied from https://github.com/babel/babel/blob/main/packages/babel-register/src/node.js#L16-L32
function installSourceMapSupport() {
  sourceMapSupport.install({
    handleUncaughtExceptions: false,
    environment: 'node',
    retrieveSourceMap(source) {
      const map = maps && maps[source];
      if (map) {
        return {
          url: null,
          map,
        };
      }

      return null;
    },
  });
}

const defaultCompiler = Module._extensions['.js'];

function getCompiler(loader) {
  // mostly sourced from https://github.com/ariporad/pirates/blob/master/src/index.js.
  return (mod, fileName) => {
    const oldCompile = mod._compile;

    if (fileName.match(/\/node_modules\//)) {
      return defaultCompiler(mod, fileName);
    }

    mod._compile = (code) => {
      mod._compile = oldCompile;

      const { code: compiledCode, map } = transformSync(code, {
        sourcemap: true,
        target: 'esnext',
        format: 'cjs',
        loader,
        sourcefile: fileName,
      });

      if (Object.keys(maps).length === 0) {
        installSourceMapSupport();
      }

      maps[fileName] = map;

      if (typeof compiledCode !== 'string') {
        throw new Error(typeof compiledCode);
      }

      return mod._compile(compiledCode, fileName);
    };

    return defaultCompiler(mod, fileName);
  };
}

module.exports = {
  register() {
    Module._extensions['.ts'] = getCompiler('ts');
    Module._extensions['.tsx'] = getCompiler('tsx');
    Module._extensions['.js'] = getCompiler('js');
    Module._extensions['.jsx'] = getCompiler('jsx');
  },
};
