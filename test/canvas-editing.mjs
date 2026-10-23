import assert from 'node:assert/strict';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {exportProject,extractProject} from '../src/export.mjs';
import {assertProject} from '../src/model.mjs';

const cache=resolve('.cache/test-canvas');
await mkdir(cache,{recursive:true});
const backend=assertProject(JSON.parse(await readFile('examples/backend-onboarding.json','utf8')));
const validation=assertProject(JSON.parse(await readFile('examples/input-validation-state.json','utf8')));
const copy=value=>JSON.parse(JSON.stringify(value));
const entitiesFrom=(source,ids)=>ids.map(id=>{const entity=copy(source.entities.find(entity=>entity.id===id));delete entity.group;return entity;});
const base=(id,title,entities,diagram,relations=[])=>assertProject({schemaVersion:1,id,title,revision:0,entities,relations,diagrams:[diagram],blocks:[{id:id+'-view',type:'diagram',diagramId:diagram.id}],testMetadata:{purpose:'Real pointer editing regression',preserve:true}});
const system=base('canvas-system','Canvas system editing',entitiesFrom(backend,['shopper','storefront','gateway']),{id:'canvas-system-diagram',type:'system',title:'Canvas graph',direction:'RIGHT',entityIds:['shopper','storefront','gateway'],relationIds:['shopper-storefront'],positions:{shopper:{x:50,y:100},storefront:{x:390,y:100},gateway:{x:730,y:100}}},[copy(backend.relations.find(relation=>relation.id==='shopper-storefront'))]);
const classes=base('canvas-class','Canvas class editing',entitiesFrom(backend,['order','order-line','money']),{id:'canvas-class-diagram',type:'class',title:'Canvas classes',entityIds:['order','order-line','money'],relationIds:[],positions:{order:{x:20,y:60},'order-line':{x:620,y:60},money:{x:1220,y:60}}});
const sequence=base('canvas-sequence','Canvas sequence editing',entitiesFrom(backend,['shopper','storefront','gateway']),{id:'canvas-sequence-diagram',type:'sequence',title:'Canvas messages',entityIds:['shopper','storefront','gateway'],messages:copy(backend.diagrams.find(diagram=>diagram.type==='sequence').messages.slice(0,2))});
const states=base('canvas-state','Canvas state editing',[{id:'start',kind:'initial',name:'Start'},...entitiesFrom(validation,['regular-input']),{id:'finish',kind:'final',name:'Finished'}],{id:'canvas-state-diagram',type:'state',title:'Canvas states',direction:'RIGHT',entityIds:['start','regular-input','finish'],relationIds:['start-input'],positions:{start:{x:40,y:120},'regular-input':{x:240,y:70},finish:{x:620,y:120}}},[{id:'start-input',kind:'transition',source:'start',target:'regular-input',label:'Begin'}]);
const inputs=[['backend-onboarding',backend],['input-validation-state',validation],['system',system],['classes',classes],['sequence',sequence],['states',states]];
await Promise.all(inputs.map(async([name,project])=>writeFile(resolve(cache,name+'.html'),await exportProject(project))));

