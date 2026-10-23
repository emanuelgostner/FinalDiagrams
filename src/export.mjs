import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { assertProject, parseProject } from './model.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const scriptElement = /<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi;

export function serializeProject(project) {
  assertProject(project);
  return JSON.stringify(project, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function locateProject(html) {
  const matches = [...html.matchAll(scriptElement)].filter(match => {
    // Read whole attributes so data-id and quoted attribute contents cannot mimic id.
    const attributes = [...match[1].matchAll(/(?:^|\s)([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)];
    return attributes.some(attribute => attribute[1].toLowerCase() === 'id' && (attribute[2] ?? attribute[3] ?? attribute[4]) === 'fd-project');
  });
  if (matches.length !== 1) throw new Error(`Expected exactly one fd-project script; found ${matches.length}.`);
  return matches[0];
}

export function extractProject(html) { return parseProject(locateProject(String(html))[2]); }

export function updateProjectHTML(html, project) {
  html = String(html); const match = locateProject(html);
  const replacement = `<script id="fd-project" type="application/json">\n${serializeProject(project)}\n</script>`;
  return html.slice(0, match.index) + replacement + html.slice(match.index + match[0].length);
}

function escapeHTML(value) { return value.replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])); }

export async function exportProject(project, options = {}) {
  assertProject(project);
  const [runtime, styles, notices] = await Promise.all([
    options.runtime ?? readFile(options.runtimePath ?? resolve(root, 'dist/runtime.js'), 'utf8'),
    options.styles ?? readFile(options.stylesPath ?? resolve(root, 'src/styles.css'), 'utf8'),
    options.notices ?? readFile(options.noticesPath ?? resolve(root, 'THIRD-PARTY-NOTICES.md'), 'utf8')
  ]);
  // Bundled executable assets are trusted, but HTML raw-text termination is not.
  if (/<\/script\s*[>\/]/i.test(runtime)) throw new Error('Runtime contains a literal closing script tag; rebuild with safe script escaping.');
  if (/<\/style\s*[>\/]/i.test(styles)) throw new Error('Styles contain a literal closing style tag.');
  // A div preserves initial newlines (unlike pre). Character references preserve
  // carriage returns that HTML parsing would otherwise normalize to linefeeds.
  const noticeText = escapeHTML(notices).replace(/\r/g,'&#13;');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHTML(project.title)}</title><style id="fd-styles">\n${styles}\n</style></head><body><div id="app"></div>\n<div id="fd-notices" hidden>${noticeText}</div>\n<script id="fd-project" type="application/json">\n${serializeProject(project)}\n</script>\n<script id="fd-runtime">\n${runtime}\n</script>\n</body></html>\n`;
}

/** Same-directory rename makes source replacement atomic for readers and watchers. */
export async function atomicWrite(path, data) {
  path = resolve(path);
  const temporary = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, data, {encoding:'utf8',flag:'wx'});
    // Windows readers and virus scanners can briefly hold the destination open.
    // Retry the atomic rename itself; never remove the last-good destination.
    for (let attempt = 0; ; attempt++) {
      try {await rename(temporary,path);break;}
      catch (error) {
        if (process.platform !== 'win32' || !['EPERM','EACCES','EBUSY'].includes(error.code) || attempt >= 7) throw error;
        await delay(Math.min(10 * 2 ** attempt,160));
      }
    }
  }
  finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
