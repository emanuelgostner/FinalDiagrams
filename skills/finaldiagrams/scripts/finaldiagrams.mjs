#!/usr/bin/env node
/** Resolve a release's standalone runtime or the enclosing complete plugin. */
import { existsSync } from 'node:fs';

const candidates = [
  new URL('../assets/finaldiagrams/bin/finaldiagrams.mjs', import.meta.url),
  new URL('../../../bin/finaldiagrams.mjs', import.meta.url),
];

try {
  const entry = candidates.find(candidate => existsSync(candidate));
  if (!entry) throw new Error('FinalDiagrams runtime is missing. Install the complete plugin or the standalone skill from a built release, including its assets directory.');
  const { main } = await import(entry.href);
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
