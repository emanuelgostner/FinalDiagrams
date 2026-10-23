import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const result = await build({ entryPoints: ['src/app.js'], bundle: true, format: 'iife', platform: 'browser', target: ['chrome110', 'firefox115', 'safari16'], outfile: 'dist/runtime.js', minify: true, legalComments: 'inline', metafile: true });
await writeFile('dist/build-meta.json', JSON.stringify(result.metafile, null, 2));
console.log('Built offline runtime: dist/runtime.js');
