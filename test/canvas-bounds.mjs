import assert from 'node:assert/strict';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {exportProject,extractProject} from '../src/export.mjs';

const cache=resolve('.cache/test-canvas-bounds');await mkdir(cache,{recursive:true});
let executablePath=process.env.FINALDIAGRAMS_BROWSER||process.env.CHROME_PATH;
if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page=await browser.newPage({viewport:{width:1700,height:1100},acceptDownloads:true}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>document.querySelector('.diagram-canvas')?.dataset.ready==='true');
const root=()=>page.locator('.diagram-canvas'),node=id=>root().locator(`[data-entity-id="${id}"]`);
const model=()=>page.evaluate(()=>FinalDiagrams.getProject());
async function header(id){const b=await node(id).locator('.fd-node-body').boundingBox();return {x:b.x+35,y:b.y+25};}
async function drag(from,delta,button='left'){await page.mouse.move(from.x,from.y);await page.mouse.down({button});await page.mouse.move(from.x+delta.x,from.y+delta.y,{steps:10});await page.mouse.up({button});}
async function closePanel(){const b=page.getByRole('button',{name:'Close details',exact:true});if(await b.isVisible())await b.click();}
const cameraScale=()=>root().locator('svg > g').evaluate(g=>g.getScreenCTM().a);
const near=(actual,expected,message,tolerance=.1)=>assert.ok(Math.abs(actual-expected)<tolerance,`${message}: ${actual} != ${expected}`);
try{
  for(const type of ['system','class','state']){
    const fixture={schemaVersion:1,id:'bounds-'+type,title:'Unbounded '+type,revision:0,
      entities:['a','b'].map(id=>({id,kind:type==='system'?'service':type,name:'Node '+id,...(type==='class'?{fields:[{id:id+'-id',name:'id',type:'uuid'}]}:{})})),
      relations:type==='system'?[]:[{id:'link',source:'a',target:'b',kind:type==='state'?'transition':'association',label:'connects',...(type==='class'?{sourceMember:'a-id',targetMember:'b-id'}:{})}],
      diagrams:[{id:'diagram',type,title:'Free canvas',entityIds:['a','b'],relationIds:type==='system'?[]:['link'],positions:{a:{x:80,y:80},b:{x:420,y:220}}}],blocks:[{id:'view',type:'diagram',diagramId:'diagram'}]};
    await writeFile(resolve(cache,type+'.html'),await exportProject(fixture));await page.goto(pathToFileURL(resolve(cache,type+'.html')).href);await ready();
    await page.getByRole('button',{name:'Edit document',exact:true}).click();await ready();await page.getByRole('button',{name:'Overview Free canvas',exact:true}).click();
    // Bring the world origin inside the viewport, as happens naturally after pan/zoom.
    const bounds=await root().boundingBox();await drag({x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2},{x:150,y:160},'middle');
    const scale=await cameraScale(),start=await header('a'),before=(await model()).diagrams[0].positions;
    const delta={x:(-100-before.a.x)*scale,y:(-60-before.a.y)*scale};await drag(start,delta);
    let positions=(await model()).diagrams[0].positions;
    near(positions.a.x,-100,'A node crosses the left origin');near(positions.a.y,-60,'A node crosses the top origin');
    const end=await header('a');near(end.x-start.x,delta.x,'Node follows horizontal pointer displacement',1);near(end.y-start.y,delta.y,'Node follows vertical pointer displacement',1);
    await page.locator('#undo').click();await ready();assert.deepEqual((await model()).diagrams[0].positions,before);
    await page.locator('#redo').click();await ready();assert.deepEqual((await model()).diagrams[0].positions,positions);
    const cancel=await header('a');await page.mouse.move(cancel.x,cancel.y);await page.mouse.down();await page.mouse.move(cancel.x-50,cancel.y-40,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual((await model()).diagrams[0].positions,positions,'Escape restores a drag in negative coordinates.');
    await closePanel();await page.getByRole('button',{name:'Overview Free canvas',exact:true}).click();
    const first=await header('a');await page.mouse.click(first.x,first.y);await closePanel();
    const second=await header('b');await page.keyboard.down('Shift');await page.mouse.click(second.x,second.y);await page.keyboard.up('Shift');await closePanel();
    assert.equal(await root().locator('[data-entity-id][data-selected="true"]').count(),2);
    const groupScale=await cameraScale(),groupStart=await header('a');await drag(groupStart,{x:-75,y:-60});
    const grouped=(await model()).diagrams[0].positions;
    for(const id of ['a','b']){near(grouped[id].x-positions[id].x,-75/groupScale,'Group X offset');near(grouped[id].y-positions[id].y,-60/groupScale,'Group Y offset');}
    await page.getByRole('button',{name:'Overview Free canvas',exact:true}).click();
    assert.ok(await root().evaluate(root=>{const viewport=root.querySelector('svg').getBoundingClientRect();return [...root.querySelectorAll('.fd-node-body')].every(e=>{const b=e.getBoundingClientRect();return b.left>=viewport.left&&b.top>=viewport.top&&b.right<=viewport.right&&b.bottom<=viewport.bottom;});}),'Overview contains every node, including negative positions and a graph without edges.');
    const svgDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export SVG Free canvas',exact:true}).click();await (await svgDownload).saveAs(resolve(cache,type+'.svg'));
    const svg=await readFile(resolve(cache,type+'.svg'),'utf8'),viewBox=svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    assert.ok(viewBox[0]<grouped.a.x&&viewBox[1]<grouped.a.y,'SVG bounds include the left/top edges of negative-position nodes.');
    const expected=await model(),download=page.waitForEvent('download');await page.getByRole('button',{name:'Save HTML ↓',exact:true}).click();await (await download).saveAs(resolve(cache,type+'-saved.html'));
    assert.deepEqual(extractProject(await readFile(resolve(cache,type+'-saved.html'),'utf8')),expected);
    await page.goto(pathToFileURL(resolve(cache,type+'-saved.html')).href);await ready();assert.deepEqual(await model(),expected);
    await page.getByRole('button',{name:'Overview Free canvas',exact:true}).click();await page.screenshot({path:resolve(cache,type+'.png')});
  }
  assert.deepEqual(errors,[]);console.log('PASS: system/class/state nodes and groups cross both origins, follow the pointer, cancel/undo/redo, fit Overview, export SVG and save/reopen at negative positions.');
}catch(error){await page.screenshot({path:resolve(cache,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
