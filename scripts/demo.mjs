import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { exportProject } from '../src/export.mjs';
await mkdir('artifacts', { recursive: true });
const project = JSON.parse(await readFile('examples/all-diagrams.json', 'utf8'));
const html = await exportProject(project);
await writeFile('artifacts/all-diagrams.html', html);
console.log(`artifacts/all-diagrams.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB)`);
