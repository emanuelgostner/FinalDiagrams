import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateProject, assertProject, parseProject, isEmbeddedRasterSource } from '../src/model.mjs';
import { exportProject, extractProject, updateProjectHTML, atomicWrite } from '../src/export.mjs';
import { startServer } from '../src/server.mjs';

function fixture() {return {
  schemaVersion:1,id:'project',title:'Architecture',revision:0,
  entities:[{id:'service',kind:'service',name:'Order Service',fields:[{id:'state',name:'state',values:{purpose:'Status'}}]},{id:'db',kind:'database',name:'Orders'}],
  relations:[{id:'stores',source:'service',target:'db',label:'stores',kind:'writes',sourceMember:'state'}],
  diagrams:[{id:'overview',type:'system',title:'Overview',entityIds:['service','db'],relationIds:['stores'],positions:{service:{x:0,y:0}}},{id:'sequence',type:'sequence',title:'Request',entityIds:['service','db'],messages:[{id:'save',from:'service',to:'db',label:'save order',kind:'sync'}]}],
  blocks:[{id:'heading',type:'heading',level:1,text:'Architecture'},{id:'prose',type:'prose',markdown:'Some **context**.'},{id:'diagram',type:'diagram',diagramId:'overview'}],
  futureExtension:{preserve:true}
};}

test('validation preserves unknown fields and accepts zero positions',() => {
  const project = fixture(); assert.deepEqual(validateProject(project),{valid:true,errors:[],warnings:[]});
  assert.equal(assertProject(project),project); assert.deepEqual(parseProject(JSON.stringify(project)),project);
});

test('module and library boundaries retain their identity through HTML round trips',async()=>{
  const project=fixture();project.entities[0].kind='module';project.entities[1].kind='library';
  const html=await exportProject(project,{runtime:'window.ready=true;',styles:''});
  assert.deepEqual(extractProject(html).entities.map(e=>e.kind),['module','library']);
});

function stateFixture(){return {
  schemaVersion:1,id:'lifecycle',title:'Lifecycle',revision:0,
  entities:[{id:'start',kind:'initial',name:'Start'},{id:'ready',kind:'state',name:'Ready',tone:'success'},{id:'check',kind:'choice',name:'Valid?'},{id:'error',kind:'state',name:'Error',tone:'error'},{id:'end',kind:'final',name:'End'}],
  relations:[{id:'begin',kind:'transition',source:'start',target:'ready',label:''},{id:'inspect',kind:'transition',source:'ready',target:'check',label:'Submit'},{id:'invalid',kind:'transition',source:'check',target:'error',label:'[invalid]',tone:'error'},{id:'retry',kind:'transition',source:'error',target:'ready',label:'Blur [valid]',tone:'success'},{id:'remain',kind:'transition',source:'error',target:'error',label:'Type / keep error'},{id:'finish',kind:'transition',source:'check',target:'end',label:'[valid]'}],
  diagrams:[{id:'states',type:'state',title:'Validation',entityIds:['start','ready','check','error','end']}],
  blocks:[{id:'view',type:'diagram',diagramId:'states'}]
};}

test('state diagrams round trip branching, cycles, self-loops and semantic colors',async()=>{
  const project=stateFixture();assert.equal(validateProject(project).valid,true);
  const html=await exportProject(project,{runtime:'window.ready=true;',styles:''});
  assert.deepEqual(extractProject(html),project);
});

test('state validation catches impossible endpoints, mixed diagram semantics and unsafe tones',()=>{
  const invalids=[
    p=>p.relations[0].source='end',
    p=>p.relations[0].target='start',
    p=>p.entities[1].kind='service',
    p=>p.relations[1].kind='calls',
    p=>p.entities[1].tone='url(https://example.com)',
    p=>p.relations[1].tone='#fff'
  ];
  for(const mutate of invalids){const project=stateFixture();mutate(project);assert.equal(validateProject(project).valid,false);}
  const project=stateFixture();project.diagrams[0].relationIds=['begin','inspect','invalid','retry','remain','finish'];
  assert.equal(validateProject(project).valid,true);
});

test('validation catches global duplicates, all reference types and invalid rich prose',() => {
  const project = fixture();project.entities[1].id = 'service';project.relations[0].sourceMember = 'missing';project.diagrams[1].messages[0].to = 'absent';project.blocks[1].content = {type:'doc'};
  const result = validateProject(project); assert.equal(result.valid,false);
  for (const fragment of ['Duplicate global','Unknown member','Unknown reference','exactly one']) assert.ok(result.errors.some(x => x.message.includes(fragment)),fragment);
  assert.throws(() => assertProject(project),/Invalid FinalDiagrams project/);
});

