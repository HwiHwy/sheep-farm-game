import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(appRoot, '..');
const pagesRoot = process.env.GITHUB_PAGES === 'true' ? '/sheep-farm-game/' : '/';

export default defineConfig({
  root: appRoot,
  base: `${pagesRoot}farm/`,
  publicDir: resolve(appRoot, 'public'),
  build: {
    outDir: resolve(repoRoot, 'dist/farm'),
    emptyOutDir: false,
    assetsDir: 'assets',
    rollupOptions: {
      input: resolve(appRoot, 'index.html')
    }
  }
});
