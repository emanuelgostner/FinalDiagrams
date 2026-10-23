import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { assertProject, parseProject } from './model.mjs';
import { atomicWrite, exportProject } from './export.mjs';

const clone = value => JSON.parse(JSON.stringify(value));

/** Local, revision-controlled JSON source server. Never binds a public interface. */
export async function startServer({ sourcePath, host = '127.0.0.1', port = 0, ...exportOptions }) {
  if (host !== '127.0.0.1') throw new Error('The connected server must bind 127.0.0.1.');
  sourcePath = resolve(sourcePath);
  let lastText = await readFile(sourcePath,'utf8');
  let current = parseProject(lastText), revision = current.revision;
  let closed = false, queue = Promise.resolve(), lastError = null;
  const clients = new Set();
  const serial = task => { const result = queue.then(task); queue = result.catch(() => {}); return result; };
  const broadcast = (event, data) => { for (const client of clients) client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  async function persist(project) {
    const text = JSON.stringify(project,null,2) + '\n';
    await atomicWrite(sourcePath,text); lastText = text; lastError = null;
    current = project; revision = project.revision;
    broadcast('project',{revision});
  }
  async function syncSource() {
    let text;
    try {
      text = await readFile(sourcePath,'utf8');
      if (text === lastText) return;
      const project = parseProject(text);
      if (JSON.stringify(project) === JSON.stringify(current)) {lastText = text; return;}
      if (revision >= Number.MAX_SAFE_INTEGER) throw new Error('Revision limit reached.');
      project.revision = revision + 1;
      await persist(project);
    } catch (error) {
      const signature = `${text ?? ''}:${error.message}`;
      if (signature !== lastError) { lastError = signature; broadcast('error',{message:error.message,revision}); }
      // Keep the last-good model. PUT will explicitly report an invalid disk source.
      return error;
    }
  }
  function respond(response, status, value) {
    response.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    response.end(JSON.stringify(value));
  }
  const server = http.createServer(async (request,response) => {
    try {
      const expectedHost = `127.0.0.1:${server.address().port}`;
      // Reject DNS rebinding as well as cross-origin write requests.
      if (request.headers.host !== expectedHost) { respond(response,403,{error:'Invalid localhost host.'}); return; }
      const path = new URL(request.url,`http://${expectedHost}`).pathname;
      if (request.method === 'PUT' && path === '/api/project') {
        if (request.headers.origin && request.headers.origin !== `http://${expectedHost}`) {respond(response,403,{error:'Cross-origin writes are not allowed.'});return;}
        if (request.headers['sec-fetch-site'] === 'cross-site') {respond(response,403,{error:'Cross-site writes are not allowed.'});return;}
        if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {respond(response,415,{error:'Expected application/json.'});return;}
        const chunks = []; let bytes = 0;
        for await (const chunk of request) {bytes += chunk.length; if (bytes > 10 * 1024 * 1024) {respond(response,413,{error:'Project exceeds 10 MB request limit.'});return;} chunks.push(chunk);}
        const body = Buffer.concat(chunks).toString('utf8');
        let input;
        try {input = JSON.parse(body);} catch {respond(response,400,{error:'Invalid JSON body.'});return;}
        await serial(async () => {
          const diskError = await syncSource();
          if (diskError) {respond(response,422,{error:'Source file is invalid; repair it before writing.',detail:diskError.message,revision});return;}
          if (!input || !Number.isSafeInteger(input.baseRevision) || input.baseRevision !== revision) {respond(response,409,{error:'Revision conflict.',revision,project:current});return;}
          try {assertProject(input.project);} catch (error) {respond(response,422,{error:error.message,diagnostics:error.diagnostics});return;}
          if (revision >= Number.MAX_SAFE_INTEGER) {respond(response,409,{error:'Revision limit reached.',revision});return;}
          const next = clone(input.project); next.revision = revision + 1;
          await persist(next); respond(response,200,{project:current,revision});
        });
        return;
      }
      if (request.method === 'GET' && path === '/api/project') {
        await serial(async () => {await syncSource();respond(response,200,{project:current,revision});}); return;
      }
      if (request.method === 'GET' && path === '/api/events') {
        response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Content-Type-Options':'nosniff'});
        response.write(`event: project\ndata: ${JSON.stringify({revision})}\n\n`);
        clients.add(response); request.on('close',() => clients.delete(response)); return;
      }
      if (request.method === 'GET' && (path === '/' || path === '/index.html')) {
        const project = await serial(async () => {await syncSource();return clone(current);});
        const html = (await exportProject(project,exportOptions)).replace('<script id="fd-runtime">','<script id="fd-connected">window.__FD_CONNECTED__ = true;</script>\n<script id="fd-runtime">');
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); response.end(html); return;
      }
      respond(response,404,{error:'Not found.'});
    } catch (error) { if (!response.headersSent) respond(response,500,{error:error.message}); else response.end(); }
  });
  await new Promise((accept,reject) => {server.once('error',reject);server.listen(port,host,accept);});
  // Watch the directory so atomic replacement of the source does not detach the watch.
  const watcher = watch(dirname(sourcePath),(_event,file) => {if (!closed && (!file || String(file) === basename(sourcePath))) serial(syncSource);});
  watcher.on('error',error => broadcast('error',{message:error.message,revision}));
  const poll = setInterval(() => {if (!closed) serial(syncSource);},500); poll.unref();
  const heartbeat = setInterval(() => {for (const client of clients) client.write(': keepalive\n\n');},15000); heartbeat.unref();
  return {
    server, url:`http://127.0.0.1:${server.address().port}`,
    getProject:() => clone(current),
    async close() {closed = true;clearInterval(poll);clearInterval(heartbeat);watcher.close();for (const client of clients) client.end();await queue;await new Promise((accept,reject) => server.close(error => error ? reject(error) : accept()));}
  };
}