test('invalid JSON, non-finite and cyclic data produce readable failures',() => {
  assert.throws(() => parseProject('{'),/Invalid project JSON/);
  const project = fixture(); project.futureExtension.bad = Infinity; assert.equal(validateProject(project).valid,false);
  project.futureExtension.bad = project; assert.equal(validateProject(project).valid,false);
});

test('rich text rejects malformed tree shapes while preserving unknown node types and fields',()=>{
  const project=fixture();delete project.blocks[1].markdown;
  project.blocks[1].content={type:'doc',content:[{type:'futureNode',attrs:{extra:'kept'},content:[{type:'text',text:'Hello',marks:[{type:'futureMark',attrs:{custom:true}}]}]}]};
  assert.equal(validateProject(project).valid,true);
  project.blocks[1].content.content='not a child array';
  assert.equal(validateProject(project).valid,false);
  project.blocks[1].content={type:'doc',content:[{type:'text',text:'Hello',marks:{bad:true}}]};
  assert.equal(validateProject(project).valid,false);
});

test('image blocks round trip embedded raster data and reject remote, executable, SVG and malformed sources',async()=>{
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1kAAAAASUVORK5CYII=';
  const project=fixture();project.blocks.push({id:'image',type:'image',src:image,alt:'Architecture sketch',caption:'A small embedded image.',futureImageField:'preserved'});
  assert.equal(validateProject(project).valid,true);
  const html=await exportProject(project,{runtime:'window.ready=true;',styles:''});
  assert.deepEqual(extractProject(html),project);
  for (const source of ['https://example.com/image.png','javascript:alert(1)','data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,PHN2Zy8+','data:image/png;base64,','data:image/png;base64,broken','data:image/png;base64,iVBORw0KGgo===']) {
    project.blocks.at(-1).src=source;
    assert.equal(validateProject(project).valid,false,source);
  }
  project.blocks.at(-1).src=image;project.blocks.at(-1).alt='';assert.equal(validateProject(project).valid,true);
  delete project.blocks.at(-1).alt;assert.equal(validateProject(project).valid,false);
  for (const [type,header] of [['jpeg','\xff\xd8\xff\xe0'],['gif','GIF89a'],['webp','RIFF\x00\x00\x00\x00WEBP']]) assert.equal(isEmbeddedRasterSource(`data:image/${type};base64,${Buffer.from(header,'latin1').toString('base64')}`),true,type);
});

test('portable HTML escapes hostile data and round trips exact model',async () => {
  const project = fixture();project.title = '</title><img src=x onerror=alert(1)>';
  project.blocks[1].markdown = '</script><script>alert("injection")</script> & \u2028';
  const html = await exportProject(project,{runtime:'window.example = true;',styles:'.app { color: red; }'});
  assert.ok(html.includes('\\u003c/script\\u003e')); assert.ok(!html.includes('<img src=x'));
  assert.equal((html.match(/<script\b/g) ?? []).length,2);
  assert.deepEqual(extractProject(html),project);
  assert.ok(!html.includes('__FD_CONNECTED__'));
});

test('update replaces only project script and preserves packaged runtime/styles/notices',async () => {
  const notices='\nLicense: <terms> & "conditions"\r\n</div><script>unsafe()</script>';
  const original = await exportProject(fixture(),{runtime:'window.preserved = true;',styles:'/* preserved */',notices});
  const changed = fixture();changed.blocks.reverse();changed.title = 'Changed';
  const updated = updateProjectHTML(original,changed);
  assert.deepEqual(extractProject(updated),changed);
  assert.equal(original.slice(original.indexOf('<script id="fd-runtime">')),updated.slice(updated.indexOf('<script id="fd-runtime">')));
  assert.ok(updated.includes('/* preserved */'));
  const expectedNotices='<div id="fd-notices" hidden>\nLicense: &lt;terms&gt; &amp; &quot;conditions&quot;&#13;\n&lt;/div&gt;&lt;script&gt;unsafe()&lt;/script&gt;</div>';
  assert.ok(original.includes(expectedNotices));
  assert.ok(updated.includes(expectedNotices));
  assert.throws(() => extractProject('<html></html>'),/exactly one/);
  assert.throws(() => extractProject(original + original),/exactly one/);
  assert.deepEqual(extractProject(`<script data-id="fd-project">not JSON</script>${original}`),fixture());
  assert.deepEqual(extractProject(`<script data-note="id='fd-project'">not JSON</script>${original}`),fixture());
});

