import assert from 'node:assert/strict';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {assertProject} from '../src/model.mjs';
import {exportProject,extractProject} from '../src/export.mjs';

const cache=resolve('.cache/test-database');await mkdir(cache,{recursive:true});
const sample=assertProject(JSON.parse(await readFile('examples/all-diagrams.json','utf8')));
const database=sample.diagrams.find(diagram=>diagram.id==='data-mapping');assert.ok(database);
const databaseRelations=sample.relations.filter(relation=>database.relationIds.includes(relation.id));
for(const relation of databaseRelations){
  const source=sample.entities.find(entity=>entity.id===relation.source),target=sample.entities.find(entity=>entity.id===relation.target);
  assert.match(source.fields.find(member=>member.id===relation.sourceMember)?.purpose||'',/primary key/i,'The sample arrow starts at the referenced PK row.');
  assert.match(target.fields.find(member=>member.id===relation.targetMember)?.purpose||'',/FK/i,'The sample arrow ends at its referencing FK row.');
  assert.equal(relation.sourceMultiplicity,'1');assert.match(relation.targetMultiplicity,/n|\*/,'The many side has an explicit multiplicity.');
}
const field=(id,name,purpose)=>({id,name,type:'uuid',purpose});
const fixture=assertProject({schemaVersion:1,id:'database-obstacle-test',title:'Database row routing',revision:0,
  entities:[
    {id:'parent',kind:'table',name:'parents',fields:[field('parent-tenant','tenant_id','Tenant scope'),field('parent-pk','id','Primary key'),field('parent-status','status','State'),field('parent-owner','owner_id','Owner')]},
    {id:'obstacle',kind:'table',name:'unrelated_audit_log',fields:Array.from({length:6},(_,index)=>field('audit-'+index,'audit_'+index,'Unrelated data'))},
    {id:'child',kind:'table',name:'children',fields:[field('child-pk','id','Primary key'),field('child-tenant','tenant_id','Tenant scope'),field('child-fk','parent_id','Foreign key to parents.id'),field('child-owner','owner_id','Owner')]},
  ],
  relations:[{id:'parent-child',source:'parent',target:'child',kind:'association',label:'parents.id → children.parent_id',sourceMember:'parent-pk',targetMember:'child-fk',sourceMultiplicity:'1',targetMultiplicity:'n'}],
  diagrams:[
    {id:'database-auto',type:'class',title:'Automatic row routing',direction:'DOWN',entityIds:['parent','child','obstacle'],relationIds:['parent-child'],columns:[{key:'name',label:'Column'},{key:'type',label:'Type'}]},
    {id:'database-manual',type:'class',title:'Routing around another table',direction:'RIGHT',entityIds:['parent','obstacle','child'],relationIds:['parent-child'],columns:[{key:'name',label:'Column'},{key:'type',label:'Type'}],positions:{parent:{x:40,y:80},obstacle:{x:500,y:80},child:{x:980,y:80}}},
  ],
  blocks:[{id:'auto-view',type:'diagram',diagramId:'database-auto'},{id:'manual-view',type:'diagram',diagramId:'database-manual'}],testMetadata:{preserved:'Physical PK/FK identities stay unchanged by visual movement.'}
});
await Promise.all([writeFile(resolve(cache,'sample.html'),await exportProject(sample)),writeFile(resolve(cache,'obstacle.html'),await exportProject(fixture))]);
let executablePath=process.env.FINALDIAGRAMS_BROWSER||process.env.CHROME_PATH;
if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1500,height:1000},acceptDownloads:true});
const errors=[],network=[];
function observe(page){page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});page.on('dialog',dialog=>dialog.accept());}
const page=await context.newPage();observe(page);
const model=target=>target.evaluate(()=>window.FinalDiagrams.getProject());
async function ready(target,count){await target.waitForFunction(count=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===count,count);}
async function overview(target,diagram){await target.getByRole('button',{name:'Overview '+diagram.title,exact:true}).click();}
async function assertGeometry(target,project,diagram,phase,{standalone=false,expectObstacle=false}={}){
  const result=await target.evaluate(({project,diagram,standalone})=>{
    const root=standalone?document.documentElement:document.querySelector(`.diagram-canvas[data-diagram-id="${diagram.id}"]`);
    const cards=diagram.entityIds.map(id=>{const group=root.querySelector(`[data-entity-id="${id}"]`),body=group.querySelector('.fd-node-body');return {id,group,box:body.getBoundingClientRect()};});
    const intersects=(a,b,padding=0)=>a.left<b.right-padding&&a.right>b.left+padding&&a.top<b.bottom-padding&&a.bottom>b.top+padding;
    const visibleRelations=project.relations.filter(relation=>diagram.relationIds?.includes(relation.id));
    const routeSamples=new Map();
    const routes=visibleRelations.map(relation=>{
      const owner=root.querySelector(`[data-relation-id="${relation.id}"]`),path=owner.querySelector('.fd-edge-line'),matrix=path.getScreenCTM(),scale=Math.hypot(matrix.a,matrix.b),length=path.getTotalLength();
      const pointAt=fraction=>path.getPointAtLength(length*fraction).matrixTransform(matrix),start=pointAt(0),end=pointAt(1);
      const bound=(side,point)=>{
        const card=cards.find(card=>card.id===relation[side]),member=relation[side+'Member'];
        const row=card.group.querySelector(`[data-member-id="${member}"] .fd-row-bg`).getBoundingClientRect();
        return {hook:owner.getAttribute(`data-${side}-member-id`),rowY:Math.abs(point.y-(row.top+row.height/2))/scale,sideX:Math.min(Math.abs(point.x-card.box.left),Math.abs(point.x-card.box.right))/scale};
      };
      const crossed=new Set();
      const steps=Math.min(5000,Math.max(200,Math.ceil(length/2)));
      const samples=[];
      for(let index=0;index<=steps;index++){
        const point=pointAt(index/steps);
        samples.push({x:point.x,y:point.y});
        for(const card of cards)if(point.x>card.box.left+scale&&point.x<card.box.right-scale&&point.y>card.box.top+scale&&point.y<card.box.bottom-scale)crossed.add(card.id);
      }
      routeSamples.set(relation.id,{samples,scale,length,relation});
      const cardinalities=['source','target'].map(side=>{
        const unit=owner.querySelector(`[data-multiplicity="${side}"]`);
        if(!unit)return {side,missing:true};
        const box=unit.getBoundingClientRect(),style=getComputedStyle(unit),point=side==='source'?start:end;
        return {side,value:unit.textContent.trim(),width:box.width,height:box.height,visible:style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0,crossed:cards.filter(card=>intersects(box,card.box,scale)).map(card=>card.id),distance:Math.hypot((box.left+box.right)/2-point.x,(box.top+box.bottom)/2-point.y)/scale};
      });
      const obstacle=cards.find(card=>card.id==='obstacle');let directWouldCrossObstacle=false;
      if(obstacle)for(let index=0;index<=200;index++){const t=index/200,x=start.x+(end.x-start.x)*t,y=start.y+(end.y-start.y)*t;if(x>obstacle.box.left+scale&&x<obstacle.box.right-scale&&y>obstacle.box.top+scale&&y<obstacle.box.bottom-scale)directWouldCrossObstacle=true;}
      return {id:relation.id,length,source:bound('source',start),target:bound('target',end),crossed:[...crossed],cardinalities,directWouldCrossObstacle,sharedRuns:[]};
    });
    function longestSharedRun(a,b){
      const sameEndpoint=(side,otherSide)=>a.relation[side]===b.relation[otherSide]&&a.relation[side+'Member']===b.relation[otherSide+'Member'];
      const sharedStart=sameEndpoint('source','source')||sameEndpoint('source','target'),sharedEnd=sameEndpoint('target','source')||sameEndpoint('target','target');
      let run=0,longest=0;
      for(let index=1;index<a.samples.length;index++){
        const distanceFromStart=a.length*index/(a.samples.length-1);
        if(sharedStart&&distanceFromStart<24||sharedEnd&&a.length-distanceFromStart<24){run=0;continue;}
        const point=a.samples[index],near=b.samples.some(other=>(point.x-other.x)**2+(point.y-other.y)**2<=(1.5*a.scale)**2);
        if(near){const previous=a.samples[index-1];run+=Math.hypot(point.x-previous.x,point.y-previous.y)/a.scale;longest=Math.max(longest,run);}else run=0;
      }
      return longest;
    }
    for(let index=0;index<routes.length;index++)for(let other=index+1;other<routes.length;other++){
      const a=routeSamples.get(routes[index].id),b=routeSamples.get(routes[other].id);
      routes[index].sharedRuns.push({other:routes[other].id,length:Math.max(longestSharedRun(a,b),longestSharedRun(b,a))});
    }
    return routes;
  },{project,diagram,standalone});
  assert.equal(result.length,diagram.relationIds.length,phase+': every database relationship is drawn.');
  for(const route of result){
    const relation=project.relations.find(relation=>relation.id===route.id),label=phase+' / '+route.id;
    assert.ok(route.length>0,label+': route has visible length.');
    assert.equal(route.source.hook,relation.sourceMember,label+': source member binding is retained.');
    assert.equal(route.target.hook,relation.targetMember,label+': target member binding is retained.');
    assert.ok(route.source.rowY<1.5,label+': starts at the exact PK row center ('+route.source.rowY+').');
    assert.ok(route.target.rowY<1.5,label+': ends at the exact FK row center ('+route.target.rowY+').');
    assert.ok(route.source.sideX<1.5,label+': source begins at the card side ('+route.source.sideX+').');
    assert.ok(route.target.sideX>=5&&route.target.sideX<=10,label+': arrow tip has a seven-unit side clearance ('+route.target.sideX+').');
    assert.deepEqual(route.crossed,[],label+': no route passes behind a card interior.');
    for(const shared of route.sharedRuns)assert.ok(shared.length<=12,label+': no shared interior trunk with '+shared.other+' ('+shared.length+' world units).');
    if(expectObstacle)assert.equal(route.directWouldCrossObstacle,true,label+': fixture places a real non-endpoint obstacle across the direct connection.');
    for(const cardinality of route.cardinalities){
      assert.equal(cardinality.missing,undefined,label+': '+cardinality.side+' multiplicity exists.');
      assert.equal(cardinality.value,relation[cardinality.side+'Multiplicity'],label+': the correct endpoint cardinality is displayed.');
      assert.ok(cardinality.visible&&cardinality.width>0&&cardinality.height>0,label+': multiplicity is rendered.');
      assert.deepEqual(cardinality.crossed,[],label+': cardinality stays outside all cards.');
      assert.ok(cardinality.distance<100,label+': cardinality stays beside its own endpoint.');
    }
  }
}
try{
  await page.goto(pathToFileURL(resolve(cache,'sample.html')).href);await ready(page,sample.blocks.filter(block=>block.type==='diagram').length);
  await overview(page,database);await assertGeometry(page,sample,database,'Complete sample / read');
  await page.getByRole('button',{name:'Expand '+database.title,exact:true}).click();
  const expanded=page.locator('.diagram-card.expanded');await expanded.waitFor({state:'visible'});
  await overview(page,database);await expanded.screenshot({path:resolve(cache,'sample-expanded-overview.png')});
  await page.getByRole('button',{name:'Read '+database.title,exact:true}).click();
  await expanded.screenshot({path:resolve(cache,'sample-expanded-readable.png')});
  await page.getByRole('combobox',{name:'Explore a table in '+database.title,exact:true}).selectOption('data-orders');
  await expanded.screenshot({path:resolve(cache,'sample-expanded-primary-key.png')});
  await page.goto(pathToFileURL(resolve(cache,'obstacle.html')).href);await ready(page,2);
  for(const diagram of fixture.diagrams){await overview(page,diagram);await assertGeometry(page,fixture,diagram,'Initial read',{expectObstacle:diagram.id==='database-manual'});}
  assert.equal(await page.locator('[data-connect-from], [data-reconnect-id]').count(),0,'Read mode exposes no editing handles.');
  await page.getByRole('button',{name:'Edit document',exact:true}).click();await ready(page,2);
  const manual=fixture.diagrams[1];await overview(page,manual);await assertGeometry(page,await model(page),manual,'Edit mode');
  const table=page.locator(`.diagram-canvas[data-diagram-id="${manual.id}"] [data-entity-id="child"] .fd-node-body`);
  await table.scrollIntoViewIfNeeded();const box=await table.boundingBox(),before=(await model(page)).diagrams.find(diagram=>diagram.id===manual.id).positions.child;
  await page.mouse.move(box.x+45,box.y+24);await page.mouse.down();await page.mouse.move(box.x-15,box.y+144,{steps:16});await page.mouse.up();
  await page.waitForFunction(({id,before})=>{const position=window.FinalDiagrams.getProject().diagrams.find(diagram=>diagram.id===id).positions.child;return position.x!==before.x||position.y!==before.y;},{id:manual.id,before});
  await assertGeometry(page,await model(page),manual,'After native table drag');
  await page.getByRole('button',{name:'Done editing',exact:true}).click();await ready(page,2);
  const savedModel=await model(page);for(const diagram of savedModel.diagrams){await overview(page,diagram);await assertGeometry(page,savedModel,diagram,'Back in read mode');}
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save HTML ↓',exact:true}).click();
  const savedPath=resolve(cache,'edited-database.html');await (await download).saveAs(savedPath);
  assert.deepEqual(extractProject(await readFile(savedPath,'utf8')),savedModel,'The saved model preserves exact PK/FK bindings, cardinalities and manual positions.');
  const reopened=await context.newPage();observe(reopened);await reopened.goto(pathToFileURL(savedPath).href);await ready(reopened,2);
  assert.deepEqual(await model(reopened),savedModel);
  for(const diagram of savedModel.diagrams){await overview(reopened,diagram);await assertGeometry(reopened,savedModel,diagram,'Reopened offline');}
  const svgDownload=reopened.waitForEvent('download');await reopened.getByRole('button',{name:'Export SVG '+manual.title,exact:true}).click();
  const svgPath=resolve(cache,'database.svg');await (await svgDownload).saveAs(svgPath);
  const svg=await context.newPage();observe(svg);await svg.goto(pathToFileURL(svgPath).href);
  await assertGeometry(svg,savedModel,savedModel.diagrams.find(diagram=>diagram.id===manual.id),'Standalone SVG',{standalone:true});
  assert.deepEqual(errors,[],'Database geometry and saved files have no browser errors.');assert.deepEqual(network,[],'Database documents and SVGs remain offline.');
  console.log('PASS: PK→FK row/side anchors, visible cardinalities, unrelated-card obstacle avoidance, automatic/manual layout, native node drag, edit/read, save/reopen, standalone SVG, no network or page errors.');
}catch(error){await page.screenshot({path:resolve(cache,'failure.png'),fullPage:false}).catch(()=>{});await writeFile(resolve(cache,'failure-model.json'),JSON.stringify(await model(page),null,2)).catch(()=>{});throw error;}finally{await browser.close();}
