import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'hub.css', 'hub.js']) {
  await copyFile(resolve(root, file), resolve(dist, file));
}
await writeFile(resolve(dist, '.nojekyll'), '');
console.log('Copied game selector to dist/');
