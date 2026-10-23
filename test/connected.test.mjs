import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {startServer} from '../src/server.mjs';
import {atomicWrite,extractProject} from '../src/export.mjs';

let browser;
before(async()=>{
  await readFile(new URL('../dist/runtime.js',import.meta.url));
  browser=await chromium.launch({executablePath:process.env.FINALDIAGRAMS_BROWSER||process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
});
after(async()=>{await browser?.close();});

function project(){return {
  schemaVersion:1,id:'connected-test',title:'Connected test',revision:0,
  entities:[],relations:[],diagrams:[],
  blocks:[{id:'intro',type:'heading',level:2,text:'Context'},{id:'paragraph',type:'prose',markdown:'Original paragraph.'}],
  futureExtension:{preserved:'unknown data'}
};}

async function setup(t){
  const directory=await mkdtemp(join(tmpdir(),'fd-connected-'));
  const sourcePath=join(directory,'source.json');await writeFile(sourcePath,JSON.stringify(project()));
  const connection=await startServer({sourcePath});
  const context=await browser.newContext();const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.dismiss());
  await page.addInitScript(()=>{
    window.__testRevisions=[];
    const NativeEventSource=window.EventSource;
    window.EventSource=class extends NativeEventSource{
      constructor(...args){super(...args);this.addEventListener('project',event=>window.__testRevisions.push(JSON.parse(event.data).revision));}
    };
  });
  t.after(async()=>{await context.close();await connection.close();await rm(directory,{recursive:true,force:true});});
  await page.goto(connection.url);
  await page.waitForFunction(()=>window.FinalDiagrams&&window.__testRevisions.length>0);
  async function externalEdit(mutator){
    const next=connection.getProject();mutator(next);
    await atomicWrite(sourcePath,JSON.stringify(next));
    return (await (await fetch(connection.url+'/api/project')).json()).revision;
  }
  return {directory,sourcePath,connection,context,page,errors,externalEdit};
}

test('connected saves reconcile an external SSE revision received while PUT response is delayed',async t=>{
  const {page,connection,errors,externalEdit}=await setup(t);
  let releaseResponse,putAccepted;
  const accepted=new Promise(resolve=>{putAccepted=resolve;});
  const released=new Promise(resolve=>{releaseResponse=resolve;});
  await page.route('**/api/project',async route=>{
    if(route.request().method()!=='PUT'){await route.continue();return;}
    const response=await route.fetch();putAccepted();await released;await route.fulfill({response});
  });
  t.after(()=>releaseResponse());
  await page.evaluate(()=>{const next=window.FinalDiagrams.getProject();next.title='Local save';window.FinalDiagrams.setProject(next);});
  await accepted;
  const externalRevision=await externalEdit(next=>{next.title='External change after local save';});
  await page.waitForFunction(revision=>window.__testRevisions.includes(revision),externalRevision);
  releaseResponse();
  await page.waitForFunction(()=>window.FinalDiagrams.getProject().title==='External change after local save',null,{timeout:4000});
  assert.equal(connection.getProject().title,'External change after local save');
  assert.deepEqual(errors,[]);
});

test('pending prose typing is protected when an external file edit arrives before debounce commits',async t=>{
  const {page,sourcePath,externalEdit,errors}=await setup(t);
  await page.getByRole('button',{name:'Edit document',exact:true}).click();
  const prose=page.locator('[data-prose-id="paragraph"]');
  // Dispatch input and immediately update disk before the 450ms canonical commit.
  await prose.evaluate(node=>{node.innerHTML='<p>Local paragraph still being typed.</p>';node.dispatchEvent(new Event('input',{bubbles:true}));});
  const externalRevision=await externalEdit(next=>{next.blocks[1].markdown='External paragraph, keep this on disk.';});
  await page.waitForFunction(revision=>window.__testRevisions.includes(revision),externalRevision);
  await page.getByRole('alert').filter({hasText:'The project changed on disk.'}).waitFor({timeout:3000});
  const local=await page.evaluate(()=>window.FinalDiagrams.getProject());
  assert.match(JSON.stringify(local.blocks[1].content),/Local paragraph still being typed/);
  // An event turn is enough to flush the debounce without a fixed sleep.
  await page.waitForFunction(()=>document.getElementById('save-status').textContent==='Changes on disk');
  assert.equal(JSON.parse(await readFile(sourcePath,'utf8')).blocks[1].markdown,'External paragraph, keep this on disk.');
  assert.deepEqual(errors,[]);
});

test('new local edits made during a save remain available when an external revision races the acknowledgement',async t=>{
  const {page,sourcePath,externalEdit,errors}=await setup(t);
  let releaseResponse,putAccepted;
  const accepted=new Promise(resolve=>{putAccepted=resolve;});
  const released=new Promise(resolve=>{releaseResponse=resolve;});
  let held=false;
  await page.route('**/api/project',async route=>{
    if(route.request().method()!=='PUT'||held){await route.continue();return;}
    held=true;const response=await route.fetch();putAccepted();await released;await route.fulfill({response});
  });
  t.after(()=>releaseResponse());
  await page.evaluate(()=>{const next=window.FinalDiagrams.getProject();next.title='First local save';window.FinalDiagrams.setProject(next);});
  await accepted;
  await page.evaluate(()=>{const next=window.FinalDiagrams.getProject();next.title='Newer local work';window.FinalDiagrams.setProject(next);});
  const externalRevision=await externalEdit(next=>{next.title='External work remains on disk';});
  await page.waitForFunction(revision=>window.__testRevisions.includes(revision),externalRevision);
  releaseResponse();
  await page.getByRole('alert').filter({hasText:'The project changed on disk.'}).waitFor({timeout:4000});
  assert.equal(await page.evaluate(()=>window.FinalDiagrams.getProject().title),'Newer local work');
  assert.equal(JSON.parse(await readFile(sourcePath,'utf8')).title,'External work remains on disk');
  assert.deepEqual(errors,[]);
});

test('invalid external JSON cannot be overwritten by a browser save and last-good source remains available',async t=>{
  const {page,sourcePath,connection,errors}=await setup(t);
  await writeFile(sourcePath,'{"malformed":');
  const good=await (await fetch(connection.url+'/api/project')).json();assert.equal(good.project.title,'Connected test');
  const failedSave=page.waitForResponse(response=>response.url().endsWith('/api/project')&&response.request().method()==='PUT'&&response.status()===422);
  await page.evaluate(()=>{const next=window.FinalDiagrams.getProject();next.title='Unsaved local work';window.FinalDiagrams.setProject(next);});
  await failedSave;
  assert.equal(await readFile(sourcePath,'utf8'),'{"malformed":');
  assert.equal(await page.evaluate(()=>window.FinalDiagrams.getProject().title),'Unsaved local work');
  assert.equal(connection.getProject().title,'Connected test');
  assert.deepEqual(errors,[]);
});

test('HTML saved from connected mode strips bootstrap marker and reopens offline without requests',async t=>{
  const {page,directory,context,errors}=await setup(t);
  const notices=await readFile(new URL('../THIRD-PARTY-NOTICES.md',import.meta.url),'utf8');
  assert.ok(await page.locator('#fd-notices').textContent()===notices,'Connected HTML retains the complete, exact notice text.');
  await page.evaluate(()=>{const next=window.FinalDiagrams.getProject();next.blocks[1].markdown='Saved <script>hostile()</script> text.';window.FinalDiagrams.setProject(next);});
  const html=await page.evaluate(()=>window.FinalDiagrams.exportHTML());
  assert.ok(!/<script\b[^>]*\bid=["']fd-connected["']/.test(html));
  assert.ok(!html.includes('<aside class="sidebar">'));
  assert.equal(extractProject(html).futureExtension.preserved,'unknown data');
  const file=join(directory,'portable.html');await writeFile(file,html);
  const offline=await context.newPage();const network=[];offline.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
  offline.on('pageerror',error=>errors.push(error.message));
  await offline.goto(pathToFileURL(file).href);
  await offline.waitForFunction(()=>window.FinalDiagrams&&document.querySelector('.topbar'));
  assert.equal(await offline.evaluate(()=>window.__FD_CONNECTED__),undefined);
  assert.ok(await offline.locator('#fd-notices').textContent()===notices,'Saved offline HTML retains the complete, exact notice text, including original newlines.');
  assert.equal(await offline.evaluate(()=>window.FinalDiagrams.getProject().blocks[1].markdown),'Saved <script>hostile()</script> text.');
  assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
});

test('rich-text semantic links reject executable URLs and escape hostile text when rendered',async t=>{
  const {page,errors}=await setup(t);
  await page.evaluate(()=>{
    const next=window.FinalDiagrams.getProject();delete next.blocks[1].markdown;
    next.blocks[1].content={type:'doc',content:[{type:'paragraph',content:[
      {type:'text',text:'Unsafe JavaScript',marks:[{type:'link',attrs:{href:'javascript:window.__unsafeLinkExecuted=true'}}]},
      {type:'text',text:'Unsafe data',marks:[{type:'link',attrs:{href:'data:text/html,<script>alert(1)</script>'}}]},
      {type:'text',text:'<img src=x onerror="window.__unsafeLinkExecuted=true">'},
      {type:'text',text:'Safe destination',marks:[{type:'link',attrs:{href:'https://example.com/docs'}}]}
    ]}]};window.FinalDiagrams.setProject(next);
  });
  const prose=page.locator('[data-prose-id="paragraph"]');
  assert.equal(await prose.locator('a').count(),1);
  assert.equal(await prose.locator('a').getAttribute('href'),'https://example.com/docs');
  assert.equal(await prose.locator('img,script').count(),0);
  assert.match(await prose.textContent(),/<img src=x onerror=/);
  assert.equal(await page.evaluate(()=>window.__unsafeLinkExecuted),undefined);
  assert.deepEqual(errors,[]);
});