let executablePath=process.env.FINALDIAGRAMS_BROWSER||process.env.CHROME_PATH;
if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
const errors=[],network=[];
function observe(page){page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});page.on('dialog',dialog=>dialog.accept());}
const page=await context.newPage();observe(page);
const model=target=>target.evaluate(()=>window.FinalDiagrams.getProject());
const node=(target,id)=>target.locator(`[data-entity-id="${id}"]`);
const relation=(target,id)=>target.locator(`[data-relation-id="${id}"]`);
const message=(target,id)=>target.locator(`[data-message-id="${id}"]`);
const withoutRevision=project=>{project=copy(project);delete project.revision;return project;};
async function ready(target,diagramID){await target.waitForFunction(id=>[...document.querySelectorAll('.diagram-canvas')].some(canvas=>(!id||canvas.dataset.diagramId===id)&&canvas.dataset.ready==='true'),diagramID);}
async function center(locator){await locator.waitFor({state:'visible'});const box=await locator.boundingBox();assert.ok(box,'Interactive geometry is visible.');return {x:box.x+box.width/2,y:box.y+box.height/2};}
async function nodeCenter(target,id){const body=node(target,id).locator('.fd-node-body').first();return center(await body.count()?body:node(target,id));}
async function clickNodeHeader(target,id){const body=node(target,id).locator('.fd-node-body').first(),box=await (await body.count()?body:node(target,id)).boundingBox();assert.ok(box);await target.mouse.click(box.x+Math.min(70,box.width*.4),box.y+18);}
async function beginConnection(target,id){await node(target,id).hover();const handle=target.locator(`[data-connect-from="${id}"][data-side="right"]`);assert.equal(await handle.evaluate(element=>element.localName==='circle'||!!element.querySelector('circle')),true,'Connection handles expose a circular hit target on the node boundary.');const start=await center(handle);await target.mouse.move(start.x,start.y);await target.mouse.down();return start;}
async function dragTo(target,start,end){await target.mouse.move(start.x,start.y);await target.mouse.down();await target.mouse.move(end.x,end.y,{steps:16});await target.mouse.up();}
async function connect(target,from,to){const end=await nodeCenter(target,to);await beginConnection(target,from);await target.mouse.move(end.x,end.y,{steps:16});await target.mouse.up();}
async function showEndpoint(target,id,endpoint,kind='relation'){
  const owner=kind==='message'?message(target,id):relation(target,id);
  const line=owner.locator('.fd-edge-line').first();
  let point;
  if(await line.count())point=await line.evaluate((path,{id,kind})=>{
    const length=path.getTotalLength(),matrix=path.getScreenCTM();
    for(const fraction of [.5,.35,.65,.2,.8,.1,.9,.05,.95,...Array.from({length:31},(_,index)=>(index+1)/32)]){
      const p=path.getPointAtLength(length*fraction).matrixTransform(matrix),hit=document.elementFromPoint(p.x,p.y);
      if(hit?.closest(`[data-${kind}-id]`)?.getAttribute(`data-${kind}-id`)===id)return {x:p.x,y:p.y};
    }
    return null;
  },{id,kind});
  if(point)await target.mouse.move(point.x,point.y);
  else{
    const label=owner.locator('[data-edge-label], .fd-message-label').first();
    assert.ok(await label.count(),'An edge exposes a visible route or label for pointer selection.');
    await label.hover();
  }
  const selector=`[data-reconnect-id="${id}"][data-endpoint="${endpoint}"][data-connection-kind="${kind}"]`;
  await target.waitForFunction(selector=>{const handle=document.querySelector(selector),control=handle?.closest('[data-edit-control]');return control&&Number(getComputedStyle(control).opacity)>.9;},selector);
  const handle=target.locator(selector);
  const hitOwner=await handle.evaluate(handle=>{const box=handle.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return hit?.closest('[data-reconnect-id]')?.getAttribute('data-reconnect-id')||hit?.closest('[data-edit-control]')?.querySelector('[data-reconnect-id]')?.getAttribute('data-reconnect-id')||null;});
  assert.equal(hitOwner,id,'A visible reconnection handle receives pointer input instead of an overlapping hidden handle.');
  return handle;
}
async function reconnect(target,id,endpoint,to,kind='relation'){const end=await nodeCenter(target,to),handle=await showEndpoint(target,id,endpoint,kind);await dragTo(target,await center(handle),end);}
async function expectRelation(target,id,source,destination){await target.waitForFunction(({id,source,destination})=>{const relation=window.FinalDiagrams.getProject().relations.find(relation=>relation.id===id);return relation?.source===source&&relation.target===destination;},{id,source,destination});await ready(target);}
async function enterEdit(target,diagramID,title){await target.getByRole('button',{name:'Edit document',exact:true}).click();await ready(target,diagramID);await target.getByRole('button',{name:'Overview '+title,exact:true}).click();}
async function addNode(target,diagramID,name,kind){await target.locator(`[data-canvas-add-entity="${diagramID}"]`).click();const editor=target.getByRole('dialog',{name:'Add node',exact:true});await editor.getByRole('textbox',{name:'Node name',exact:true}).fill(name);if(kind)await editor.getByRole('combobox',{name:'Node type',exact:true}).selectOption(kind);await editor.getByRole('button',{name:'Add node',exact:true}).click();await target.waitForFunction(name=>window.FinalDiagrams.getProject().entities.some(entity=>entity.name===name),name);await ready(target,diagramID);return (await model(target)).entities.find(entity=>entity.name===name);}
async function closeInspector(target){const close=target.getByRole('button',{name:'Close details',exact:true});if(await close.isVisible())await close.click();}

