export interface PluginData {
  absPath: string;
  relPath: string;
  isPage: boolean;
  isTS: boolean;
  isJSX: boolean;
}

export interface BuildMeta {
  appPath: string;
  domPath: string;
  documentPath: string;
  devHookPath?: string;
  entrypointPath: string;
}

// These are some internal constants set at build time via esbuild.
// @internal
declare global {
  export const __IS_ESM__: boolean;
  export const __IS_DEV__: boolean;
}
