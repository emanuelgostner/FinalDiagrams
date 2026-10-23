import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { extractProject, exportProject } from '../src/export.mjs';

// Coverage fixtures are generated into the test cache, separate from the single public demo.
await mkdir('.cache/test-browser', { recursive: true });
for (const name of ['backend-onboarding', 'dense-system']) {
  const fixture = JSON.parse(await readFile(`examples/${name}.json`, 'utf8'));
  await writeFile(`.cache/test-browser/${name}.html`, await exportProject(fixture));
}

let executablePath=process.env.FINALDIAGRAMS_BROWSER;
if(!executablePath){for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
await mkdir('.cache/test-browser/screenshots',{recursive:true});
await mkdir('.cache/test-browser',{recursive:true});
const page=await context.newPage();
const errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?dialog.defaultValue():undefined));
try{
  await page.goto(pathToFileURL(resolve('.cache/test-browser/backend-onboarding.html')).href);
  await page.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===3);
  // The desktop outline stays visible until deliberately hidden.
  const navigation=page.getByRole('button',{name:'Document navigation',exact:true});
  const drawer=page.locator('#document-navigation'),backdrop=page.locator('#navigation-backdrop');
  const search=page.getByRole('combobox',{name:'Search document'});
  const shortcut=await page.evaluate(()=>/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ K':'Ctrl K');
  const modifier=shortcut==='⌘ K'?'Meta':'Control';
  assert.equal(await navigation.getAttribute('aria-controls'),'document-navigation');
  assert.equal(await navigation.getAttribute('aria-expanded'),'true');
  assert.equal(await drawer.isVisible(),true,'The desktop outline starts visible.');
  assert.equal(await backdrop.isVisible(),false,'The desktop outline does not cover the document.');
  const documentModel=await page.evaluate(()=>window.FinalDiagrams.getProject());
  assert.equal(await drawer.locator('.outline-title strong').textContent(),documentModel.title);
  assert.equal(await drawer.locator('.outline-subtitle').textContent(),documentModel.subtitle);
  assert.ok(await drawer.getByRole('link',{name:'A small fictional command boundary',exact:true}).evaluate(link=>parseFloat(getComputedStyle(link).paddingLeft))>
    await drawer.getByRole('link',{name:'Read the model by responsibility',exact:true}).evaluate(link=>parseFloat(getComputedStyle(link).paddingLeft)),'Subheadings are visibly nested.');
  assert.equal(await page.locator('kbd.search-shortcut').textContent(),shortcut);
  assert.equal(await page.locator('kbd.search-shortcut').isVisible(),true);
  const openFrame=await page.locator('main.document').boundingBox();
  await page.getByRole('button',{name:'Hide outline',exact:true}).click();
  assert.equal(await drawer.isVisible(),false);
  const closedFrame=await page.locator('main.document').boundingBox();
  assert.ok(closedFrame.width>=openFrame.width+190,'Hiding the outline releases its narrow column.');
  await page.reload();
  await page.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===3);
  assert.equal(await drawer.isVisible(),false,'The hidden preference survives reopening this document.');
  await navigation.focus();await navigation.press('Enter');
  assert.equal(await drawer.isVisible(),true);
  assert.equal(await drawer.locator('a').first().evaluate(link=>link===document.activeElement),true);
  await page.keyboard.press('Escape');
  assert.equal(await drawer.isVisible(),false,'Escape in the outline hides it.');
  assert.equal(await navigation.evaluate(button=>button===document.activeElement),true);
  await navigation.click();await search.focus();
  assert.equal(await drawer.isVisible(),true,'Moving focus to the document leaves the outline visible.');
  const destination=drawer.locator('a').last(),targetID=(await destination.getAttribute('href')).slice(1);
  await destination.click();
  assert.equal(await drawer.isVisible(),true,'Following a section keeps the desktop outline visible.');
  assert.equal(await page.evaluate(()=>document.activeElement.id),targetID);
  await page.keyboard.press(modifier+'+k');
  assert.equal(await drawer.isVisible(),true);
  assert.equal(await search.evaluate(input=>input===document.activeElement),true);

  // Keyboard selection stays in the search box and follows visible results.
  await search.fill('order');
  const options=page.locator('#search-options').getByRole('option');
  const hitCount=await options.count();assert.ok(hitCount>2);
  await search.press('ArrowDown');assert.equal(await search.getAttribute('aria-activedescendant'),'search-hit-0');
  await search.press('ArrowDown');assert.equal(await options.nth(1).getAttribute('aria-selected'),'true');
  await search.press('ArrowUp');assert.equal(await search.getAttribute('aria-activedescendant'),'search-hit-0');
  assert.equal(await search.evaluate(input=>input===document.activeElement),true);
  await search.press('Escape');assert.equal(await search.getAttribute('aria-expanded'),'false');
  assert.equal(await drawer.isVisible(),true,'Search Escape does not hide the outline.');
  await search.press('ArrowUp');assert.equal(await search.getAttribute('aria-activedescendant'),'search-hit-'+(hitCount-1));
  const lastHit=await options.last().boundingBox(),resultBox=await page.locator('#search-results').boundingBox();
  assert.ok(lastHit.y>=resultBox.y-1&&lastHit.y+lastHit.height<=resultBox.y+resultBox.height+1,'Keyboard selection scrolls its result into view.');
  await search.fill('Inventory service');
  assert.equal(await search.getAttribute('aria-activedescendant'),null,'Typing resets selection.');
  await search.press('ArrowDown');await search.press('Enter');
  assert.equal(await search.getAttribute('aria-expanded'),'false');
  assert.match(await page.locator('#inspector').innerText(),/Inventory service/);
  await page.getByRole('button',{name:'Close details',exact:true}).click();
  await search.fill('zz-no-such-concept-zz');await search.press('ArrowDown');await search.press('Enter');
  assert.equal(await options.count(),0);assert.equal(await search.getAttribute('aria-activedescendant'),null);
  await search.press('Escape');await search.fill('order');await search.press('Tab');
  assert.equal(await search.getAttribute('aria-expanded'),'false','Tab closes results without trapping focus.');
  await search.fill('');
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  const system=page.locator('.diagram-card').first();
  await system.getByRole('button',{name:/^Read /}).click();
  const readingScale=await system.locator('svg > g').first().getAttribute('transform');
  assert.ok(Number(readingScale.match(/scale\(([^)]+)/)[1])>=.75,'Read restores a readable scale after search navigation');
  await system.getByRole('button',{name:/^Overview /}).click();
  assert.notEqual(await system.locator('svg > g').first().getAttribute('transform'),readingScale,'overview remains available');
  await system.getByRole('button',{name:/^Read /}).click();

  // Overview must restore disconnected classes and relations after automatic Read focus.
  // Zoom and resize should retain focus until the user explicitly requests Overview.
  const overviewRegression=await context.newPage();
  overviewRegression.on('pageerror',e=>errors.push(e.message));
  overviewRegression.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
  await overviewRegression.goto(pathToFileURL(resolve('.cache/test-browser/backend-onboarding.html')).href);
  await overviewRegression.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===3);
  await overviewRegression.evaluate(()=>window.FinalDiagrams.setProject({
    schemaVersion:1,id:'overview-regression',title:'Disconnected class overview',revision:0,
    entities:['a','b','c','d'].map(id=>({id,kind:'class',name:'Class '+id.toUpperCase(),fields:[{id:'field-'+id,name:'value',type:'String',purpose:'A documented member for opacity checks.'}]})),
    relations:[{id:'pair-ab',source:'a',target:'b',kind:'association',label:'First pair'},{id:'pair-cd',source:'c',target:'d',kind:'association',label:'Disconnected pair'}],
    diagrams:[{id:'disconnected-classes',type:'class',title:'Disconnected pairs',direction:'RIGHT',entityIds:['a','b','c','d'],relationIds:['pair-ab','pair-cd']}],
    blocks:[{id:'overview-regression-block',type:'diagram',diagramId:'disconnected-classes'}]
  }));
  await overviewRegression.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===1);
  const regressionCard=overviewRegression.locator('.diagram-card');
  await overviewRegression.waitForFunction(()=>getComputedStyle(document.querySelector('[data-entity-id="c"]')).opacity==='0.16');
  assert.equal(await regressionCard.locator('[data-entity-id="c"]').evaluate(el=>getComputedStyle(el).opacity),'0.16','Read focuses the first pair and dims the disconnected class');
  assert.equal(await regressionCard.locator('[data-relation-id="pair-cd"]').evaluate(el=>getComputedStyle(el).opacity),'0.16','Read dims the disconnected relation');
  await regressionCard.getByRole('button',{name:'Zoom in Disconnected pairs',exact:true}).click();
  assert.equal(await regressionCard.locator('[data-entity-id="c"]').evaluate(el=>getComputedStyle(el).opacity),'0.16','Zoom preserves endpoint focus');
  await overviewRegression.setViewportSize({width:1180,height:900});
  await overviewRegression.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await regressionCard.locator('[data-entity-id="c"]').evaluate(el=>getComputedStyle(el).opacity),'0.16','Resize preserves Read focus');
  await regressionCard.getByRole('button',{name:'Overview Disconnected pairs',exact:true}).click();
  assert.equal(await regressionCard.locator('.fd-dim').count(),0,'Overview clears all diagram dimming');
  await overviewRegression.waitForFunction(()=>[...document.querySelectorAll('.fd-diagram [data-entity-id], .fd-diagram [data-member-id], .fd-diagram [data-relation-id]')].every(el=>getComputedStyle(el).opacity==='1'));
  assert.equal(await regressionCard.locator('[data-entity-id], [data-member-id], [data-relation-id]').evaluateAll(elements=>elements.every(el=>getComputedStyle(el).opacity==='1')),true,'Every overview card, member and relation has normal opacity');
  assert.equal(await regressionCard.locator('.diagram-canvas svg').evaluate(canvas=>{
    const frame=canvas.getBoundingClientRect();
    return [...canvas.querySelectorAll('[data-entity-id]')].every(el=>{const box=el.getBoundingClientRect();return box.left>=frame.left-1&&box.right<=frame.right+1&&box.top>=frame.top-1&&box.bottom<=frame.bottom+1;});
  }),true,'Overview fits every disconnected class into the canvas');
  await regressionCard.getByRole('button',{name:'Read Disconnected pairs',exact:true}).click();
  await overviewRegression.waitForFunction(()=>getComputedStyle(document.querySelector('[data-entity-id="c"]')).opacity==='0.16');
  assert.equal(await regressionCard.locator('[data-entity-id="c"]').evaluate(el=>getComputedStyle(el).opacity),'0.16','Read can focus the local pair again');
  await regressionCard.getByRole('button',{name:'Overview Disconnected pairs',exact:true}).click();
  assert.equal(await regressionCard.locator('.fd-dim').count(),0,'Overview remains reversible after another Read');
  await overviewRegression.close();

  await page.screenshot({path:'.cache/test-browser/screenshots/document.png',fullPage:false});
  for(const [index,name] of ['system','sequence','class'].entries())await page.locator('.diagram-card').nth(index).screenshot({path:`.cache/test-browser/screenshots/${name}.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'desktop body must not overflow');
  await page.getByRole('combobox',{name:'Search document'}).fill('idempotency');
  await page.locator('.search-hit').first().waitFor();
  assert.ok(await page.locator('.search-hit').count()>0,'cross-document search returns results');
  await page.keyboard.press('Escape');

  await page.getByRole('button',{name:'Edit document',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===3);
  const prose=page.locator('[data-prose-id]').first();
  const proseID=await prose.getAttribute('data-prose-id');
  await prose.fill('A visual edit that must survive export and reopening.');
  await prose.blur();
  assert.match(JSON.stringify((await page.evaluate(()=>window.FinalDiagrams.getProject())).blocks.find(b=>b.id===proseID)),/visual edit/);

  const member=page.locator('[data-member-id]').first();
  await member.scrollIntoViewIfNeeded();await member.click();
  await page.getByRole('textbox',{name:'Purpose',exact:true}).fill('Updated purpose from the visual inspector.');
  await page.getByRole('textbox',{name:'Purpose',exact:true}).blur();
  await page.waitForFunction(()=>JSON.stringify(window.FinalDiagrams.getProject()).includes('Updated purpose from the visual inspector.'));

  await page.getByRole('button',{name:'Close details',exact:true}).click();
  await page.getByRole('button',{name:/Configure .*domain|Configure .*types|Configure .*model/i}).first().click();
  const colButton=page.getByRole('button',{name:'Add explanatory column',exact:false});
  await colButton.click();
  const withColumn=await page.evaluate(()=>window.FinalDiagrams.getProject());
  assert.ok(withColumn.diagrams.find(d=>d.type==='class').columns.some(c=>c.label==='Example'));

  // External/AI data changes must update both visible content and diagrams.
  await page.evaluate(()=>{const next=window.FinalDiagrams.getProject();next.entities.find(e=>e.kind==='class').name='RenamedByAI';window.FinalDiagrams.setProject(next);});
  await page.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===3);
  if(await page.getByRole('button',{name:'Close details',exact:true}).isVisible())await page.getByRole('button',{name:'Close details',exact:true}).click();
  assert.ok(await page.getByText('RenamedByAI',{exact:true}).count()>0);

  // A local image becomes part of the same editable file.
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  await page.getByRole('button',{name:'+ Add content',exact:true}).click();
  const chooserPromise=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'+ image',exact:true}).click();
  await (await chooserPromise).setFiles({name:'local-note.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.waitForFunction(()=>window.FinalDiagrams.getProject().blocks.some(b=>b.type==='image'));
  await page.getByRole('button',{name:'Edit caption and alt text',exact:true}).click();
  await page.getByRole('textbox',{name:'alt',exact:true}).fill('Embedded visual note');
  await page.getByRole('textbox',{name:'caption',exact:true}).fill('An image stored inside this HTML.');
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===3);
  assert.equal(await page.getByRole('img',{name:'Embedded visual note'}).evaluate(n=>n.complete&&n.naturalWidth===1),true);

  // Markdown tables remain tables after a visual prose edit and model round trip.
  await page.evaluate(()=>{const p=window.FinalDiagrams.getProject();p.blocks.push({id:'roundtrip-table',type:'prose',markdown:'| Name | Purpose |\n| --- | --- |\n| Order | Preserve intent |'});window.FinalDiagrams.setProject(p);});
  const table=page.locator('[data-prose-id="roundtrip-table"]');
  await table.locator('td').last().fill('Preserved after visual editing');
  await table.blur();
  await page.getByRole('button',{name:'Done editing',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===3);
  assert.equal(await page.locator('[data-prose-id="roundtrip-table"] td').last().textContent(),'Preserved after visual editing');
  assert.equal(await page.locator('[data-prose-id="roundtrip-table"] th').count(),2);

  // Guided navigation centers the current message and opens its explanation.
  await page.getByRole('button',{name:'Walk through the request →',exact:true}).click();
  await page.getByRole('button',{name:'Next →',exact:true}).click();
  const expectedMessage=await page.evaluate(()=>window.FinalDiagrams.getProject().diagrams.find(d=>d.type==='sequence').messages[1].id);
  assert.equal(await page.locator('.diagram-canvas svg[data-selected-message-id]').getAttribute('data-selected-message-id'),expectedMessage);
  await page.getByRole('button',{name:'Close details',exact:true}).click();

  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Save HTML ↓',exact:true}).click();
  const saved=await downloadPromise;const savedPath=resolve('.cache/test-browser/edited.html');await saved.saveAs(savedPath);
  const extracted=extractProject(await readFile(savedPath,'utf8'));
  assert.match(JSON.stringify(extracted),/visual edit/);assert.match(JSON.stringify(extracted),/Updated purpose from the visual inspector/);assert.match(JSON.stringify(extracted),/RenamedByAI/);
  assert.equal(extracted.schemaVersion,1);
  assert.equal(extracted.blocks.find(b=>b.type==='image').alt,'Embedded visual note');
  const reopened=await context.newPage();reopened.on('pageerror',e=>errors.push(e.message));reopened.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await reopened.goto(pathToFileURL(savedPath).href);
  await reopened.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===3);
  assert.equal((await reopened.evaluate(()=>window.FinalDiagrams.getProject())).entities.find(e=>e.kind==='class').name,'RenamedByAI');
  assert.equal(await reopened.getByRole('img',{name:'Embedded visual note'}).getAttribute('src'),'data:image/png;base64,'+png);
  await reopened.getByRole('button',{name:'Toggle theme'}).click();
  await reopened.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===3);
  await reopened.screenshot({path:'.cache/test-browser/screenshots/dark.png',fullPage:false});
  await reopened.setViewportSize({width:390,height:844});
  assert.equal(await reopened.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile body must not overflow');
  assert.equal(await reopened.locator('kbd.search-shortcut').isVisible(),false,'Narrow search hides only the shortcut hint.');
  const mobileNavigation=reopened.getByRole('button',{name:'Document navigation',exact:true});
  const mobileDocument=await reopened.locator('main.document').boundingBox();
  await mobileNavigation.click();
  const mobileDrawer=reopened.locator('#document-navigation');await mobileDrawer.waitFor({state:'visible'});
  const mobileDrawerBox=await mobileDrawer.boundingBox();
  assert.ok(mobileDrawerBox.x>=0&&mobileDrawerBox.x+mobileDrawerBox.width<=390,'The contents drawer fits a narrow viewport.');
  assert.ok(mobileDrawerBox.height<=844-48,'The drawer remains scrollable within the mobile viewport.');
  assert.equal((await reopened.locator('main.document').boundingBox()).width,mobileDocument.width,'Mobile navigation overlays rather than resizes content.');
  await mobileDrawer.locator('a').first().click();await mobileDrawer.waitFor({state:'hidden'});
  await reopened.keyboard.press(modifier+'+k');
  assert.equal(await reopened.getByRole('combobox',{name:'Search document'}).evaluate(input=>input===document.activeElement),true,'The hidden mobile hint does not disable the search shortcut.');
  await reopened.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await reopened.screenshot({path:'.cache/test-browser/screenshots/mobile.png',fullPage:false});

  await page.goto(pathToFileURL(resolve('.cache/test-browser/dense-system.html')).href);
  await page.waitForFunction(()=>document.querySelectorAll('.diagram-canvas[data-ready="true"]').length===3);
  assert.equal((await page.evaluate(()=>window.FinalDiagrams.getProject())).entities.length,40);
  await page.screenshot({path:'.cache/test-browser/screenshots/dense.png',fullPage:false});
  assert.deepEqual(errors,[],'No browser runtime errors');assert.deepEqual(network,[],'Portable HTML makes no HTTP requests');
  console.log('PASS: 3 diagram types, search, visual prose/member edits, custom column, embedded image, Markdown table roundtrip, guided sequence, AI data update, HTML save/reopen, dark/mobile/dense, zero network requests or browser errors.');
}catch(error){await page.screenshot({path:'.cache/test-browser/screenshots/test-failure.png',fullPage:false}).catch(()=>{});throw error;}finally{await browser.close();}
