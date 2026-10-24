import assert from 'node:assert/strict';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {exportProject,extractProject} from '../src/export.mjs';

const cache=resolve('.cache/test-editor-performance');await mkdir(cache,{recursive:true});
const fixture=JSON.parse(await readFile('examples/all-diagrams.json','utf8'));
const classes=fixture.diagrams.find(d=>d.id==='orders-domain-classes');
fixture.diagrams.push({...structuredClone(classes),id:'shared-classes',title:'Shared class view'});
fixture.blocks.push({id:'shared-classes-block',type:'diagram',diagramId:'shared-classes'});
await writeFile(resolve(cache,'fixture.html'),await exportProject(fixture));
let executablePath=process.env.FINALDIAGRAMS_BROWSER||process.env.CHROME_PATH;
if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page=await browser.newPage({viewport:{width:1600,height:1100},acceptDownloads:true}),errors=[],timings=[];
page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('.diagram-canvas')].every(e=>e.dataset.ready==='true'));
const card=id=>page.locator(`[data-diagram-card="${id}"]`),dense='landscape-dense-overview';
const close=async()=>{const b=page.getByRole('button',{name:'Close details',exact:true});if(await b.isVisible())await b.click();};
async function remember(id){await page.evaluate(id=>{window.untouchedCanvas=document.querySelector(`[data-diagram-id="${id}"] svg`);window.untouchedNode=untouchedCanvas.querySelector('[data-entity-id]');},id);}
async function unchanged(id){assert.ok(await page.evaluate(id=>untouchedCanvas===document.querySelector(`[data-diagram-id="${id}"] svg`)&&untouchedNode.isConnected,id),'Unrelated views retain their SVG and node DOM instead of being laid out/routed again.');}
async function measure(name,action,eventType='click'){
  await page.evaluate(eventType=>{window.editTiming=null;document.addEventListener(eventType,()=>{const start=performance.now();requestAnimationFrame(function frame(){if([...document.querySelectorAll('.diagram-canvas')].every(e=>e.dataset.ready==='true'))requestAnimationFrame(()=>window.editTiming=performance.now()-start);else requestAnimationFrame(frame);});},{capture:true,once:true});},eventType);
  await action();await ready();await page.waitForFunction(()=>editTiming!==null);timings.push({action:name,ms:Math.round(await page.evaluate(()=>editTiming))});
}
try{
  await page.goto(pathToFileURL(resolve(cache,'fixture.html')).href);await ready();
  await page.getByRole('button',{name:'Edit document',exact:true}).click();await ready();
  await card(classes.id).scrollIntoViewIfNeeded();await card(classes.id).getByRole('button',{name:'Information about Order',exact:true}).click();
  await remember(dense);
  await measure('Add method',()=>page.getByRole('button',{name:'+ Add method',exact:true}).click());await unchanged(dense);
  for(const id of [classes.id,'shared-classes'])assert.equal(await card(id).getByRole('button',{name:'Order.newMethod(): string',exact:true}).count(),1,'Both views of the shared entity show its new method.');
  await page.locator('#undo').click();await ready();await unchanged(dense);
  for(const id of [classes.id,'shared-classes'])assert.equal(await card(id).getByRole('button',{name:'Order.newMethod(): string',exact:true}).count(),0);
  await page.locator('#redo').click();await ready();await unchanged(dense);await close();
  await card(classes.id).hover();await card(classes.id).getByRole('button',{name:'Add node to '+classes.title,exact:true}).click();
  await page.getByRole('textbox',{name:'Node name',exact:true}).fill('Fast new class');
  await measure('Add node',()=>page.getByRole('button',{name:'Add node',exact:true}).click());await unchanged(dense);
  // The canvas retained across the method edit still opens its editor in the current document.
  await card(dense).scrollIntoViewIfNeeded();await card(dense).hover();await card(dense).getByRole('button',{name:'Add node to A larger commerce landscape',exact:true}).click();
  await page.getByRole('textbox',{name:'Node name',exact:true}).fill('Fast dense service');await remember(classes.id);
  await measure('Add node in dense view',()=>page.getByRole('button',{name:'Add node',exact:true}).click());await unchanged(classes.id);
  await close();await card(classes.id).scrollIntoViewIfNeeded();await card(classes.id).getByRole('button',{name:'Overview '+classes.title,exact:true}).click();await card(classes.id).hover();
  await card(classes.id).getByRole('button',{name:'Draw connection in '+classes.title,exact:true}).click();
  const from=card(classes.id).locator('[data-entity-id="orders-order"]'),to=card(classes.id).locator('[data-entity-id="orders-money"]');
  await from.press('Enter');await remember(dense);
  await measure('Add connection',()=>to.press('Enter'),'keydown');await unchanged(dense);
  const connections=await page.evaluate(()=>FinalDiagrams.getProject().relations.filter(r=>r.label==='connects to'));
  assert.ok(connections.some(r=>r.source==='orders-order'&&r.target==='orders-money'),JSON.stringify({connections,timings}));
  const model=await page.evaluate(()=>FinalDiagrams.getProject());
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Save HTML ↓',exact:true}).click();const download=await downloadPromise;await download.saveAs(resolve(cache,'saved.html'));
  assert.deepEqual(extractProject(await readFile(resolve(cache,'saved.html'),'utf8')),model);
  await page.goto(pathToFileURL(resolve(cache,'saved.html')).href);await ready();assert.deepEqual(await page.evaluate(()=>FinalDiagrams.getProject()),model);
  assert.deepEqual(errors,[]);await writeFile(resolve(cache,'timings.json'),JSON.stringify(timings,null,2));console.log(timings);console.log('PASS: unrelated views retain their DOM; shared members, undo/redo, reused editors, node/connection creation and saved reopen remain correct.');
}catch(error){console.error(timings);await page.screenshot({path:resolve(cache,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
