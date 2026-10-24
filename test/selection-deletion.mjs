import assert from 'node:assert/strict';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {exportProject,extractProject} from '../src/export.mjs';

const cache=resolve('.cache/test-deletion');await mkdir(cache,{recursive:true});
const fixture={schemaVersion:1,id:'selection-deletion',title:'Selection deletion',revision:0,
  entities:['a','b','c'].map(id=>({id,kind:'service',name:'Node '+id})),
  relations:[{id:'ab',source:'a',target:'b',kind:'calls',label:'First connection'},{id:'bc',source:'b',target:'c',kind:'calls',label:'Second connection'}],
  diagrams:[{id:'first',type:'system',title:'Editable connections',entityIds:['a','b','c'],positions:{a:{x:80,y:80},b:{x:500,y:80},c:{x:500,y:320}}},{id:'shared',type:'system',title:'Shared connections',entityIds:['a','b','c'],relationIds:['ab','bc']},{id:'sequence',type:'sequence',title:'Editable messages',entityIds:['a','b','c'],messages:[{id:'one',from:'a',to:'b',kind:'sync',label:'First message'},{id:'two',from:'b',to:'c',kind:'async',label:'Second message'}]}],
  blocks:[{id:'first-view',type:'diagram',diagramId:'first'},{id:'shared-view',type:'diagram',diagramId:'shared'},{id:'sequence-view',type:'diagram',diagramId:'sequence'}]};
await writeFile(resolve(cache,'fixture.html'),await exportProject(fixture));
let executablePath=process.env.FINALDIAGRAMS_BROWSER||process.env.CHROME_PATH;
if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page=await browser.newPage({viewport:{width:1700,height:1100},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('.diagram-canvas')].every(e=>e.dataset.ready==='true'));
const model=()=>page.evaluate(()=>FinalDiagrams.getProject()),root=id=>page.locator(`[data-diagram-id="${id}"]`),edge=id=>root('first').locator(`[data-relation-id="${id}"] .fd-edge-label-text`);
const clean=p=>{p=structuredClone(p);delete p.revision;return p;};
const close=async()=>{const b=page.getByRole('button',{name:'Close details',exact:true});if(await b.isVisible())await b.click();};
const undo=async()=>{await page.locator('#undo').click();await ready();await close();};
async function load(){await page.goto(pathToFileURL(resolve(cache,'fixture.html')).href);await ready();await page.getByRole('button',{name:'Edit document',exact:true}).click();await ready();await page.getByRole('button',{name:'Overview Editable connections',exact:true}).click();}
async function node(id,shift=false,view='first'){const b=await root(view).locator(`[data-entity-id="${id}"] .fd-node-body`).boundingBox();if(shift)await page.keyboard.down('Shift');await page.mouse.click(b.x+40,b.y+25);if(shift)await page.keyboard.up('Shift');}
try{
  await load();const before=await model();await edge('ab').click();await page.keyboard.press('Delete');await ready();
  let current=await model();assert.deepEqual(current.entities,before.entities);assert.deepEqual(current.relations,before.relations);assert.deepEqual(current.diagrams[0].relationIds,['bc']);assert.deepEqual(current.diagrams[1],before.diagrams[1]);assert.equal(await root('first').locator('[data-relation-id="ab"]').count(),0);assert.equal(await root('shared').locator('[data-relation-id="ab"]').count(),1);
  await undo();assert.deepEqual(clean(await model()),clean(before),'One undo restores an implicit relationship view.');await page.locator('#redo').click();await ready();assert.deepEqual((await model()).diagrams[0].relationIds,['bc']);await undo();
  await edge('ab').dblclick();const input=page.getByRole('textbox',{name:'Rename relation',exact:true});await input.press('Control+a');await input.press('Delete');await input.press('Escape');assert.deepEqual(clean(await model()),clean(before),'Delete inside a rename field does not delete a connection.');
  await edge('ab').click();await edge('bc').click({modifiers:['Shift']});assert.equal(await root('first').locator('[data-relation-id][data-selected="true"]').count(),2);await page.keyboard.press('Backspace');await ready();assert.deepEqual((await model()).diagrams[0].relationIds,[]);await undo();
  await node('a');await edge('bc').click({modifiers:['Shift']});assert.equal(await root('first').locator('[data-entity-id][data-selected="true"], [data-relation-id][data-selected="true"]').count(),2);await page.keyboard.press('Delete');await ready();current=await model();assert.deepEqual(current.diagrams[0].entityIds,['b','c']);assert.deepEqual(current.diagrams[0].relationIds,[]);assert.equal(current.entities.length,3);assert.equal(current.relations.length,2);assert.deepEqual(current.diagrams[1],before.diagrams[1]);await undo();
  await edge('ab').click();await node('c',true);assert.equal(await root('first').locator('[data-entity-id][data-selected="true"], [data-relation-id][data-selected="true"]').count(),2);await root('first').locator('svg').focus();await page.keyboard.press('Delete');await ready();assert.deepEqual((await model()).diagrams[0].entityIds,['a','b']);assert.deepEqual((await model()).diagrams[0].relationIds,[]);await undo();
  await edge('ab').click();await edge('bc').click({modifiers:['Shift']});await edge('bc').click({modifiers:['Shift']});await page.keyboard.press('Delete');await ready();assert.deepEqual((await model()).diagrams[0].relationIds,['bc']);await undo();
  await edge('ab').click({button:'right'});await page.getByRole('menuitem',{name:'Delete everywhere',exact:true}).click();await ready();current=await model();assert.deepEqual(current.relations.map(r=>r.id),['bc']);assert.deepEqual(current.diagrams[1].relationIds,['bc']);await undo();
  await close();await page.getByRole('button',{name:'Overview Editable messages',exact:true}).click();const message=id=>root('sequence').locator(`[data-message-id="${id}"]`).getByText(id==='one'?'First message':'Second message',{exact:true});
  await message('one').click();await page.keyboard.press('Delete');await ready();assert.deepEqual((await model()).diagrams[2].messages.map(m=>m.id),['two']);await undo();await message('one').click();await message('two').click({modifiers:['Shift']});await page.keyboard.press('Delete');await ready();assert.deepEqual((await model()).diagrams[2].messages,[]);await undo();
  await message('one').click();await node('c',true,'sequence');await root('sequence').locator('svg').focus();await page.keyboard.press('Delete');await ready();current=await model();assert.deepEqual(current.diagrams[2].entityIds,['a','b']);assert.deepEqual(current.diagrams[2].messages,[]);assert.deepEqual(current.relations,before.relations);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save HTML ↓',exact:true}).click();await (await download).saveAs(resolve(cache,'saved.html'));assert.deepEqual(extractProject(await readFile(resolve(cache,'saved.html'),'utf8')),current);await page.goto(pathToFileURL(resolve(cache,'saved.html')).href);await ready();assert.deepEqual(await model(),current);await page.screenshot({path:resolve(cache,'deleted.png')});assert.deepEqual(errors,[]);
  console.log('PASS: Delete/Backspace for connections, mixed selections and sequence messages; implicit/explicit view scope; input safety; global delete; undo/redo and save/reopen.');
}catch(error){await page.screenshot({path:resolve(cache,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
