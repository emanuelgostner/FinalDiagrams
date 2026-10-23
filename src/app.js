import { validateProject } from './model.mjs';
import { renderDiagram } from './diagrams.js';
import { escapeHTML, safeURL, proseHTML, proseText, richFromElement, formatSelection } from './richtext.js';

const originalHTML = '<!DOCTYPE html>\n' + document.documentElement.outerHTML.replace(/<script\b[^>]*id=["']fd-connected["'][^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/(<div\b[^>]*id=["']fd-notices["'][^>]*>)[\s\S]*?(<\/div\s*>)/i,(_all,open,close)=>open+escapeHTML(document.getElementById('fd-notices').textContent).replace(/\r/g,'&#13;')+close);
const clone = value => JSON.parse(JSON.stringify(value));
let project = JSON.parse(document.getElementById('fd-project').textContent);
let checkpoint = clone(project), undoStack=[], redoStack=[], editing=false, dirty=false;
let selection=null, selectedDiagram=null, renderEpoch=0, diagramControllers=new Map(), pendingEditors=new Map();
let serverRevision=null, saving=false, syncTimer, conflict=false, eventStream, announcedRevision=-1, loadSequence=0;
let lastQuery='', theme='light', navigationOpen=false, outlineVisible=true, mobileNavigationOpen=false, outlineProjectId=null, activeSearchIndex=-1;
const mobileNavigation=matchMedia('(max-width:800px)');
try { theme=localStorage.getItem('finaldiagrams-theme') || 'light'; } catch {}
const app=document.getElementById('app');
const connected=window.__FD_CONNECTED__===true && /^https?:$/.test(location.protocol);

function element(tag, attrs={}, ...children) {
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)) {
    if(value==null)continue;
    if(['hidden','disabled','readonly','checked','selected','multiple'].includes(key)){if(value)node.setAttribute(key,'');continue;}
    if(key==='class')node.className=value;
    else if(key==='text')node.textContent=value;
    else if(key.startsWith('on'))node.addEventListener(key.slice(2).toLowerCase(),value);
    else if(key==='value')node.value=value;
    else node.setAttribute(key,String(value));
  }
  for(const child of children.flat())if(child!=null)node.append(child.nodeType?child:document.createTextNode(String(child)));
  return node;
}
const button=(text,action,cls='',title=text)=>element('button',{type:'button',class:cls,title,'aria-label':title,onclick:action},text);
const byId=(list,id)=>list.find(item=>item.id===id);
const uid=prefix=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
const stateKinds=['state','choice','initial','final'];
const tones=['neutral','info','success','warning','error'];
const icons={search:['m21 21-4.5-4.5','M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0'],sun:['M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4','M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],moon:['M20.5 14A8.7 8.7 0 0 1 10 3.5 8.8 8.8 0 1 0 20.5 14Z'],edit:['m15 5 4 4M4 20l4.5-1 12-12a2.8 2.8 0 0 0-4-4l-12 12L4 20Z'],check:['m5 12 4 4L19 6'],save:['M12 3v12m-5-5 5 5 5-5','M4 16v4h16v-4'],info:['M12 11v6m0-10v.1','M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],expand:['M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5'],settings:['M4 7h16M4 17h16','M9 4v6m6 4v6'],layout:['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z']};
function icon(name){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);
  for(const shape of icons[name]||icons.info){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',shape);svg.append(path);}return svg;
}
function iconButton(name,action,symbol,{active=false}={}){const control=button('',action,'icon-button'+(active?' active':''),name);control.append(icon(symbol));return control;}
icons.menu=['M4 6h16M4 12h16M4 18h16'];
icons.close=['m6 6 12 12M6 18 18 6'];
function setNavigationOpen(open,{restoreFocus=true}={}){
  if(mobileNavigation.matches)mobileNavigationOpen=!!open;
  else{outlineVisible=!!open;try{localStorage.setItem('finaldiagrams-outline:'+project.id,String(outlineVisible));}catch{}}
  syncNavigation();
  const drawer=document.getElementById('document-navigation'),toggle=document.getElementById('navigation-toggle');
  if(navigationOpen){closeSearch();drawer?.querySelector('a')?.focus();}
  else if(restoreFocus)toggle?.focus();
}
function syncNavigation(){
  const drawer=document.getElementById('document-navigation'),toggle=document.getElementById('navigation-toggle');
  navigationOpen=mobileNavigation.matches?mobileNavigationOpen:outlineVisible;
  if(!drawer||!toggle)return;
  drawer.hidden=!navigationOpen;
  document.querySelector('.workspace').classList.toggle('outline-visible',navigationOpen&&!mobileNavigation.matches);
  document.getElementById('navigation-backdrop').hidden=!navigationOpen||!mobileNavigation.matches;
  toggle.setAttribute('aria-expanded',String(navigationOpen));
  toggle.classList.toggle('active',navigationOpen);
}
mobileNavigation.addEventListener('change',()=>{mobileNavigationOpen=false;syncNavigation();if(document.activeElement?.closest('#document-navigation')&&!navigationOpen)document.getElementById('navigation-toggle')?.focus();});
function titleBlock(){const first=project.blocks.find(block=>block.type==='heading');return first?.text.trim()===project.title.trim()?first:null;}
function editDocumentTitle(){
  const matching=titleBlock()?.id,draft={title:project.title,subtitle:project.subtitle||''};
  modal('Document title',element('div',{},field('Title',draft.title,v=>draft.title=v),field('Subtitle',draft.subtitle,v=>draft.subtitle=v,{multiline:true}),button('Apply',()=>{commit(p=>{Object.assign(p,draft);if(matching)byId(p.blocks,matching).text=draft.title;});closeModal();},'button primary')));
}
function toast(message,error=false) {
  let area=document.getElementById('toast');
  if(!area){area=element('div',{id:'toast',role:'status','aria-live':'polite'});document.body.append(area);}
  area.className=error?'toast error':'toast';area.textContent=message;area.hidden=false;
  clearTimeout(area.timer);area.timer=setTimeout(()=>area.hidden=true,4500);
}
function check(value) {
  const result=validateProject(value);
  if(!result.valid)throw new Error(result.errors.slice(0,5).map(e=>`${e.path}: ${e.message}`).join('\n'));
}
function status() {
  const node=document.getElementById('save-status');if(!node)return;
  node.textContent=conflict?'Changes on disk':saving?'Saving…':dirty?(connected?'Saving…':'Unsaved changes'):'';
  node.hidden=!conflict&&!saving&&!dirty;
  node.className=conflict?'status conflict':dirty?'status dirty':'status';
  document.getElementById('undo')?.toggleAttribute('disabled',!undoStack.length);
  document.getElementById('redo')?.toggleAttribute('disabled',!redoStack.length);
}
function commit(mutator,{render=true}={}) {
  const before=clone(checkpoint);
  try {
    if(mutator)mutator(project);
    check(project);
    if(JSON.stringify(project)===JSON.stringify(checkpoint))return false;
    undoStack.push(before);if(undoStack.length>60)undoStack.shift();redoStack=[];
    project.revision=(checkpoint.revision||0)+1;checkpoint=clone(project);dirty=true;
    if(render)renderApp();else status();
    scheduleSync();return true;
  } catch(error) {project=before;checkpoint=clone(before);toast(error.message,true);if(render)renderApp();return false;}
}
function flushEditors(){for(const save of [...pendingEditors.values()])save();pendingEditors.clear();}
function undo(){flushEditors();if(!undoStack.length)return;redoStack.push(clone(project));project=undoStack.pop();project.revision=(checkpoint.revision||0)+1;checkpoint=clone(project);dirty=true;renderApp();scheduleSync();}
function redo(){flushEditors();if(!redoStack.length)return;undoStack.push(clone(project));project=redoStack.pop();project.revision=(checkpoint.revision||0)+1;checkpoint=clone(project);dirty=true;renderApp();scheduleSync();}
function download(name,text,type='text/plain'){
  const url=URL.createObjectURL(new Blob([text],{type}));const link=element('a',{href:url,download:name});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function exportHTML(){
  flushEditors();
  const json=JSON.stringify(project).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return originalHTML.replace(/(<script\b[^>]*id=["']fd-project["'][^>]*>)[\s\S]*?(<\/script\s*>)/i,(_all,open,close)=>open+json+close).replace(/<title>[\s\S]*?<\/title>/i,()=>`<title>${escapeHTML(project.title)}</title>`);
}
function saveHTML(){download(`${project.id}.html`,exportHTML(),'text/html');if(!connected)dirty=false;status();toast('Saved a complete editable HTML copy.');}
function setProject(value){flushEditors();check(value);undoStack.push(clone(project));project=clone(value);project.revision=(checkpoint.revision||0)+1;checkpoint=clone(project);redoStack=[];dirty=true;selection=null;renderApp();scheduleSync();}
function safeSourceLink(source){if(!source)return null;const href=safeURL(source.url);return href?element('a',{href,target:'_blank',rel:'noopener noreferrer',class:'source-link'},`${source.path}${source.line?':'+source.line:''} ↗`):element('code',{class:'source-path'},`${source.path}${source.line?':'+source.line:''}`);}

function renderApp(){
  const epoch=++renderEpoch;
  const savedViews=new Map([...diagramControllers].map(([id,controller])=>[id,{view:controller.getView?.(),expanded:document.getElementById('block-'+id)?.querySelector('.diagram-card')?.classList.contains('expanded')}]));
  if(outlineProjectId!==project.id){outlineProjectId=project.id;outlineVisible=true;mobileNavigationOpen=false;try{outlineVisible=localStorage.getItem('finaldiagrams-outline:'+project.id)!=='false';}catch{}}
  navigationOpen=mobileNavigation.matches?mobileNavigationOpen:outlineVisible;
  activeSearchIndex=-1;
  for(const controller of diagramControllers.values())controller.destroy();diagramControllers.clear();
  document.documentElement.dataset.theme=theme;document.documentElement.lang='en';
  document.title=project.title;
  app.replaceChildren();
  const searchIcon=element('span',{class:'search-icon'});searchIcon.append(icon('search'));
  const shortcut=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ K':'Ctrl K';
  const header=element('header',{class:'topbar'},
    element('div',{class:'search-wrap'},searchIcon,element('input',{id:'search',type:'search',role:'combobox',placeholder:'Search document','aria-label':'Search document','aria-keyshortcuts':'Control+k Meta+k','aria-autocomplete':'list','aria-haspopup':'listbox','aria-controls':'search-options','aria-expanded':'false',title:`Search document (${shortcut})`,autocomplete:'off',oninput:e=>search(e.target.value),onfocus:e=>{if(e.target.value.trim())search(e.target.value);},onkeydown:searchKeydown}),element('kbd',{class:'search-shortcut','aria-hidden':'true'},shortcut),element('div',{id:'search-results',class:'search-results',hidden:true},element('div',{id:'search-options',role:'listbox','aria-label':'Search results'}))),
    element('div',{class:'top-actions'},element('span',{id:'save-status',class:'status',role:'status','aria-live':'polite',hidden:true}),iconButton('Toggle theme',()=>{flushEditors();theme=theme==='light'?'dark':'light';try{localStorage.setItem('finaldiagrams-theme',theme);}catch{}renderApp();},theme==='light'?'moon':'sun'),iconButton(editing?'Done editing':'Edit document',()=>{flushEditors();editing=!editing;renderApp();},editing?'check':'edit',{active:editing}),iconButton('Save HTML ↓',saveHTML,'save'),iconButton('About this document',showAbout,'info')));
  const matchingTitle=titleBlock(),destinations=[{id:'top',label:project.title,level:0,root:true}];
  const headingLevels=[];
  for(const block of project.blocks){
    if(block.type==='heading'&&block.id!==matchingTitle?.id){while(headingLevels.length&&headingLevels.at(-1)>=block.level)headingLevels.pop();headingLevels.push(block.level);destinations.push({id:'block-'+block.id,label:block.text,level:headingLevels.length});}
    else if(block.type==='diagram'){const diagram=byId(project.diagrams,block.diagramId);if(diagram&&destinations.at(-1)?.label.trim()!==diagram.title.trim())destinations.push({id:'block-'+block.id,label:diagram.title,level:headingLevels.length+1,diagram:true});}
  }
  const sidebar=element('aside',{id:'document-navigation',class:'sidebar',hidden:!navigationOpen,'aria-label':'Document outline'},
    element('div',{class:'navigation-heading'},element('strong',{},'Outline'),iconButton('Hide outline',()=>setNavigationOpen(false),'close')),
    element('nav',{'aria-label':'Document sections'},destinations.map(item=>element('a',{href:'#'+item.id,class:'nav-item'+(item.root?' outline-title':'')+(item.diagram?' diagram-nav':''),style:`--nav-depth:${item.level}`,title:item.label,onclick:()=>{if(mobileNavigation.matches)setNavigationOpen(false,{restoreFocus:false});const target=document.getElementById(item.id);target?.setAttribute('tabindex','-1');target?.focus({preventScroll:true});}},item.root?element('strong',{},item.label):item.label,item.root&&project.subtitle?element('span',{class:'outline-subtitle'},project.subtitle):null))));
  {
    const toggle=iconButton('Document navigation',()=>setNavigationOpen(!navigationOpen),'menu',{active:navigationOpen});
    toggle.id='navigation-toggle';toggle.setAttribute('aria-controls','document-navigation');toggle.setAttribute('aria-expanded',String(navigationOpen));header.prepend(toggle);
  }
  const main=element('main',{id:'top',class:'document'});
  if(!matchingTitle)main.append(element('header',{class:'document-header'},element('h1',{},project.title),project.subtitle?element('p',{class:'document-subtitle'},project.subtitle):null));
  if(editing){
    const undoButton=button('↶ Undo',undo,'button small');undoButton.id='undo';const redoButton=button('↷ Redo',redo,'button small');redoButton.id='redo';
    main.append(element('div',{class:'edit-bar'},undoButton,redoButton,button('+ Add content',addBlockMenu,'button small'),button('Edit document title',editDocumentTitle,'button small')));
  }
  if(conflict)main.append(element('div',{class:'sync-conflict',role:'alert'},element('strong',{},'The project changed on disk.'),element('p',{},'Your edits are still here. Save an HTML copy before loading the external version.'),button('Load version from disk',()=>loadServer(true),'button'),button('Save my copy',saveHTML,'button')));
  for(const block of project.blocks)main.append(renderBlock(block,epoch,savedViews.get(block.id)));
  const inspector=element('aside',{id:'inspector',class:'inspector',hidden:!selection,'aria-label':'Selected item details'});
  const layout=element('div',{class:'workspace'+(navigationOpen&&!mobileNavigation.matches?' outline-visible':'')+(selection?' inspector-open':'')},sidebar,main,inspector);
  app.append(header,layout);
  app.append(element('div',{id:'navigation-backdrop',class:'navigation-backdrop',hidden:!navigationOpen||!mobileNavigation.matches,onclick:()=>setNavigationOpen(false),'aria-hidden':'true'}));
  renderInspector();status();
  if(location.hash.startsWith('#entity='))requestAnimationFrame(()=>focusEntity(decodeURIComponent(location.hash.slice(8)),false));
}

function renderBlock(block,epoch,savedView){
  const wrap=element('section',{class:'doc-block block-'+block.type,id:'block-'+block.id,'data-block-id':block.id});
  if(editing)wrap.append(element('div',{class:'block-tools'},button('↑',()=>moveBlock(block.id,-1),'icon-button','Move block up'),button('↓',()=>moveBlock(block.id,1),'icon-button','Move block down'),button('×',()=>{if(confirm('Remove this content block?'))commit(p=>p.blocks=p.blocks.filter(b=>b.id!==block.id));},'icon-button','Remove block')));
  if(block.type==='heading'){
    const isTitle=titleBlock()?.id===block.id;
    if(isTitle)wrap.classList.add('document-title-block');
    const heading=element(isTitle?'h1':'h'+block.level,{},block.text);
    if(editing){heading.contentEditable='true';heading.setAttribute('aria-label','Section heading');heading.addEventListener('blur',()=>commit(p=>{byId(p.blocks,block.id).text=heading.textContent;if(isTitle)p.title=heading.textContent;},{render:isTitle}));}
    wrap.append(heading);
    if(isTitle&&project.subtitle)wrap.append(element('p',{class:'document-subtitle'},project.subtitle));
  } else if(block.type==='prose'){
    const content=element('div',{class:'prose'+(editing?' editable':''),'data-prose-id':block.id});content.innerHTML=proseHTML(block);
    if(editing){
      content.contentEditable='true';content.setAttribute('role','textbox');content.setAttribute('aria-multiline','true');content.setAttribute('aria-label','Edit paragraph');
      const toolbar=element('div',{class:'format-bar','aria-label':'Text formatting'});
      for(const [label,tag] of [['B','strong'],['I','em'],['Code','code']]){const b=button(label,()=>formatSelection(tag,content),'format-button','Format selection '+label);b.addEventListener('mousedown',e=>e.preventDefault());toolbar.append(b);}
      toolbar.append(element('small',{},'Select text to format · links and lists are preserved'));wrap.append(toolbar);
      let timer;
      const save=()=>{clearTimeout(timer);pendingEditors.delete(block.id);const next=richFromElement(content);commit(p=>{const target=byId(p.blocks,block.id);target.content=next;delete target.markdown;},{render:false});};
      content.addEventListener('input',()=>{clearTimeout(timer);pendingEditors.set(block.id,save);timer=setTimeout(save,450);});
      content.addEventListener('blur',save);
      content.addEventListener('paste',e=>{e.preventDefault();const text=e.clipboardData?.getData('text/plain')||'';const range=window.getSelection()?.getRangeAt(0);if(range&&content.contains(range.commonAncestorContainer)){range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);content.dispatchEvent(new Event('input'));}});
    }
    content.addEventListener('click',e=>{const link=e.target.closest('a');if(link?.getAttribute('href')?.startsWith('#entity=')){e.preventDefault();focusEntity(decodeURIComponent(link.getAttribute('href').slice(8)));}else if(link&&safeURL(link.getAttribute('href'))?.startsWith('http')){link.target='_blank';link.rel='noopener noreferrer';}});
    wrap.append(content);
  } else if(block.type==='callout'){
    const box=element('div',{class:'callout '+(block.tone||'info')},element('span',{class:'callout-symbol'},block.tone==='warning'?'!':'i'),element('div',{},element('strong',{},block.title),element('p',{},block.text)));
    if(editing)box.append(button('Edit',()=>editSimpleBlock(block),'button small'));wrap.append(box);
  } else if(block.type==='code'){
    const head=element('div',{class:'code-header'},element('span',{},block.language||'CODE'),button(editing?'Edit':'Copy',()=>editing?editSimpleBlock(block):copyText(block.text),'text-button'));
    wrap.append(element('div',{class:'code-block'},head,element('pre',{},element('code',{},block.text))));
  } else if(block.type==='image'){
    const figure=element('figure',{class:'document-image'},element('img',{src:block.src,alt:block.alt,loading:'lazy'}));
    if(block.caption)figure.append(element('figcaption',{},block.caption));
    if(editing)figure.append(element('div',{class:'image-actions'},button('Edit caption and alt text',()=>editSimpleBlock(block),'button small'),button('Replace image',()=>importImage(block.id),'button small')));
    wrap.append(figure);
  } else if(block.type==='diagram'){
    const diagram=byId(project.diagrams,block.diagramId);if(!diagram)return wrap;
    const card=element('div',{class:'diagram-card','data-diagram-card':diagram.id});
    if(savedView?.expanded)card.classList.add('expanded');
    const control=()=>diagramControllers.get(block.id);
    const tools=element('div',{class:'diagram-tools'},button('−',()=>control()?.zoom(0.8),'icon-button','Zoom out '+diagram.title),button('+',()=>control()?.zoom(1.25),'icon-button','Zoom in '+diagram.title),button('Overview',()=>control()?.fit(),'button small','Overview '+diagram.title));
    tools.append(button('Read',()=>control()?.read(),'button small','Read '+diagram.title));
    tools.append(iconButton('Export SVG '+diagram.title,()=>{const svg=control()?.exportSvg();if(svg)download(diagram.id+'.svg',svg,'image/svg+xml');},'save'),iconButton('Expand '+diagram.title,()=>{card.classList.toggle('expanded');setTimeout(()=>control()?.read(),30);},'expand'));
    if(editing)tools.append(iconButton('Auto layout '+diagram.title,()=>control()?.relayout(),'layout'),iconButton('Configure '+diagram.title,()=>{selectedDiagram=diagram.id;selection={kind:'diagram',id:diagram.id};renderInspectorOpen();},'settings'));
    if(diagram.type==='sequence'&&diagram.messages?.length)tools.append(button('Steps',()=>showMessage(diagram.id,diagram.messages[0].id),'button small','Walk through the request →'));
    const title=element('div',{class:'diagram-title'},element('h3',{},diagram.title));
    card.append(element('div',{class:'diagram-header'},title,tools));
    if(diagram.description)card.append(element('p',{class:'diagram-description'},diagram.description));
    if(diagram.type!=='sequence'){
      const noun=diagram.type==='state'?'state':diagram.type==='class'?(diagram.entityIds.every(id=>byId(project.entities,id)?.kind==='table')?'table':'class'):'component';
      const picker=element('select',{'aria-label':'Explore a '+noun+' in '+diagram.title},element('option',{value:''},'Explore a '+noun+'…'),diagram.entityIds.map(id=>element('option',{value:id},byId(project.entities,id)?.name||id)));
      picker.addEventListener('change',()=>{if(!picker.value)return;selectedDiagram=diagram.id;selection={kind:'entity',id:picker.value};renderInspectorOpen();control()?.focus(picker.value);});
      card.append(element('div',{class:'diagram-navigation'},picker));
    }
    const canvas=element('div',{class:'diagram-canvas','data-diagram-id':diagram.id,'aria-label':diagram.title});
    const stage=element('div',{class:'diagram-stage'});
    if(editing){
      const add=button('+ Node',()=>control()?.requestAddNode(),'button small','Add node to '+diagram.title);add.dataset.canvasAddEntity=diagram.id;
      stage.append(element('div',{class:'canvas-editbar'},add,button('Connect',()=>control()?.startConnection(),'button small','Draw connection in '+diagram.title),element('span',{class:'canvas-edit-hint'},'Drag circles to connect · double-click labels to edit')));
    }
    stage.append(canvas);card.append(stage);
    wrap.append(card);
    requestAnimationFrame(async()=>{if(epoch!==renderEpoch)return;try{
      const controller=await renderDiagram(canvas,diagram,project,{editable:editing,
        onSelect:item=>{if(editing&&item.kind!=='member'&&document.getElementById('inspector')?.hidden)return;flushEditors();selectedDiagram=diagram.id;selection=item;renderInspectorOpen();},
        onInspect:item=>{flushEditors();selectedDiagram=diagram.id;selection=item;renderInspectorOpen();},
        onChange:()=>commit(null,{render:false}),onError:error=>toast(error.message||String(error),true),
        onConnect:connectOnCanvas,onReconnect:reconnectOnCanvas,onReorder:reorderOnCanvas,onRename:renameOnCanvas,
        onAddNode:point=>showCanvasNodeEditor(stage,diagram.id,point)
      });
      if(epoch!==renderEpoch){controller.destroy();return;}diagramControllers.set(block.id,controller);
      if(savedView?.view)controller.setView(savedView.view);
      else{controller.read();const focusId=selection?.kind==='member'?selection.entityId:selection?.kind==='entity'?selection.id:null;if(focusId&&diagram.entityIds.includes(focusId))controller.focus(focusId);if(selection?.kind==='message'&&selectedDiagram===diagram.id)controller.focusMessage(selection.id);}
      canvas.dataset.ready='true';
    }catch(error){canvas.replaceChildren(element('div',{class:'diagram-error'},'Could not draw this view. '+error.message));console.error(error);}});
  }
  return wrap;
}
async function canvasEdit(diagramId,mutator){
  if(!editing)return false;
  flushEditors();
  const placements=new Map();
  for(const [blockId,controller] of diagramControllers){const id=byId(project.blocks,blockId)?.diagramId;if(id&&byId(project.diagrams,id)?.type!=='sequence')placements.set(id,controller.getPositions?.()||{});}
  const changed=commit(p=>{
    for(const [id,positions] of placements){const d=byId(p.diagrams,id);if(d)d.positions={...d.positions,...positions};}
    mutator(p,byId(p.diagrams,diagramId));
  },{render:false});
  const epoch=renderEpoch;
  await Promise.all([...diagramControllers].map(async([blockId,controller])=>{
    const d=byId(project.diagrams,byId(project.blocks,blockId)?.diagramId),container=document.getElementById('block-'+blockId)?.querySelector('.diagram-canvas');
    if(!d||!container)return;
    container.dataset.ready='false';
    try{await controller.refresh(d,project);if(epoch===renderEpoch)container.dataset.ready='true';}
    catch(error){if(epoch===renderEpoch)toast(error.message||String(error),true);}
  }));
  if(epoch===renderEpoch){
    for(const block of project.blocks.filter(b=>b.type==='diagram')){
      const d=byId(project.diagrams,block.diagramId),picker=document.getElementById('block-'+block.id)?.querySelector('.diagram-navigation select');
      if(d&&picker){const value=picker.value;const label=picker.options[0]?.textContent||'Explore…';picker.replaceChildren(element('option',{value:''},label),...d.entityIds.map(id=>element('option',{value:id},byId(project.entities,id)?.name||id)));if(d.entityIds.includes(value))picker.value=value;}
    }
    renderInspector();status();
  }
  return changed;
}
function checkCanvasEndpoints(p,d,source,target){
  if(!d||!d.entityIds.includes(source)||!d.entityIds.includes(target))throw new Error('Choose a node in this diagram.');
  if(d.type==='state'&&(byId(p.entities,source)?.kind==='final'||byId(p.entities,target)?.kind==='initial'))throw new Error('Final states cannot send transitions; initial states cannot receive them.');
}
function connectOnCanvas({diagramId,source,target}){
  return canvasEdit(diagramId,(p,d)=>{
    checkCanvasEndpoints(p,d,source,target);
    if(d.type==='sequence'){d.messages??=[];d.messages.push({id:uid('message'),from:source,to:target,label:'New message',kind:'sync',description:''});}
    else{const relation={id:uid('relation'),source,target,label:d.type==='state'?'event':'connects to',kind:d.type==='state'?'transition':d.type==='class'?'association':'calls'};p.relations.push(relation);if(d.relationIds)d.relationIds.push(relation.id);}
  });
}
function reconnectOnCanvas({diagramId,kind,id,endpoint,entityId}){
  if(!['source','target'].includes(endpoint))return;
  const d=byId(project.diagrams,diagramId),item=kind==='message'?byId(d?.messages||[],id):byId(project.relations,id),key=kind==='message'?(endpoint==='source'?'from':'to'):endpoint;
  if(!item||item[key]===entityId)return;
  return canvasEdit(diagramId,(p,diagram)=>{
    const connection=kind==='message'?byId(diagram.messages,id):byId(p.relations,id);
    const source=endpoint==='source'?entityId:connection[kind==='message'?'from':'source'],target=endpoint==='target'?entityId:connection[kind==='message'?'to':'target'];
    checkCanvasEndpoints(p,diagram,source,target);connection[key]=entityId;
    if(kind==='relation'){
      delete connection[endpoint+'Member'];
      // A relationship is shared data; explicit views must include its new endpoint too.
      for(const view of p.diagrams)if(view.relationIds?.includes(id)&&!view.entityIds.includes(entityId))view.entityIds.push(entityId);
    }
  });
}
function reorderOnCanvas({diagramId,entityIds}){
  const d=byId(project.diagrams,diagramId);if(!d||d.type!=='sequence'||JSON.stringify(d.entityIds)===JSON.stringify(entityIds))return;
  if(entityIds.length!==d.entityIds.length||new Set(entityIds).size!==d.entityIds.length||entityIds.some(id=>!d.entityIds.includes(id)))return;
  return canvasEdit(diagramId,(_p,diagram)=>{diagram.entityIds=[...entityIds];});
}
function renameOnCanvas({diagramId,kind,id,entityId,value}){
  value=String(value??'').trim();if(!value)return;
  const item=kind==='entity'?byId(project.entities,id):kind==='relation'?byId(project.relations,id):kind==='message'?byId(byId(project.diagrams,diagramId)?.messages||[],id):kind==='member'?[...(byId(project.entities,entityId)?.fields||[]),...(byId(project.entities,entityId)?.methods||[])].find(m=>m.id===id):null;
  const key=kind==='entity'||kind==='member'?'name':'label';if(!item||item[key]===value)return;
  return canvasEdit(diagramId,()=>{item[key]=value;});
}
function showCanvasNodeEditor(stage,diagramId,point={}){
  if(!editing||!stage.isConnected)return;
  for(const editor of document.querySelectorAll('.canvas-node-editor'))editor.remove();
  const d=byId(project.diagrams,diagramId);if(!d)return;
  const kinds=d.type==='state'?stateKinds:d.type==='class'?['class','interface','table']:['service','actor','module','library','database','queue','external'];
  const initialKind=d.type==='class'&&d.entityIds.length&&d.entityIds.every(id=>byId(project.entities,id)?.kind==='table')?'table':kinds[0];
  const name=element('input',{type:'text','aria-label':'Node name',value:'New '+(d.type==='sequence'?'participant':initialKind),required:true});
  const kind=element('select',{'aria-label':'Node type'},kinds.map(value=>element('option',{value,selected:value===initialKind},value)));
  const close=()=>{form.remove();stage.querySelector('[data-canvas-add-entity]')?.focus();};
  const form=element('form',{class:'canvas-node-editor',role:'dialog','aria-label':'Add node',onkeydown:event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}},onsubmit:async event=>{
    event.preventDefault();if(!name.value.trim())return;
    const add=form.querySelector('button[type=submit]');add.disabled=true;
    let newId;
    const changed=await canvasEdit(diagramId,(p,diagram)=>{
      const entity={id:uid('entity'),kind:kind.value,name:name.value.trim(),summary:'',description:''};
      newId=entity.id;
      if(['class','interface','table'].includes(entity.kind))entity.fields=[];
      p.entities.push(entity);diagram.entityIds.push(entity.id);
      if(diagram.type!=='sequence'&&Number.isFinite(point.x)&&Number.isFinite(point.y)){
        const width=diagram.type==='class'?(diagram.columns||[{key:'name'},{key:'type'},{key:'purpose'}]).reduce((sum,col)=>sum+({name:154,type:126,purpose:238}[col.key]||176),0):232;
        diagram.positions??={};diagram.positions[entity.id]={x:point.x-width/2,y:point.y-42};
      }
    });
    if(changed){close();if(d.type==='sequence')for(const [blockId,controller] of diagramControllers)if(byId(project.blocks,blockId)?.diagramId===diagramId)controller.focus(newId);}else add.disabled=false;
  }},element('label',{},'Name',name),element('label',{},'Type',kind),element('div',{class:'canvas-node-actions'},element('button',{type:'submit',class:'button primary'},'Add node'),button('Cancel',close,'button')));
  stage.append(form);name.focus();name.select();
}
function moveBlock(id,delta){commit(p=>{const index=p.blocks.findIndex(b=>b.id===id);const dest=index+delta;if(dest<0||dest>=p.blocks.length)return;[p.blocks[index],p.blocks[dest]]=[p.blocks[dest],p.blocks[index]];});}
function scrollDiagram(id){const block=project.blocks.find(b=>b.type==='diagram'&&b.diagramId===id);if(block)document.getElementById('block-'+block.id)?.scrollIntoView({behavior:'smooth',block:'center'});}
function focusEntity(id,updateHash=true){
  if(!byId(project.entities,id))return;
  selection={kind:'entity',id};const diagram=project.diagrams.find(d=>d.entityIds.includes(id));selectedDiagram=diagram?.id;
  if(diagram)scrollDiagram(diagram.id);
  for(const [bid,controller] of diagramControllers){if(byId(project.diagrams,byId(project.blocks,bid)?.diagramId)?.entityIds.includes(id))controller.focus(id);else controller.clearFocus();}
  renderInspectorOpen();if(updateHash)history.replaceState(null,'','#entity='+encodeURIComponent(id));
}
function showMessage(diagramId,messageId){
  selectedDiagram=diagramId;selection={kind:'message',id:messageId};renderInspectorOpen();
  for(const [blockId,controller] of diagramControllers)if(byId(project.blocks,blockId)?.diagramId===diagramId)controller.focusMessage(messageId);
}
function renderInspectorOpen(){
  const inspector=document.getElementById('inspector');if(!inspector)return;
  inspector.hidden=false;document.querySelector('.workspace')?.classList.add('inspector-open');renderInspector();
}
function closeInspector(){selection=null;document.getElementById('inspector').hidden=true;document.querySelector('.workspace')?.classList.remove('inspector-open');for(const ctrl of diagramControllers.values())ctrl.clearFocus();if(location.hash.startsWith('#entity='))history.replaceState(null,'',location.pathname+location.search);}
function field(label,value,onChange,{multiline=false,options=null,help=null}={}){
  const input=options?element('select',{'aria-label':label},options.map(item=>element('option',{value:typeof item==='string'?item:item.value},typeof item==='string'?item:item.label))):element(multiline?'textarea':'input',{'aria-label':label,rows:multiline?4:null,type:multiline?null:'text'});
  input.value=value??'';input.addEventListener('change',()=>onChange(input.value));
  return element('label',{class:'field'},element('span',{},label),input,help?element('small',{},help):null);
}
function detail(label,value){return value?element('div',{class:'detail'},element('span',{class:'detail-label'},label),element('p',{},value)):null;}
function renderInspector(){
  const panel=document.getElementById('inspector');if(!panel||!selection)return;panel.replaceChildren();
  const diagram=byId(project.diagrams,selectedDiagram);
  const head=element('div',{class:'inspector-head'},element('span',{class:'eyebrow'},editing?'EDIT DETAILS':'INSPECT'),button('×',closeInspector,'icon-button','Close details'));
  panel.append(head);
  const body=element('div',{class:'inspector-body'});panel.append(body);
  if(selection.kind==='entity'){
    const entity=byId(project.entities,selection.id);if(!entity){closeInspector();return;}
    body.append(element('span',{class:'pill'},entity.kind),element('h2',{},entity.name));
    if(editing){for(const [key,label,multi] of [['name','Name',false],['summary','Summary',true],['description','Explanation',true],['technology','Technology',false]])body.append(field(label,entity[key],value=>commit(p=>byId(p.entities,entity.id)[key]=value),{multiline:multi}));body.append(field('Entity kind',entity.kind,value=>commit(p=>byId(p.entities,entity.id).kind=value),{options:diagram?.type==='state'?stateKinds:['actor','service','module','library','database','queue','external','class','interface','table',...stateKinds]}),field('Tone',entity.tone||'neutral',value=>commit(p=>{const target=byId(p.entities,entity.id);if(value==='neutral')delete target.tone;else target.tone=value;}),{options:tones}));}
    else body.append(detail('Purpose',entity.summary),detail('Explanation',entity.description),detail('Technology',entity.technology),detail('Tone',entity.tone));
    if(entity.source)body.append(element('div',{class:'detail'},element('span',{class:'detail-label'},'SOURCE'),safeSourceLink(entity.source)));
    const relationships=project.relations.filter(r=>r.source===entity.id||r.target===entity.id);
    if(relationships.length){body.append(element('h3',{},'Connections'));for(const relation of relationships){const other=byId(project.entities,relation.source===entity.id?relation.target:relation.source);body.append(button(`${relation.source===entity.id?'→':'←'} ${other?.name||'?'} · ${relation.label}`,()=>{selection={kind:'relation',id:relation.id};renderInspector();},'connection-link'));}}
    for(const key of ['fields','methods']){
      if(entity[key]?.length){body.append(element('h3',{},key==='fields'?'Fields':'Methods'));for(const member of entity[key])body.append(button(member.name+(member.type?' : '+member.type:''),()=>{selection={kind:'member',id:member.id,entityId:entity.id};renderInspector();},'member-link'));}
      if(editing&&['class','interface','table'].includes(entity.kind))body.append(button('+ Add '+(key==='fields'?'field':'method'),()=>commit(p=>{const e=byId(p.entities,entity.id);e[key]??=[];const m={id:uid('member'),name:key==='fields'?'newField':'newMethod()',type:'string',purpose:''};e[key].push(m);selection={kind:'member',id:m.id,entityId:e.id};}),'button small'));
    }
    body.append(button('Copy entity link',()=>copyText(location.href.split('#')[0]+'#entity='+encodeURIComponent(entity.id)),'button'));
  } else if(selection.kind==='member'){
    const entity=byId(project.entities,selection.entityId);const key=entity?.fields?.some(m=>m.id===selection.id)?'fields':'methods';const member=entity?.[key]?.find(m=>m.id===selection.id);if(!member){closeInspector();return;}
    body.append(button('← '+entity.name,()=>{selection={kind:'entity',id:entity.id};renderInspector();},'text-button'),element('h2',{},member.name));
    for(const [prop,label,multi] of [['name','Name',false],['type','Type',false],['purpose','Purpose',true],['details','Details',true]]){
      if(editing)body.append(field(label,member[prop],value=>commit(p=>byId(p.entities,entity.id)[key].find(m=>m.id===member.id)[prop]=value),{multiline:multi}));else body.append(detail(label,member[prop]));
    }
    for(const col of diagram?.columns||[])if(!['name','type','purpose','details','visibility'].includes(col.key)){if(editing)body.append(field(col.label,member.values?.[col.key],value=>commit(p=>{const m=byId(p.entities,entity.id)[key].find(m=>m.id===member.id);m.values??={};m.values[col.key]=value;}),{multiline:true}));else body.append(detail(col.label,member.values?.[col.key]));}
    if(editing)body.append(button('Remove member',()=>{if(confirm('Remove this member? Connections to it must be removed first.'))commit(p=>{byId(p.entities,entity.id)[key]=byId(p.entities,entity.id)[key].filter(m=>m.id!==member.id);selection={kind:'entity',id:entity.id};});},'button danger'));
  } else if(selection.kind==='relation'){
    const relation=byId(project.relations,selection.id);if(!relation){closeInspector();return;}
    body.append(element('span',{class:'pill'},relation.kind==='transition'?'TRANSITION':'RELATIONSHIP'),element('h2',{},relation.label||relation.kind));
    const options=project.entities.map(e=>({value:e.id,label:e.name}));
    if(editing){const transition=relation.kind==='transition';const participants=transition?options.filter(option=>stateKinds.includes(byId(project.entities,option.value)?.kind)):options;body.append(field('From',relation.source,value=>commit(p=>byId(p.relations,relation.id).source=value),{options:transition?participants.filter(option=>byId(project.entities,option.value).kind!=='final'):participants}),field('To',relation.target,value=>commit(p=>byId(p.relations,relation.id).target=value),{options:transition?participants.filter(option=>byId(project.entities,option.value).kind!=='initial'):participants}),field('Label',relation.label,value=>commit(p=>byId(p.relations,relation.id).label=value)),field('Notation',relation.kind,value=>commit(p=>byId(p.relations,relation.id).kind=value),{options:diagram?.type==='state'?['transition']:['calls','async','reads','writes','association','inheritance','implementation','composition','aggregation','dependency','transition']}),field('Tone',relation.tone||'neutral',value=>commit(p=>{const target=byId(p.relations,relation.id);if(value==='neutral')delete target.tone;else target.tone=value;}),{options:tones}),field('Explanation',relation.description,value=>commit(p=>byId(p.relations,relation.id).description=value),{multiline:true}));}
    else{body.append(detail('From',byId(project.entities,relation.source)?.name),detail('To',byId(project.entities,relation.target)?.name),detail('Relationship',relation.kind),detail('Explanation',relation.description),detail('Tone',relation.tone));}
    if(editing)body.append(button('Remove relationship',()=>{if(confirm('Remove this relationship from all views?'))commit(p=>{p.relations=p.relations.filter(r=>r.id!==relation.id);for(const d of p.diagrams)if(d.relationIds)d.relationIds=d.relationIds.filter(id=>id!==relation.id);selection=null;});},'button danger'));
  } else if(selection.kind==='message'){
    const d=diagram||project.diagrams.find(d=>d.messages?.some(m=>m.id===selection.id));const message=d?.messages?.find(m=>m.id===selection.id);if(!message){closeInspector();return;}
    const index=d.messages.indexOf(message);body.append(element('span',{class:'pill'},'STEP '+(index+1)),element('h2',{},message.label));
    const options=d.entityIds.map(id=>({value:id,label:byId(project.entities,id)?.name||id}));
    if(editing){for(const [key,label,multi] of [['label','Message',false],['description','Why this step matters',true],['phase','Phase',false]])body.append(field(label,message[key],value=>commit(p=>byId(p.diagrams,d.id).messages.find(m=>m.id===message.id)[key]=value),{multiline:multi}));body.append(field('From',message.from,value=>commit(p=>byId(p.diagrams,d.id).messages.find(m=>m.id===message.id).from=value),{options}),field('To',message.to,value=>commit(p=>byId(p.diagrams,d.id).messages.find(m=>m.id===message.id).to=value),{options}),field('Message type',message.kind,value=>commit(p=>byId(p.diagrams,d.id).messages.find(m=>m.id===message.id).kind=value),{options:['sync','async','return']}));}
    else body.append(detail('From',byId(project.entities,message.from)?.name),detail('To',byId(project.entities,message.to)?.name),detail('Why this step matters',message.description),detail('Phase',message.phase));
    const previous=button('← Previous',()=>showMessage(d.id,d.messages[index-1].id),'button small');previous.disabled=index===0;
    const next=button('Next →',()=>showMessage(d.id,d.messages[index+1].id),'button small');next.disabled=index===d.messages.length-1;
    body.append(element('div',{class:'inline-actions'},previous,next));
    if(editing)body.append(button('Move earlier',()=>commit(p=>{const messages=byId(p.diagrams,d.id).messages;if(index>0)[messages[index-1],messages[index]]=[messages[index],messages[index-1]];}),'button small'),button('Remove message',()=>commit(p=>{byId(p.diagrams,d.id).messages=byId(p.diagrams,d.id).messages.filter(m=>m.id!==message.id);selection=null;}),'button danger'));
  } else if(selection.kind==='diagram'){
    const d=byId(project.diagrams,selection.id);if(!d)return;
    body.append(element('span',{class:'pill'},d.type),element('h2',{},d.title));
    body.append(field('Diagram title',d.title,value=>commit(p=>byId(p.diagrams,d.id).title=value)),field('Description',d.description,value=>commit(p=>byId(p.diagrams,d.id).description=value),{multiline:true}));
    if(d.type!=='state')body.append(field('Symbols',d.notation||'uml',value=>commit(p=>byId(p.diagrams,d.id).notation=value),{options:[{value:'uml',label:'Common UML symbols'},{value:'plain',label:'Plain arrows and labels'}]}));
    if(d.type!=='sequence')body.append(field('Direction',d.direction||'RIGHT',value=>commit(p=>{const target=byId(p.diagrams,d.id);target.direction=value;target.positions={};}),{options:[{value:'RIGHT',label:'Left to right'},{value:'DOWN',label:'Top to bottom'}]}));
    if(d.type==='class'){
      body.append(element('h3',{},'Visible columns'));
      const columns=d.columns||[{key:'name',label:'Name'},{key:'type',label:'Type'},{key:'purpose',label:'Purpose'}];
      for(const [index,column] of columns.entries())body.append(element('div',{class:'column-row'},field('Column '+(index+1),column.label,value=>commit(p=>{const target=byId(p.diagrams,d.id);target.columns??=clone(columns);target.columns[index].label=value;})),button('×',()=>commit(p=>{const target=byId(p.diagrams,d.id);target.columns=clone(columns).filter((_,i)=>i!==index);if(!target.columns.length)target.columns=[{key:'name',label:'Name'}];}),'icon-button','Remove column '+column.label)));
      body.append(button('+ Add explanatory column',()=>{const label=prompt('Column name','Example');if(label?.trim())commit(p=>{const target=byId(p.diagrams,d.id);target.columns??=clone(columns);target.columns.push({key:uid('column'),label:label.trim()});});},'button'));
    }
    body.append(element('h3',{},d.type==='sequence'?'Participants':d.type==='state'?'Visible states':'Visible entities'));
    for(const entity of project.entities.filter(entity=>d.type!=='state'||stateKinds.includes(entity.kind))){const checkbox=element('input',{type:'checkbox','aria-label':'Show '+entity.name});checkbox.checked=d.entityIds.includes(entity.id);checkbox.addEventListener('change',()=>commit(p=>{const target=byId(p.diagrams,d.id);if(checkbox.checked)target.entityIds.push(entity.id);else{target.entityIds=target.entityIds.filter(id=>id!==entity.id);target.relationIds=(target.relationIds||[]).filter(id=>{const r=byId(p.relations,id);return r.source!==entity.id&&r.target!==entity.id;});if(target.messages)target.messages=target.messages.filter(m=>m.from!==entity.id&&m.to!==entity.id);delete target.positions?.[entity.id];}}));body.append(element('label',{class:'check-row'},checkbox,entity.name));}
    if(d.type==='state')body.append(element('div',{class:'state-add-actions'},...stateKinds.map(kind=>button('+ '+({state:'New state',choice:'Choice',initial:'Initial',final:'Final'})[kind],()=>addEntity(d,kind),'button small'))));
    else body.append(button('+ New entity',()=>addEntity(d),'button'));
    if(d.type==='sequence')body.append(button('+ Add message',()=>{if(d.entityIds.length<1)return;commit(p=>{const target=byId(p.diagrams,d.id);target.messages??=[];const m={id:uid('message'),from:d.entityIds[0],to:d.entityIds[1]||d.entityIds[0],label:'New message',kind:'sync',description:''};target.messages.push(m);selection={kind:'message',id:m.id};});},'button'));
    else body.append(button(d.type==='state'?'+ Add transition':'+ Add relationship',()=>{const source=d.entityIds.find(id=>d.type!=='state'||byId(project.entities,id).kind!=='final');const targetId=d.entityIds.find(id=>id!==source&&(d.type!=='state'||byId(project.entities,id).kind!=='initial'))||(d.type==='state'&&byId(project.entities,source)?.kind==='state'?source:null);if(!source||!targetId){toast(d.type==='state'?'Add a source and destination state first.':'Add two entities first.');return;}commit(p=>{const r={id:uid('relation'),source,target:targetId,kind:d.type==='state'?'transition':d.type==='class'?'association':'calls',label:d.type==='state'?'event':'connects to'};p.relations.push(r);const target=byId(p.diagrams,d.id);target.relationIds??=[];target.relationIds.push(r.id);selection={kind:'relation',id:r.id};});},'button'));
  }
  if(!editing)body.append(button('Edit these details',()=>{editing=true;renderApp();},'button edit-details'));
}
function addEntity(diagram,kind=diagram.type==='state'?'state':diagram.type==='class'?'class':'service'){
  const name=prompt(diagram.type==='state'?'State name':'Entity name',({state:'New state',choice:'Choice',initial:'Initial',final:'Final',class:'NewClass',service:'New service'})[kind]||'New entity');if(!name?.trim())return;
  commit(p=>{const e={id:uid('entity'),kind,name:name.trim(),summary:'',description:''};if(e.kind==='class')e.fields=[];p.entities.push(e);byId(p.diagrams,diagram.id).entityIds.push(e.id);selection={kind:'entity',id:e.id};});
}
function addDiagram(type){
  commit(p=>{
    const d={id:uid('diagram'),type,title:'New '+type+' diagram',entityIds:[],relationIds:[],direction:'RIGHT'};
    if(type==='state'){
      const nodes=[{id:uid('initial'),kind:'initial',name:'Initial'},{id:uid('state'),kind:'state',name:'New state'},{id:uid('final'),kind:'final',name:'Final'}];
      p.entities.push(...nodes);d.entityIds=nodes.map(node=>node.id);
      const transitions=[{id:uid('transition'),source:nodes[0].id,target:nodes[1].id,kind:'transition',label:''},{id:uid('transition'),source:nodes[1].id,target:nodes[2].id,kind:'transition',label:'finish'}];
      p.relations.push(...transitions);d.relationIds=transitions.map(relation=>relation.id);
    }else{
      d.entityIds=p.entities.filter(entity=>type==='class'?['class','interface','table'].includes(entity.kind):!stateKinds.includes(entity.kind)).slice(0,2).map(entity=>entity.id);
      if(type==='sequence')d.messages=[];
    }
    p.diagrams.push(d);p.blocks.push({id:uid('block'),type:'diagram',diagramId:d.id});selection={kind:'diagram',id:d.id};selectedDiagram=d.id;
  });closeModal();
}
function addBlockMenu(){
  const body=element('div',{class:'add-grid'});
  for(const type of ['heading','prose','callout','code','image','diagram'])body.append(button('+ '+type,()=>{
    if(type==='image'){closeModal();importImage();return;}
    if(type==='diagram'){
      const pick=element('div',{class:'add-grid'},project.diagrams.map(d=>button(d.title,()=>{commit(p=>p.blocks.push({id:uid('block'),type:'diagram',diagramId:d.id}));closeModal();},'button')));
      for(const diagramType of ['system','class','sequence','state'])pick.append(button('New '+diagramType+' diagram',()=>addDiagram(diagramType),'button'));
      modal('Insert a diagram',pick);return;
    }
    commit(p=>p.blocks.push(type==='heading'?{id:uid('block'),type,level:2,text:'New section'}:type==='prose'?{id:uid('block'),type,markdown:'Write your explanation here.'}:type==='callout'?{id:uid('block'),type,title:'Good to know',text:'Add a useful detail.',tone:'info'}:{id:uid('block'),type,language:'text',text:'Your code here'}));closeModal();
  },'button'));modal('Add content',body);
}
function editSimpleBlock(block){
  const draft=clone(block);const body=element('div',{});
  for(const key of block.type==='callout'?['title','text']:block.type==='image'?['alt','caption']:['language','text'])body.append(field(key,draft[key],v=>draft[key]=v,{multiline:key==='text'||key==='caption'}));
  body.append(button('Apply',()=>{commit(p=>Object.assign(byId(p.blocks,block.id),draft));closeModal();},'button primary'));modal('Edit '+block.type,body);
}
function importImage(blockId){
  const input=element('input',{type:'file',accept:'image/png,image/jpeg,image/webp,image/gif'});
  input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file)return;try{
    const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
    commit(p=>{if(blockId)byId(p.blocks,blockId).src=src;else p.blocks.push({id:uid('image'),type:'image',src,alt:file.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' '),caption:''});});
  }catch(error){toast(error.message,true);}});input.click();
}
function modal(title,content){
  closeModal();const dialog=element('dialog',{class:'modal',id:'modal'});
  dialog.append(element('div',{class:'modal-head'},element('h2',{},title),button('×',closeModal,'icon-button','Close dialog')),content);document.body.append(dialog);dialog.showModal();dialog.addEventListener('click',e=>{if(e.target===dialog)closeModal();});
}
function closeModal(){const dialog=document.getElementById('modal');if(dialog){dialog.close();dialog.remove();}}
function openSource(){
  flushEditors();const source=element('textarea',{class:'source-editor','aria-label':'Project JSON',spellcheck:'false'});source.value=JSON.stringify(project,null,2);
  const result=element('div',{class:'source-result',role:'status'});
  const actions=element('div',{class:'modal-actions'},button('Download JSON',()=>download(project.id+'.json',JSON.stringify(project,null,2),'application/json'),'button'),button('Validate',()=>{try{check(JSON.parse(source.value));result.textContent='Valid project. All references resolve.';result.className='source-result success';}catch(e){result.textContent=e.message;result.className='source-result error';}},'button'),button('Apply changes',()=>{try{setProject(JSON.parse(source.value));closeModal();toast('Project updated.');}catch(e){result.textContent=e.message;result.className='source-result error';}},'button primary'));
  modal('Project data',element('div',{},element('p',{class:'muted'},'This is the editable source shared by the document, diagrams, and AI tools.'),source,result,actions));
}
function importProject(){
  const input=element('input',{type:'file',accept:'.json,.html,application/json,text/html'});
  input.addEventListener('change',async()=>{try{const file=input.files[0];if(!file)return;const text=await file.text();const model=file.name.endsWith('.html')?JSON.parse(new DOMParser().parseFromString(text,'text/html').getElementById('fd-project')?.textContent||'null'):JSON.parse(text);setProject(model);toast('Imported project. Save HTML to keep this version.');}catch(error){toast(error.message,true);}});input.click();
}
function showAbout(){
  flushEditors();
  modal('About this document',element('div',{class:'about'},element('p',{},'The document, source data and editor are embedded in this HTML file. Save HTML downloads an editable copy with your changes; it does not overwrite the file you opened.'),element('p',{},connected?'This view is connected to a local JSON source. Changes save while the local server is running. Downloaded HTML copies open independently.':'This file works offline. Browser edits remain in this session until you save a new HTML copy.'),element('div',{class:'about-actions'},button('Project data { }',openSource,'button'),button('Import project',()=>{closeModal();importProject();},'button'),button('Edit document title',()=>editDocumentTitle(),'button')),element('p',{class:'keyboard-help'},'Ctrl/Cmd K: search · Ctrl/Cmd S: save HTML · Ctrl/Cmd Z: undo · Escape: close'),element('p',{class:'muted'},'FinalDiagrams 0.4.1 supports system, class, sequence and state diagrams. Sequence phases are descriptive groupings, not formal UML combined fragments.'),button('Dependency notices',()=>modal('Dependency notices',element('pre',{class:'notice-text'},document.getElementById('fd-notices')?.textContent||'Dependency notices are available in the original release.')),'text-button')));
}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('Copied.');}catch{modal('Copy text',element('textarea',{class:'copy-text',readonly:true,value:text}));}}

