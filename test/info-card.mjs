import assert from 'node:assert/strict';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {exportProject,extractProject} from '../src/export.mjs';
const cache=resolve('.cache/test-info-card');await mkdir(cache,{recursive:true});
const fixture={schemaVersion:1,id:'context-editing',title:'Context editing',revision:0,entities:[...['a','b','c'].map(id=>({id,kind:'service',name:'Node '+id})),{id:'order',kind:'table',name:'Order',fields:[{id:'id',name:'id',type:'uuid',purpose:'Order identity'}]}],relations:[{id:'ab',source:'a',target:'b',kind:'calls',label:'Places order',description:'Original explanation'}],diagrams:[{id:'first',type:'system',title:'Editable connections',entityIds:['a','b','c'],positions:{a:{x:80,y:100},b:{x:500,y:100},c:{x:500,y:350}}},{id:'shared',type:'system',title:'Shared connection',entityIds:['a','b']},{id:'table',type:'class',title:'Editable members',entityIds:['order'],columns:[{key:'name',label:'Name'}]},{id:'sequence',type:'sequence',title:'Editable messages',entityIds:['a','b'],messages:[{id:'one',from:'a',to:'b',label:'Request',kind:'sync'}]}],blocks:[{id:'intro',type:'prose',markdown:'Scroll and edit beside the connection.'},...['first','shared','table','sequence'].map(id=>({id:'block-'+id,type:'diagram',diagramId:id}))]};
fixture.entities[0].description='Long detail '.repeat(100);fixture.entities[0].source={path:'src/a.js',url:'https://example.com/source',line:12};fixture.diagrams[3].messages.push({id:'two',from:'b',to:'a',label:'Response',kind:'return'});
await writeFile(resolve(cache,'fixture.html'),await exportProject(fixture));
let executablePath=process.env.FINALDIAGRAMS_BROWSER||process.env.CHROME_PATH;
if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})}),page=await browser.newPage({viewport:{width:1500,height:1100},acceptDownloads:true}),errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});

const panel=page.locator('#inspector'),root=id=>page.locator(`[data-diagram-id="${id}"]`);
const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('.diagram-canvas')].every(e=>e.dataset.ready==='true'));
const info=root('first').getByRole('button',{name:'Information about Node a',exact:true});
try{
 await page.goto(pathToFileURL(resolve(cache,'fixture.html')).href);await ready();
 const before=await root('first').boundingBox();await info.hover();await panel.waitFor({state:'visible'});
 assert.equal(await panel.getByRole('button',{name:'Pin details'}).getAttribute('aria-pressed'),'false');
 assert.ok((await panel.textContent()).includes(fixture.entities[0].description),'Full text is not truncated');
 assert.equal(await panel.locator('a.source-link').getAttribute('href'),'https://example.com/source');
 assert.deepEqual(await root('first').boundingBox(),before,'Preview does not change canvas geometry');
 await page.mouse.move(1,1);await panel.waitFor({state:'hidden'});
 await info.click();await page.mouse.move(1,1);assert.equal(await panel.getByRole('button',{name:'Pin details'}).getAttribute('aria-pressed'),'true');
 await panel.getByText('Connections',{exact:true}).click();await panel.locator('.connection-link').click();assert.ok((await panel.textContent()).includes('Places order'));
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
 await info.focus();await panel.waitFor({state:'visible'});await page.keyboard.press('Enter');assert.equal(await panel.getByRole('button',{name:'Pin details'}).getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>{window.copied='';navigator.clipboard.writeText=async text=>{window.copied=text;};});await panel.getByRole('button',{name:'Copy entity link'}).click();assert.match(await page.evaluate(()=>window.copied),/#entity=a$/);
 await panel.getByRole('button',{name:'Edit these details'}).click();await ready();await panel.getByRole('button',{name:'Edit Name',exact:true}).click();await page.getByRole('textbox',{name:'Name',exact:true}).fill('Changed');await page.keyboard.press('Escape');assert.equal((await page.evaluate(()=>FinalDiagrams.getProject())).entities[0].name,'Node a');
 await panel.getByRole('button',{name:'Edit Name',exact:true}).click();await page.getByRole('textbox',{name:'Name',exact:true}).fill('Changed');await page.keyboard.press('Enter');await ready();await page.keyboard.press('Escape');await page.keyboard.press('Control+z');await ready();assert.equal((await page.evaluate(()=>FinalDiagrams.getProject())).entities[0].name,'Node a');await page.keyboard.press('Control+Shift+z');await ready();
 await page.getByRole('button',{name:'Done editing Editable connections',exact:true}).click();await ready();
 await root('table').getByRole('button',{name:'Information about Order',exact:true}).click();await panel.getByText('Fields',{exact:true}).click();await panel.locator('.member-link').click();assert.ok((await panel.textContent()).includes('Order identity'));await panel.getByRole('button',{name:'← Order',exact:true}).click();assert.ok(await panel.getByText('Fields',{exact:true}).isVisible());await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Walk through the request →'}).click();await panel.getByRole('button',{name:'Next →'}).click();assert.ok((await panel.textContent()).includes('Response'));await panel.getByRole('button',{name:'← Previous'}).click();assert.ok((await panel.textContent()).includes('Request'));await page.keyboard.press('Escape');
 await page.setViewportSize({width:500,height:850});await page.getByRole('button',{name:'Expand Editable connections',exact:true}).click();await root('first').getByRole('button',{name:'Information about Changed',exact:true}).click();const b=await panel.boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=500&&b.y+b.height<=850);await page.screenshot({path:resolve(cache,'fullscreen-mobile.png')});await page.keyboard.press('Escape');await page.getByRole('button',{name:'Expand Editable connections',exact:true}).click();
 const download=page.waitForEvent('download');await page.keyboard.press('Control+s');await (await download).saveAs(resolve(cache,'saved.html'));const model=await page.evaluate(()=>FinalDiagrams.getProject());assert.deepEqual(extractProject(await readFile(resolve(cache,'saved.html'),'utf8')),model);await page.goto(pathToFileURL(resolve(cache,'saved.html')).href);await ready();assert.equal(await panel.isVisible(),false);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 console.log('PASS: hover, pin, keyboard, full details, source/copy links, relation/member/sequence navigation, edit cancel/undo/redo, mobile fullscreen and offline save/reopen.');
}catch(error){await page.screenshot({path:resolve(cache,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
