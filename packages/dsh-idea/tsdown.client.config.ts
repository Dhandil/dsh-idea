/**
 * Standalone web client bundle. Mirrors the Harness first-party client preset
 * shape (packages/client/tsdown.client.ts `clientConfig`): a closure-factory
 * artifact that registers itself with `window.__ModuleLoader__.load({id,
 * factory})`; the module table answers the platform seed words and the
 * packages this manifest injects, everything else must inline so the factory
 * never requires a specifier the table cannot resolve.
 */
import { defineConfig } from 'tsdown'

const PLUGIN_ID = '@dsh-external/dsh-idea'

// The shell's shared module table (packages/client/web/src/platform.ts).
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
] as const

const externals: ReadonlySet<string> = new Set(PLATFORM_MODULES)

export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: (specifier: string) => externals.has(specifier),
    alwaysBundle: (specifier: string) => !externals.has(specifier),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env': JSON.stringify({ MODE: 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})
