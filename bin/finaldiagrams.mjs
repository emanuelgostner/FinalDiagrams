#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProject } from '../src/model.mjs';
import { exportProject, extractProject, updateProjectHTML, atomicWrite } from '../src/export.mjs';
import { startServer } from '../src/server.mjs';

const help = `FinalDiagrams — editable offline architecture documents

Usage:
  finaldiagrams validate project.json
  finaldiagrams export project.json [-o document.html]
  finaldiagrams extract document.html [-o project.json]
  finaldiagrams update document.html project.json [-o document.html]
  finaldiagrams serve project.json [--port 8787]

Export reads the packaged runtime; no per-document build is needed.
Update replaces embedded model data and preserves the document runtime and styles.
Serve binds 127.0.0.1 and atomically synchronizes the JSON source.
`;

export async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes('--help') || argv[0] === 'help' || argv[0] === '-h') {console.log(help);return;}
  const [command,...rest] = argv, files = [];
  let output, port = 8787;
  for (let i = 0;i < rest.length;i++) {
    const value = rest[i];
    if (value === '-o' || value === '--output') {output = rest[++i];if (!output || output.startsWith('-')) throw new Error('Output path is required.');}
    else if (value === '--port') {port = Number(rest[++i]);if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer between 0 and 65535.');}
    else if (value.startsWith('-')) throw new Error(`Unknown option: ${value}`);
    else files.push(value);
  }
  const requireFiles = count => {if (files.length !== count) throw new Error(`${command} requires ${count} input file${count === 1 ? '' : 's'}. Run finaldiagrams --help.`);};
  const json = async file => parseProject(await readFile(file,'utf8'));
  const defaultOutput = (file,extension) => resolve(`${file.slice(0,file.length-extname(file).length)}${extension}`);
  if (command === 'validate') {requireFiles(1);const project = await json(files[0]);console.log(`Valid: ${project.title} (${project.entities.length} entities, ${project.diagrams.length} diagrams)`);return;}
  if (command === 'export') {requireFiles(1);const destination = output ?? defaultOutput(files[0],'.html');if (resolve(destination) === resolve(files[0])) throw new Error('Export output must differ from JSON source.');await atomicWrite(destination,await exportProject(await json(files[0])));console.log(`Exported ${destination}`);return;}
  if (command === 'extract') {requireFiles(1);const destination = output ?? defaultOutput(files[0],'.json');if (resolve(destination) === resolve(files[0])) throw new Error('Extract output must differ from HTML source.');await atomicWrite(destination,JSON.stringify(extractProject(await readFile(files[0],'utf8')),null,2)+'\n');console.log(`Extracted ${destination}`);return;}
  if (command === 'update') {requireFiles(2);const destination = output ?? files[0];if (resolve(destination) === resolve(files[1])) throw new Error('HTML output must differ from JSON source.');await atomicWrite(destination,updateProjectHTML(await readFile(files[0],'utf8'),await json(files[1])));console.log(`Updated ${destination}`);return;}
  if (command === 'serve') {requireFiles(1);const connection = await startServer({sourcePath:files[0],port});console.log(`FinalDiagrams: ${connection.url}\nSource: ${resolve(files[0])}\nPress Ctrl+C to stop.`);for (const signal of ['SIGINT','SIGTERM']) process.once(signal,() => connection.close().then(() => {process.exitCode = 0;}));return connection;}
  throw new Error(`Unknown command: ${command}. Run finaldiagrams --help.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {console.error(error.message);process.exitCode = 1;});
}
