import ELK from 'elkjs/lib/elk.bundled.js';

const NS = 'http://www.w3.org/2000/svg';
let instanceCount = 0;
const defaultPalette = { bg: '#f7f9f6', panel: '#ffffff', ink: '#172b24', muted: '#68756d', line: '#dde5df', accent: '#087965', pale: '#e7f5ed' };
const styleText = `
.fd-diagram{position:relative;min-width:0;overflow:hidden;border:1px solid var(--line,#dde5df);border-radius:12px;background:var(--canvas,#f7f9f6);touch-action:none}
.fd-diagram>svg{display:block;width:100%;height:100%;min-height:420px;outline:none;user-select:none}
.fd-diagram .fd-pannable{cursor:grab}.fd-diagram .fd-pannable:active{cursor:grabbing}
.fd-diagram .fd-selectable{cursor:pointer;outline:none;transition:opacity .15s}
.fd-diagram .fd-selectable:focus .fd-node-body,.fd-diagram .fd-selectable:hover .fd-node-body{stroke:var(--fd-diagram-accent);stroke-width:2}
.fd-diagram .fd-selectable:focus .fd-edge-hit,.fd-diagram .fd-selectable:hover .fd-edge-hit{stroke:var(--fd-diagram-accent);stroke-opacity:.12}
.fd-diagram .fd-dim{opacity:.16}.fd-diagram .fd-selected .fd-node-body{stroke:var(--fd-diagram-accent);stroke-width:2.5}
.fd-diagram .fd-selected .fd-edge-line{stroke:var(--fd-diagram-accent);stroke-width:2.5}
.fd-diagram .fd-selected .fd-step-note{stroke:var(--fd-diagram-accent);stroke-width:1.5}
.fd-diagram .fd-member:hover .fd-row-bg,.fd-diagram .fd-member:focus .fd-row-bg{fill:var(--fd-diagram-pale)}
.fd-diagram .fd-info{cursor:help;outline:none}.fd-diagram .fd-info:hover circle,.fd-diagram .fd-info:focus circle{fill:var(--fd-diagram-accent);stroke-width:1.8}.fd-diagram .fd-info:hover text,.fd-diagram .fd-info:focus text{fill:var(--fd-diagram-panel)}
.fd-diagram-tooltip{position:fixed;z-index:10000;box-sizing:border-box;width:320px;max-width:calc(100vw - 24px);max-height:min(280px,calc(100vh - 24px));overflow:auto;padding:15px 16px;border:1px solid var(--fd-tip-line);border-radius:10px;background:var(--fd-tip-panel);color:var(--fd-tip-ink);box-shadow:0 10px 34px #0003;font:12px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}
.fd-diagram-tooltip[hidden]{display:none}.fd-diagram-tooltip strong{display:block;font-size:14px;line-height:1.4;color:var(--fd-tip-ink)}
.fd-diagram-tooltip .fd-tip-meta{margin:3px 0 10px;color:var(--fd-tip-accent);font-size:10px}
.fd-diagram-tooltip .fd-tip-label{margin:9px 0 2px;font-size:10px;font-weight:650;color:var(--fd-tip-muted);letter-spacing:.03em;text-transform:uppercase}
.fd-diagram-tooltip p{margin:0;white-space:pre-wrap}.fd-diagram-tooltip .fd-tip-footer{margin-top:12px;padding-top:9px;border-top:1px solid var(--fd-tip-line);font-size:10px;color:var(--fd-tip-muted)}
.fd-diagram .fd-error{padding:24px;color:#a52836;font:14px system-ui}
.fd-diagram .fd-edit-handle{opacity:0;cursor:crosshair;outline:none;pointer-events:none}
.fd-diagram .fd-edit-handle circle{pointer-events:inherit}
.fd-diagram .fd-selectable:hover>.fd-edit-handle,.fd-diagram .fd-selectable:focus-within>.fd-edit-handle,.fd-diagram .fd-selected>.fd-edit-handle,.fd-diagram .fd-edit-handle:focus,.fd-diagram .fd-floating-edit-handle{opacity:1;pointer-events:all}
.fd-diagram .fd-edit-handle:hover circle:last-child,.fd-diagram .fd-edit-handle:focus circle:last-child{fill:var(--fd-diagram-accent)}
.fd-diagram .fd-drop-target .fd-node-body{stroke:var(--fd-diagram-accent);stroke-width:3;filter:drop-shadow(0 0 5px #08796533)}
.fd-diagram .fd-connection-preview{pointer-events:none;stroke:var(--fd-diagram-accent);stroke-width:2;stroke-dasharray:6 4;fill:none}
.fd-diagram .fd-reorder-preview{pointer-events:none;stroke:var(--fd-diagram-accent);stroke-width:3;stroke-dasharray:5 4}
.fd-inline-rename{position:fixed;z-index:10001;box-sizing:border-box;width:280px;max-width:calc(100vw - 24px);padding:8px 10px;border:2px solid var(--accent,#087965);border-radius:7px;background:var(--panel,#fff);color:var(--ink,#172b24);font:14px system-ui;box-shadow:0 6px 24px #0002}
`;

function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined && value !== null) el.setAttribute(key, String(value));
  if (text !== undefined) el.textContent = String(text);
  return el;
}
function add(parent, tag, attrs, text) { const el = svg(tag, attrs, text); parent.append(el); return el; }
function title(el, value) { if (value) add(el, 'title', {}, value); }
function number(value, fallback = 0) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
function wrap(value, width, font = 12) {
  const raw = String(value ?? '');
  const capacity = Math.max(4, Math.floor(width / (font * .55)));
  const lines = [];
  for (const paragraph of raw.split('\n')) {
    let line = '';
    for (let word of paragraph.split(/\s+/)) {
      while (word.length > capacity) {
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, capacity)); word = word.slice(capacity);
      }
      if (!word) continue;
      if ((line + ' ' + word).trim().length > capacity) { lines.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}
function drawLines(parent, values, x, y, opts = {}) {
  const el = add(parent, 'text', { x, y, 'font-size': opts.size || 12, fill: opts.fill || defaultPalette.ink, 'font-weight': opts.weight || 400, 'font-family': opts.mono ? 'ui-monospace, SFMono-Regular, Consolas, monospace' : 'Inter, ui-sans-serif, system-ui, sans-serif', ...opts.attrs });
  values.forEach((value, index) => add(el, 'tspan', { x, dy: index ? opts.leading || 17 : 0 }, value));
  return el;
}
function entityMetrics(entity, diagram) {
  if (diagram.type === 'state' || ['state', 'choice', 'initial', 'final'].includes(entity.kind)) {
    if (['initial', 'final'].includes(entity.kind)) return { width: 28, height: 28, stateShape: entity.kind, name: [] };
    if (entity.kind === 'choice') {
      const name = wrap(entity.name, 110, 13);
      return { width: 168, height: Math.max(98, name.length * 38 + 22), stateShape: 'choice', name };
    }
    const name = wrap(entity.name, 184, 14), summary = entity.summary ? wrap(entity.summary, 200, 11) : [];
    return { width: 232, height: Math.max(72, 42 + name.length * 18 + summary.length * 15), stateShape: 'state', name, summary };
  }
  if (diagram.type === 'class' || entity.kind === 'class' || entity.kind === 'interface' || entity.kind === 'table') {
    const columns = diagram.columns?.length ? diagram.columns : [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'purpose', label: 'Purpose' }];
    const widths = columns.map(c => c.key === 'name' ? 154 : c.key === 'type' ? 126 : c.key === 'purpose' ? 238 : 176);
    const width = Math.max(300, widths.reduce((a, b) => a + b, 0));
    const name = wrap(entity.name, width - 32, 16);
    const summary = entity.summary ? wrap(entity.summary, width - 32) : [];
    const head = 46 + name.length * 21 + summary.length * 17;
    const columnLabels = columns.map((column, i) => wrap(column.label || column.key, widths[i] - 20, 10));
    const columnHeight = Math.max(29, ...columnLabels.map(label => label.length * 14 + 14));
    const rows = [];
    for (const [section, members] of [['Fields', entity.fields || []], ['Methods', entity.methods || []]]) {
      if (!members.length) continue;
      rows.push({ section, height: 26 });
      for (const member of members) {
        const cells = columns.map((column, i) => wrap(column.key === 'name' ? `${member.visibility || ''}${member.visibility ? ' ' : ''}${member.name}` : ['type', 'purpose', 'details'].includes(column.key) ? member[column.key] || '—' : member.values?.[column.key] || '—', widths[i] - (i === columns.length - 1 ? 42 : 20), 11));
        rows.push({ member, cells, height: Math.max(35, Math.max(...cells.map(x => x.length)) * 16 + 16) });
      }
    }
    if (!rows.length) rows.push({ empty: true, height: 40 });
    let rowY = head + columnHeight;
    for (const row of rows) { row.y = rowY; rowY += row.height; }
    return { width, height: rowY + 4, columns, widths, columnLabels, rows, head, name, summary, table: true };
  }
  const width = 252;
  const name = wrap(entity.name, width - 60, 15);
  const summary = entity.summary ? wrap(entity.summary, width - 32, 12) : [];
  return { width, height: 55 + name.length * 19 + summary.length * 17 + (entity.technology ? 25 : 0), name, summary };
}