function search(query){
  lastQuery=query.trim();const results=document.getElementById('search-results');closeSearch();results.replaceChildren();
  const options=element('div',{id:'search-options',role:'listbox','aria-label':'Search results'});
  if(!lastQuery){results.append(options);return;}
  const needle=lastQuery.toLocaleLowerCase(),hits=[];
  const matches=(...values)=>values.filter(Boolean).join(' ').toLocaleLowerCase().includes(needle);
  for(const entity of project.entities){if(matches(entity.name,entity.summary,entity.description,entity.technology))hits.push({title:entity.name,kind:entity.kind,description:entity.summary,run:()=>focusEntity(entity.id)});for(const member of [...entity.fields||[],...entity.methods||[]])if(matches(member.name,member.type,member.purpose,member.details,...Object.values(member.values||{})))hits.push({title:entity.name+'.'+member.name,kind:'member',description:member.purpose,run:()=>{focusEntity(entity.id);selection={kind:'member',id:member.id,entityId:entity.id};renderInspector();}});}
  for(const d of project.diagrams)for(const m of d.messages||[])if(matches(m.label,m.description,m.phase))hits.push({title:m.label,kind:'message',description:m.description,run:()=>{scrollDiagram(d.id);showMessage(d.id,m.id);}});
  for(const block of project.blocks){const text=block.type==='prose'?proseText(block):[block.title,block.text,block.alt,block.caption].filter(Boolean).join(' ');if(matches(text))hits.push({title:block.type==='heading'?block.text:'In the document',kind:block.type,description:text.slice(0,140),run:()=>{const node=document.getElementById('block-'+block.id);node?.scrollIntoView({behavior:'smooth',block:'center'});node?.classList.add('search-highlight');setTimeout(()=>node?.classList.remove('search-highlight'),2000);}});}
  results.hidden=false;document.getElementById('search').setAttribute('aria-expanded','true');
  results.append(element('div',{class:'search-count',role:'status','aria-live':'polite'},hits.length?`${hits.length} matches`:'No matches. Try an entity, field, or concept.'),options);
  hits.forEach((hit,index)=>{const item=button('',()=>{closeSearch();hit.run();},'search-hit',hit.title);
    item.id='search-hit-'+index;item.setAttribute('role','option');item.setAttribute('tabindex','-1');item.setAttribute('aria-selected','false');item.removeAttribute('title');
    item.addEventListener('pointerdown',event=>event.preventDefault());item.addEventListener('pointermove',()=>selectSearchResult(index,false));
    item.append(element('span',{class:'pill'},hit.kind),element('strong',{},hit.title),element('small',{},hit.description||''));options.append(item);
  });
}
function selectSearchResult(index,scroll=true){
  const items=[...document.querySelectorAll('#search-options .search-hit')];
  if(!items.length)return;
  activeSearchIndex=Math.max(0,Math.min(index,items.length-1));
  items.forEach((item,i)=>item.setAttribute('aria-selected',String(i===activeSearchIndex)));
  const item=items[activeSearchIndex];document.getElementById('search').setAttribute('aria-activedescendant',item.id);
  if(scroll)item.scrollIntoView({block:'nearest',behavior:'instant'});
}
function searchKeydown(event){
  if(event.isComposing)return;
  const results=document.getElementById('search-results');
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();
    if(results.hidden&&event.target.value.trim())search(event.target.value);
    const count=document.querySelectorAll('#search-options .search-hit').length;
    selectSearchResult(activeSearchIndex<0?(event.key==='ArrowDown'?0:count-1):activeSearchIndex+(event.key==='ArrowDown'?1:-1));
  }else if(event.key==='Enter'&&!results.hidden){
    const items=document.querySelectorAll('#search-options .search-hit');
    if(items.length){event.preventDefault();items[Math.max(0,activeSearchIndex)]?.click();}
  }else if(event.key==='Escape'&&!results.hidden){event.preventDefault();event.stopPropagation();closeSearch();}
  else if(event.key==='Tab')closeSearch();
}
function closeSearch(){
  const node=document.getElementById('search-results');if(node)node.hidden=true;
  const input=document.getElementById('search');input?.setAttribute('aria-expanded','false');input?.removeAttribute('aria-activedescendant');
  for(const item of document.querySelectorAll('#search-options [aria-selected="true"]'))item.setAttribute('aria-selected','false');
  activeSearchIndex=-1;
}

