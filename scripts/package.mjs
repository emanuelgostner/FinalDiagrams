import { readFile, writeFile, readdir, mkdir, access } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'artifacts');
const runtimePaths = ['bin/finaldiagrams.mjs', 'src/model.mjs', 'src/export.mjs', 'src/server.mjs', 'src/styles.css', 'dist/runtime.js'];
const skillPath = 'skills/finaldiagrams';
const onboardingSkillPath = 'skills/monorepo-onboarding';
const exists = async path => access(path).then(() => true, () => false);

async function collectTree(path, skip = () => false) {
  const result = [];
  for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (skip(child)) continue;
    if (entry.isDirectory()) result.push(...await collectTree(child, skip));
    else if (entry.isFile()) result.push(child);
    else throw new Error(`Release inputs must be regular files or directories: ${child}`);
  }
  return result.sort();
}

// ZIP32, stored entries: no compression library, native executable or platform dependency.
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const local = [], central = [];
  let offset = 0, centralSize = 0;
  if (entries.length > 65535) throw new Error('Release exceeds ZIP32 entry limit.');
  for (const [path, data] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    if (!path || path.includes('\\') || path.startsWith('/') || path.split('/').some(part => part === '..' || part === '.')) throw new Error(`Unsafe ZIP entry path: ${path}`);
    const name = Buffer.from(path, 'utf8'), crc = crc32(data);
    if (data.length > 0xffffffff || name.length > 65535) throw new Error(`Release entry exceeds ZIP32 limits: ${path}`);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0x0021, 12); // Fixed 1980-01-01 timestamp for reproducible archives.
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(0x0021, 14); record.writeUInt32LE(crc, 16); record.writeUInt32LE(data.length, 20); record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
    central.push(record, name); centralSize += record.length + name.length; offset += header.length + name.length + data.length;
    if (offset + centralSize > 0xffffffff) throw new Error('Release exceeds ZIP32 archive size.');
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

// Read all required inputs before writing any output. A source checkout needs one library build.
const required = [...runtimePaths, 'THIRD-PARTY-NOTICES.md', 'README.md', 'plugin.json', '.codex-plugin/plugin.json', '.claude-plugin/plugin.json', `${skillPath}/SKILL.md`, `${onboardingSkillPath}/SKILL.md`, 'host-config/claude/agents/module-scanner.md', 'host-config/claude/agents/database-scanner.md'];
for (const path of required) if (!await exists(join(root, path))) throw new Error(`Missing release input: ${path}. Include both complete skills and host configuration, and build the library runtime with npm run build before packaging.`);
const skillFiles = await collectTree(skillPath, path => path === `${skillPath}/assets/finaldiagrams`);
const onboardingSkillFiles = await collectTree(onboardingSkillPath);
if (onboardingSkillFiles.some(path => path.startsWith(`${onboardingSkillPath}/assets/finaldiagrams/`))) throw new Error('The onboarding wrapper must reuse the base skill runtime rather than bundle another copy.');
const pluginFiles = new Set([...required, ...skillFiles, ...onboardingSkillFiles, ...await collectTree('host-config'), ...await collectTree('docs'), ...(await collectTree('examples')).filter(path => path.endsWith('.json'))]);
const notices = [];
for (const path of ['THIRD-PARTY-NOTICES.md', 'THIRD-PARTY-NOTICES.txt', 'LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
  if (await exists(join(root, path))) { pluginFiles.add(path); notices.push(path); }
}
const contents = new Map(await Promise.all([...pluginFiles].map(async path => [path, await readFile(join(root, path))])));
const pluginEntries = [...contents].map(([path, data]) => [`finaldiagrams/${path}`, data]);
const standaloneEntries = skillFiles.map(path => [`finaldiagrams/${relative(join(root, skillPath), join(root, path)).split(sep).join('/')}`, contents.get(path)]);
for (const path of [...runtimePaths, ...notices]) standaloneEntries.push([`finaldiagrams/assets/finaldiagrams/${path}`, contents.get(path)]);
const skillBundleEntries = [...standaloneEntries, ...onboardingSkillFiles.map(path => [`monorepo-onboarding/${relative(join(root, onboardingSkillPath), join(root, path)).split(sep).join('/')}`, contents.get(path)])];
// Copilot CLI accepts colon-qualified skill names. Keep that host-specific name
// out of portable skills: VS Code/Codex/Claude expect unqualified frontmatter.
const copilotSkillEntries = skillBundleEntries.map(([path, data]) => {
  if (path !== 'monorepo-onboarding/SKILL.md') return [path, data];
  const source = data.toString('utf8');
  const renamed = source.replace(/^(---\r?\n)name: monorepo-onboarding(?=\r?\n)/, '$1name: finaldiagrams:monorepo-onboarding');
  if (renamed === source) throw new Error('Could not apply the Copilot CLI onboarding skill name.');
  return [path, Buffer.from(renamed, 'utf8')];
});
await mkdir(artifacts, { recursive: true });
for (const [filename, entries] of [['finaldiagrams-plugin.zip', pluginEntries], ['finaldiagrams-skill.zip', standaloneEntries], ['finaldiagrams-skills.zip', skillBundleEntries], ['finaldiagrams-copilot-skills.zip', copilotSkillEntries]]) {
  const target = join(artifacts, filename);
  await writeFile(target, zip(entries));
  console.log(`Packaged ${target} (${entries.length} files)`);
}
