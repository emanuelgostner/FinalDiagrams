import assert from 'node:assert/strict';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {exportProject,extractProject} from '../src/export.mjs';

const cache=resolve('.cache/test-groups');await mkdir(cache,{recursive:true});
const fixture={schemaVersion:1,id:'group-editing',title:'Group editing',revision:0,
  entities:['a','b','c'].map(id=>({id,kind:'class',name:'Node '+id,fields:[]})),relations:[{id:'ab',source:'a',target:'b',kind:'association',label:'uses'}],
  diagrams:[{id:'first',type:'class',title:'Editable groups',entityIds:['a','b','c'],relationIds:['ab'],positions:{a:{x:80,y:80},b:{x:700,y:80},c:{x:1320,y:80}}},{id:'shared',type:'class',title:'Shared groups',entityIds:['a','b'],relationIds:['ab']}],
  blocks:[{id:'first-view',type:'diagram',diagramId:'first'},{id:'shared-view',type:'diagram',diagramId:'shared'}]};
await writeFile(resolve(cache,'fixture.html'),await exportProject(fixture));
let executablePath=process.env.FINALDIAGRAMS_BROWSER||process.env.CHROME_PATH;
if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page=await browser.newPage({viewport:{width:1700,height:1100},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('.diagram-canvas')].every(e=>e.dataset.ready==='true'));
const model=()=>page.evaluate(()=>FinalDiagrams.getProject()),root=()=>page.locator('[data-diagram-id="first"]');
const close=async()=>{const b=page.getByRole('button',{name:'Close details',exact:true});if(await b.isVisible())await b.click();};
async function header(id){const b=await root().locator(`[data-entity-id="${id}"] .fd-node-body`).boundingBox();return {x:b.x+25,y:b.y+12};}
async function select(id,shift=false){const p=await header(id);if(shift)await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y);if(shift)await page.keyboard.up('Shift');}
try{
  await page.goto(pathToFileURL(resolve(cache,'fixture.html')).href);await ready();await page.getByRole('button',{name:'Edit document',exact:true}).click();await ready();await page.getByRole('button',{name:'Overview Editable groups',exact:true}).click();
  const point=await header('a');await page.mouse.click(point.x,point.y,{button:'right'});await page.getByRole('menuitem',{name:'Group selected nodes…',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await model(),fixture,'Cancel leaves group data unchanged.');
  await close();await select('a');await close();await select('b',true);
  assert.equal(await root().locator('[data-entity-id][data-selected="true"]').count(),2);
  await page.locator('.inspector').getByRole('button',{name:'Group selected nodes…',exact:true}).click();
  await page.getByRole('dialog').getByRole('textbox',{name:'Group name',exact:true}).fill('Ordering module');
  await page.getByRole('dialog').getByRole('textbox',{name:'Group description',exact:true}).fill('Order data and behavior');
  await page.getByRole('dialog').getByRole('button',{name:'Create group',exact:true}).click();await ready();
  let current=await model();const groupId=current.entities[0].group;
  assert.ok(groupId);assert.equal(current.entities[1].group,groupId);assert.equal(current.entities[2].group,undefined);assert.deepEqual(current.diagrams[0].positions,fixture.diagrams[0].positions,'Grouping preserves existing node placement.');
  for(const diagram of current.diagrams){assert.equal(diagram.groups.find(g=>g.id===groupId).label,'Ordering module');assert.equal(await page.locator(`[data-diagram-id="${diagram.id}"]`).getByRole('button',{name:'Group: Ordering module',exact:true}).count(),1);}
  await close();await root().getByRole('button',{name:'Group: Ordering module',exact:true}).click();
  await page.locator('.inspector').getByRole('button',{name:'Edit Group name',exact:true}).click();await page.getByRole('textbox',{name:'Group name',exact:true}).fill('Fulfillment <module>');await page.getByRole('textbox',{name:'Group name',exact:true}).press('Enter');await ready();
  assert.equal(await root().getByRole('button',{name:'Group: Fulfillment <module>',exact:true}).count(),1);
  await page.getByRole('checkbox',{name:'Include Node c',exact:true}).check();await ready();assert.equal((await model()).entities[2].group,groupId);
  await page.getByRole('checkbox',{name:'Include Node c',exact:true}).uncheck();await ready();assert.equal((await model()).entities[2].group,undefined);
  await close();await select('c');await page.locator('.inspector').getByRole('button',{name:'Group selected nodes…',exact:true}).click();
  await page.getByRole('dialog').getByRole('combobox',{name:'Choose group',exact:true}).selectOption(groupId);await page.getByRole('dialog').getByRole('button',{name:'Add to group',exact:true}).click();await ready();assert.equal((await model()).entities[2].group,groupId);
  await close();await select('a');await page.locator('.inspector').getByRole('button',{name:'Remove from group',exact:true}).click();await ready();assert.equal((await model()).entities[0].group,undefined);assert.equal((await model()).entities[1].group,groupId);
  await page.locator('#undo').click();await ready();assert.equal((await model()).entities[0].group,groupId);await close();await root().getByRole('button',{name:'Group: Fulfillment <module>',exact:true}).click();
  const grouped=await model();await page.getByRole('button',{name:'Remove group',exact:true}).click();await ready();current=await model();assert.ok(current.entities.every(e=>!e.group));assert.ok(current.diagrams.every(d=>!d.groups?.some(g=>g.id===groupId)));assert.equal(current.entities.length,3);assert.deepEqual(current.relations,fixture.relations);
  await page.locator('#undo').click();await ready();const restored=await model();assert.deepEqual(restored.entities,grouped.entities);await page.locator('#redo').click();await ready();assert.ok((await model()).entities.every(e=>!e.group));await page.locator('#undo').click();await ready();
  const expected=await model(),download=page.waitForEvent('download');await page.getByRole('button',{name:'Save HTML ↓',exact:true}).click();await (await download).saveAs(resolve(cache,'saved.html'));assert.deepEqual(extractProject(await readFile(resolve(cache,'saved.html'),'utf8')),expected);
  await page.goto(pathToFileURL(resolve(cache,'saved.html')).href);await ready();assert.deepEqual(await model(),expected);await page.getByRole('button',{name:'Overview Editable groups',exact:true}).click();await page.screenshot({path:resolve(cache,'groups.png')});assert.deepEqual(errors,[]);
  console.log('PASS: create/join/rename groups, membership controls, shared views, cancellation, preserving placement/nodes/relations, undo/redo and saved reopen.');
}catch(error){console.error(errors);await page.screenshot({path:resolve(cache,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