/** Render an independently navigable, editable diagram. User text never enters HTML. */
export async function renderDiagram(container, diagram, project, options = {}) {
  const computed = getComputedStyle(container);
  const themeColor = (key, fallback) => {
    const value = computed.getPropertyValue(key).trim();
    return value && CSS.supports('color', value) ? value : fallback;
  };
  const palette = {
    bg: themeColor('--canvas', defaultPalette.bg), panel: themeColor('--panel', defaultPalette.panel),
    ink: themeColor('--ink', defaultPalette.ink), muted: themeColor('--muted', defaultPalette.muted),
    line: themeColor('--line', defaultPalette.line), accent: themeColor('--accent', defaultPalette.accent)
  };
  // Resolve a tinted surface once, so the exported SVG has no CSS-variable dependency.
  const colorProbe = document.createElement('span');
  colorProbe.style.color = `color-mix(in srgb, ${palette.accent} 11%, ${palette.panel})`;
  container.append(colorProbe);
  palette.pale = colorProbe.style.color ? getComputedStyle(colorProbe).color : palette.panel;
  colorProbe.remove();
  const pixel = document.createElement('canvas'); pixel.width = pixel.height = 1;
  const pixelContext = pixel.getContext('2d'); pixelContext.fillStyle = palette.panel; pixelContext.fillRect(0, 0, 1, 1);
  const rgb = pixelContext.getImageData(0, 0, 1, 1).data, dark = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 < 128;
  const tones = {
    neutral: { key: 'neutral', stroke: palette.line, edge: palette.muted, fill: palette.panel },
    info: { key: 'info', stroke: dark ? '#79bdee' : '#357ca9', edge: dark ? '#79bdee' : '#357ca9', fill: dark ? '#253747' : '#edf5fc' },
    success: { key: 'success', stroke: dark ? '#70d7a0' : '#238653', edge: dark ? '#70d7a0' : '#238653', fill: dark ? '#253d30' : '#edf8f0' },
    warning: { key: 'warning', stroke: dark ? '#e5bc6c' : '#a76a12', edge: dark ? '#e5bc6c' : '#a76a12', fill: dark ? '#423a27' : '#fcf5e6' },
    error: { key: 'error', stroke: dark ? '#f08d91' : '#bb3f45', edge: dark ? '#f08d91' : '#bb3f45', fill: dark ? '#482b30' : '#fceff0' }
  };
  const toneFor = value => Object.hasOwn(tones, value) ? tones[value] : tones.neutral;
  const lines = (parent, values, x, y, opts = {}) => drawLines(parent, values, x, y, { fill: palette.ink, ...opts });
  if (!document.getElementById('fd-diagram-style')) {
    const style = document.createElement('style'); style.id = 'fd-diagram-style'; style.textContent = styleText; document.head.append(style);
  }
  const instance = `fd-${++instanceCount}`;
  const host = document.createElement('div'); host.className = 'fd-diagram';
  host.style.setProperty('--fd-diagram-accent', palette.accent);
  host.style.setProperty('--fd-diagram-pale', palette.pale);
  host.style.setProperty('--fd-diagram-panel', palette.panel);
  host.style.height = container.dataset.height || '560px';
  const canvas = svg('svg', { role: 'group', 'aria-label': diagram.title || 'Software diagram', 'aria-description': 'Scroll to zoom. Drag the background to pan. Use plus and minus to zoom, Home to show the overview, and arrow keys to pan.', tabindex: 0, xmlns: NS });
  canvas.classList.add('fd-pannable'); host.append(canvas); container.replaceChildren(host);
  const defs = add(canvas, 'defs');
  for (const [name, shape, fill] of [
    ['arrow', 'M 0 0 L 9 4.5 L 0 9 Z', palette.ink],
    ['open', 'M 0 0 L 9 4.5 L 0 9', 'none'],
    ['triangle', 'M 0 0 L 10 5 L 0 10 Z', palette.panel],
    ['diamond', 'M 0 5 L 6 1 L 12 5 L 6 9 Z', palette.ink],
    ['diamond-open', 'M 0 5 L 6 1 L 12 5 L 6 9 Z', palette.panel]
  ]) {
    const marker = add(defs, 'marker', { id: `${instance}-${name}`, viewBox: '0 0 12 10', refX: name.startsWith('diamond') ? 1 : 9, refY: 5, markerWidth: 12, markerHeight: 10, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' });
    add(marker, 'path', { d: shape, fill, stroke: palette.ink, 'stroke-width': 1.3, 'stroke-linejoin': 'round' });
  }
  for (const tone of Object.values(tones).filter(t => t.key !== 'neutral')) {
    const marker = add(defs, 'marker', { id: `${instance}-arrow-${tone.key}`, viewBox: '0 0 12 10', refX: 9, refY: 5, markerWidth: 12, markerHeight: 10, orient: 'auto', markerUnits: 'userSpaceOnUse' });
    add(marker, 'path', { d: 'M0 0L9 4.5L0 9Z', fill: tone.edge, stroke: tone.edge, 'stroke-width': 1.3 });
  }
  const world = add(canvas, 'g');
  const infoData = new WeakMap();
  const tooltip = document.createElement('div'); tooltip.className = 'fd-diagram-tooltip'; tooltip.id = `${instance}-tooltip`; tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
  for (const key of ['panel', 'ink', 'muted', 'line', 'accent']) tooltip.style.setProperty(`--fd-tip-${key}`, palette[key]);
  document.body.append(tooltip);
  let activeInfo = null, hideInfoTimer = null, insideTooltip = false;
  function hideInfo() { clearTimeout(hideInfoTimer); activeInfo?.removeAttribute('aria-describedby'); activeInfo = null; insideTooltip = false; tooltip.hidden = true; }
  function positionInfo() {
    if (activeInfo && !activeInfo.isConnected) hideInfo();
    if (!activeInfo || tooltip.hidden) return;
    const rect = activeInfo.getBoundingClientRect(), width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    let x = rect.right + 12;
    if (x + width > window.innerWidth - 12) x = rect.left - width - 12;
    let y = rect.bottom + 8;
    if (y + height > window.innerHeight - 12) y = rect.top - height - 8;
    tooltip.style.left = `${Math.max(12, Math.min(x, window.innerWidth - width - 12))}px`;
    tooltip.style.top = `${Math.max(12, Math.min(y, window.innerHeight - height - 12))}px`;
  }
  function scheduleInfoHide() {
    clearTimeout(hideInfoTimer);
    hideInfoTimer = setTimeout(() => { if (!insideTooltip && document.activeElement !== activeInfo) hideInfo(); }, 140);
  }
  function showInfo(icon) {
    const data = infoData.get(icon); if (!data) return;
    clearTimeout(hideInfoTimer);
    activeInfo?.removeAttribute('aria-describedby'); activeInfo = icon; tooltip.replaceChildren();
    const textElement = (tag, value, className) => { const el = document.createElement(tag); if (className) el.className = className; el.textContent = String(value); tooltip.append(el); };
    textElement('strong', data.heading);
    if (data.meta) textElement('div', data.meta, 'fd-tip-meta');
    let hasDetail = false;
    for (const [label, value] of data.sections || []) if (value !== undefined && value !== null && String(value).trim()) {
      hasDetail = true; textElement('div', label, 'fd-tip-label');
      const text = String(value); textElement('p', text.length > 700 ? text.slice(0, 697) + '…' : text);
    }
    if (!hasDetail) textElement('p', 'No additional details documented.');
    icon.setAttribute('aria-describedby', tooltip.id); tooltip.hidden = false; positionInfo();
  }
  function infoIcon(parent, x, y, data, selection) {
    // SVG title on any ancestor also produces a native hover tooltip over this icon.
    for (let owner = parent; owner && owner !== host; owner = owner.parentElement) {
      owner.removeAttribute('title');
      for (const child of [...owner.children]) if (child.localName === 'title') child.remove();
    }
    const icon = add(parent, 'g', { class: 'fd-info', transform: `translate(${x} ${y})`, tabindex: 0, role: 'button', 'aria-label': data.ariaLabel || `Information about ${data.heading}` });
    infoData.set(icon, data);
    add(icon, 'circle', { r: 10, fill: 'transparent', stroke: 'none' });
    add(icon, 'circle', { r: 7, fill: palette.pale, stroke: palette.accent, 'stroke-width': 1 });
    add(icon, 'text', { 'text-anchor': 'middle', y: 4, fill: palette.accent, 'font-size': 10, 'font-family': 'system-ui', 'font-weight': 700 }, 'i');
    icon.addEventListener('pointerdown', event => event.stopPropagation());
    const activate = event => {
      event.stopPropagation(); select(selection.kind, selection.id, selection.entityId, false);
      (options.onInspect || options.onSelect)?.({ kind: selection.kind, id: selection.id, ...(selection.entityId ? { entityId: selection.entityId } : {}) });
    };
    icon.addEventListener('click', activate);
    icon.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event); } });
    return icon;
  }
  function entityInfo(parent, entity, width) {
    infoIcon(parent, width - 19, 20, { heading: entity.name, meta: [entity.kind, entity.technology].filter(Boolean).join(' · '), sections: [['Summary', entity.summary], ['Description', entity.description], ['Source', entity.source?.path ? `${entity.source.path}${entity.source.line ? ':' + entity.source.line : ''}` : entity.source?.url]] }, { kind: 'entity', id: entity.id });
  }
  const onInfoOver = event => { const icon = event.target.closest?.('.fd-info'); if (icon && !icon.contains(event.relatedTarget)) showInfo(icon); };
  const onInfoOut = event => { const icon = event.target.closest?.('.fd-info'); if (icon && !icon.contains(event.relatedTarget)) scheduleInfoHide(); };
  const onInfoFocus = event => { const icon = event.target.closest?.('.fd-info'); if (icon) showInfo(icon); };
  const onInfoBlur = () => scheduleInfoHide();
  const onInfoEscape = event => { if (event.key === 'Escape' && activeInfo) { hideInfo(); event.stopPropagation(); } };
  tooltip.addEventListener('pointerenter', () => { insideTooltip = true; clearTimeout(hideInfoTimer); });
  tooltip.addEventListener('pointerleave', () => { insideTooltip = false; scheduleInfoHide(); });
  canvas.addEventListener('pointerover', onInfoOver); canvas.addEventListener('pointerout', onInfoOut); canvas.addEventListener('focusin', onInfoFocus); canvas.addEventListener('focusout', onInfoBlur);
  document.addEventListener('keydown', onInfoEscape, true); window.addEventListener('resize', positionInfo); window.addEventListener('scroll', positionInfo, true);
  let scale = 1, tx = 20, ty = 20, contentX = 0, contentY = 0, contentWidth = 600, contentHeight = 400, destroyed = false, focused = null, selected = null, drag = null;
  let layoutNodes = new Map(), layoutEdges = new Map(), layoutLabels = new Map(), messageLayouts = new Map(), placedRelationLabels = [], stateRoutes = new Map(), memberRoutes = new Map();
  let framing = 'overview';
  let entities, ids, relations, metrics, messages, renameInput = null, pendingConnection = null, connectionMode = false, refreshQueue = Promise.resolve(), suppressClickUntil = 0, endpointOverlay = null, endpointOwner = null;
  function loadModel() {
    entities = (diagram.entityIds || []).map(id => project.entities.find(e => e.id === id)).filter(Boolean);
    ids = new Set(entities.map(e => e.id));
    relations = (project.relations || []).filter(r => ids.has(r.source) && ids.has(r.target) && (!diagram.relationIds || diagram.relationIds.includes(r.id)));
    metrics = new Map(entities.map(entity => [entity.id, entityMetrics(entity, diagram)]));
    messages = (diagram.messages || []).filter(m => ids.has(m.from) && ids.has(m.to));
  }
  loadModel();
  function worldPoint(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left - tx) / scale, y: (event.clientY - rect.top - ty) / scale }; }
  function validConnection(source, target) {
    const transition = diagram.type === 'state' || drag?.kind === 'reconnect' && drag.connectionKind === 'relation' && relations.find(r => r.id === drag.id)?.kind === 'transition';
    return ids.has(source) && ids.has(target) && (!transition || entities.find(e => e.id === source)?.kind !== 'final' && entities.find(e => e.id === target)?.kind !== 'initial');
  }
  function targetAt(point) {
    for (const [id, node] of [...layoutNodes].reverse()) if (point.x >= node.x - 8 && point.x <= node.x + node.width + 8 && point.y >= node.y - 8 && point.y <= node.y + node.height + 8) return id;
    if (diagram.type === 'sequence') for (const [id, node] of layoutNodes) if (Math.abs(point.x - node.x - node.width / 2) <= 24 && point.y >= node.y && point.y <= contentHeight) return id;
    return null;
  }
  function restoreEndpointHandles() {
    if (!endpointOverlay) return;
    for (const handle of [...endpointOverlay.children]) { handle.classList.remove('fd-floating-edit-handle'); if (endpointOwner?.isConnected) endpointOwner.append(handle); }
    endpointOverlay.remove(); endpointOverlay = endpointOwner = null;
  }
  function showEndpointHandles(owner) {
    if (!options.editable || endpointOwner === owner || drag || pendingConnection) return;
    restoreEndpointHandles();
    const handles = [...owner.children].filter(el => el.classList.contains('fd-edit-handle') && el.querySelector('[data-reconnect-id]'));
    if (!handles.length) return;
    endpointOwner = owner; endpointOverlay = add(world, 'g', { 'data-edit-overlay': 'endpoint-handles', 'data-edit-control': 'true' });
    for (const handle of handles) { handle.classList.add('fd-floating-edit-handle'); endpointOverlay.append(handle); }
  }
  const onEditHover = event => {
    if (!options.editable || drag || pendingConnection || event.target.closest('[data-edit-control]')) return;
    const owner = event.target.closest('[data-relation-id], [data-message-id]');
    if (owner) showEndpointHandles(owner); else restoreEndpointHandles();
  };
  function clearGestureUI() { restoreEndpointHandles(); world.querySelectorAll('[data-edit-overlay]').forEach(el => el.remove()); world.querySelectorAll('.fd-drop-target').forEach(el => el.classList.remove('fd-drop-target')); host.classList.remove('fd-connecting'); }
  function beginHandle(event, data) {
    if (!options.editable || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); hideInfo(); clearGestureUI();
    drag = { ...data, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId); host.classList.add('fd-connecting'); drawConnectionPreview(worldPoint(event));
  }
  function editHandle(parent, point, attrs, label, data) {
    if (!options.editable) return;
    const handle = add(parent, 'g', { class: 'fd-edit-handle', transform: `translate(${point.x} ${point.y})`, 'data-edit-control': 'true', role: 'button', tabindex: 0, 'aria-label': label });
    add(handle, 'circle', { r: 11, fill: 'transparent' });
    add(handle, 'circle', { r: 5.5, fill: palette.panel, stroke: palette.accent, 'stroke-width': 1.8, 'vector-effect': 'non-scaling-stroke', ...attrs });
    handle.addEventListener('pointerdown', event => beginHandle(event, data));
    handle.addEventListener('click', event => event.stopPropagation());
    handle.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); options.onSelect?.(data.kind === 'connect' ? { kind: 'entity', id: data.source } : { kind: data.connectionKind, id: data.id }); } });
  }
  function nodeHandles(parent, entity, node) {
    if (!options.editable || diagram.type === 'state' && entity.kind === 'final') return;
    for (const [side, x, y] of [['top', node.width / 2, 0], ['right', node.width, node.height / 2], ['bottom', node.width / 2, node.height], ['left', 0, node.height / 2]]) editHandle(parent, { x, y }, { 'data-connect-from': entity.id, 'data-side': side }, `Create connection from ${entity.name} (${side})`, { kind: 'connect', source: entity.id, anchor: { x: node.x + x, y: node.y + y } });
  }
  function endpointHandles(parent, kind, item, start, end, points) {
    if (!options.editable) return;
    for (const [endpoint, point, fixed, adjacent] of [['source', start, end, points?.[1]], ['target', end, start, points?.at(-2)]]) {
      let position = point;
      if (kind === 'relation' && adjacent) { const length = Math.hypot(adjacent.x - point.x, adjacent.y - point.y) || 1, offset = Math.min(13, length / 3); position = { x: point.x + (adjacent.x - point.x) * offset / length, y: point.y + (adjacent.y - point.y) * offset / length }; }
      editHandle(parent, position, { 'data-reconnect-id': item.id, 'data-endpoint': endpoint, 'data-connection-kind': kind }, `Reconnect ${endpoint} of ${item.label || item.id}`, { kind: 'reconnect', connectionKind: kind, id: item.id, endpoint, fixed, source: kind === 'message' ? item.from : item.source, target: kind === 'message' ? item.to : item.target });
    }
  }
  function drawConnectionPreview(point, gesture = drag) {
    clearGestureUI(); host.classList.add('fd-connecting');
    const candidate = targetAt(point), source = gesture.kind === 'connect' || gesture.endpoint === 'target' ? gesture.source : candidate, target = gesture.kind === 'connect' || gesture.endpoint === 'target' ? candidate : gesture.target;
    gesture.dropEntityId = candidate && validConnection(source, target) ? candidate : null;
    if (gesture.dropEntityId) world.querySelectorAll('[data-entity-id]').forEach(el => { if (el.dataset.entityId === gesture.dropEntityId) el.classList.add('fd-drop-target'); });
    const overlay = add(world, 'g', { 'data-edit-overlay': 'connection', 'pointer-events': 'none' });
    const fixed = gesture.kind === 'connect' ? gesture.anchor : gesture.fixed;
    const start = gesture.kind === 'reconnect' && gesture.endpoint === 'source' ? point : fixed, end = gesture.kind === 'reconnect' && gesture.endpoint === 'source' ? fixed : point;
    add(overlay, 'path', { class: 'fd-connection-preview', d: `M${start.x} ${start.y}L${end.x} ${end.y}`, 'marker-end': `url(#${instance}-arrow)`, opacity: gesture.dropEntityId ? 1 : .65 });
  }
  function chooseConnectionEntity(id) {
    if (!pendingConnection) {
      if (diagram.type === 'state' && entities.find(e => e.id === id)?.kind === 'final') return;
      const node = layoutNodes.get(id); pendingConnection = { kind: 'connect', source: id, anchor: { x: node.x + node.width / 2, y: node.y + node.height } };
      drawConnectionPreview(pendingConnection.anchor, pendingConnection);
    } else if (validConnection(pendingConnection.source, id)) {
      const source = pendingConnection.source; pendingConnection = null; connectionMode = false; clearGestureUI();
      options.onConnect?.({ diagramId: diagram.id, kind: diagram.type === 'sequence' ? 'message' : 'relation', source, target: id });
    }
  }
  function enableNodeDrag(parent, entity, node) {
    if (!options.editable) return;
    parent.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('[data-member-id], .fd-info, [data-edit-control]')) return;
      event.stopPropagation(); hideInfo();
      drag = { kind: connectionMode ? 'pick-entity' : diagram.type === 'sequence' ? 'participant' : 'node', id: entity.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y, moved: false, element: parent, position: diagram.positions?.[entity.id] ? { ...diagram.positions[entity.id] } : null, positionsExisted: Object.hasOwn(diagram, 'positions') };
      // Keep a stationary click's native SVG target so double-click can rename it.
      // Capture begins only once this becomes a drag, rather than retargeting dblclick to the background.
    });
  }
  function renameItem(kind, id, element, entityId) {
    if (!options.editable || !options.onRename) return;
    const owner = kind === 'member' && entities.find(e => e.id === entityId);
    const item = kind === 'member' ? [...(owner?.fields || []), ...(owner?.methods || [])].find(m => m.id === id) : kind === 'entity' ? entities.find(e => e.id === id) : kind === 'relation' ? relations.find(r => r.id === id) : messages.find(m => m.id === id);
    if (!item) return;
    const oldValue = kind === 'entity' || kind === 'member' ? item.name : item.label;
    renameInput?.remove(); const input = document.createElement('input'); renameInput = input; input.className = 'fd-inline-rename'; input.value = oldValue; input.setAttribute('aria-label', `Rename ${kind}`);
    const rect = element.getBoundingClientRect(); input.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - 292))}px`; input.style.top = `${Math.max(12, Math.min(rect.top, innerHeight - 52))}px`;
    let finished = false;
    const finish = save => { if (finished) return; finished = true; const value = input.value.trim(); input.remove(); renameInput = null; if (save && value && value !== oldValue) options.onRename({ diagramId: diagram.id, kind, id, ...(entityId ? { entityId } : {}), value }); };
    input.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); finish(true); } if (event.key === 'Escape') finish(false); }); input.addEventListener('blur', () => finish(true)); document.body.append(input); input.focus(); input.select();
  }
  const updateTransform = () => { hideInfo(); world.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`); };
  function dimensions() { return { width: Math.max(100, host.clientWidth || 900), height: Math.max(100, host.clientHeight || 560) }; }
  function fit() {
    framing = 'overview';
    focused = null; updateFocus();
    const size = dimensions(); scale = Math.min(1.25, (size.width - 56) / Math.max(contentWidth, 1), (size.height - 58) / Math.max(contentHeight, 1));
    scale = Math.max(.025, scale); tx = (size.width - contentWidth * scale) / 2 - contentX * scale; ty = (size.height - contentHeight * scale) / 2 - contentY * scale; updateTransform();
  }
  function zoom(factor, x, y) {
    const size = dimensions(); x ??= size.width / 2; y ??= size.height / 2;
    const next = Math.max(.025, Math.min(4, scale * factor)); tx = x - (x - tx) * next / scale; ty = y - (y - ty) * next / scale; scale = next; updateTransform();
  }
  function select(kind, id, entityId, notify = true) {
    if (notify && connectionMode && kind === 'entity') { chooseConnectionEntity(id); return; }
    selected = { kind, id, entityId };
    if (kind === 'message') canvas.dataset.selectedMessageId = id; else delete canvas.dataset.selectedMessageId;
    updateFocus(); if (notify) options.onSelect?.({ kind, id, ...(entityId ? { entityId } : {}) });
  }
  function selectable(el, kind, id, label, entityId) {
    el.classList.add('fd-selectable'); el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); el.setAttribute('aria-label', label);
    el.dataset[`${kind}Id`] = id;
    if (entityId) el.dataset.ownerEntityId = entityId;
    el.addEventListener('click', event => { event.stopPropagation(); if (!el.dataset.suppressClick) select(kind, id, entityId); });
    el.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select(kind, id, entityId); } });
    if (options.editable) {
      // Bring overlapping cards forward, while keeping connection paths underneath cards.
      // Raising an entire edge would otherwise make a crossing line intercept card clicks.
      if (kind === 'entity') el.addEventListener('pointerenter', () => { if (el.parentNode === world && world.lastElementChild !== el) world.append(el); });
      el.addEventListener('dblclick', event => { if (event.target.closest('.fd-info, [data-edit-control]') || kind === 'entity' && event.target.closest('[data-member-id]')) return; event.stopPropagation(); renameItem(kind, id, el, entityId); });
      el.addEventListener('keydown', event => { if (event.key === 'F2') { event.preventDefault(); event.stopPropagation(); renameItem(kind, id, el, entityId); } });
    }
    return el;
  }
  function updateFocus() {
    const neighbors = new Set(focused ? [focused] : []);
    if (focused) {
      for (const relation of relations) if (relation.source === focused || relation.target === focused) { neighbors.add(relation.source); neighbors.add(relation.target); }
      for (const message of messages) if (message.from === focused || message.to === focused) { neighbors.add(message.from); neighbors.add(message.to); }
    }
    world.querySelectorAll('[data-entity-id], [data-relation-id], [data-message-id], [data-member-id], [data-owner-entity-id]').forEach(el => {
      let relevant = true;
      if (focused && el.dataset.entityId) relevant = neighbors.has(el.dataset.entityId);
      if (focused && el.dataset.ownerEntityId) relevant = neighbors.has(el.dataset.ownerEntityId);
      if (focused && el.dataset.relationId) { const r = relations.find(r => r.id === el.dataset.relationId); relevant = r && (r.source === focused || r.target === focused); }
      if (focused && el.dataset.messageId) { const m = messages.find(m => m.id === el.dataset.messageId); relevant = m && (m.from === focused || m.to === focused); }
      el.classList.toggle('fd-dim', !relevant);
      const isSelected = !!selected && (el.dataset[`${selected.kind}Id`] === selected.id) && (!selected.entityId || el.dataset.ownerEntityId === selected.entityId);
      el.classList.toggle('fd-selected', isSelected);
      if (el.classList.contains('fd-selectable')) { el.setAttribute('aria-pressed', String(isSelected)); el.dataset.selected = String(isSelected); }
    });
  }
  function focus(entityId) {
    framing = 'entity';
    focused = ids.has(entityId) ? entityId : null; updateFocus();
    const node = layoutNodes.get(entityId);
    if (node) {
      const size = dimensions(), table = diagram.type !== 'sequence' && metrics.get(entityId)?.table, readableNode = table || diagram.type === 'state';
      scale = Math.min(1.2, size.width / (node.width + 160), size.height / (node.height + 130));
      if (readableNode) scale = Math.max(.75, scale);
      tx = readableNode && node.width * scale > size.width - 56 ? 28 - node.x * scale : size.width / 2 - (node.x + node.width / 2) * scale;
      ty = readableNode && node.height * scale > size.height - 56 ? 28 - node.y * scale : size.height / 2 - (node.y + node.height / 2) * scale;
      updateTransform();
    }
  }
  function read() {
    if (diagram.type === 'class' && entities.length) {
      const central = [...entities].sort((a, b) => relations.filter(r => r.source === b.id || r.target === b.id).length - relations.filter(r => r.source === a.id || r.target === a.id).length)[0];
      focus(central.id);
    } else if (diagram.type === 'system' && entities.length) {
      const degree = id => relations.filter(r => r.source === id || r.target === id).length;
      const central = [...entities].sort((a, b) => degree(b.id) - degree(a.id))[0];
      const hub = layoutNodes.get(central.id), size = dimensions();
      if (!hub) { fit(); return; }
      const hx = hub.x + hub.width / 2, hy = hub.y + hub.height / 2;
      const connected = new Set(relations.filter(r => r.source === central.id || r.target === central.id).flatMap(r => [r.source, r.target]));
      const nodes = [...layoutNodes.values()], readableScale = .75;
      const viewWidth = size.width / readableScale, viewHeight = (size.height - 40) / readableScale;
      // Find a local window that retains the hub and the most readable nearby cards.
      // A simple nearest-neighbor bounding box can be dominated by a single distant edge.
      const xs = [hx - viewWidth / 2, ...nodes.flatMap(n => [n.x, n.x + n.width - viewWidth])];
      const ys = [hy - viewHeight / 2, ...nodes.flatMap(n => [n.y, n.y + n.height - viewHeight])];
      let best = { score: -Infinity, visible: [hub] };
      for (const x of xs) for (const y of ys) {
        if (hub.x < x || hub.x + hub.width > x + viewWidth || hub.y < y || hub.y + hub.height > y + viewHeight) continue;
        const visible = nodes.filter(n => n.x >= x - .1 && n.x + n.width <= x + viewWidth + .1 && n.y >= y - .1 && n.y + n.height <= y + viewHeight + .1);
        const score = visible.reduce((sum, n) => sum + 1 + (connected.has(n.id) ? .3 : 0), 0) - .2 * Math.hypot((x + viewWidth / 2 - hx) / viewWidth, (y + viewHeight / 2 - hy) / viewHeight);
        if (score > best.score) best = { score, visible };
      }
      const local = best.visible, left = Math.min(...local.map(n => n.x)), right = Math.max(...local.map(n => n.x + n.width));
      const top = Math.min(...local.map(n => n.y)), bottom = Math.max(...local.map(n => n.y + n.height));
      scale = Math.max(.75, Math.min(1, (size.width - 72) / (right - left + 40), (size.height - 72) / (bottom - top + 60)));
      const cx = (left + right) / 2, cy = (top + bottom) / 2;
      focused = null; updateFocus(); canvas.dataset.readHub = central.id;
      tx = size.width / 2 - cx * scale; ty = size.height / 2 - cy * scale; updateTransform();
    } else if (diagram.type === 'state') {
      fit();
      if (scale < .7 && entities.length) {
        const initial = entities.find(e => e.kind === 'initial');
        const firstTransition = initial && relations.find(r => r.source === initial.id && r.target !== initial.id);
        const start = entities.find(e => e.id === firstTransition?.target) || entities.find(e => e.kind === 'state') || entities.find(e => !['initial', 'final'].includes(e.kind)) || entities[0];
        focus(start.id);
        // Begin at the top of a vertical flow so the next transitions remain visible.
        const node = layoutNodes.get(start.id);
        if (node && (!diagram.direction || diagram.direction === 'DOWN')) {
          ty = 40 - node.y * scale; updateTransform();
        }
      }
    } else if (diagram.type === 'sequence') {
      focused = null; updateFocus();
      const size = dimensions(); scale = Math.max(.75, Math.min(1.1, (size.width - 56) / contentWidth));
      tx = contentWidth * scale <= size.width - 56 ? (size.width - contentWidth * scale) / 2 : 28;
      ty = 28 - 26 * scale; updateTransform();
    } else fit();
    framing = 'read';
  }
  function focusMessage(messageId) {
    const row = messageLayouts.get(messageId); if (!row) return false;
    focused = null; select('message', messageId, undefined, false); framing = 'message';
    const size = dimensions();
    const left = Math.min(row.x1, row.x2) - 35, right = contentWidth - 20;
    const fitWithNote = (size.width - 56) / Math.max(1, right - left);
    scale = Math.max(.75, Math.min(1.1, fitWithNote, (size.height - 70) / (row.height + 70)));
    if ((right - left) * scale <= size.width - 56) tx = (size.width - (right - left) * scale) / 2 - left * scale;
    else {
      const messageRight = Math.max(row.x1, row.x2) + (row.x1 === row.x2 ? 85 : 35);
      const messageWidth = messageRight - left;
      scale = Math.max(.65, Math.min(scale, (size.width - 56) / messageWidth));
      tx = size.width / 2 - (left + messageRight) / 2 * scale;
    }
    ty = size.height / 2 - (row.y + row.height / 2) * scale;
    canvas.dataset.selectedMessageId = messageId; updateTransform(); return true;
  }
  function drawIcon(parent, kind, x, y) {
    const icon = add(parent, 'g', { transform: `translate(${x} ${y})`, fill: 'none', stroke: palette.accent, 'stroke-width': 1.6, 'stroke-linecap': 'round' });
    if (kind === 'database') { add(icon, 'path', { d: 'M0 5C0-1 22-1 22 5V20C22 26 0 26 0 20ZM0 5C0 11 22 11 22 5M0 12C0 18 22 18 22 12' }); }
    else if (kind === 'actor') { add(icon, 'circle', { cx: 11, cy: 4, r: 4 }); add(icon, 'path', { d: 'M11 8V18M3 12H19M11 18L4 25M11 18L18 25' }); }
    else if (kind === 'queue') { [0, 8, 16].forEach(x => add(icon, 'rect', { x, y: 3, width: 5, height: 18, rx: 1 })); }
    else { add(icon, 'rect', { x: 0, y: 1, width: 23, height: 22, rx: kind === 'external' ? 10 : 5 }); add(icon, 'path', { d: kind === 'external' ? 'M1 12H22M11 1C4 7 4 17 11 23M12 1C19 7 19 17 12 23' : 'M6 8H17M6 13H17M6 18H12' }); }
  }
  function renderNode(entity, node, parent = world) {
    const metric = metrics.get(entity.id), tone = toneFor(entity.tone);
    const g = selectable(add(parent, 'g', { transform: `translate(${node.x} ${node.y})` }), 'entity', entity.id, `${entity.kind}: ${entity.name}`);
    g.dataset.tone = tone.key;
    title(g, entity.description || entity.summary || entity.name);
    if (metric.stateShape) {
      g.dataset.stateKind = metric.stateShape;
      const attrs = { class: 'fd-node-body', fill: tone.fill, stroke: tone.key === 'neutral' ? palette.muted : tone.stroke, 'stroke-width': 1.5 };
      if (metric.stateShape === 'choice') {
        add(g, 'polygon', { ...attrs, points: `${node.width / 2},0 ${node.width},${node.height / 2} ${node.width / 2},${node.height} 0,${node.height / 2}` });
        lines(g, metric.name, node.width / 2, node.height / 2 - (metric.name.length - 1) * 9 + 4, { size: 13, weight: 650, leading: 18, attrs: { 'text-anchor': 'middle' } });
        infoIcon(g, node.width - 4, 13, { heading: entity.name, meta: 'Decision', sections: [['Summary', entity.summary], ['Description', entity.description]] }, { kind: 'entity', id: entity.id });
      } else if (metric.stateShape === 'initial' || metric.stateShape === 'final') {
        add(g, 'circle', { cx: 14, cy: 14, r: 14, fill: 'transparent' });
        if (metric.stateShape === 'final') {
          add(g, 'circle', { ...attrs, cx: 14, cy: 14, r: 12 });
          add(g, 'circle', { cx: 14, cy: 14, r: 7, fill: tone.key === 'neutral' ? palette.ink : tone.stroke });
        } else add(g, 'circle', { ...attrs, cx: 14, cy: 14, r: 11, fill: tone.key === 'neutral' ? palette.ink : tone.stroke });
        infoIcon(g, 43, 14, { heading: entity.name, meta: metric.stateShape === 'initial' ? 'Initial state' : 'Final state', sections: [['Summary', entity.summary], ['Description', entity.description]] }, { kind: 'entity', id: entity.id });
      } else {
        add(g, 'rect', { ...attrs, width: node.width, height: node.height, rx: 16 });
        lines(g, metric.name, 16, 28, { size: 14, leading: 18, weight: 650 });
        if (metric.summary.length) lines(g, metric.summary, 16, 34 + metric.name.length * 18, { size: 11, leading: 15, fill: palette.muted });
        entityInfo(g, entity, node.width);
      }
    } else {
    add(g, 'rect', { class: 'fd-node-body', width: node.width, height: node.height, rx: 9, fill: tone.fill, stroke: tone.stroke, 'stroke-width': 1.2 });
    if (metric.table) {
      add(g, 'path', { d: `M9 0H${node.width - 9}Q${node.width} 0 ${node.width} 9V${metric.head}H0V9Q0 0 9 0`, fill: palette.pale });
      lines(g, [entity.kind === 'interface' ? '«interface»' : entity.kind.toUpperCase()], 16, 21, { size: 10, weight: 650, fill: palette.accent });
      lines(g, metric.name, 16, 44, { size: 16, leading: 21, weight: 650 });
      if (metric.summary.length) lines(g, metric.summary, 16, 44 + metric.name.length * 21, { fill: palette.muted });
      let cx = 0;
      metric.columns.forEach((column, i) => { lines(g, metric.columnLabels[i], cx + 10, metric.head + 19, { size: 10, leading: 14, weight: 650, fill: palette.muted }); cx += metric.widths[i]; });
      for (const row of metric.rows) {
        if (row.section) { add(g, 'rect', { x: 1, y: row.y, width: node.width - 2, height: row.height, fill: palette.bg }); lines(g, [row.section.toUpperCase()], 11, row.y + 17, { size: 9, weight: 700, fill: palette.muted }); }
        else if (row.empty) lines(g, ['No members documented'], 12, row.y + 25, { size: 11, fill: palette.muted });
        else {
          const member = row.member;
          const rg = selectable(add(g, 'g', { class: 'fd-member' }), 'member', member.id, `${entity.name}.${member.name}: ${member.purpose || member.type || 'View details'}`, entity.id);
          title(rg, [member.name, member.type, member.purpose, member.details].filter(Boolean).join('\n'));
          add(rg, 'rect', { class: 'fd-row-bg', x: 1, y: row.y, width: node.width - 2, height: row.height, fill: 'transparent' });
          add(rg, 'line', { x1: 1, x2: node.width - 1, y1: row.y + row.height, y2: row.y + row.height, stroke: palette.line });
          let x = 0;
          row.cells.forEach((cell, i) => { lines(rg, cell, x + 10, row.y + 22, { size: 11, leading: 16, mono: metric.columns[i].key === 'type', weight: metric.columns[i].key === 'name' ? 550 : 400, fill: metric.columns[i].key === 'type' ? palette.accent : palette.ink }); x += metric.widths[i]; });
          infoIcon(rg, node.width - 22, row.y + 17, {
            heading: `${entity.name}.${member.name}`, ariaLabel: `Information about ${member.name}`, meta: member.type,
            sections: [['Purpose', member.purpose], ['Details', member.details], ['Visibility', member.visibility], ...Object.entries(member.values || {}).map(([key, value]) => [metric.columns.find(c => c.key === key)?.label || key, value])]
          }, { kind: 'member', id: member.id, entityId: entity.id });
        }
      }
    } else {
      drawIcon(g, entity.kind, 16, 16);
      lines(g, [entity.kind.toUpperCase()], 52, 27, { size: 9, weight: 650, fill: palette.accent });
      lines(g, metric.name, 16, 59, { size: 15, leading: 19, weight: 650 });
      const summaryY = 59 + metric.name.length * 19 + 4;
      if (metric.summary.length) lines(g, metric.summary, 16, summaryY, { fill: palette.muted });
      if (entity.technology) lines(g, [entity.technology], 16, node.height - 15, { size: 10, fill: palette.accent, mono: true });
    }
    entityInfo(g, entity, node.width);
    }
    nodeHandles(g, entity, node); enableNodeDrag(g, entity, node);
    return g;
  }
  function borderPoint(node, target, memberId) {
    const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
    const dx = target.x - cx, dy = target.y - cy;
    if (memberId) {
      const metric = metrics.get(node.id), row = metric?.rows?.find(r => r.member?.id === memberId);
      if (row) return { x: node.x + (dx >= 0 ? node.width : 0), y: node.y + row.y + row.height / 2 };
    }
    const shape = metrics.get(node.id)?.stateShape;
    if (shape === 'choice') {
      const k = 1 / (Math.abs(dx) / (node.width / 2) + Math.abs(dy) / (node.height / 2) || 1);
      return { x: cx + dx * k, y: cy + dy * k };
    }
    if (shape === 'initial' || shape === 'final') {
      const k = (shape === 'initial' ? 11 : 12) / (Math.hypot(dx, dy) || 1);
      return { x: cx + dx * k, y: cy + dy * k };
    }
    const k = Math.min(node.width / 2 / (Math.abs(dx) || .001), node.height / 2 / (Math.abs(dy) || .001));
    return { x: cx + dx * k, y: cy + dy * k };
  }
  function relationPoints(relation) {
    if (diagram.type === 'state' && stateRoutes.has(relation.id)) return stateRoutes.get(relation.id);
    if (memberRoutes.has(relation.id)) return memberRoutes.get(relation.id);
    const a = layoutNodes.get(relation.source), b = layoutNodes.get(relation.target);
    if (!a || !b) return [];
    if (a === b) {
      const sy = metrics.get(a.id)?.stateShape ? a.y + a.height / 2 : a.y + 25;
      const start = borderPoint(a, { x: a.x + a.width + 38, y: sy });
      return [start, { x: a.x + a.width + 38, y: sy }, { x: a.x + a.width + 38, y: a.y - 26 }, { x: a.x + a.width / 2, y: a.y - 26 }, borderPoint(a, { x: a.x + a.width / 2, y: a.y - 26 })];
    }
    const stored = layoutEdges.get(relation.id);
    if (usesElkRoute(relation)) {
      const points = stored.map(point => ({ ...point }));
      for (const [node, index, adjacent] of [[a, 0, 1], [b, points.length - 1, points.length - 2]]) if (['choice', 'initial', 'final'].includes(metrics.get(node.id)?.stateShape)) points[index] = borderPoint(node, points[adjacent]);
      return points;
    }
    const start = borderPoint(a, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, relation.sourceMember);
    const end = borderPoint(b, { x: a.x + a.width / 2, y: a.y + a.height / 2 }, relation.targetMember);
    if (Math.abs(start.x - end.x) > Math.abs(start.y - end.y)) { const mid = (start.x + end.x) / 2; return [start, { x: mid, y: start.y }, { x: mid, y: end.y }, end]; }
    const mid = (start.y + end.y) / 2; return [start, { x: start.x, y: mid }, { x: end.x, y: mid }, end];
  }
  function usesElkRoute(relation) { return relation.source !== relation.target && layoutEdges.has(relation.id) && !diagram.positions?.[relation.source] && !diagram.positions?.[relation.target] && !relation.sourceMember && !relation.targetMember; }
  function relationLabelMetrics(relation) {
    const labelLines = wrap(relation.label, 150, 11);
    if (relation.kind === 'transition') {
      pixelContext.font = '400 11px Inter, ui-sans-serif, system-ui, sans-serif';
      const textWidth = Math.ceil(Math.max(...labelLines.map(line => pixelContext.measureText(line).width)));
      return { labelLines, textWidth, width: textWidth + 38, height: Math.max(24, labelLines.length * 15 + 8) };
    }
    return { labelLines, width: Math.min(166, Math.max(...labelLines.map(l => l.length)) * 6 + 12), height: labelLines.length * 15 + 8 };
  }
  function tidyPoints(points) {
    const result = [];
    for (const point of points) {
      if (result.length && Math.hypot(point.x - result.at(-1).x, point.y - result.at(-1).y) < .1) continue;
      while (result.length > 1) {
        const a = result.at(-2), b = result.at(-1);
        if (Math.abs((b.x - a.x) * (point.y - b.y) - (b.y - a.y) * (point.x - b.x)) > .01 || (b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y) < 0) break;
        result.pop();
      }
      result.push({ ...point });
    }
    return result;
  }
  function hasReverseBend(path) {
    return path.slice(2).some((point, index) => { const u = path[index], v = path[index + 1]; return Math.abs((v.x - u.x) * (point.y - v.y) - (v.y - u.y) * (point.x - v.x)) < .1 && (v.x - u.x) * (point.x - v.x) + (v.y - u.y) * (point.y - v.y) < 0; });
  }
  function segmentIntersectsBox(a, b, box, padding = 0) {
    const left = box.x - padding, right = box.x + box.width + padding, top = box.y - padding, bottom = box.y + box.height + padding;
    if (Math.abs(a.x - b.x) < .1) return a.x > left + .1 && a.x < right - .1 && Math.max(a.y, b.y) > top + .1 && Math.min(a.y, b.y) < bottom - .1;
    if (Math.abs(a.y - b.y) < .1) return a.y > top + .1 && a.y < bottom - .1 && Math.max(a.x, b.x) > left + .1 && Math.min(a.x, b.x) < right - .1;
    return true;
  }
  function orthogonalGridPath(start, end, nodes, sourceSide, targetSide) {
    // Visibility grid follows obstacle boundaries; direction-aware search avoids needless elbows.
    const padding = 16, xs = [...new Set([start.x, end.x, ...nodes.flatMap(n => [n.x - padding, n.x + n.width + padding])])].sort((a, b) => a - b), ys = [...new Set([start.y, end.y, ...nodes.flatMap(n => [n.y - padding, n.y + n.height + padding])])].sort((a, b) => a - b);
    const width = xs.length, size = width * ys.length, blocked = new Uint8Array(size);
    const point = index => ({ x: xs[index % width], y: ys[Math.floor(index / width)] });
    for (let i = 0; i < size; i++) { const p = point(i); blocked[i] = nodes.some(n => p.x > n.x - padding + .1 && p.x < n.x + n.width + padding - .1 && p.y > n.y - padding + .1 && p.y < n.y + n.height + padding - .1) ? 1 : 0; }
    const source = ys.indexOf(start.y) * width + xs.indexOf(start.x), target = ys.indexOf(end.y) * width + xs.indexOf(end.x);
    if (blocked[source] || blocked[target]) return null;
    const distance = new Float64Array(size * 5).fill(Infinity), previous = new Int32Array(size * 5).fill(-1), heap = [];
    const push = value => { heap.push(value); let i = heap.length - 1; while (i) { const parent = (i - 1) >> 1; if (heap[parent][0] <= value[0]) break; heap[i] = heap[parent]; i = parent; } heap[i] = value; };
    const pop = () => { const first = heap[0], last = heap.pop(); if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0]) child++; if (heap[child][0] >= last[0]) break; heap[i] = heap[child]; i = child; } heap[i] = last; } return first; };
    const visibility = new Map(); distance[source * 5] = 0; push([0, source * 5]);
    while (heap.length) {
      const [cost, state] = pop(); if (cost !== distance[state]) continue;
      const index = Math.floor(state / 5), direction = state % 5;
      if (index === target && direction !== (targetSide > 0 ? 1 : 2)) { const path = []; for (let cursor = state; cursor !== -1; cursor = previous[cursor]) path.push(point(Math.floor(cursor / 5))); return tidyPoints(path.reverse()); }
      const x = index % width, y = Math.floor(index / width), a = point(index);
      for (const [next, nextDirection] of [[x > 0 ? index - 1 : -1, 2], [x < width - 1 ? index + 1 : -1, 1], [y > 0 ? index - width : -1, 4], [y < ys.length - 1 ? index + width : -1, 3]]) {
        if (next < 0 || blocked[next]) continue;
        if (index === source && nextDirection === (sourceSide > 0 ? 2 : 1)) continue;
        const key = Math.min(index, next) + ':' + Math.max(index, next), b = point(next);
        if (!visibility.has(key)) visibility.set(key, !nodes.some(node => segmentIntersectsBox(a, b, node, padding)));
        if (!visibility.get(key)) continue;
        const nextState = next * 5 + nextDirection, turn = direction && (direction <= 2) !== (nextDirection <= 2);
        const nextCost = cost + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (turn ? 28 : 0);
        if (nextCost < distance[nextState]) { distance[nextState] = nextCost; previous[nextState] = state; push([nextCost, nextState]); }
      }
    }
    return null;
  }
  function routeMemberRelation(relation) {
    const a = layoutNodes.get(relation.source), b = layoutNodes.get(relation.target); if (!a || !b) return [];
    const rowCenter = (node, id) => { const row = metrics.get(node.id)?.rows?.find(r => r.member?.id === id); return row ? node.y + row.y + row.height / 2 : node.y + node.height / 2; };
    const ay = rowCenter(a, relation.sourceMember), by = rowCenter(b, relation.targetMember), nodes = [...layoutNodes.values()];
    const preferred = b.x + b.width / 2 >= a.x + a.width / 2 ? 1 : -1;
    let best = null, bestCost = Infinity;
    for (const sourceSide of [preferred, -preferred]) for (const targetSide of [-preferred, preferred]) for (const [sourceDepth, targetDepth] of [[32, 40], [56, 64], [80, 88], [32, 64], [56, 40]]) {
      const start = { x: sourceSide > 0 ? a.x + a.width : a.x, y: ay }, boundary = { x: targetSide > 0 ? b.x + b.width : b.x, y: by };
      const end = { x: boundary.x + targetSide * 7, y: by }, s = { x: start.x + sourceSide * sourceDepth, y: ay }, t = { x: boundary.x + targetSide * targetDepth, y: by };
      if (nodes.some(n => n.id !== a.id && segmentIntersectsBox(start, s, n, 8)) || nodes.some(n => n.id !== b.id && segmentIntersectsBox(t, end, n, 8))) continue;
      const cores = [[s, t], [s, { x: t.x, y: s.y }, t], [s, { x: s.x, y: t.y }, t], [s, { x: (s.x + t.x) / 2, y: s.y }, { x: (s.x + t.x) / 2, y: t.y }, t]];
      const clear = cores.map(tidyPoints).filter(path => !hasReverseBend(tidyPoints([start, ...path, end])) && !path.slice(1).some((point, index) => nodes.some(n => segmentIntersectsBox(path[index], point, n, 16))));
      if (!clear.length) { const grid = orthogonalGridPath(s, t, nodes, sourceSide, targetSide); if (grid) clear.push(grid); }
      for (const core of clear) {
        const path = tidyPoints([start, ...core, end]);
        if (hasReverseBend(path)) continue;
        let cost = (path.length - 2) * 28 + (sourceSide !== preferred ? 60 : 0) + (targetSide !== -preferred ? 60 : 0);
        path.slice(1).forEach((point, index) => { cost += Math.abs(point.x - path[index].x) + Math.abs(point.y - path[index].y); });
        // Choose distinct corridors for simultaneous key links, rather than nearly
        // coincident independent shortest paths which look like one merged trunk.
        for (const previous of memberRoutes.values()) for (let i = 1; i < path.length; i++) for (let j = 1; j < previous.length; j++) {
          const p = path[i - 1], q = path[i], r = previous[j - 1], u = previous[j];
          const vertical = Math.abs(p.x - q.x) < .1 && Math.abs(r.x - u.x) < .1, horizontal = Math.abs(p.y - q.y) < .1 && Math.abs(r.y - u.y) < .1;
          if (!vertical && !horizontal) continue;
          const gap = vertical ? Math.abs(p.x - r.x) : Math.abs(p.y - r.y);
          if (gap >= 28) continue;
          const overlap = vertical ? Math.min(Math.max(p.y, q.y), Math.max(r.y, u.y)) - Math.max(Math.min(p.y, q.y), Math.min(r.y, u.y)) : Math.min(Math.max(p.x, q.x), Math.max(r.x, u.x)) - Math.max(Math.min(p.x, q.x), Math.min(r.x, u.x));
          if (overlap > 8) cost += (overlap - 8) * (1 - gap / 28) * 8;
        }
        if (cost < bestCost) { bestCost = cost; best = path; }
      }
    }
    if (best) return best;
    const start = borderPoint(a, { x: b.x + b.width / 2, y: by }, relation.sourceMember), end = borderPoint(b, { x: a.x + a.width / 2, y: ay }, relation.targetMember), lane = Math.max(...nodes.map(n => n.y + n.height)) + 32;
    return tidyPoints([start, { x: start.x + preferred * 32, y: start.y }, { x: start.x + preferred * 32, y: lane }, { x: end.x - preferred * 40, y: lane }, { x: end.x - preferred * 40, y: end.y }, end]);
  }
  function statePort(node, other, elkPoint) {
    const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
    const sides = [{ side: 'W', distance: Math.abs((elkPoint?.x ?? Infinity) - node.x), nx: -1, ny: 0 }, { side: 'E', distance: Math.abs((elkPoint?.x ?? Infinity) - node.x - node.width), nx: 1, ny: 0 }, { side: 'N', distance: Math.abs((elkPoint?.y ?? Infinity) - node.y), nx: 0, ny: -1 }, { side: 'S', distance: Math.abs((elkPoint?.y ?? Infinity) - node.y - node.height), nx: 0, ny: 1 }];
    let side;
    if (elkPoint) side = sides.sort((a, b) => a.distance - b.distance)[0];
    else { const dx = other.x + other.width / 2 - cx, dy = other.y + other.height / 2 - cy; side = sides.find(s => Math.abs(dx) > Math.abs(dy) ? s.side === (dx >= 0 ? 'E' : 'W') : s.side === (dy >= 0 ? 'S' : 'N')); }
    const shape = metrics.get(node.id)?.stateShape;
    let point;
    if (['choice', 'initial', 'final'].includes(shape)) point = borderPoint(node, { x: cx + side.nx * 1000, y: cy + side.ny * 1000 });
    else point = { x: side.nx ? cx + side.nx * node.width / 2 : Math.max(node.x + 24, Math.min(node.x + node.width - 24, elkPoint?.x ?? cx)), y: side.ny ? cy + side.ny * node.height / 2 : Math.max(node.y + 24, Math.min(node.y + node.height - 24, elkPoint?.y ?? cy)) };
    return { ...point, nx: side.nx, ny: side.ny };
  }
  function routeStateRelation(relation) {
    const a = layoutNodes.get(relation.source), b = layoutNodes.get(relation.target); if (!a || !b) return [];
    const stored = usesElkRoute(relation) ? layoutEdges.get(relation.id) : null;
    let source = statePort(a, b, a === b ? { x: a.x + a.width, y: a.y + a.height / 2 } : stored?.[0]);
    let target = statePort(b, a, a === b ? { x: a.x + a.width / 2, y: a.y } : stored?.at(-1));
    const horizontal = diagram.direction === 'RIGHT';
    const backward = (from, to) => horizontal ? to.x + to.width / 2 < from.x + from.width / 2 - 16 : to.y + to.height / 2 < from.y + from.height / 2 - 16;
    const returnSide = (from, to) => metrics.get(from.id)?.stateShape === 'choice' ? (horizontal ? 'S' : 'E') : horizontal ? (from.y + from.height / 2 < to.y + to.height / 2 ? 'N' : 'S') : (from.x + from.width / 2 < to.x + to.width / 2 ? 'W' : 'E');
    let reciprocalLane = false;
    if (a !== b && metrics.get(a.id)?.stateShape === 'state' && metrics.get(b.id)?.stateShape === 'state' && relations.some(r => r.id !== relation.id && r.source === relation.target && r.target === relation.source)) {
      const dx = b.x + b.width / 2 - a.x - a.width / 2, dy = b.y + b.height / 2 - a.y - a.height / 2;
      if (Math.abs(dy) < Math.min(a.height, b.height) / 3 && Math.abs(dx) > Math.abs(dy)) {
        const side = dx > 0 ? 1 : -1, offset = -side * Math.max(6, Math.min(14, (Math.min(a.height, b.height) - 48) / 2));
        source = statePort(a, b, { x: side > 0 ? a.x + a.width : a.x, y: a.y + a.height / 2 + offset });
        target = statePort(b, a, { x: side > 0 ? b.x : b.x + b.width, y: b.y + b.height / 2 + offset }); reciprocalLane = true;
      } else if (Math.abs(dx) < Math.min(a.width, b.width) / 3 && Math.abs(dy) > Math.abs(dx)) {
        const side = dy > 0 ? 1 : -1, offset = -side * 14;
        source = statePort(a, b, { x: a.x + a.width / 2 + offset, y: side > 0 ? a.y + a.height : a.y });
        target = statePort(b, a, { x: b.x + b.width / 2 + offset, y: side > 0 ? b.y : b.y + b.height }); reciprocalLane = true;
      }
    }
    if (!reciprocalLane && a !== b && backward(a, b)) {
      // Return paths leave the side of the flow, keeping the main decision entry distinct.
      const side = returnSide(a, b);
      const incoming = relations.filter(r => {
        const from = layoutNodes.get(r.source), to = layoutNodes.get(r.target);
        return to?.id === b.id && from && from !== to && backward(from, to) && returnSide(from, to) === side;
      }).sort((first, second) => {
        const u = layoutNodes.get(first.source), v = layoutNodes.get(second.source);
        // Nest longer return loops outside shorter ones instead of crossing at the target.
        return horizontal ? v.x + v.width / 2 - u.x - u.width / 2 : v.y + v.height / 2 - u.y - u.height / 2;
      });
      const slot = (Math.max(0, incoming.findIndex(r => r.id === relation.id)) + 1) / (incoming.length + 1);
      const pointOnSide = (node, fraction) => ({ x: side === 'W' ? node.x : side === 'E' ? node.x + node.width : node.x + node.width * fraction, y: side === 'N' ? node.y : side === 'S' ? node.y + node.height : node.y + node.height * fraction });
      source = statePort(a, b, pointOnSide(a, .5)); target = statePort(b, a, pointOnSide(b, slot));
    } else if (!reciprocalLane && a !== b) {
      if (!horizontal && source.ny && target.ny && metrics.get(b.id)?.stateShape === 'choice' && target.x >= a.x + 24 && target.x <= a.x + a.width - 24) source.x = target.x;
      if (horizontal && source.nx && target.nx && metrics.get(b.id)?.stateShape === 'choice' && target.y >= a.y + 24 && target.y <= a.y + a.height - 24) source.y = target.y;
    }
    const start = { x: source.x, y: source.y }, end = { x: target.x + target.nx * 7, y: target.y + target.ny * 7 };
    const s = { x: source.x + source.nx * 36, y: source.y + source.ny * 36 }, t = { x: target.x + target.nx * 40, y: target.y + target.ny * 40 };
    // Neighboring ports may be closer than two full approach stubs: share one clear lane.
    if (source.nx && source.nx === -target.nx && Math.abs(source.x - target.x) < 80) s.x = t.x = (source.x + target.x) / 2;
    if (source.ny && source.ny === -target.ny && Math.abs(source.y - target.y) < 80) s.y = t.y = (source.y + target.y) / 2;
    const nodes = [...layoutNodes.values()], left = Math.min(...nodes.map(n => n.x)) - 34, right = Math.max(...nodes.map(n => n.x + n.width)) + 34, top = Math.min(...nodes.map(n => n.y)) - 34, bottom = Math.max(...nodes.map(n => n.y + n.height)) + 34;
    const cores = [[s, t], [s, { x: t.x, y: s.y }, t], [s, { x: s.x, y: t.y }, t]];
    for (const x of [(s.x + t.x) / 2, left, right]) cores.push([s, { x, y: s.y }, { x, y: t.y }, t]);
    for (const y of [(s.y + t.y) / 2, top, bottom]) cores.push([s, { x: s.x, y }, { x: t.x, y }, t]);
    if (stored?.length > 2) {
      const middle = stored.slice(1, -1), first = middle[0], last = middle.at(-1);
      cores.push([s, source.nx ? { x: first.x, y: s.y } : { x: s.x, y: first.y }, ...middle, target.nx ? { x: last.x, y: t.y } : { x: t.x, y: last.y }, t]);
    }
    let best = null, bestScore = Infinity;
    for (const core of cores) {
      const clean = tidyPoints(core);
      if (clean.slice(1).some((point, i) => nodes.some(node => segmentIntersectsBox(clean[i], point, node, 10)))) continue;
      const points = tidyPoints([start, ...clean, end]);
      if (points.slice(1).some((point, i) => nodes.some(node => {
        // A dot sits slightly inside its rectangular ELK bounds; allow only its own
        // outward attachment segment, while checking all other nodes normally.
        if (i === 0 && node.id === a.id || i === points.length - 2 && node.id === b.id) return false;
        return segmentIntersectsBox(points[i], point, node);
      }))) continue;
      let score = (points.length - 2) * 34;
      points.slice(1).forEach((point, i) => { score += Math.hypot(point.x - points[i].x, point.y - points[i].y); });
      // Avoid opposite transitions silently sharing the same line.
      for (const existing of stateRoutes.values()) for (let i = 1; i < points.length; i++) for (let j = 1; j < existing.length; j++) {
        const p = points[i - 1], q = points[i], r = existing[j - 1], u = existing[j];
        if (Math.abs(p.x - q.x) < .1 && Math.abs(r.x - u.x) < .1 && Math.abs(p.x - r.x) < 8) score += Math.max(0, Math.min(Math.max(p.y, q.y), Math.max(r.y, u.y)) - Math.max(Math.min(p.y, q.y), Math.min(r.y, u.y))) * 3;
        if (Math.abs(p.y - q.y) < .1 && Math.abs(r.y - u.y) < .1 && Math.abs(p.y - r.y) < 8) score += Math.max(0, Math.min(Math.max(p.x, q.x), Math.max(r.x, u.x)) - Math.max(Math.min(p.x, q.x), Math.min(r.x, u.x))) * 3;
      }
      if (score < bestScore) { best = points; bestScore = score; }
    }
    // The original ELK corridor remains a safe fallback for unusually dense arrangements.
    return best || tidyPoints(stored || [start, s, { x: t.x, y: s.y }, t, end]);
  }
  function roundedPath(points) {
    if (!points.length) return '';
    let d = `M${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], b = points[i], c = points[i + 1];
      const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y), radius = Math.min(8, before / 2, after / 2);
      if (!radius) continue;
      const enter = { x: b.x + (a.x - b.x) * radius / before, y: b.y + (a.y - b.y) * radius / before }, exit = { x: b.x + (c.x - b.x) * radius / after, y: b.y + (c.y - b.y) * radius / after };
      d += `L${enter.x} ${enter.y}Q${b.x} ${b.y} ${exit.x} ${exit.y}`;
    }
    return d + `L${points.at(-1).x} ${points.at(-1).y}`;
  }
  function fallbackLabelPosition(points, width, height, besideRoute = false) {
    const segments = points.slice(1).map((b, i) => ({ a: points[i], b, length: Math.hypot(b.x - points[i].x, b.y - points[i].y) })).sort((a, b) => b.length - a.length);
    const candidates = [];
    for (const segment of segments) {
      const cx = (segment.a.x + segment.b.x) / 2, cy = (segment.a.y + segment.b.y) / 2;
      const horizontal = Math.abs(segment.a.x - segment.b.x) >= Math.abs(segment.a.y - segment.b.y);
      const distance = (horizontal ? height : width) / 2 + 10;
      for (const offset of besideRoute ? [-distance, distance, -distance * 2, distance * 2] : [0, -height - 8, height + 8, -height * 2 - 16, height * 2 + 16]) {
        for (const fraction of besideRoute ? [.5, .3, .7] : [.5]) {
          const px = segment.a.x + (segment.b.x - segment.a.x) * fraction, py = segment.a.y + (segment.b.y - segment.a.y) * fraction;
          candidates.push({ x: px - width / 2 + (horizontal ? 0 : offset), y: py - height / 2 + (horizontal ? offset : 0), width, height });
        }
      }
    }
    const intersection = (a, b) => Math.max(0, Math.min(a.x + a.width + 4, b.x + b.width) - Math.max(a.x - 4, b.x)) * Math.max(0, Math.min(a.y + a.height + 4, b.y + b.height) - Math.max(a.y - 4, b.y));
    let best = candidates[0], bestScore = Infinity;
    for (const candidate of candidates) {
      let score = [...layoutNodes.values()].reduce((sum, node) => sum + intersection(candidate, node) * 3, 0) + placedRelationLabels.reduce((sum, box) => sum + intersection(candidate, box), 0);
      if (besideRoute) for (const route of stateRoutes.values()) for (let i = 1; i < route.length; i++) if (segmentIntersectsBox(route[i - 1], route[i], candidate, 3)) score += 100000;
      if (score < bestScore) { best = candidate; bestScore = score; }
      if (score === 0) break;
    }
    return best || { x: 0, y: 0, width, height };
  }
  function renderMemberMultiplicity(parent, endpoint, value, point, node) {
    pixelContext.font = '650 10px Inter, ui-sans-serif, system-ui, sans-serif';
    const width = Math.ceil(pixelContext.measureText(String(value)).width) + 10, height = 18, side = point.x < node.x + node.width / 2 ? -1 : 1;
    const baseX = side > 0 ? node.x + node.width + 14 : node.x - width - 14;
    const candidates = [point.y - 26, point.y + 8, point.y - 48, point.y + 30].map(y => ({ x: baseX, y, width, height }));
    const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const obstacles = [...layoutNodes.values(), ...placedRelationLabels];
    const box = candidates.sort((a, b) => obstacles.reduce((sum, item) => sum + overlap(a, item), 0) - obstacles.reduce((sum, item) => sum + overlap(b, item), 0))[0];
    placedRelationLabels.push(box);
    const g = add(parent, 'g', { 'data-multiplicity': endpoint, role: 'img', 'aria-label': `${endpoint} cardinality ${value}` });
    add(g, 'rect', { ...box, rx: 3, fill: palette.bg, opacity: .98 });
    lines(g, [value], box.x + width / 2, box.y + 12, { size: 10, weight: 650, fill: palette.accent, attrs: { 'text-anchor': 'middle' } });
  }
  function renderRelation(relation, index) {
    const points = relationPoints(relation); if (!points.length) return;
    const tone = toneFor(relation.tone);
    const g = selectable(add(world, 'g'), 'relation', relation.id, `${relation.source} ${relation.label || relation.kind} ${relation.target}`);
    g.dataset.tone = tone.key;
    if (relation.sourceMember) g.dataset.sourceMemberId = relation.sourceMember;
    if (relation.targetMember) g.dataset.targetMemberId = relation.targetMember;
    title(g, relation.description || relation.label || relation.kind);
    const d = diagram.type === 'state' || memberRoutes.has(relation.id) ? roundedPath(points) : points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
    add(g, 'path', { class: 'fd-edge-hit', d, fill: 'none', stroke: 'transparent', 'stroke-width': 18 });
    const triangle = ['inheritance', 'implementation'].includes(relation.kind);
    const dashed = ['dependency', 'implementation', 'async'].includes(relation.kind);
    add(g, 'path', { class: 'fd-edge-line', d, fill: 'none', stroke: tone.edge, 'stroke-width': relation.kind === 'transition' ? 1.8 : 1.5, 'stroke-dasharray': dashed ? '6 4' : undefined, 'stroke-linejoin': 'round', 'marker-end': `url(#${instance}-${triangle ? 'triangle' : relation.kind === 'association' || relation.kind === 'aggregation' || relation.kind === 'composition' ? 'open' : tone.key !== 'neutral' ? 'arrow-' + tone.key : 'arrow'})`, 'marker-start': ['composition', 'aggregation'].includes(relation.kind) ? `url(#${instance}-${relation.kind === 'composition' ? 'diamond' : 'diamond-open'})` : undefined });
    if (relation.label) {
      const { labelLines, textWidth, width, height } = relationLabelMetrics(relation);
      const elk = diagram.type !== 'state' && usesElkRoute(relation) && layoutLabels.get(relation.id);
      const box = elk ? { ...elk, width, height } : fallbackLabelPosition(points, width, height, diagram.type === 'state');
      if (!elk) placedRelationLabels.push(box);
      const label = add(g, 'g', { 'data-edge-label': relation.id, 'data-label-placement': elk ? 'elk' : 'fallback' });
      add(label, 'rect', { x: box.x, y: box.y, width, height, rx: 4, fill: palette.bg, opacity: .97 });
      lines(label, labelLines, relation.kind === 'transition' ? box.x + 6 : box.x + width / 2, box.y + 15, { size: 11, leading: 15, fill: tone.key === 'neutral' ? palette.ink : tone.edge, attrs: { class: 'fd-edge-label-text', 'text-anchor': relation.kind === 'transition' ? 'start' : 'middle' } });
      if (relation.kind === 'transition') infoIcon(label, box.x + textWidth + 22, box.y + height / 2, { heading: relation.label || 'Transition', meta: `${entities.find(e => e.id === relation.source)?.name || relation.source} → ${entities.find(e => e.id === relation.target)?.name || relation.target}`, sections: [['Description', relation.description]] }, { kind: 'relation', id: relation.id });
    }
    for (const [endpoint, value, point, sign, entityId] of [['source', relation.sourceMultiplicity, points[0], 1, relation.source], ['target', relation.targetMultiplicity, points.at(-1), -1, relation.target]]) if (value) {
      if (memberRoutes.has(relation.id)) renderMemberMultiplicity(g, endpoint, value, point, layoutNodes.get(entityId));
      else lines(g, [value], point.x + sign * 13, point.y - 9, { size: 10, weight: 650, fill: palette.accent, attrs: { 'data-multiplicity': endpoint } });
    }
    endpointHandles(g, 'relation', relation, points[0], points.at(-1), points);
    return g;
  }
  function renderGroups() {
    const groupIds = [...new Set(entities.map(e => e.group).filter(Boolean))];
    for (const id of groupIds) {
      const nodes = entities.filter(e => e.group === id).map(e => layoutNodes.get(e.id)).filter(Boolean);
      if (!nodes.length) continue;
      const x = Math.min(...nodes.map(n => n.x)) - 20, y = Math.min(...nodes.map(n => n.y)) - 36;
      const right = Math.max(...nodes.map(n => n.x + n.width)) + 20, bottom = Math.max(...nodes.map(n => n.y + n.height)) + 20;
      const group = diagram.groups?.find(g => g.id === id);
      const g = add(world, 'g', { 'data-group-id': id, 'pointer-events': 'none' });
      add(g, 'rect', { x, y, width: right - x, height: bottom - y, rx: 15, fill: palette.pale, 'fill-opacity': .45, stroke: palette.line, 'stroke-dasharray': '5 4' });
      const groupLabel = group?.label || id, groupLines = wrap(groupLabel, right - x - 26, 10);
      lines(g, [groupLines[0] + (groupLines.length > 1 ? '…' : '')], x + 13, y + 20, { size: 10, weight: 700, fill: palette.muted }); title(g, [groupLabel, group?.description].filter(Boolean).join('\n'));
    }
  }
  function drawGraph() {
    restoreEndpointHandles();
    stateRoutes = new Map();
    memberRoutes = new Map();
    if (diagram.type === 'state') for (const relation of relations) stateRoutes.set(relation.id, routeStateRelation(relation));
    else for (const relation of relations) if (relation.sourceMember || relation.targetMember) memberRoutes.set(relation.id, routeMemberRelation(relation));
    placedRelationLabels = diagram.type === 'state' ? [] : relations.filter(r => r.label && usesElkRoute(r) && layoutLabels.has(r.id)).map(r => ({ ...layoutLabels.get(r.id), ...relationLabelMetrics(r) }));
    world.replaceChildren(); renderGroups(); relations.forEach(renderRelation); entities.forEach(entity => { const node = layoutNodes.get(entity.id); if (node) renderNode(entity, node); });
    contentX = contentY = 0;
    contentWidth = Math.max(300, ...[...layoutNodes.values()].map(n => n.x + n.width + 50)); contentHeight = Math.max(200, ...[...layoutNodes.values()].map(n => n.y + n.height + 50));
    if ((diagram.type === 'state' || memberRoutes.size) && world.childElementCount) {
      // Node dimensions alone omit cycle routes, labels and the small initial/final info controls.
      // getBBox is in world coordinates even when the canvas is currently zoomed or panned.
      const bounds = world.getBBox();
      contentWidth = Math.max(160, bounds.width + 48); contentHeight = Math.max(120, bounds.height + 48);
      contentX = bounds.x - (contentWidth - bounds.width) / 2; contentY = bounds.y - (contentHeight - bounds.height) / 2;
    }
    updateFocus();
  }
  async function layoutGraph(reset = false) {
    const engine = new ELK();
    const stateDiagram = diagram.type === 'state';
    // Both options and MODEL_ORDER are supported by the bundled ELK 0.9.3.
    // Respect the authored forward flow when deciding which cycle edges return backwards.
    const stateOrder = stateDiagram ? { 'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES' } : {};
    const children = [], groups = new Map();
    for (const entity of entities) {
      const node = { id: entity.id, width: metrics.get(entity.id).width, height: metrics.get(entity.id).height };
      if (entity.group) {
        if (!groups.has(entity.group)) {
          const group = { id: `${instance}-group-${groups.size}`, children: [], layoutOptions: { ...stateOrder, 'elk.padding': '[top=40,left=24,bottom=24,right=24]', 'elk.spacing.nodeNode': stateDiagram ? '38' : '56', 'elk.layered.spacing.nodeNodeBetweenLayers': stateDiagram ? '44' : '100' } };
          groups.set(entity.group, group); children.push(group);
        }
        groups.get(entity.group).children.push(node);
      } else children.push(node);
    }
    const graph = { id: `${instance}-root`, layoutOptions: { ...stateOrder, 'elk.algorithm': 'layered', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.direction': diagram.direction || (stateDiagram ? 'DOWN' : 'RIGHT'), 'elk.spacing.nodeNode': stateDiagram ? '38' : '72', 'elk.layered.spacing.nodeNodeBetweenLayers': stateDiagram ? '44' : '110', 'elk.padding': stateDiagram ? '[top=42,left=32,bottom=32,right=32]' : '[top=54,left=40,bottom=40,right=40]', 'elk.edgeRouting': 'ORTHOGONAL', 'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX' }, children, edges: relations.map(r => { const { width, height } = relationLabelMetrics(r); return { id: r.id, sources: [r.source], targets: [r.target], labels: r.label ? [{ text: r.label, width, height }] : [] }; }) };
    let result;
    try { result = await engine.layout(graph); }
    catch (error) { options.onError?.(error); result = { children: entities.map((entity, i) => ({ id: entity.id, ...metrics.get(entity.id), x: 40 + i % 3 * 650, y: 50 + Math.floor(i / 3) * 550 })), edges: [] }; }
    if (destroyed) return;
    const offsets = new Map([[graph.id, { x: 0, y: 0 }]]), nodes = [];
    function flatten(items, px = 0, py = 0) {
      for (const node of items || []) {
        const x = px + number(node.x), y = py + number(node.y); offsets.set(node.id, { x, y });
        if (node.children) flatten(node.children, x, y);
        else { const pos = !reset && diagram.positions?.[node.id]; nodes.push([node.id, { ...node, x: pos ? number(pos.x, x) : x, y: pos ? number(pos.y, y) : y }]); }
      }
    }
    flatten(result.children); layoutNodes = new Map(nodes);
    layoutEdges = new Map((result.edges || []).filter(e => e.sections?.length).map(e => { const section = e.sections[0], offset = offsets.get(e.container) || { x: 0, y: 0 }; return [e.id, [section.startPoint, ...(section.bendPoints || []), section.endPoint].map(p => ({ x: p.x + offset.x, y: p.y + offset.y }))]; }));
    layoutLabels = new Map((result.edges || []).filter(e => Number.isFinite(e.labels?.[0]?.x) && Number.isFinite(e.labels?.[0]?.y)).map(e => { const offset = offsets.get(e.container) || { x: 0, y: 0 }, label = e.labels[0]; return [e.id, { x: label.x + offset.x, y: label.y + offset.y }]; }));
    if (reset) { diagram.positions = {}; options.onChange?.(); }
    drawGraph();
  }
  function renderSequence() {
    restoreEndpointHandles();
    world.replaceChildren(); layoutNodes.clear(); messageLayouts.clear();
    const laneWidth = 208, left = 34, top = 26, participantWidth = 168;
    const participantHeight = Math.max(76, ...entities.map(e => 38 + wrap(e.name, participantWidth - 20, 13).length * 17));
    const whyX = left + entities.length * laneWidth + 34;
    const explanationWidth = 310;
    let y = top + participantHeight + 60;
    const rows = []; let previousPhase = null;
    for (const message of messages) {
      if (message.phase && message.phase !== previousPhase) { rows.push({ phase: message.phase, y, height: 35 }); y += 42; previousPhase = message.phase; }
      const explanation = message.description ? wrap(message.description, explanationWidth - 36, 12) : [];
      const label = wrap(message.label, Math.max(135, Math.abs(entities.findIndex(e => e.id === message.to) - entities.findIndex(e => e.id === message.from)) * laneWidth - 40), 12);
      const height = Math.max(82, explanation.length * 17 + 35, label.length * 17 + 38, message.from === message.to ? 98 : 0);
      rows.push({ message, explanation, label, y, height }); y += height;
    }
    contentWidth = whyX + explanationWidth + 28; contentHeight = Math.max(300, y + 40);
    add(world, 'rect', { x: whyX - 14, y: top, width: explanationWidth + 14, height: contentHeight - top - 15, rx: 10, fill: palette.pale });
    lines(world, ['WHY THIS STEP'], whyX + 4, top + 24, { size: 10, weight: 700, fill: palette.accent });
    lines(world, ['Each note follows its message.'], whyX + 4, top + 44, { size: 11, fill: palette.muted });
    const center = id => left + entities.findIndex(e => e.id === id) * laneWidth + participantWidth / 2;
    for (const entity of entities) {
      const x = center(entity.id) - participantWidth / 2;
      const lifeline = add(world, 'g', { 'data-lifeline-for': entity.id, 'data-owner-entity-id': entity.id });
      add(lifeline, 'line', { x1: center(entity.id), x2: center(entity.id), y1: top + participantHeight, y2: contentHeight - 20, stroke: palette.muted, 'stroke-width': 1.3, 'stroke-dasharray': '5 6' });
      layoutNodes.set(entity.id, { id: entity.id, x, y: top, width: participantWidth, height: participantHeight });
      const g = selectable(add(world, 'g', { transform: `translate(${x} ${top})` }), 'entity', entity.id, `${entity.kind}: ${entity.name}`);
      title(g, entity.description || entity.summary);
      g.dataset.tone = toneFor(entity.tone).key;
      add(g, 'rect', { class: 'fd-node-body', width: participantWidth, height: participantHeight, rx: 8, fill: toneFor(entity.tone).fill, stroke: toneFor(entity.tone).stroke });
      lines(g, [entity.kind.toUpperCase()], participantWidth / 2, 20, { size: 9, weight: 700, fill: palette.accent, attrs: { 'text-anchor': 'middle' } });
      lines(g, wrap(entity.name, participantWidth - 20, 13), participantWidth / 2, 43, { size: 13, weight: 600, leading: 17, attrs: { 'text-anchor': 'middle' } });
      entityInfo(g, entity, participantWidth);
      const participant = layoutNodes.get(entity.id); nodeHandles(g, entity, participant); enableNodeDrag(g, entity, participant);
    }
    let step = 0;
    for (const row of rows) {
      if (row.phase) { add(world, 'rect', { x: left - 5, y: row.y - 9, width: whyX - left - 25, height: 28, rx: 4, fill: palette.pale, stroke: palette.line }); lines(world, [row.phase], left + 7, row.y + 9, { size: 11, weight: 650, fill: palette.accent }); continue; }
      const { message, label, explanation } = row; step++;
      const x1 = center(message.from), x2 = center(message.to), lineY = row.y + label.length * 17 + 8;
      messageLayouts.set(message.id, { x1, x2, y: row.y, height: row.height });
      const g = selectable(add(world, 'g'), 'message', message.id, `Step ${step}: ${message.label}. ${message.description || ''}`);
      add(g, 'rect', { x: Math.min(x1, x2) - 29, y: row.y - 5, width: whyX + explanationWidth - Math.min(x1, x2) + 22, height: row.height - 7, fill: 'transparent' });
      title(g, message.description || message.label);
      let d = `M${x1} ${lineY}L${x2} ${lineY}`;
      if (x1 === x2) d = `M${x1} ${lineY}H${x1 + 64}V${lineY + 28}H${x1 + 5}`;
      add(g, 'path', { class: 'fd-edge-hit', d, fill: 'none', stroke: 'transparent', 'stroke-width': 20 });
      add(g, 'path', { class: 'fd-edge-line', d, fill: 'none', stroke: palette.ink, 'stroke-width': 1.5, 'stroke-dasharray': message.kind === 'return' ? '6 4' : undefined, 'marker-end': `url(#${instance}-${message.kind === 'sync' ? 'arrow' : 'open'})` });
      const labelX = x1 === x2 ? x1 + 8 : (x1 + x2) / 2;
      lines(g, label, labelX, row.y + 11, { size: 12, leading: 17, weight: 550, attrs: { 'text-anchor': x1 === x2 ? 'start' : 'middle' } });
      add(g, 'circle', { cx: Math.min(x1, x2) - 16, cy: lineY, r: 10, fill: palette.pale, stroke: palette.line });
      lines(g, [String(step)], Math.min(x1, x2) - 16, lineY + 3.5, { size: 9, weight: 700, fill: palette.accent, attrs: { 'text-anchor': 'middle' } });
      add(g, 'rect', { class: 'fd-step-note', x: whyX - 3, y: row.y - 3, width: explanationWidth - 7, height: row.height - 13, rx: 5, fill: palette.panel, opacity: .9 });
      lines(g, [`${step.toString().padStart(2, '0')}  ${message.kind.toUpperCase()}`], whyX + 8, row.y + 13, { size: 9, weight: 700, fill: palette.accent });
      lines(g, explanation.length ? explanation : ['No explanation documented.'], whyX + 8, row.y + 33, { size: 12, fill: explanation.length ? palette.ink : palette.muted, leading: 17 });
      infoIcon(g, whyX + explanationWidth - 23, row.y + 10, { heading: `Step ${step}: ${message.label}`, meta: `${entities.find(e => e.id === message.from)?.name || message.from} → ${entities.find(e => e.id === message.to)?.name || message.to}`, sections: [['Explanation', message.description], ['Message type', message.kind], ['Phase', message.phase]] }, { kind: 'message', id: message.id });
      endpointHandles(g, 'message', message, { x: x1, y: lineY }, { x: x1 === x2 ? x1 + 5 : x2, y: x1 === x2 ? lineY + 28 : lineY });
    }
    updateFocus();
  }
  function onPointerMove(event) {
    if (!drag) { if (pendingConnection) drawConnectionPreview(worldPoint(event), pendingConnection); return; }
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved && (drag.kind === 'node' || drag.kind === 'participant') && !canvas.hasPointerCapture(event.pointerId)) canvas.setPointerCapture(event.pointerId);
    if (drag.kind === 'connect' || drag.kind === 'reconnect') { drawConnectionPreview(worldPoint(event)); return; }
    if (drag.kind === 'pick-entity') return;
    if (drag.kind === 'pan') { tx = drag.x + dx; ty = drag.y + dy; updateTransform(); }
    else if (drag.kind === 'participant' && drag.moved) {
      const point = worldPoint(event), node = layoutNodes.get(drag.id);
      drag.element.setAttribute('transform', `translate(${drag.x + dx / scale} ${drag.y})`);
      drag.dropIndex = entities.map((entity, index) => ({ index, distance: Math.abs(point.x - layoutNodes.get(entity.id).x - node.width / 2) })).sort((a, b) => a.distance - b.distance)[0]?.index;
      clearGestureUI(); const target = layoutNodes.get(entities[drag.dropIndex]?.id);
      if (target) { const overlay = add(world, 'g', { 'data-edit-overlay': 'reorder' }); add(overlay, 'line', { class: 'fd-reorder-preview', x1: target.x + target.width / 2, x2: target.x + target.width / 2, y1: target.y - 12, y2: target.y + target.height + 14 }); }
    } else if (drag.kind === 'node' && drag.moved) {
      const node = layoutNodes.get(drag.id); node.x = Math.max(24, drag.x + dx / scale); node.y = Math.max(42, drag.y + dy / scale);
      diagram.positions ||= {}; diagram.positions[drag.id] = { x: node.x, y: node.y }; drawGraph();
    }
  }
  function cancelGesture() {
    const previous = drag; drag = null; pendingConnection = null; connectionMode = false; clearGestureUI();
    if (previous && canvas.hasPointerCapture(previous.pointerId)) canvas.releasePointerCapture(previous.pointerId);
    if (previous?.kind === 'node' && previous.moved) {
      const node = layoutNodes.get(previous.id); if (node) { node.x = previous.x; node.y = previous.y; }
      if (previous.position) diagram.positions[previous.id] = previous.position; else if (diagram.positions) { delete diagram.positions[previous.id]; if (!previous.positionsExisted && !Object.keys(diagram.positions).length) delete diagram.positions; }
      drawGraph();
    }
    if (previous?.kind === 'participant') previous.element.setAttribute('transform', `translate(${previous.x} ${previous.y})`);
  }
  function onPointerUp(event) {
    if (!drag) return;
    if (drag.kind === 'connect' || drag.kind === 'reconnect') {
      drawConnectionPreview(worldPoint(event)); const gesture = drag, targetId = gesture.dropEntityId;
      drag = null; clearGestureUI(); suppressClickUntil = performance.now() + 150; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (targetId && gesture.moved) {
        if (gesture.kind === 'connect') options.onConnect?.({ diagramId: diagram.id, kind: diagram.type === 'sequence' ? 'message' : 'relation', source: gesture.source, target: targetId });
        else if (targetId !== (gesture.endpoint === 'source' ? gesture.source : gesture.target)) options.onReconnect?.({ diagramId: diagram.id, kind: gesture.connectionKind, id: gesture.id, endpoint: gesture.endpoint, entityId: targetId });
      }
      return;
    }
    const previous = drag; drag = null;
    if (previous.kind !== 'pan') suppressClickUntil = performance.now() + 150;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (previous.kind === 'pick-entity') { select('entity', previous.id); return; }
    if (previous.kind === 'participant') {
      previous.element.setAttribute('transform', `translate(${previous.x} ${previous.y})`); clearGestureUI();
      if (previous.moved) {
        const point = worldPoint(event), node = layoutNodes.get(previous.id), rect = canvas.getBoundingClientRect();
        if (previous.dropIndex !== undefined && point.y >= node.y - 60 && point.y <= node.y + node.height + 60 && event.clientX >= rect.left && event.clientX <= rect.right) {
          const order = [...diagram.entityIds], oldIndex = order.indexOf(previous.id); order.splice(oldIndex, 1); order.splice(previous.dropIndex, 0, previous.id);
          if (order.some((id, index) => id !== diagram.entityIds[index])) options.onReorder?.({ diagramId: diagram.id, entityIds: order });
        }
      } else select('entity', previous.id);
      return;
    }
    if (previous.kind === 'node' && previous.moved) options.onChange?.();
    else if (previous.kind === 'node') select('entity', previous.id);
  }
  const onPointerDown = event => {
    if (event.button !== 0 || event.target.closest('.fd-selectable')) return;
    drag = { kind: 'pan', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: tx, y: ty }; canvas.setPointerCapture(event.pointerId);
  };
  const onPointerCancel = () => cancelGesture();
  const onCaptureClick = event => { if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); } };
  const onGestureEscape = event => { if (event.key === 'Escape' && (drag || connectionMode)) { event.preventDefault(); event.stopPropagation(); cancelGesture(); } };
  const onBackgroundDoubleClick = event => { if (options.editable && !event.target.closest('.fd-selectable, [data-edit-control]')) { event.preventDefault(); options.onAddNode?.({ diagramId: diagram.id, ...worldPoint(event) }); } };
  const onWheel = event => { event.preventDefault(); const rect = canvas.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top); };
  const onKey = event => {
    if (event.target !== canvas) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.2); }
    else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.2); }
    else if (event.key === '0' || event.key === 'Home') { event.preventDefault(); fit(); }
    else if (event.key === 'Escape') { focused = null; updateFocus(); }
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); tx += event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0; ty += event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0; updateTransform(); }
  };
  canvas.addEventListener('pointerover', onEditHover); canvas.addEventListener('click', onCaptureClick, true); canvas.addEventListener('pointerdown', onPointerDown); canvas.addEventListener('pointermove', onPointerMove); canvas.addEventListener('pointerup', onPointerUp); canvas.addEventListener('pointercancel', onPointerCancel); canvas.addEventListener('dblclick', onBackgroundDoubleClick); document.addEventListener('keydown', onGestureEscape, true); canvas.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('keydown', onKey);
  try { if (diagram.type === 'sequence') renderSequence(); else await layoutGraph(); }
  catch (error) { options.onError?.(error); const message = document.createElement('div'); message.className = 'fd-error'; message.textContent = 'Unable to render this diagram.'; host.append(message); }
  fit();
  let lastWidth = host.clientWidth;
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { if (host.clientWidth !== lastWidth) { lastWidth = host.clientWidth; if (framing === 'read') read(); else if (framing === 'message' && selected?.kind === 'message') focusMessage(selected.id); else if (framing === 'entity' && focused) focus(focused); else fit(); } }); observer?.observe(host);
  function getView() { return { scale, tx, ty, framing, focused, selected: selected ? { ...selected } : null }; }
  function setView(view) {
    if (!view || destroyed) return;
    if (Number.isFinite(view.scale) && view.scale > 0) scale = Math.max(.025, Math.min(4, view.scale));
    if (Number.isFinite(view.tx)) tx = view.tx; if (Number.isFinite(view.ty)) ty = view.ty;
    framing = ['read', 'overview', 'entity', 'message'].includes(view.framing) ? view.framing : 'overview';
    focused = ids.has(view.focused) ? view.focused : null; selected = view.selected ? { ...view.selected } : null;
    if (selected) {
      const owner = entities.find(e => e.id === selected.entityId);
      const exists = selected.kind === 'entity' ? ids.has(selected.id) : selected.kind === 'relation' ? relations.some(r => r.id === selected.id) : selected.kind === 'message' ? messages.some(m => m.id === selected.id) : selected.kind === 'member' && [...(owner?.fields || []), ...(owner?.methods || [])].some(m => m.id === selected.id);
      if (!exists) selected = null;
    }
    if (selected?.kind === 'message') canvas.dataset.selectedMessageId = selected.id; else delete canvas.dataset.selectedMessageId;
    updateFocus(); updateTransform();
  }
  function viewportCenter() { const size = dimensions(); return { x: (size.width / 2 - tx) / scale, y: (size.height / 2 - ty) / scale }; }
  return {
    destroy() { cancelGesture(); destroyed = true; observer?.disconnect(); renameInput?.remove(); hideInfo(); tooltip.remove(); canvas.removeEventListener('pointerover', onEditHover); canvas.removeEventListener('pointerover', onInfoOver); canvas.removeEventListener('pointerout', onInfoOut); canvas.removeEventListener('focusin', onInfoFocus); canvas.removeEventListener('focusout', onInfoBlur); document.removeEventListener('keydown', onInfoEscape, true); document.removeEventListener('keydown', onGestureEscape, true); window.removeEventListener('resize', positionInfo); window.removeEventListener('scroll', positionInfo, true); canvas.removeEventListener('click', onCaptureClick, true); canvas.removeEventListener('pointerdown', onPointerDown); canvas.removeEventListener('pointermove', onPointerMove); canvas.removeEventListener('pointerup', onPointerUp); canvas.removeEventListener('pointercancel', onPointerCancel); canvas.removeEventListener('dblclick', onBackgroundDoubleClick); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('keydown', onKey); host.remove(); },
    fit, zoom, focus, read, focusMessage, getView, setView, viewportCenter,
    getPositions() { return diagram.type === 'sequence' ? {} : Object.fromEntries([...layoutNodes].map(([id, node]) => [id, { x: node.x, y: node.y }])); },
    requestAddNode() { if (options.editable) options.onAddNode?.({ diagramId: diagram.id, ...viewportCenter() }); },
    startConnection() { if (options.editable) { cancelGesture(); connectionMode = true; canvas.focus(); host.classList.add('fd-connecting'); } },
    refresh(nextDiagram = diagram, nextProject = project) {
      const work = refreshQueue.catch(() => {}).then(async () => {
        if (destroyed) return;
        const view = getView(); cancelGesture(); diagram = nextDiagram; project = nextProject; loadModel();
        if (diagram.type === 'sequence') renderSequence(); else await layoutGraph();
        if (!destroyed) setView(view);
      });
      refreshQueue = work; return work;
    },
    clearFocus() { focused = null; updateFocus(); },
    async relayout() { if (diagram.type === 'sequence') renderSequence(); else await layoutGraph(true); fit(); },
    exportSvg() {
      const clone = canvas.cloneNode(true); clone.setAttribute('width', String(contentWidth)); clone.setAttribute('height', String(contentHeight)); clone.setAttribute('viewBox', `${contentX} ${contentY} ${contentWidth} ${contentHeight}`); clone.removeAttribute('tabindex');
      const liveElements = [canvas, ...canvas.querySelectorAll('*')], cloneElements = [clone, ...clone.querySelectorAll('*')];
      const properties = ['fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'visibility'];
      liveElements.forEach((el, i) => {
        const style = getComputedStyle(el);
        for (const property of properties) {
          const transientTarget = el.classList.contains('fd-node-body') && el.closest('.fd-drop-target') && ['stroke', 'stroke-width'].includes(property);
          const value = transientTarget ? el.getAttribute(property) : property === 'opacity' && el.classList.contains('fd-dim') ? '1' : style.getPropertyValue(property);
          if (value) cloneElements[i].setAttribute(property, value);
        }
      });
      const rootGroup = clone.querySelector(':scope > g'); rootGroup?.removeAttribute('transform');
      clone.querySelectorAll('.fd-dim').forEach(el => el.classList.remove('fd-dim'));
      clone.querySelectorAll('[aria-describedby]').forEach(el => el.removeAttribute('aria-describedby'));
      clone.querySelectorAll('[data-edit-control], [data-edit-overlay]').forEach(el => el.remove());
      clone.querySelectorAll('.fd-drop-target').forEach(el => el.classList.remove('fd-drop-target'));
      const bg = svg('rect', { x: contentX, y: contentY, width: contentWidth, height: contentHeight, fill: palette.bg }); clone.insertBefore(bg, clone.firstChild);
      return new XMLSerializer().serializeToString(clone);
    }
  };
}
