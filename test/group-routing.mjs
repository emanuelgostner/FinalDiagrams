import assert from 'node:assert/strict';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {exportProject,extractProject} from '../src/export.mjs';

const cache=resolve('.cache/test-group-routing');await mkdir(cache,{recursive:true});
const fixture=JSON.parse(await readFile('examples/group-contained-relations.json','utf8'));
await writeFile(resolve(cache,'fixture.html'),await exportProject(fixture));
let executablePath=process.env.FINALDIAGRAMS_BROWSER;
if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===3);
const root=id=>page.locator(`[data-diagram-card="${id}"]`);
const model=()=>page.evaluate(()=>FinalDiagrams.getProject());
async function containment(standalone=false){
  const failures=await page.evaluate(({fixture,standalone})=>{
    const failures=[];
    for(const diagram of fixture.diagrams){
      const canvas=standalone?document.documentElement:document.querySelector(`[data-diagram-id="${diagram.id}"]`);
      for(const relation of fixture.relations.filter(r=>diagram.relationIds.includes(r.id))){
        const source=fixture.entities.find(e=>e.id===relation.source),target=fixture.entities.find(e=>e.id===relation.target);
        if(!source.group||source.group!==target.group)continue;
        const group=canvas.querySelector(`[data-group-id="${source.group}"] > rect`);if(!group)continue;
        const frame=group.getBBox(),owner=canvas.querySelector(`[data-relation-id="${relation.id}"]`),path=owner.querySelector('.fd-edge-line');
        const inside=(x,y)=>x>frame.x+12&&x<frame.x+frame.width-12&&y>frame.y+30&&y<frame.y+frame.height-12;
        for(let i=0;i<=100;i++){const p=path.getPointAtLength(path.getTotalLength()*i/100);if(!inside(p.x,p.y))failures.push(relation.id+' path escapes group');}
        for(const item of owner.querySelectorAll('[data-edge-label],[data-multiplicity]')){const b=item.getBBox();if(!inside(b.x,b.y)||!inside(b.x+b.width,b.y+b.height))failures.push(relation.id+' annotation escapes group');}
      }
    }
    return failures;
  },{fixture,standalone});assert.deepEqual(failures,[]);
}
try{
  await page.goto(pathToFileURL(resolve(cache,'fixture.html')).href);await ready();await containment();
  assert.deepEqual(await model(),fixture,'Group bounds are presentation only');
  assert.equal(await root('libraries-view').evaluate(el=>{const group=el.querySelector('[data-group-id] > rect').getBBox(),path=el.querySelector('[data-relation-id="outgoing"] .fd-edge-line'),end=path.getPointAtLength(path.getTotalLength());return end.x>group.x+group.width+100;}),true,'External connection must leave the group');
  await page.getByRole('button',{name:'Edit Grouped libraries',exact:true}).click();await ready();await containment();
  const expand=root('libraries-view').getByRole('button',{name:'Expand Grouped libraries',exact:true});await expand.click();
  const card=root('libraries-view').locator('[data-entity-id="library-a"] .fd-node-body');
  let box=await card.boundingBox();
  await page.mouse.move(box.x+40,box.y+20);await page.mouse.down();await page.mouse.move(box.x+110,box.y+80,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();
  assert.deepEqual(await model(),fixture,'Cancelled movement preserves the model');await containment();
  box=await card.boundingBox();await page.mouse.move(box.x+40,box.y+20);await page.mouse.down();await page.mouse.move(box.x-40,box.y+80,{steps:8});await page.mouse.up();await ready();
  const moved=await model();assert.notDeepEqual(moved.diagrams[0].positions,fixture.diagrams[0].positions);await containment();
  await page.keyboard.press('Escape');await page.keyboard.press('Control+z');await ready();await containment();
  assert.deepEqual((await model()).diagrams[0].positions,fixture.diagrams[0].positions);
  await page.keyboard.press('Control+Shift+z');await ready();await containment();
  assert.deepEqual((await model()).diagrams[0].positions,moved.diagrams[0].positions);
  await root('libraries-view').getByRole('button',{name:'Overview Grouped libraries',exact:true}).click();
  await page.screenshot({path:resolve(cache,'moved-overview.png')});
  const svgDownload=page.waitForEvent('download');await root('libraries-view').getByRole('button',{name:'Export SVG Grouped libraries',exact:true}).click();await (await svgDownload).saveAs(resolve(cache,'group.svg'));
  const saved=await model(),htmlDownload=page.waitForEvent('download');await page.keyboard.press('Control+s');await (await htmlDownload).saveAs(resolve(cache,'saved.html'));
  assert.deepEqual(extractProject(await readFile(resolve(cache,'saved.html'),'utf8')),saved);
  await page.goto(pathToFileURL(resolve(cache,'saved.html')).href);await ready();await containment();assert.deepEqual(await model(),saved);
  await page.goto(pathToFileURL(resolve(cache,'group.svg')).href);await containment(true);
  assert.deepEqual(errors,[]);
  console.log('PASS: internal routes/labels/cardinalities enclosed, external links excluded, edit/drag/cancel/undo/redo, SVG and saved HTML round trips.');
}catch(error){await page.screenshot({path:resolve(cache,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
