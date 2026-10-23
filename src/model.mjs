/** Accept only embedded base64 raster images, with a MIME-matching file header. */
export function isEmbeddedRasterSource(source) {
  if (typeof source !== 'string') return false;
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
  if (!match) return false;
  const [,type,payload] = match;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) return false;
  let header;
  try {header = atob(payload.slice(0,32));} catch {return false;}
  if (type === 'png') return header.startsWith('\x89PNG\r\n\x1a\n');
  if (type === 'jpeg') return header.startsWith('\xff\xd8\xff');
  if (type === 'gif') return /^GIF8[79]a/.test(header);
  return header.startsWith('RIFF') && header.slice(8,12) === 'WEBP';
}

/** Environment-neutral, non-mutating validation of the FinalDiagrams source format. */
export function validateProject(project) {
  const errors = [], warnings = [];
  const stateKinds = ['state','choice','initial','final'];
  const tones = ['neutral','info','success','warning','error'];
  const fail = (path, message) => errors.push({ path, message });
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const string = (x, path, required = true) => { if ((required || x !== undefined) && (typeof x !== 'string' || (required && !x.trim()))) fail(path, required ? 'Expected a non-empty string.' : 'Expected a string.'); };
  const identifier = (x, path) => { string(x,path); if (['__proto__','prototype','constructor'].includes(x)) fail(path,'Reserved object property names cannot be used as IDs or column keys.'); };
  const choice = (x, path, values, optional = false) => { if (!(optional && x === undefined) && !values.includes(x)) fail(path, `Expected one of: ${values.join(', ')}.`); };
  const optionalStrings = (x, path, keys) => keys.forEach(key => string(x[key], `${path}.${key}`, false));
  function richText(root,path) {
    const visited = new Set();
    function node(value,p) {
      if (!object(value)) {fail(p,'Expected a rich-text node object.');return;}
      if (visited.has(value)) return; visited.add(value);
      string(value.type,`${p}.type`);
      if (value.type === 'text' || value.text !== undefined) {if (typeof value.text !== 'string') fail(`${p}.text`,'Expected rich-text text to be a string.');}
      if (value.attrs !== undefined && !object(value.attrs)) fail(`${p}.attrs`,'Expected a rich-text attribute object.');
      if (value.content !== undefined) {
        if (!Array.isArray(value.content)) fail(`${p}.content`,'Expected an array of rich-text child nodes.');
        else value.content.forEach((child,i)=>node(child,`${p}.content[${i}]`));
      }
      if (value.marks !== undefined) {
        if (!Array.isArray(value.marks)) fail(`${p}.marks`,'Expected an array of rich-text marks.');
        else value.marks.forEach((mark,i)=>{const mp=`${p}.marks[${i}]`;if (!object(mark)) {fail(mp,'Expected a rich-text mark object.');return;} string(mark.type,`${mp}.type`);if (mark.attrs !== undefined && !object(mark.attrs)) fail(`${mp}.attrs`,'Expected a rich-text attribute object.');});
      }
    }
    node(root,path);
  }
  // Unknown properties are allowed, but the entire model must remain JSON data.
  const ancestors = new Set();
  function json(value, path) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail(path, 'Expected a finite JSON number.'); return; }
    if (typeof value !== 'object') { fail(path, 'Expected JSON-compatible data.'); return; }
    if (ancestors.has(value)) { fail(path, 'Circular data is not supported.'); return; }
    ancestors.add(value);
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail(path, 'Expected a plain JSON object.');
    Object.entries(value).forEach(([key, child]) => json(child, `${path}.${key}`));
    ancestors.delete(value);
  }
  json(project, '$');
  if (!object(project)) return { valid: false, errors: [...errors, {path:'$',message:'Expected a project object.'}], warnings };
  if (project.schemaVersion !== 1) fail('$.schemaVersion', 'Expected schema version 1.');
  identifier(project.id, '$.id'); string(project.title, '$.title'); string(project.subtitle, '$.subtitle', false);
  if (!Number.isSafeInteger(project.revision) || project.revision < 0) fail('$.revision', 'Expected a non-negative safe integer.');
  const arrays = {};
  for (const key of ['entities', 'relations', 'diagrams', 'blocks']) {
    if (!Array.isArray(project[key])) fail(`$.${key}`, 'Expected an array.');
    arrays[key] = Array.isArray(project[key]) ? project[key] : [];
  }
  const ids = new Set(), maps = {};
  for (const [key, items] of Object.entries(arrays)) {
    maps[key] = new Map();
    items.forEach((item, i) => {
      const path = `$.${key}[${i}]`;
      if (!object(item)) { fail(path, 'Expected an object.'); return; }
      identifier(item.id, `${path}.id`);
      if (typeof item.id === 'string') {
        if (ids.has(item.id)) fail(`${path}.id`, `Duplicate global ID: ${item.id}.`);
        ids.add(item.id); maps[key].set(item.id, item);
      }
    });
  }
  const ref = (id, map, path) => { string(id, path); if (typeof id === 'string' && !map.has(id)) fail(path, `Unknown reference: ${id}.`); };
  const members = new Map();
  arrays.entities.forEach((entity, i) => {
    if (!object(entity)) return;
    const p = `$.entities[${i}]`, memberIds = new Set(); members.set(entity.id, memberIds);
    choice(entity.kind, `${p}.kind`, ['actor','service','module','library','database','queue','external','class','interface','table',...stateKinds]); string(entity.name, `${p}.name`);
    choice(entity.tone, `${p}.tone`, tones, true);
    optionalStrings(entity, p, ['summary','description','technology','group']);
    if (entity.source !== undefined) {
      if (!object(entity.source)) fail(`${p}.source`, 'Expected an object.');
      else { string(entity.source.path, `${p}.source.path`); string(entity.source.url, `${p}.source.url`, false); if (entity.source.line !== undefined && (!Number.isSafeInteger(entity.source.line) || entity.source.line < 1)) fail(`${p}.source.line`, 'Expected a positive line number.'); }
    }
    for (const key of ['fields','methods']) {
      if (entity[key] === undefined) continue;
      if (!Array.isArray(entity[key])) { fail(`${p}.${key}`, 'Expected an array.'); continue; }
      entity[key].forEach((member, j) => {
        const mp = `${p}.${key}[${j}]`;
        if (!object(member)) { fail(mp, 'Expected a member object.'); return; }
        identifier(member.id, `${mp}.id`); string(member.name, `${mp}.name`); optionalStrings(member, mp, ['type','purpose','details','visibility']);
        if (memberIds.has(member.id)) fail(`${mp}.id`, 'Duplicate member ID in entity.'); memberIds.add(member.id);
        if (member.values !== undefined) {
          if (!object(member.values)) fail(`${mp}.values`, 'Expected an object of column values.');
          else Object.entries(member.values).forEach(([key,value]) => {if (['__proto__','prototype','constructor'].includes(key)) fail(`${mp}.values.${key}`,'Reserved column key.'); string(value, `${mp}.values.${key}`, false);});
        }
      });
    }
  });
  arrays.relations.forEach((relation, i) => {
    if (!object(relation)) return;
    const p = `$.relations[${i}]`;
    ref(relation.source, maps.entities, `${p}.source`); ref(relation.target, maps.entities, `${p}.target`);
    // Empty labels are useful for conventional UML relationships.
    if (typeof relation.label !== 'string') fail(`${p}.label`, 'Expected a string.');
    choice(relation.kind, `${p}.kind`, ['calls','async','reads','writes','association','inheritance','implementation','composition','aggregation','dependency','transition']);
    choice(relation.tone, `${p}.tone`, tones, true);
    if (relation.kind === 'transition') {
      for (const side of ['source','target']) {
        const entity = maps.entities.get(relation[side]);
        if (entity && !stateKinds.includes(entity.kind)) fail(`${p}.${side}`, 'Transitions must connect state, choice, initial or final entities.');
      }
      if (maps.entities.get(relation.source)?.kind === 'final') fail(`${p}.source`, 'A final state cannot have outgoing transitions.');
      if (maps.entities.get(relation.target)?.kind === 'initial') fail(`${p}.target`, 'An initial state cannot have incoming transitions.');
    }
    optionalStrings(relation, p, ['description','sourceMultiplicity','targetMultiplicity','sourceMember','targetMember']);
    for (const side of ['source','target']) if (relation[`${side}Member`] !== undefined && !members.get(relation[side])?.has(relation[`${side}Member`])) fail(`${p}.${side}Member`, 'Unknown member on referenced entity.');
  });
  arrays.diagrams.forEach((diagram, i) => {
    if (!object(diagram)) return;
    const p = `$.diagrams[${i}]`;
    choice(diagram.type, `${p}.type`, ['system','class','sequence','state']); string(diagram.title, `${p}.title`); string(diagram.description, `${p}.description`, false);
    choice(diagram.direction, `${p}.direction`, ['RIGHT','DOWN'], true); choice(diagram.notation, `${p}.notation`, ['uml','plain'], true);
    const included = new Set(Array.isArray(diagram.entityIds) ? diagram.entityIds : []);
    for (const [key, map, required] of [['entityIds',maps.entities,true],['relationIds',maps.relations,false]]) {
      if (diagram[key] === undefined && !required) continue;
      if (!Array.isArray(diagram[key])) { fail(`${p}.${key}`, 'Expected an array.'); continue; }
      const local = new Set(); diagram[key].forEach((id,j) => { ref(id,map,`${p}.${key}[${j}]`); if (local.has(id)) fail(`${p}.${key}[${j}]`, 'Duplicate reference.'); local.add(id); });
    }
    if (Array.isArray(diagram.relationIds)) diagram.relationIds.forEach((id,j) => { const relation = maps.relations.get(id); if (relation && (!included.has(relation.source) || !included.has(relation.target))) fail(`${p}.relationIds[${j}]`, 'Both relation endpoints must appear in entityIds.'); });
    if (diagram.type === 'state') {
      if (Array.isArray(diagram.entityIds)) diagram.entityIds.forEach((id,j) => {
        const entity = maps.entities.get(id);
        if (entity && !stateKinds.includes(entity.kind)) fail(`${p}.entityIds[${j}]`, 'State diagrams require state, choice, initial or final entities.');
      });
      const visibleRelations = Array.isArray(diagram.relationIds) ? diagram.relationIds.map(id => maps.relations.get(id)).filter(Boolean) : arrays.relations.filter(r => object(r) && included.has(r.source) && included.has(r.target));
      for (const relation of visibleRelations) if (relation.kind !== 'transition') fail(`${p}.relationIds`, `State diagrams require transition relations: ${relation.id}.`);
    }
    if (diagram.positions !== undefined) {
      if (!object(diagram.positions)) fail(`${p}.positions`, 'Expected a position map.');
      else Object.entries(diagram.positions).forEach(([id,pos]) => { if (!included.has(id)) fail(`${p}.positions.${id}`, 'Position references an entity outside the diagram.'); if (!object(pos) || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) fail(`${p}.positions.${id}`, 'Expected finite x and y coordinates.'); });
    }
    for (const key of ['columns','groups']) if (diagram[key] !== undefined) {
      if (!Array.isArray(diagram[key])) { fail(`${p}.${key}`, 'Expected an array.'); continue; }
      const local = new Set(); diagram[key].forEach((item,j) => { const ip = `${p}.${key}[${j}]`; if (!object(item)) { fail(ip,'Expected an object.'); return; } const idKey = key === 'columns' ? 'key' : 'id'; identifier(item[idKey],`${ip}.${idKey}`); string(item.label,`${ip}.label`); if (local.has(item[idKey])) fail(`${ip}.${idKey}`,'Duplicate ID or key.'); local.add(item[idKey]); if (key === 'groups') string(item.description,`${ip}.description`,false); });
    }
    if (diagram.messages !== undefined) {
      if (!Array.isArray(diagram.messages)) fail(`${p}.messages`, 'Expected an array.');
      else { const local = new Set(); diagram.messages.forEach((message,j) => { const mp = `${p}.messages[${j}]`; if (!object(message)) {fail(mp,'Expected a message object.');return;} identifier(message.id,`${mp}.id`); if (local.has(message.id)) fail(`${mp}.id`,'Duplicate message ID.'); local.add(message.id); for (const side of ['from','to']) { ref(message[side],maps.entities,`${mp}.${side}`); if (!included.has(message[side])) fail(`${mp}.${side}`,'Message participant must appear in entityIds.'); } string(message.label,`${mp}.label`); choice(message.kind,`${mp}.kind`,['sync','async','return']); optionalStrings(message,mp,['description','phase']); }); }
    }
  });
  arrays.blocks.forEach((block, i) => {
    if (!object(block)) return;
    const p = `$.blocks[${i}]`;
    choice(block.type,`${p}.type`,['heading','prose','diagram','callout','code','image']);
    if (block.type === 'heading') { choice(block.level,`${p}.level`,[1,2,3]); string(block.text,`${p}.text`); }
    if (block.type === 'prose') { const markdown = Object.hasOwn(block,'markdown'), content = Object.hasOwn(block,'content'); if (markdown === content) fail(p,'Prose requires exactly one of markdown or content.'); if (markdown && typeof block.markdown !== 'string') fail(`${p}.markdown`,'Expected a string.'); if (content) richText(block.content,`${p}.content`); }
    if (block.type === 'diagram') ref(block.diagramId,maps.diagrams,`${p}.diagramId`);
    if (block.type === 'callout') { string(block.title,`${p}.title`); string(block.text,`${p}.text`); choice(block.tone,`${p}.tone`,['info','warning'],true); }
    if (block.type === 'code') { if (typeof block.text !== 'string') fail(`${p}.text`,'Expected a string.'); string(block.language,`${p}.language`,false); }
    if (block.type === 'image') {
      if (!isEmbeddedRasterSource(block.src)) fail(`${p}.src`,'Expected an embedded base64 PNG, JPEG, WebP, or GIF with a matching raster file header. Remote images and SVG are not supported.');
      if (typeof block.alt !== 'string') fail(`${p}.alt`,'Expected image alternative text as a string.');
      string(block.caption,`${p}.caption`,false);
    }
  });
  return { valid: errors.length === 0, errors, warnings };
}

export function assertProject(project) {
  const result = validateProject(project);
  if (!result.valid) {
    const error = new Error(`Invalid FinalDiagrams project:\n${result.errors.map(x => `${x.path}: ${x.message}`).join('\n')}`);
    error.name = 'ProjectValidationError'; error.diagnostics = result.errors; throw error;
  }
  return project;
}

export function parseProject(text) {
  let project;
  try { project = JSON.parse(text); } catch (cause) { throw new Error(`Invalid project JSON: ${cause.message}`, {cause}); }
  return assertProject(project);
}