try{
  await page.goto(pathToFileURL(resolve(cache,'system.html')).href);await ready(page,system.diagrams[0].id);
  assert.equal(await page.locator('[data-connect-from], [data-reconnect-id], .canvas-editbar').count(),0,'Read mode does not expose editing controls.');
  await enterEdit(page,system.diagrams[0].id,'Canvas graph');
  await node(page,'shopper').locator('text').filter({hasText:/^Shopper$/}).first().dblclick();
  await page.getByRole('textbox',{name:'Rename entity',exact:true}).fill('Canvas shopper');
  await page.getByRole('textbox',{name:'Rename entity',exact:true}).press('Enter');
  await page.waitForFunction(()=>window.FinalDiagrams.getProject().entities.find(entity=>entity.id==='shopper').name==='Canvas shopper');await ready(page);
  await node(page,'shopper').hover();
  assert.ok(await page.locator('[data-connect-from="shopper"]').count()>=4,'Hover exposes connection handles around the node.');
  assert.ok(await page.locator('[data-connect-from="shopper"][data-side="right"]').evaluate(handle=>Number(getComputedStyle(handle).opacity)>0),'The hovered connection handle is visible.');
  const beforeCreate=await model(page);
  await connect(page,'shopper','gateway');
  await page.waitForFunction(()=>window.FinalDiagrams.getProject().relations.length===2);await ready(page);
  let current=await model(page),created=current.relations.find(relation=>!beforeCreate.relations.some(previous=>previous.id===relation.id));
  assert.equal(created.source,'shopper');assert.equal(created.target,'gateway');
  assert.ok(current.diagrams[0].relationIds.includes(created.id),'Pointer-created arrows join the visible diagram.');
  await page.locator('#undo').click();await page.waitForFunction(id=>!window.FinalDiagrams.getProject().relations.some(relation=>relation.id===id),created.id);
  assert.deepEqual(withoutRevision(await model(page)),withoutRevision(beforeCreate),'One undo reverses the entire connection gesture.');
  await page.locator('#redo').click();await expectRelation(page,created.id,'shopper','gateway');await closeInspector(page);
  await relation(page,created.id).locator('.fd-edge-label-text').dblclick();
  await page.getByRole('textbox',{name:'Rename relation',exact:true}).fill('Canvas connection');
  await page.getByRole('textbox',{name:'Rename relation',exact:true}).press('Enter');
  await page.waitForFunction(id=>window.FinalDiagrams.getProject().relations.find(relation=>relation.id===id)?.label==='Canvas connection',created.id);await ready(page);
  const beforeToolbar=(await model(page)).relations.length;
  await page.getByRole('button',{name:'Draw connection in Canvas graph',exact:true}).click();
  await clickNodeHeader(page,'storefront');
  await clickNodeHeader(page,'gateway');
  await page.waitForFunction(count=>window.FinalDiagrams.getProject().relations.length===count+1,beforeToolbar);await ready(page);
  assert.ok((await model(page)).relations.some(relation=>relation.source==='storefront'&&relation.target==='gateway'),'Connect toolbar supports choosing the source and destination directly on canvas.');
  await reconnect(page,created.id,'target','storefront');await expectRelation(page,created.id,'shopper','storefront');await closeInspector(page);
  await reconnect(page,created.id,'source','gateway');await expectRelation(page,created.id,'gateway','storefront');await closeInspector(page);

  const beforeCancel=await model(page),canvasBox=await page.locator('.diagram-canvas').boundingBox();
  const empty={x:canvasBox.x+canvasBox.width-28,y:canvasBox.y+canvasBox.height-28};
  await beginConnection(page,'shopper');await page.mouse.move(empty.x,empty.y,{steps:12});await page.mouse.up();
  assert.deepEqual(await model(page),beforeCancel,'Dropping a new arrow on empty canvas does not change the source.');
  await beginConnection(page,'shopper');await page.mouse.move(empty.x,empty.y,{steps:12});
  await page.locator('.fd-connection-preview').waitFor({state:'attached'});await page.keyboard.press('Escape');await page.mouse.up();
  assert.equal(await page.locator('.fd-connection-preview').count(),0,'Escape removes a connection preview.');
  assert.deepEqual(await model(page),beforeCancel,'Escape cancels without creating an undo entry or revising the model.');
  const canceledEndpoint=await showEndpoint(page,created.id,'target');await dragTo(page,await center(canceledEndpoint),empty);
  assert.deepEqual(await model(page),beforeCancel,'An empty reconnection drop keeps its original endpoint.');
  await page.mouse.dblclick(empty.x,empty.y);
  const blankEditor=page.getByRole('dialog',{name:'Add node',exact:true});
  await blankEditor.getByRole('textbox',{name:'Node name',exact:true}).fill('Discarded blank-canvas node');
  await blankEditor.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(await model(page),beforeCancel,'Canceling blank-canvas node creation leaves the complete model unchanged.');
  await page.mouse.dblclick(empty.x,empty.y);await blankEditor.waitFor({state:'visible'});await page.keyboard.press('Escape');
  await blankEditor.waitFor({state:'hidden'});
  assert.deepEqual(await model(page),beforeCancel,'Escape also closes blank-canvas creation without an edit.');
  const oldPosition=copy((await model(page)).diagrams[0].positions.shopper),moving=await nodeCenter(page,'shopper');
  await dragTo(page,moving,{x:moving.x+75,y:moving.y+65});
  await page.waitForFunction(before=>{const after=window.FinalDiagrams.getProject().diagrams[0].positions.shopper;return after.x!==before.x||after.y!==before.y;},oldPosition);
  const beforeNode=await model(page),addition=await addNode(page,system.diagrams[0].id,'Canvas addition');
  assert.equal(addition.kind,'service');assert.ok((await model(page)).diagrams[0].entityIds.includes(addition.id));
  await page.locator('#undo').click();await page.waitForFunction(id=>!window.FinalDiagrams.getProject().entities.some(entity=>entity.id===id),addition.id);
  assert.deepEqual(withoutRevision(await model(page)),withoutRevision(beforeNode),'Adding a canvas node is one undoable semantic operation.');
  await page.locator('#redo').click();await page.waitForFunction(id=>window.FinalDiagrams.getProject().entities.some(entity=>entity.id===id),addition.id);await ready(page);await closeInspector(page);

  // Even an SVG exported while a connection preview is live contains only document geometry.
  await beginConnection(page,'shopper');await page.mouse.move(empty.x,empty.y,{steps:10});
  await page.locator('.fd-connection-preview').waitFor({state:'attached'});
  const svgExport=page.getByRole('button',{name:'Export SVG Canvas graph',exact:true});await svgExport.focus();
  const svgDownload=page.waitForEvent('download');await svgExport.press('Enter');
  const svgPath=resolve(cache,'editing.svg');await (await svgDownload).saveAs(svgPath);
  await page.keyboard.press('Escape');await page.mouse.up();
  const exported=await context.newPage();observe(exported);await exported.goto(pathToFileURL(svgPath).href);
  assert.equal(await exported.locator('[data-edit-control], [data-edit-overlay], [data-connect-from], [data-reconnect-id], .fd-connection-preview').count(),0,'SVG exports exclude handles, hit targets and active previews.');await exported.close();
  const savedModel=await model(page),htmlDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Save HTML ↓',exact:true}).click();
  const savedPath=resolve(cache,'saved-system.html');await (await htmlDownload).saveAs(savedPath);
  assert.deepEqual(extractProject(await readFile(savedPath,'utf8')),savedModel);
  const reopened=await context.newPage();observe(reopened);await reopened.goto(pathToFileURL(savedPath).href);await ready(reopened);
  assert.deepEqual(await model(reopened),savedModel,'Reopening preserves moved nodes, arrows, endpoints and added entities.');
  assert.equal(await reopened.locator('[data-connect-from], [data-reconnect-id], .canvas-editbar').count(),0,'Saved documents reopen in read mode.');await reopened.close();

  await page.goto(pathToFileURL(resolve(cache,'classes.html')).href);await ready(page);await enterEdit(page,classes.diagrams[0].id,'Canvas classes');
  await connect(page,'order','money');await page.waitForFunction(()=>window.FinalDiagrams.getProject().relations.length===1);
  assert.equal((await model(page)).relations[0].kind,'association','Class gestures create semantic associations.');

  await page.goto(pathToFileURL(resolve(cache,'states.html')).href);await ready(page);await enterEdit(page,states.diagrams[0].id,'Canvas states');
  const beforeInvalid=await model(page);await connect(page,'regular-input','start');
  assert.deepEqual(await model(page),beforeInvalid,'An initial state rejects an incoming transition drop.');
  await reconnect(page,'start-input','source','finish');
  assert.deepEqual(await model(page),beforeInvalid,'A final state rejects an outgoing reconnection drop.');
  await connect(page,'regular-input','finish');await page.waitForFunction(()=>window.FinalDiagrams.getProject().relations.length===2);
  assert.equal((await model(page)).relations.find(relation=>relation.id!=='start-input').kind,'transition','State gestures create transitions.');

  await page.goto(pathToFileURL(resolve(cache,'sequence.html')).href);await ready(page);await enterEdit(page,sequence.diagrams[0].id,'Canvas messages');
  await connect(page,'shopper','gateway');await page.waitForFunction(()=>window.FinalDiagrams.getProject().diagrams[0].messages.length===3);await ready(page);
  current=await model(page);const addedMessage=current.diagrams[0].messages.find(message=>!sequence.diagrams[0].messages.some(previous=>previous.id===message.id));
  assert.equal(addedMessage.from,'shopper');assert.equal(addedMessage.to,'gateway');assert.equal(current.relations.length,0,'Sequence gestures create ordered messages rather than static relations.');await closeInspector(page);
  await reconnect(page,addedMessage.id,'target','storefront','message');await page.waitForFunction(id=>window.FinalDiagrams.getProject().diagrams[0].messages.find(message=>message.id===id)?.to==='storefront',addedMessage.id);await ready(page);await closeInspector(page);
  await reconnect(page,addedMessage.id,'source','gateway','message');await page.waitForFunction(id=>window.FinalDiagrams.getProject().diagrams[0].messages.find(message=>message.id===id)?.from==='gateway',addedMessage.id);await ready(page);await closeInspector(page);
  const beforeReorder=await model(page),participant=await nodeCenter(page,'shopper'),lastParticipant=await nodeCenter(page,'gateway');
  await dragTo(page,participant,{x:lastParticipant.x+60,y:participant.y});
  await page.waitForFunction(()=>window.FinalDiagrams.getProject().diagrams[0].entityIds.at(-1)==='shopper');
  assert.deepEqual((await model(page)).diagrams[0].messages,beforeReorder.diagrams[0].messages,'Participant reordering preserves message endpoints and order.');
  const extraParticipant=await addNode(page,sequence.diagrams[0].id,'Extra participant');
  assert.ok((await model(page)).diagrams[0].entityIds.includes(extraParticipant.id),'The sequence toolbar adds a participant.');
  await page.getByRole('button',{name:'Done editing',exact:true}).click();await ready(page);
  assert.equal(await page.locator('[data-connect-from], [data-reconnect-id], .canvas-editbar').count(),0,'Leaving edit mode removes graph and sequence editing handles.');

  // Actual shipped examples also pass through the same prebuilt runtime without an artifact build.
  for(const [name,source] of [['backend-onboarding',backend],['input-validation-state',validation]]){
    await page.goto(pathToFileURL(resolve(cache,name+'.html')).href);
    await page.waitForFunction(count=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===count,source.blocks.filter(block=>block.type==='diagram').length);
    assert.deepEqual(await model(page),source);
    assert.equal(await page.locator('[data-connect-from], [data-reconnect-id]').count(),0,'Published examples remain clean in read mode.');
  }
  assert.deepEqual(errors,[],'Canvas editing does not throw browser errors.');assert.deepEqual(network,[],'Canvas edits, saved files and SVG exports stay offline.');
  console.log('PASS: real canvas connect/reconnect/cancel/move, class/state semantics, sequence message/reorder, canvas node creation, undo/redo, SVG exclusion, HTML save/reopen, offline examples.');
}catch(error){await page.screenshot({path:resolve(cache,'failure.png'),fullPage:false}).catch(()=>{});await writeFile(resolve(cache,'failure-model.json'),JSON.stringify(await model(page),null,2)).catch(()=>{});throw error;}finally{await browser.close();}
