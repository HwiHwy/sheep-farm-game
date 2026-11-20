import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
await rm(resolve(root, 'dist'), { recursive: true, force: true });
console.log('Cleaned dist/');
