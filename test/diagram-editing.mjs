import assert from 'node:assert/strict';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {exportProject,extractProject} from '../src/export.mjs';

const cache=resolve('.cache/test-diagram-editing');
await mkdir(cache,{recursive:true});
const fixture={schemaVersion:1,id:'local-edit',title:'Diagram editing',revision:0,
  entities:[{id:'table',kind:'table',name:'Orders',fields:[{id:'key',name:'id',type:'UUID',purpose:'Primary key'}]}],relations:[],
  diagrams:['first','sibling'].map(id=>({id,type:'class',title:id,entityIds:['table'],relationIds:[]})),
  blocks:[{id:'heading',type:'heading',level:1,text:'Diagram editing'},{id:'prose',type:'prose',markdown:'Read-only prose.'},
    ...['first','sibling'].map(id=>({id:id+'-block',type:'diagram',diagramId:id}))]};
await writeFile(resolve(cache,'input.html'),await exportProject(fixture));
let executablePath=process.env.FINALDIAGRAMS_BROWSER;
if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page=await browser.newPage({viewport:{width:1300,height:900},acceptDownloads:true});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const root=id=>page.locator(`[data-diagram-card="${id}"]`);
const ready=()=>page.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===2);
const model=()=>page.evaluate(()=>window.FinalDiagrams.getProject());
const edit=id=>root(id).getByRole('button',{name:'Edit '+id,exact:true});
const done=id=>root(id).getByRole('button',{name:'Done editing '+id,exact:true});
const close=()=>page.getByRole('button',{name:'Close details',exact:true}).click();
try{
  await page.goto(pathToFileURL(resolve(cache,'input.html')).href);await ready();
  await page.evaluate(()=>window.siblingCanvas=document.querySelector('[data-diagram-id="sibling"]'));
  await root('first').getByRole('button',{name:'Expand first',exact:true}).click();
  await edit('first').click();await ready();
  assert.equal(await done('first').textContent(),'','Diagram toggle uses an icon only');
  assert.equal(await done('first').locator('svg').count(),1);
  assert.equal(await done('first').getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('button',{name:'Edit document',exact:true}).count(),1);
  assert.equal(await page.locator('[contenteditable="true"],.block-tools,.edit-bar').count(),0,'Local editing leaves document controls and prose in read mode');
  assert.equal(await root('sibling').locator('.canvas-editbar,[data-connect-from]').count(),0,'Sibling diagram stays read-only');
  assert.equal(await page.evaluate(()=>window.siblingCanvas===document.querySelector('[data-diagram-id="sibling"]')),true,'Sibling canvas survives local toggle');
  assert.equal(await root('first').evaluate(el=>el.classList.contains('expanded')),true);
  await root('first').getByRole('button',{name:'Add node to first',exact:true}).click();
  await page.getByRole('textbox',{name:'Node name',exact:true}).fill('Cancelled node');await page.keyboard.press('Escape');
  assert.equal((await model()).entities.length,1);
  await root('first').getByRole('button',{name:'Information about id',exact:true}).click();
  await page.getByRole('button',{name:'Edit Purpose',exact:true}).click();
  await page.getByRole('textbox',{name:'Purpose',exact:true}).fill('Cancelled purpose');await page.keyboard.press('Escape');
  assert.equal((await model()).entities[0].fields[0].purpose,'Primary key');
  await page.getByRole('button',{name:'Edit Purpose',exact:true}).click();
  await page.getByRole('textbox',{name:'Purpose',exact:true}).fill('Shared key');await page.keyboard.press('Control+Enter');await ready();
  assert.equal((await model()).entities[0].fields[0].purpose,'Shared key');
  assert.ok((await root('sibling').textContent()).includes('Shared key'),'Shared model updates a read-only sibling');await close();
  await page.keyboard.press('Control+z');await ready();assert.equal((await model()).entities[0].fields[0].purpose,'Primary key');
  await page.keyboard.press('Control+Shift+z');await ready();assert.equal((await model()).entities[0].fields[0].purpose,'Shared key');
  await page.screenshot({path:resolve(cache,'fullscreen.png')});
  await done('first').click();await ready();
  assert.equal(await root('first').locator('.canvas-editbar,[data-connect-from]').count(),0);
  assert.equal(await root('first').evaluate(el=>el.classList.contains('expanded')),true);
  await root('first').getByRole('button',{name:'Expand first',exact:true}).click();
  await edit('first').click();await ready();
  await root('sibling').getByRole('button',{name:'Information about Orders',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Edit these details',exact:true}).count(),1,'Sibling details remain read-only');await close();
  await page.getByRole('button',{name:'Edit document',exact:true}).click();await ready();
  assert.equal(await page.locator('.canvas-editbar').count(),2,'Global Edit enables every diagram');
  assert.ok(await page.locator('[contenteditable="true"]').count());
  await done('first').click();await ready();
  assert.equal(await root('first').locator('.canvas-editbar').count(),0,'Local Done only disables its diagram during document editing');
  assert.equal(await root('sibling').locator('.canvas-editbar').count(),1);
  assert.equal(await page.getByRole('button',{name:'Done editing',exact:true}).count(),1);
  await page.getByRole('button',{name:'Done editing',exact:true}).click();await ready();
  assert.equal(await page.locator('.canvas-editbar,[contenteditable="true"]').count(),0,'Global Done returns everything to reading');
  await edit('first').click();await ready();
  const saved=await model(),download=page.waitForEvent('download');await page.keyboard.press('Control+s');
  await (await download).saveAs(resolve(cache,'saved.html'));
  assert.deepEqual(extractProject(await readFile(resolve(cache,'saved.html'),'utf8')),saved);
  await page.goto(pathToFileURL(resolve(cache,'saved.html')).href);await ready();
  assert.deepEqual(await model(),saved);assert.equal(await page.locator('.canvas-editbar').count(),0,'Edit modes are temporary UI state');
  assert.deepEqual(errors,[]);
  console.log('PASS: diagram-only pencil/check, fullscreen, read-only prose/sibling, local properties, cancellation, shared updates, undo/redo, global/local toggles, HTML save/reopen.');
}catch(error){await page.screenshot({path:resolve(cache,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
