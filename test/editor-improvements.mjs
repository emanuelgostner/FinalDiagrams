import assert from 'node:assert/strict';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {exportProject,extractProject} from '../src/export.mjs';
import {assertProject} from '../src/model.mjs';

const cache=resolve('.cache/test-editor');await mkdir(cache,{recursive:true});
const fixture={schemaVersion:1,id:'editor-regression',title:'Editor regression',revision:0,
  entities:['a','b','c'].map(id=>({id,kind:'table',name:'Table '+id,fields:[{id:id+'-id',name:'id',type:'uuid'},{id:id+'-ref',name:'parent_id',type:'uuid'}]})),relations:[],
  diagrams:[{id:'first',type:'class',title:'Editable tables',columns:[{key:'name',label:'Column'}],entityIds:['a','b','c'],relationIds:[],positions:{a:{x:50,y:80},b:{x:450,y:80},c:{x:850,y:80}}},{id:'shared',type:'class',title:'Shared view',columns:[{key:'name',label:'Column'}],entityIds:['a','b'],relationIds:[]}],
  blocks:[{id:'first-block',type:'diagram',diagramId:'first'},{id:'shared-block',type:'diagram',diagramId:'shared'}]};
await writeFile(resolve(cache,'fixture.html'),await exportProject(assertProject(fixture)));
let executablePath=process.env.FINALDIAGRAMS_BROWSER||process.env.CHROME_PATH;
if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1700,height:1100},acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const model=()=>page.evaluate(()=>FinalDiagrams.getProject());
const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('.diagram-canvas')].every(e=>e.dataset.ready==='true'));
const box=async locator=>{const b=await locator.boundingBox();assert.ok(b);return b;};
const root=()=>page.locator('[data-diagram-id="first"]');
const entity=id=>root().locator(`[data-entity-id="${id}"]`);
const header=async id=>{const b=await box(entity(id));return {x:b.x+40,y:b.y+25};};
async function drag(from,to,button='left'){await page.mouse.move(from.x,from.y);await page.mouse.down({button});await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up({button});}
async function closePanel(){const c=page.getByRole('button',{name:'Close details',exact:true});if(await c.isVisible())await c.click();}
async function undo(){await page.locator('#undo').click();await ready();await closePanel();}
async function loadFixture(){await page.goto(pathToFileURL(resolve(cache,'fixture.html')).href);await ready();await page.getByRole('button',{name:'Edit document',exact:true}).click();await ready();await page.getByRole('button',{name:'Overview Editable tables',exact:true}).click();}
try{
  await page.goto(pathToFileURL(resolve('artifacts/all-diagrams.html')).href);await ready();
  const routing=await page.evaluate(()=>{
    const root=document.querySelector('[data-diagram-id="landscape-dense-overview"]'),project=FinalDiagrams.getProject();
    const nodes=[...root.querySelectorAll('[data-entity-id]')].map(e=>({id:e.dataset.entityId,b:e.querySelector('.fd-node-body').getBoundingClientRect()}));
    const labels=[...root.querySelectorAll('[data-edge-label]')].map(e=>({id:e.dataset.edgeLabel,b:e.getBoundingClientRect()})),cardHits=[],labelHits=[],labelOverlaps=[];
    const inside=(q,b)=>q.x>b.left+1&&q.x<b.right-1&&q.y>b.top+1&&q.y<b.bottom-1;
    for(const g of root.querySelectorAll('[data-relation-id]')){
      const r=project.relations.find(r=>r.id===g.dataset.relationId),path=g.querySelector('.fd-edge-line'),length=path.getTotalLength(),matrix=path.getScreenCTM();
      for(let i=2;i<length;i+=4){const p=path.getPointAtLength(i).matrixTransform(matrix);for(const n of nodes)if(n.id!==r.source&&n.id!==r.target&&inside(p,n.b))cardHits.push([r.id,n.id]);for(const label of labels)if(inside(p,label.b))labelHits.push([r.id,label.id]);}
    }
    for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i].b,b=labels[j].b;if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)labelOverlaps.push([labels[i].id,labels[j].id]);}
    return {cardHits,labelHits,labelOverlaps};
  });
  assert.deepEqual(routing,{cardHits:[],labelHits:[],labelOverlaps:[]},'Dense showcase paths avoid unrelated cards and labels; labels do not overlap.');
  await page.evaluate(()=>scrollTo({top:4300,behavior:'instant'}));
  const geometry=()=>page.evaluate(()=>({y:scrollY,boxes:[...document.querySelectorAll('.doc-block')].map(e=>[e.id,e.offsetWidth,e.offsetHeight,e.getBoundingClientRect().top+scrollY])}));
  const before=await geometry();const edit=await box(page.getByRole('button',{name:'Edit document',exact:true}));await page.mouse.click(edit.x+edit.width/2,edit.y+edit.height/2);await ready();assert.deepEqual(await geometry(),before,'Edit mode preserves scrolled viewport and every block dimension.');
  const done=await box(page.getByRole('button',{name:'Done editing',exact:true}));await page.mouse.click(done.x+done.width/2,done.y+done.height/2);await ready();assert.deepEqual(await geometry(),before,'Leaving edit mode preserves geometry.');
  await loadFixture();
  const first=await header('a');await page.mouse.click(first.x,first.y);await page.waitForFunction(()=>document.querySelector('.inspector h2')?.textContent==='Table a');await closePanel();
  const row=(id,member)=>entity(id).locator(`[data-member-id="${member}"]`);
  await row('a','a-id').hover();
  const handle=entity('a').locator('[data-source-member="a-id"][data-side="right"]');const h=await box(handle),target=await box(row('b','b-ref'));
  await drag({x:h.x+h.width/2,y:h.y+h.height/2},{x:target.x+target.width/2,y:target.y+target.height/2});await ready();
  let r=(await model()).relations[0];assert.equal(r.sourceMember,'a-id');assert.equal(r.targetMember,'b-ref');
  const arrow=root().locator(`[data-edge-label="${r.id}"]`);await page.waitForTimeout(180);await arrow.click();await page.waitForFunction(()=>!document.getElementById('inspector').hidden);assert.equal(await page.locator('.inspector h2').textContent(),'connects to');await closePanel();
  // Move an endpoint to another row on the SAME entity.
  await arrow.hover();const endpoint=root().locator(`[data-reconnect-id="${r.id}"][data-endpoint="target"]`),ep=await box(endpoint),next=await box(row('b','b-id'));
  await drag({x:ep.x+ep.width/2,y:ep.y+ep.height/2},{x:next.x+next.width/2,y:next.y+next.height/2});await ready();assert.equal((await model()).relations[0].targetMember,'b-id');
  await arrow.hover();const ep2=await box(endpoint),bhead=await header('b');await drag({x:ep2.x+ep2.width/2,y:ep2.y+ep2.height/2},bhead);await ready();assert.equal((await model()).relations[0].targetMember,undefined,'Dropping on the header restores whole-box attachment.');
  await page.screenshot({path:resolve(cache,'row-connections.png')});
  // Marquee the first two cards, then move them while maintaining the same offset.
  await closePanel();const a=await box(entity('a')),b=await box(entity('b'));
  await drag({x:a.x-12,y:a.y-12},{x:b.x+b.width+12,y:b.y+b.height+12});
  assert.equal(await root().locator('[data-entity-id][data-selected="true"]').count(),2);
  const positions=(await model()).diagrams[0].positions,start=await header('a');await drag(start,{x:start.x+60,y:start.y+50});
  let after=await model();const dx=after.diagrams[0].positions.a.x-positions.a.x,dy=after.diagrams[0].positions.a.y-positions.a.y;
  assert.ok(dx>0&&dy>0);assert.ok(Math.abs(after.diagrams[0].positions.b.x-positions.b.x-dx)<.01);assert.ok(Math.abs(after.diagrams[0].positions.b.y-positions.b.y-dy)<.01);
  await root().locator('svg').focus();await page.keyboard.press('Delete');await ready();after=await model();assert.deepEqual(after.diagrams[0].entityIds,['c']);assert.equal(after.entities.length,3);assert.deepEqual(after.diagrams[1].entityIds,['a','b']);assert.equal(after.relations.length,1);assertProject(after);
  await undo();assert.deepEqual((await model()).diagrams[0].entityIds,['a','b','c']);
  await root().locator('svg').focus();const moveBefore=await root().locator('svg > g').getAttribute('transform'),p=await header('c');await drag(p,{x:p.x-50,y:p.y+30},'middle');assert.notEqual(await root().locator('svg > g').getAttribute('transform'),moveBefore,'Middle button pans over nodes.');
  await page.getByRole('button',{name:'Overview Editable tables',exact:true}).click();await closePanel();const c=await header('a');await page.mouse.click(c.x,c.y,{button:'right'});await page.getByRole('menuitem',{name:'Delete everywhere',exact:true}).click();await ready();after=await model();assert.ok(!after.entities.some(e=>e.id==='a'));assert.ok(after.diagrams.every(d=>!d.entityIds.includes('a')));assert.equal(after.relations.length,0);assertProject(after);await undo();
  const canvas=await box(root());await page.mouse.click(canvas.x+25,canvas.y+canvas.height-40,{button:'right'});await page.getByRole('menuitem',{name:'Add table',exact:true}).click();await page.getByRole('textbox',{name:'Node name',exact:true}).fill('Created from menu');await page.getByRole('button',{name:'Add node',exact:true}).click();await ready();assert.ok((await model()).entities.some(e=>e.name==='Created from menu'));
  // Wheel does not zoom until explicitly enabled, then Escape restores page scrolling.
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));const cv=await box(root());await page.mouse.move(cv.x+cv.width/2,cv.y+cv.height/2);
  const transform=await root().locator('svg > g').getAttribute('transform');await page.mouse.wheel(0,160);await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>scrollY>0));assert.equal(await root().locator('svg > g').getAttribute('transform'),transform);
  await root().getByRole('button',{name:'Enable wheel zoom',exact:true}).click();const activeY=await page.evaluate(()=>scrollY),cv2=await box(root());await page.mouse.move(cv2.x+cv2.width/2,cv2.y+cv2.height/2);await page.mouse.wheel(0,-100);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>scrollY),activeY);assert.notEqual(await root().locator('svg > g').getAttribute('transform'),transform);await page.keyboard.press('Escape');assert.ok(await root().getByRole('button',{name:'Enable wheel zoom',exact:true}).isVisible());
  for(const type of ['system','class','sequence','state']){
    await page.getByRole('button',{name:'Add diagram',exact:true}).click();await page.getByRole('button',{name:'Blank '+type+' diagram',exact:true}).click();await ready();const d=(await model()).diagrams.at(-1);assert.equal(d.type,type);assert.deepEqual(d.entityIds,[]);assert.deepEqual(d.relationIds,[]);if(type==='sequence')assert.deepEqual(d.messages,[]);
    await closePanel();const stage=page.locator(`[data-diagram-card="${d.id}"]`);await stage.hover();await stage.getByRole('button',{name:'Add node to '+d.title,exact:true}).click();await page.getByRole('textbox',{name:'Node name',exact:true}).fill('First '+type);await page.getByRole('button',{name:'Add node',exact:true}).click();await ready();assert.equal((await model()).diagrams.at(-1).entityIds.length,1);
  }
  await page.screenshot({path:resolve(cache,'blank-state-created.png')});
  const expected=await model(),downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Save HTML ↓',exact:true}).click();const download=await downloadPromise;await download.saveAs(resolve(cache,'saved.html'));const saved=extractProject(await readFile(resolve(cache,'saved.html'),'utf8'));assert.deepEqual(saved,expected);await page.goto(pathToFileURL(resolve(cache,'saved.html')).href);await ready();assert.deepEqual(await model(),expected);
  assert.deepEqual(errors,[]);console.log('Editor requirements: scroll geometry, direct inspector, row drag/reconnect, group move/delete, pan/menu, wheel activation, all blank families and saved reopen passed.');
}finally{await browser.close();}
