import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const extensionRoot = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = resolve(extensionRoot, '../..');
const DEFAULT_API_BASE_URL = 'http://localhost:4000/api';

/**
 * tldts embeds the Public Suffix List. Its prebuilt minified ESM bundle is about half the size of
 * what bundling its ES source produces (the trie data minifies poorly), so use it directly.
 */
const TLDTS_MIN_BUNDLE = createRequire(import.meta.url).resolve('tldts/dist/index.esm.min.js');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function parseApiBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`VITE_API_BASE_URL is not a valid URL: "${value}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`VITE_API_BASE_URL must use http or https: "${value}"`);
  }
  return url;
}

/**
 * Emits `manifest.json` into the build:
 * - `version` comes from package.json (single source of truth),
 * - `host_permissions` is limited to the origin of the sync API (no website access at all).
 */
function manifestPlugin(apiBaseUrl: URL): Plugin {
  const manifestPath = resolve(extensionRoot, 'manifest.json');
  const packagePath = resolve(extensionRoot, 'package.json');
  return {
    name: 'stilltime:manifest',
    buildStart() {
      this.addWatchFile(manifestPath);
      this.addWatchFile(packagePath);
    },
    generateBundle(_options, bundle) {
      const manifest = readJson<Record<string, unknown>>(manifestPath);
      manifest['version'] = readJson<{ version: string }>(packagePath).version;
      manifest['host_permissions'] = [`${apiBaseUrl.origin}/*`];

      const background = (manifest['background'] as { service_worker?: string } | undefined)?.service_worker;
      if (!background || !(background in bundle)) {
        this.error(`Manifest service worker "${background}" was not emitted by the build`);
      }
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: `${JSON.stringify(manifest, null, 2)}\n` });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repositoryRoot, 'VITE_');
  const apiBaseUrl = parseApiBaseUrl(env['VITE_API_BASE_URL'] || DEFAULT_API_BASE_URL);
  const isDevelopment = mode === 'development';

  if (!existsSync(resolve(extensionRoot, 'public/icons/icon-128.png'))) {
    console.warn('[stilltime] Extension icons are missing — run `npm run icons -w @stilltime/extension`.');
  }

  return {
    root: extensionRoot,
    envDir: repositoryRoot,
    resolve: {
      alias: { '@': resolve(extensionRoot, 'src'), tldts: TLDTS_MIN_BUNDLE },
    },
    define: {
      __API_BASE_URL__: JSON.stringify(apiBaseUrl.href.replace(/\/+$/, '')),
      // The repository-root .env is shared with the backend, and Vite lets a NODE_ENV entry there
      // override the build. Derive it from the build mode only, so production builds always ship
      // React's production bundle.
      'process.env.NODE_ENV': JSON.stringify(isDevelopment ? 'development' : 'production'),
    },
    plugins: [react(), tailwindcss(), manifestPlugin(apiBaseUrl)],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'chrome120',
      sourcemap: isDevelopment,
      minify: !isDevelopment,
      // Extension pages load from the local package; preload polyfills are pointless here.
      modulePreload: { polyfill: false },
      rolldownOptions: {
        input: {
          popup: resolve(extensionRoot, 'index.html'),
          background: resolve(extensionRoot, 'src/background/service-worker.ts'),
        },
        output: {
          // The manifest references the service worker by a stable name.
          entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
