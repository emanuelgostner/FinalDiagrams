import assert from 'node:assert/strict';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {exportProject,extractProject} from '../src/export.mjs';
const cache=resolve('.cache/test-blocks');await mkdir(cache,{recursive:true});
const fixture={schemaVersion:1,id:'block-reordering',title:'Block reordering',revision:0,entities:[{id:'a',kind:'service',name:'Service'}],relations:[],diagrams:[{id:'graph',type:'system',title:'Movable diagram',entityIds:['a'],positions:{a:{x:50,y:50}}}],blocks:[{id:'intro',type:'prose',markdown:'Introductory paragraph'},{id:'diagram',type:'diagram',diagramId:'graph'},{id:'details',type:'prose',markdown:'Details below the diagram'},{id:'last',type:'callout',title:'Last block',text:'Keep this content intact.',tone:'info'}]};
await writeFile(resolve(cache,'fixture.html'),await exportProject(fixture));
let executablePath=process.env.FINALDIAGRAMS_BROWSER||process.env.CHROME_PATH;
if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})}),page=await browser.newPage({viewport:{width:1500,height:1250},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('.diagram-canvas')].every(e=>e.dataset.ready==='true')),model=()=>page.evaluate(()=>FinalDiagrams.getProject()),order=async()=>(await model()).blocks.map(b=>b.id),block=id=>page.locator(`[data-block-id="${id}"]`),handle=id=>block(id).locator('.block-drag-handle');
async function move(id,target,after=false){const b=await block(target).boundingBox();await handle(id).dragTo(block(target),{targetPosition:{x:Math.min(80,b.width/2),y:after?b.height-2:2}});await ready();}
try{
  await page.goto(pathToFileURL(resolve(cache,'fixture.html')).href);await ready();assert.equal(await page.locator('.block-drag-handle').count(),0);await page.getByRole('button',{name:'Edit document',exact:true}).click();await ready();
  await page.mouse.move(8,55);for(const id of ['intro','diagram','details','last'])assert.equal(await handle(id).evaluate(e=>getComputedStyle(e.parentElement).opacity==='1'&&getComputedStyle(e.parentElement).visibility==='visible'),true,'Block controls remain visible away from the block.');
  const canvas=await page.locator('.diagram-canvas').elementHandle();await move('diagram','intro');assert.deepEqual(await order(),['diagram','intro','details','last']);assert.equal(await canvas.evaluate(e=>e.isConnected),true,'Reordering preserves the existing diagram canvas.');assert.deepEqual((await model()).diagrams,fixture.diagrams);
  await page.locator('#undo').click();await ready();assert.deepEqual(await order(),fixture.blocks.map(b=>b.id));await page.locator('#redo').click();await ready();assert.deepEqual(await order(),['diagram','intro','details','last']);
  await move('intro','last',true);assert.deepEqual(await order(),['diagram','details','last','intro']);await move('details','diagram');assert.deepEqual(await order(),['details','diagram','last','intro']);
  const beforeCancel=await model(),start=await handle('diagram').boundingBox(),end=await block('intro').boundingBox();await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(end.x+40,end.y+3,{steps:12});await page.locator('.block-drop-indicator').waitFor({state:'visible'});await page.screenshot({path:resolve(cache,'dragging.png')});await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await model(),beforeCancel);assert.equal(await page.locator('.block-drop-indicator').count(),0);assert.equal(await page.locator('.block-dragging').count(),0);
  await handle('diagram').dragTo(page.locator('.topbar'),{targetPosition:{x:8,y:8}});assert.deepEqual(await model(),beforeCancel,'Dropping outside the document cancels.');
  await block('intro').getByRole('button',{name:'Move block up',exact:true}).click();await ready();assert.deepEqual(await order(),['details','diagram','intro','last']);
  const current=await model();for(const b of current.blocks)assert.deepEqual(b,fixture.blocks.find(original=>original.id===b.id));
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save HTML ↓',exact:true}).click();await (await download).saveAs(resolve(cache,'saved.html'));assert.deepEqual(extractProject(await readFile(resolve(cache,'saved.html'),'utf8')),current);await page.goto(pathToFileURL(resolve(cache,'saved.html')).href);await ready();assert.deepEqual(await model(),current);assert.equal(await page.locator('.block-drag-handle').count(),0);await page.screenshot({path:resolve(cache,'reordered.png')});assert.deepEqual(errors,[]);
  console.log('PASS: always reachable block handles, diagram/text drag reordering, insertion feedback, Escape/outside cancellation, preserved canvases/content, buttons, undo/redo and save/reopen.');
}catch(error){await page.screenshot({path:resolve(cache,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
