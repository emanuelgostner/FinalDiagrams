import { marked } from 'marked';
import DOMPurify from 'dompurify';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function safeURL(value) {
  const s = String(value || '').trim();
  return /^(https?:\/\/|mailto:|#)/i.test(s) ? s : '';
}
function inline(node) {
  if (node.type === 'hardBreak') return '<br>';
  let out = escapeHTML(node.text || '');
  for (const mark of node.marks || []) {
    if (mark.type === 'bold') out = `<strong>${out}</strong>`;
    if (mark.type === 'italic') out = `<em>${out}</em>`;
    if (mark.type === 'code') out = `<code>${out}</code>`;
    if (mark.type === 'strike') out = `<s>${out}</s>`;
    if (mark.type === 'link' && safeURL(mark.attrs?.href)) out = `<a href="${escapeHTML(safeURL(mark.attrs.href))}">${out}</a>`;
  }
  return out;
}
function richHTML(node) {
  if (!node) return '';
  if (node.type === 'text' || node.type === 'hardBreak') return inline(node);
  const child = (node.content || []).map(richHTML).join('');
  const tags = { doc: '', paragraph: 'p', bulletList: 'ul', orderedList: 'ol', listItem: 'li', blockquote: 'blockquote', codeBlock: 'pre', table:'table', tableHead:'thead', tableBody:'tbody', tableRow:'tr', tableHeader:'th', tableCell:'td' };
  if (node.type === 'horizontalRule') return '<hr>';
  if (node.type === 'heading') return `<h${Math.min(4, Math.max(1, Number(node.attrs?.level) || 2))}>${child}</h${Math.min(4, Math.max(1, Number(node.attrs?.level) || 2))}>`;
  const tag = tags[node.type];
  const start=node.type==='orderedList'&&Number.isInteger(node.attrs?.start)?` start="${node.attrs.start}"`:'';
  return tag ? `<${tag}${start}>${child || '<br>'}</${tag}>` : child;
}
export function proseHTML(block) {
  const html = block.content ? richHTML(block.content) : marked.parse(block.markdown || '', { gfm: true, breaks: false });
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['p','br','strong','b','em','i','s','del','code','pre','ul','ol','li','blockquote','h1','h2','h3','h4','hr','a','table','thead','tbody','tr','th','td'], ALLOWED_ATTR: ['href','title','start'], ALLOW_DATA_ATTR: false });
}
export function proseText(block) {
  if (block.markdown != null) return block.markdown;
  const walk = node => node.text || (node.content || []).map(walk).join(' ');
  return walk(block.content || {});
}
export function richFromElement(element) {
  const clean = document.createElement('div');
  clean.innerHTML = DOMPurify.sanitize(element.innerHTML, { ALLOWED_TAGS: ['p','div','br','strong','b','em','i','s','del','code','pre','ul','ol','li','blockquote','h1','h2','h3','h4','hr','a','table','thead','tbody','tr','th','td'], ALLOWED_ATTR: ['href','start'], ALLOW_DATA_ATTR: false });
  function parse(node, marks = []) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [{type:'text',text:node.textContent, ...(marks.length ? {marks} : {})}] : [];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return [{type:'hardBreak'}];
    if (tag === 'hr') return [{type:'horizontalRule'}];
    const markTypes = {strong:'bold',b:'bold',em:'italic',i:'italic',s:'strike',del:'strike',code:'code'};
    const next = markTypes[tag] ? [...marks,{type:markTypes[tag]}] : tag === 'a' && safeURL(node.getAttribute('href')) ? [...marks,{type:'link',attrs:{href:safeURL(node.getAttribute('href'))}}] : marks;
    const children = [...node.childNodes].flatMap(child => parse(child,next));
    const type = {p:'paragraph',div:'paragraph',ul:'bulletList',ol:'orderedList',li:'listItem',blockquote:'blockquote',pre:'codeBlock',h1:'heading',h2:'heading',h3:'heading',h4:'heading',table:'table',thead:'tableHead',tbody:'tableBody',tr:'tableRow',th:'tableHeader',td:'tableCell'}[tag];
    if (!type) return children;
    return [{type, ...(type==='heading'?{attrs:{level:Number(tag[1])}}:type==='orderedList'?{attrs:{start:Number(node.getAttribute('start'))||1}}:{}), content:children}];
  }
  const parsed = [...clean.childNodes].flatMap(n => parse(n));
  const blocks=[]; let line=[];
  const flush=()=>{if(line.length){blocks.push({type:'paragraph',content:line});line=[];}};
  for(const node of parsed){if(node.type==='text'||node.type==='hardBreak')line.push(node);else{flush();blocks.push(node);}}flush();
  return {type:'doc',content:blocks.length?blocks:[{type:'paragraph',content:[]}]};
}

export function formatSelection(tag, root) {
  const selection=window.getSelection();
  if(!selection?.rangeCount)return;
  const range=selection.getRangeAt(0);
  if(!root.contains(range.commonAncestorContainer)||range.collapsed)return;
  const wrapper=document.createElement(tag);
  wrapper.append(range.extractContents());range.insertNode(wrapper);
  range.selectNodeContents(wrapper);selection.removeAllRanges();selection.addRange(range);
  root.dispatchEvent(new Event('input',{bubbles:true}));
}