function scheduleSync(){if(!connected||conflict)return;clearTimeout(syncTimer);syncTimer=setTimeout(sync,600);}
async function sync(){
  if(!connected||saving||conflict||!dirty)return;saving=true;status();const snapshot=clone(project);
  let success=false;
  try{const response=await fetch('/api/project',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:snapshot,baseRevision:serverRevision})});if(response.status===409){conflict=true;renderApp();return;}if(!response.ok)throw new Error(await response.text());const result=await response.json();serverRevision=result.revision;success=true;flushEditors();if(JSON.stringify(project)===JSON.stringify(snapshot)){project=result.project;checkpoint=clone(project);dirty=false;}}catch(error){toast('Could not save to project: '+error.message,true);}finally{saving=false;status();if(announcedRevision>serverRevision&&!conflict)await loadServer();if(success&&dirty&&!conflict)scheduleSync();}
}
async function loadServer(force=false){
  if(!connected)return;
  const request=++loadSequence;
  try{const response=await fetch('/api/project');if(!response.ok)throw new Error('Project is unavailable');const result=await response.json();if(request!==loadSequence||result.revision<serverRevision)return;check(result.project);flushEditors();if((dirty||saving)&&!force){if(result.revision!==serverRevision){conflict=true;clearTimeout(syncTimer);renderApp();}return;}project=result.project;checkpoint=clone(project);serverRevision=result.revision;announcedRevision=Math.max(announcedRevision,result.revision);dirty=false;conflict=false;undoStack=[];redoStack=[];renderApp();}catch(error){toast(error.message,true);}
}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&navigationOpen&&(mobileNavigation.matches||event.target.closest('#document-navigation,#navigation-toggle'))){event.preventDefault();setNavigationOpen(false);return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&navigationOpen&&mobileNavigation.matches)setNavigationOpen(false,{restoreFocus:false});
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();document.getElementById('search')?.focus();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveHTML();}
  if(event.key==='Escape'){closeSearch();closeModal();closeInspector();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.target.closest('input,textarea,[contenteditable="true"]')){event.preventDefault();event.shiftKey?redo():undo();}
});
document.addEventListener('click',event=>{if(!event.target.closest('.search-wrap'))closeSearch();});
document.addEventListener('focusin',event=>{if(navigationOpen&&mobileNavigation.matches&&!event.target.closest('#document-navigation,#navigation-toggle'))setNavigationOpen(false,{restoreFocus:false});if(!event.target.closest('.search-wrap'))closeSearch();});
window.addEventListener('beforeunload',event=>{flushEditors();if(dirty){event.preventDefault();event.returnValue='';}});
window.FinalDiagrams={getProject:()=>{flushEditors();return clone(project);},setProject,exportHTML,renderDiagram,validateProject,version:'0.4.1'};
try{check(project);renderApp();if(connected){loadServer().then(()=>{eventStream=new EventSource('/api/events');eventStream.addEventListener('project',event=>{const next=JSON.parse(event.data);announcedRevision=Math.max(announcedRevision,next.revision);if(next.revision===serverRevision||saving)return;loadServer();});eventStream.addEventListener('error',event=>{if(event.data)toast('Project file needs attention: '+JSON.parse(event.data).message,true);});});}}catch(error){app.replaceChildren(element('div',{class:'startup-error'},element('h1',{},'This project needs a correction'),element('pre',{},error.message)));}
