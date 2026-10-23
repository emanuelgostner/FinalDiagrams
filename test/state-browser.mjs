import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { extractProject, exportProject } from '../src/export.mjs';
import { assertProject } from '../src/model.mjs';

const source = assertProject(JSON.parse(await readFile('examples/input-validation-state.json', 'utf8')));
const errorIDs = ['save-error', 'blur-error'];
assert.equal(source.diagrams.length, 1, 'The delivered example contains only the useful validation view.');
assert.equal(source.blocks.some(block => block.type === 'heading'), false, 'The document title is not repeated in a heading block.');
for (const id of errorIDs) {
  const outgoing = source.relations.filter(relation => relation.source === id);
  assert.equal(outgoing.length, 1, 'An existing error has only one clearing event.');
  assert.equal(outgoing[0].target, 'regular-input');
  assert.equal(outgoing[0].tone, 'success');
  assert.equal(outgoing[0].label, 'Field blur [input valid]');
}

// The validation fixture stays in the test cache; artifacts contains only the public demo.
await mkdir('.cache/test-state', { recursive: true });
await writeFile('.cache/test-state/input-validation-state.html', await exportProject(source));

let executablePath = process.env.FINALDIAGRAMS_BROWSER;
if (!executablePath) {
  for (const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']) {
    try { await access(candidate); executablePath = candidate; break; } catch {}
  }
}
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [], requests = [];
function observe(target) {
  target.on('pageerror', error => errors.push(error.message));
  target.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
}
observe(page);
const ready = target => target.waitForFunction(() => document.querySelectorAll('.diagram-canvas[data-ready="true"]').length === 1);
const node = (target, id) => target.locator(`[data-entity-id="${id}"]`);
const edge = (target, id) => target.locator(`[data-relation-id="${id}"]`);
async function select(target, locator) {
  const info=locator.locator('.fd-info').first();
  await info.focus();
  await info.press('Enter');
  await target.locator('#inspector').waitFor({ state: 'visible' });
}
async function compactChrome(target) {
  assert.equal(await target.getByRole('heading', { name: 'Input validation', exact: true }).count(), 1, 'One visible document title.');
  const text = await target.locator('body').innerText();
  for (const boilerplate of ['FinalDiagrams', 'AN INTERACTIVE SOFTWARE GUIDE', 'Built to be understood.', 'Read · explore · edit', 'Works entirely offline']) {
    assert.equal(text.includes(boilerplate), false, `No default chrome copy: ${boilerplate}`);
  }
  const header = target.locator('.topbar');
  if (await header.count()) assert.ok((await header.boundingBox()).height <= 90, 'Desktop header stays compact.');
  assert.equal(await target.getByRole('button',{name:'Document navigation',exact:true}).count(),1,'The outline is available even for a short document.');
  assert.equal(await target.locator('#document-navigation .outline-title strong').textContent(),'Input validation','The outline links to the document title.');
  assert.equal(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Document does not overflow the viewport.');
}

await mkdir('.cache/test-state/screenshots', { recursive: true });
await mkdir('.cache/test-state', { recursive: true });
try {
  await page.goto(pathToFileURL(resolve('.cache/test-state/input-validation-state.html')).href);
  await ready(page);
  await compactChrome(page);
  assert.equal(await page.locator('.diagram-card').count(), 1);
  const model = await page.evaluate(() => window.FinalDiagrams.getProject());
  assert.equal(model.diagrams[0].type, 'state');
  for (const entity of source.entities) {
    assert.equal(await node(page, entity.id).getAttribute('data-state-kind'), entity.kind);
    assert.equal(await node(page, entity.id).getAttribute('data-tone'), entity.tone);
    assert.ok((await node(page, entity.id).getAttribute('aria-label')).includes(entity.name), `Accessible state label: ${entity.name}`);
  }
  assert.equal(await node(page, 'regular-input').locator('rect.fd-node-body').evaluate(rect => Number(rect.getAttribute('rx')) > 0), true, 'Regular state is rounded.');
  assert.ok(await node(page, 'validity-choice').locator('polygon.fd-node-body, path.fd-node-body').count() > 0, 'Choice uses a diamond shape.');
  for (const relation of source.relations) {
    assert.equal(await edge(page, relation.id).getAttribute('data-tone'), relation.tone);
    assert.ok((await edge(page, relation.id).getAttribute('aria-label')).includes(relation.label), `Accessible transition label: ${relation.label}`);
    assert.equal(await edge(page, relation.id).locator('.fd-edge-line').evaluate(path => path.getTotalLength() > 0), true, 'Every cycle branch has a visible route.');
  }
  for (const id of ['clear-save-error', 'clear-blur-error']) {
    assert.equal(await edge(page, id).locator('.fd-edge-line').evaluate(path => {
      const [red, green, blue] = getComputedStyle(path).stroke.match(/[\d.]+/g).map(Number);
      return green > red && green > blue;
    }), true, 'Clearing transitions render green.');
  }
  const routing = await page.evaluate(() => {
    const p = window.FinalDiagrams.getProject();
    return p.relations.map(relation => {
      const owner = document.querySelector(`[data-relation-id="${relation.id}"]`);
      const path = owner.querySelector('.fd-edge-line'), matrix = path.getScreenCTM(), length = path.getTotalLength();
      const end = path.getPointAtLength(length).matrixTransform(matrix);
      const target = document.querySelector(`[data-entity-id="${relation.target}"] .fd-node-body`).getBoundingClientRect();
      const distance = (point, box) => Math.hypot(Math.max(box.left - point.x, 0, point.x - box.right), Math.max(box.top - point.y, 0, point.y - box.bottom));
      const label = owner.querySelector('[data-edge-label]').getBoundingClientRect();
      let labelGap = Infinity;
      for(let step=0;step<=200;step++)labelGap=Math.min(labelGap,distance(path.getPointAtLength(length*step/200).matrixTransform(matrix),label));
      return {id:relation.id,arrowGap:distance(end,target)/matrix.a,labelGap:labelGap/matrix.a,rounded:path.getAttribute('d').includes('Q')};
    });
  });
  assert.ok(routing.some(route => route.rounded), 'Bent state transitions use rounded corners.');
  for(const route of routing){
    assert.ok(route.arrowGap>=4&&route.arrowGap<=12, `Arrowhead has breathing room before its target: ${route.id}`);
    assert.ok(route.labelGap<=15, `Transition label stays beside its own line: ${route.id}`);
  }
  assert.match(await page.locator('[data-prose-id="validation-rule"]').innerText(), /Typing alone or pressing Save does not clear it/);
  const informationGaps=await page.locator('[data-edge-label]').evaluateAll(labels=>labels.map(label=>{
    const text=label.querySelector('.fd-edge-label-text'),information=label.querySelector('.fd-info');
    if(!text||!information)return {id:label.dataset.edgeLabel,gap:null};
    const matrix=label.getScreenCTM(),scale=Math.hypot(matrix.a,matrix.b);
    return {id:label.dataset.edgeLabel,gap:(information.getBoundingClientRect().left-text.getBoundingClientRect().right)/scale};
  }));
  assert.equal(informationGaps.length,source.relations.filter(relation=>relation.label).length,'Each transition label has a measurable information control.');
  for(const {id,gap} of informationGaps)assert.ok(gap!==null&&gap>=2&&gap<=12,`Transition ${id} keeps its information icon beside the actual text (gap ${gap} SVG units).`);

  const information = page.getByRole('button', { name: 'Information about Regular input', exact: true });
  assert.ok(await page.locator('.fd-info').count()>0);
  assert.equal(await page.locator('.fd-info').evaluateAll(controls=>controls.every(control=>{
    for(let owner=control;owner;owner=owner.parentElement){
      if(owner.hasAttribute('title')||[...owner.children].some(child=>child.localName==='title'))return false;
    }
    return true;
  })),true,'Information controls and their ancestors do not also trigger inherited native title tooltips.');
  await information.hover();
  await page.getByRole('tooltip').waitFor({state:'visible'});
  assert.match(await page.getByRole('tooltip').innerText(),/missing or invalid input until Save or field blur/,'Hover shows the custom information tooltip.');
  await information.focus();
  await page.getByRole('tooltip').waitFor({ state: 'visible' });
  assert.match(await page.getByRole('tooltip').innerText(), /missing or invalid input until Save or field blur/);
  await information.press('Enter');
  await page.locator('#inspector').waitFor({ state: 'visible' });
  assert.match(await page.locator('#inspector').innerText(), /visible state, not a guarantee/);
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.screenshot({ path: '.cache/test-state/screenshots/state-validation.png', fullPage: false });

  await page.getByRole('button', { name: 'Edit document', exact: true }).click();
  await ready(page);
  await select(page, node(page, 'regular-input'));
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Regular field');
  await page.getByRole('textbox', { name: 'Name', exact: true }).blur();
  await ready(page);
  await page.getByRole('combobox', { name: 'Tone', exact: true }).selectOption('info');
  await ready(page);
  await page.waitForFunction(() => window.FinalDiagrams.getProject().entities.find(entity => entity.id === 'regular-input').tone === 'info');
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await select(page, edge(page, 'clear-save-error'));
  await page.getByRole('textbox', { name: 'Label', exact: true }).fill('Field blur [correct value]');
  await page.getByRole('textbox', { name: 'Label', exact: true }).blur();
  await ready(page);
  await page.getByRole('combobox', { name: 'Tone', exact: true }).selectOption('warning');
  await ready(page);
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.getByRole('button', { name: 'Done editing', exact: true }).click();
  await ready(page);
  const edited = await page.evaluate(() => window.FinalDiagrams.getProject());
  assert.equal(edited.entities.find(entity => entity.id === 'regular-input').name, 'Regular field');
  assert.equal(edited.entities.find(entity => entity.id === 'regular-input').tone, 'info');
  assert.equal(edited.relations.find(relation => relation.id === 'clear-save-error').label, 'Field blur [correct value]');
  assert.equal(edited.relations.find(relation => relation.id === 'clear-save-error').tone, 'warning');
  assert.equal(await node(page, 'regular-input').getAttribute('data-tone'), 'info', 'State tone edits reach the diagram.');
  assert.equal(await edge(page, 'clear-save-error').getAttribute('data-tone'), 'warning', 'Transition tone edits reach the diagram.');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save HTML ↓', exact: true }).click();
  const savedPath = resolve('.cache/test-state/edited-validation.html');
  await (await downloadPromise).saveAs(savedPath);
  assert.deepEqual(extractProject(await readFile(savedPath, 'utf8')), edited, 'Save HTML preserves all current JSON data.');
  const reopened = await context.newPage();
  observe(reopened);
  await reopened.goto(pathToFileURL(savedPath).href);
  await ready(reopened);
  assert.deepEqual(await reopened.evaluate(() => window.FinalDiagrams.getProject()), edited, 'Reopening preserves semantic edits.');
  await compactChrome(reopened);
  await reopened.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await ready(reopened);
  assert.equal(await reopened.locator('html').getAttribute('data-theme'), 'dark');
  await reopened.setViewportSize({ width: 390, height: 844 });
  assert.equal(await reopened.locator('kbd.search-shortcut').isVisible(),false,'The shortcut hint yields space on a narrow state document.');
  assert.equal(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile page does not overflow.');
  await reopened.getByRole('button', { name: 'Read Validation flow', exact: true }).click();
  assert.ok(await reopened.locator('.diagram-canvas svg > g').evaluate(group => Number(group.getAttribute('transform').match(/scale\(([^)]+)/)[1]) >= .7), 'Read mode keeps state text readable on a narrow screen.');
  await reopened.screenshot({ path: '.cache/test-state/screenshots/state-mobile-dark.png', fullPage: false });

  // Additional UML forms belong in a test model, not the delivered validation example.
  const forms = {
    schemaVersion: 1, id: 'state-forms-test', title: 'State shapes', revision: 0,
    entities: [
      { id: 'start', kind: 'initial', name: 'Start' },
      { id: 'working', kind: 'state', name: 'Working' },
      { id: 'finish', kind: 'final', name: 'Finished' },
    ],
    relations: [
      { id: 'begin', source: 'start', target: 'working', kind: 'transition', label: 'Begin' },
      { id: 'repeat', source: 'working', target: 'working', kind: 'transition', label: 'Retry' },
      { id: 'complete', source: 'working', target: 'finish', kind: 'transition', label: 'Complete', tone: 'success' },
    ],
    diagrams: [{ id: 'state-forms', type: 'state', title: 'State forms', entityIds: ['start', 'working', 'finish'], relationIds: ['begin', 'repeat', 'complete'] }],
    blocks: [{id:'legacy-title',type:'heading',level:1,text:'State shapes'},{ id: 'state-forms-block', type: 'diagram', diagramId: 'state-forms' }],
  };
  assertProject(forms);
  await page.evaluate(project => window.FinalDiagrams.setProject(project), forms);
  await ready(page);
  assert.equal(await page.getByRole('heading', { name: 'State shapes', exact: true }).count(), 1, 'Existing documents with a matching first heading show their title once.');
  assert.equal(await node(page, 'start').getAttribute('data-state-kind'), 'initial');
  assert.equal(await node(page, 'finish').getAttribute('data-state-kind'), 'final');
  assert.ok(await node(page, 'start').locator('circle.fd-node-body').count() >= 1, 'Initial state has a filled circle.');
  assert.equal(await node(page, 'finish').evaluate(group => [...group.children].filter(child => child.tagName === 'circle' && child.getAttribute('fill') !== 'transparent').length >= 2), true, 'Final state has two visible concentric circles.');
  assert.equal(await edge(page, 'repeat').locator('.fd-edge-line').evaluate(path => {
    const box = path.getBBox();
    return path.getTotalLength() > 20 && box.width > 0 && box.height > 0;
  }), true, 'A self-transition has a non-degenerate visible loop.');

  // SVG framing must contain cycles and labels, even after dragging into negative coordinates.
  forms.diagrams[0].positions={start:{x:-180,y:-120},working:{x:-120,y:-30},finish:{x:160,y:180}};
  await page.evaluate(project => window.FinalDiagrams.setProject(project), forms);
  await ready(page);
  const svgDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export SVG State forms',exact:true}).click();
  const svgPath=resolve('.cache/test-state/state-forms.svg');
  await (await svgDownload).saveAs(svgPath);
  const exported=await context.newPage();observe(exported);
  await exported.goto(pathToFileURL(svgPath).href);
  assert.equal(await exported.evaluate(()=>{
    const svg=document.documentElement,view=svg.viewBox.baseVal,box=svg.querySelector(':scope > g').getBBox();
    return view.x<0&&view.y<0&&box.x>=view.x&&box.y>=view.y&&box.x+box.width<=view.x+view.width&&box.y+box.height<=view.y+view.height;
  }),true,'Standalone SVG contains every shape, label and loop inside its viewBox.');

  // Opposite events between level cards need distinct usable lanes and ports.
  const reciprocal={schemaVersion:1,id:'reciprocal-state-test',title:'Opposite validation events',revision:0,
    entities:[{id:'save-state',kind:'state',name:'Error after Save',tone:'error'},{id:'blur-state',kind:'state',name:'Error after blur',tone:'warning'}],
    relations:[{id:'save-to-blur',source:'save-state',target:'blur-state',kind:'transition',label:'Field blur [invalid]',tone:'warning'},{id:'blur-to-save',source:'blur-state',target:'save-state',kind:'transition',label:'Save [invalid]',tone:'error'}],
    diagrams:[{id:'opposite-events',type:'state',title:'Reciprocal state lanes',direction:'RIGHT',entityIds:['save-state','blur-state'],relationIds:['save-to-blur','blur-to-save'],positions:{'save-state':{x:60,y:110},'blur-state':{x:520,y:110}}}],
    blocks:[{id:'opposite-events-view',type:'diagram',diagramId:'opposite-events'}]};
  assertProject(reciprocal);await writeFile('.cache/test-state/reciprocal-state.json',JSON.stringify(reciprocal,null,2));
  await page.evaluate(project=>window.FinalDiagrams.setProject(project),reciprocal);await ready(page);
  async function reciprocalGeometry(){
    const geometry=await page.evaluate(()=>{
      const owners=['save-to-blur','blur-to-save'].map(id=>document.querySelector(`[data-relation-id="${id}"]`));
      const routes=owners.map(owner=>{const path=owner.querySelector('.fd-edge-line'),length=path.getTotalLength(),points=Array.from({length:241},(_,index)=>{const point=path.getPointAtLength(length*index/240);return {x:point.x,y:point.y};});return {start:points[0],end:points.at(-1),points,label:owner.querySelector('[data-edge-label]').getBoundingClientRect()};});
      let closest=Infinity;for(const a of routes[0].points)for(const b of routes[1].points)closest=Math.min(closest,Math.hypot(a.x-b.x,a.y-b.y));
      const a=routes[0].label,b=routes[1].label;
      const overlap=a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
      return {closest,labelOverlap:overlap,firstPortSeparation:Math.abs(routes[0].start.y-routes[1].end.y),secondPortSeparation:Math.abs(routes[1].start.y-routes[0].end.y)};
    });
    assert.ok(geometry.firstPortSeparation>=16&&geometry.secondPortSeparation>=16,'Opposite events use separate attachment rows on both level cards.');
    assert.ok(geometry.closest>=6,'Actual reciprocal paths remain separate, including arrowhead approaches ('+geometry.closest+' units).');
    assert.equal(geometry.labelOverlap,false,'Both transition labels and information controls have disjoint usable boxes.');
  }
  await reciprocalGeometry();
  if(await page.locator('html').getAttribute('data-theme')!=='light'){await page.getByRole('button',{name:'Toggle theme',exact:true}).click();await ready(page);}
  await page.locator('.diagram-card').screenshot({path:'.cache/test-state/screenshots/reciprocal-light.png'});
  await page.getByRole('button',{name:'Toggle theme',exact:true}).click();await ready(page);await reciprocalGeometry();
  await page.locator('.diagram-card').screenshot({path:'.cache/test-state/screenshots/reciprocal-dark.png'});
  assert.deepEqual(errors, [], 'No page errors in state examples or reopened files.');
  assert.deepEqual(requests, [], 'Offline state documents make zero HTTP requests.');
  console.log('PASS: validation-state semantics, state/choice/initial/final/self-loop shapes, information, state and transition edits, save/reopen, compact chrome, dark/mobile, zero HTTP or page errors.');
} catch (error) {
  await page.screenshot({ path: '.cache/test-state/screenshots/state-failure.png', fullPage: false }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