test('export includes full default notices and supports an alternate notice file',async t=>{
  const fullNotices=await readFile(new URL('../THIRD-PARTY-NOTICES.md',import.meta.url),'utf8');
  const html=await exportProject(fixture(),{runtime:'window.ready=true;',styles:''});
  const embedded=html.match(/<div id="fd-notices" hidden>([\s\S]*?)<\/div>/)[1];
  const decoded=embedded.replace(/&(amp|lt|gt|quot|#39|#13);/g,(_match,name)=>({'amp':'&','lt':'<','gt':'>','quot':'"','#39':"'",'#13':'\r'}[name]));
  assert.equal(decoded,fullNotices);
  const directory=await mkdtemp(join(tmpdir(),'fd-notices-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const noticesPath=join(directory,'notices.txt');await writeFile(noticesPath,'Alternate & complete license.');
  const custom=await exportProject(fixture(),{runtime:'window.ready=true;',styles:'',noticesPath});
  assert.ok(custom.includes('<div id="fd-notices" hidden>Alternate &amp; complete license.</div>'));
});

test('connected server rejects stale writes and unsafe origins; external edits retain last-good state',async t => {
  const directory = await mkdtemp(join(tmpdir(),'fd-core-'));t.after(() => rm(directory,{recursive:true,force:true}));
  const sourcePath = join(directory,'project.json');await writeFile(sourcePath,JSON.stringify(fixture()));
  const connection = await startServer({sourcePath,runtime:'window.ok=true;',styles:''});t.after(() => connection.close());
  const eventsController = new AbortController();t.after(() => eventsController.abort());
  const events = (await fetch(`${connection.url}/api/events`,{signal:eventsController.signal})).body.getReader();
  assert.match(new TextDecoder().decode((await events.read()).value),/event: project/);
  const headers = {'Content-Type':'application/json','Origin':connection.url};
  const put = (project,baseRevision,origin = connection.url) => fetch(`${connection.url}/api/project`,{method:'PUT',headers:{...headers,Origin:origin},body:JSON.stringify({project,baseRevision})});
  const initial = await (await fetch(`${connection.url}/api/project`)).json();assert.equal(initial.revision,0);
  const next = fixture();next.title = 'Updated';next.revision = 999;
  const concurrent = await Promise.all([put(next,0),put(next,0)]);assert.deepEqual(concurrent.map(r => r.status).sort(),[200,409]);
  const stored = JSON.parse(await readFile(sourcePath,'utf8'));assert.equal(stored.revision,1);assert.equal(stored.title,'Updated');
  assert.equal((await put(next,1,'https://example.com')).status,403);
  const invalid = fixture();invalid.blocks[0].level = 7;assert.equal((await put(invalid,1)).status,422);
  await writeFile(sourcePath,'{"broken":');
  const lastGood = await (await fetch(`${connection.url}/api/project`)).json();assert.equal(lastGood.project.title,'Updated');assert.equal(lastGood.revision,1);
  let eventText = '';
  const eventTimeout = setTimeout(() => eventsController.abort(),5000);
  try {while (!eventText.includes('event: error')) eventText += new TextDecoder().decode((await events.read()).value);}
  finally {clearTimeout(eventTimeout);}
  assert.match(eventText,/Invalid project JSON/);await events.cancel();
  assert.equal((await put(next,1)).status,422);
  const external = fixture();external.title = 'External valid change';external.revision = 0;await atomicWrite(sourcePath,JSON.stringify(external));
  const refreshed = await (await fetch(`${connection.url}/api/project`)).json();assert.equal(refreshed.project.title,'External valid change');assert.equal(refreshed.revision,2);
  assert.equal((await put(next,1)).status,409);
  const connectedHTML = await (await fetch(connection.url)).text();assert.ok(connectedHTML.includes('window.__FD_CONNECTED__ = true;'));
});

test('CLI help, validate, extract and in-place update work without a build',async t => {
  const directory = await mkdtemp(join(tmpdir(),'fd-cli-'));t.after(() => rm(directory,{recursive:true,force:true}));
  const source = join(directory,'source.json'), html = join(directory,'document.html'), extracted = join(directory,'extracted.json');
  await writeFile(source,JSON.stringify(fixture()));await writeFile(html,await exportProject(fixture(),{runtime:'window.ok = true;',styles:''}));
  const cli = fileURLToPath(new URL('../bin/finaldiagrams.mjs',import.meta.url));
  const run = (...args) => {const result = spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout;};
  assert.match(run('--help'),/finaldiagrams export/);assert.match(run('validate',source),/Valid:/);
  run('extract',html,'-o',extracted);assert.deepEqual(JSON.parse(await readFile(extracted,'utf8')),fixture());
  const changed = fixture();changed.title = 'CLI updated';await writeFile(source,JSON.stringify(changed));run('update',html,source);assert.equal(extractProject(await readFile(html,'utf8')).title,'CLI updated');
});
