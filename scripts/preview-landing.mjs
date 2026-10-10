import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import worker from '../worker/src/index.mjs';

// Real Worker handler + local asset binding; no cloud services or credentials.
const port = Number(process.argv[2] || 4321);
const original = process.argv.includes('--original');
const publicDir = new URL('../worker/public/', import.meta.url);
const types = { '.html': 'text/html', '.md': 'text/markdown', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const assets = {
  async fetch(request) {
    let path = decodeURIComponent(new URL(request.url).pathname);
    if (path === '/') path = '/index.html';
    if (['/collection', '/how-it-works'].includes(path)) path += '.html';
    if (path.split('/').includes('..')) return new Response('Not found', { status: 404 });
    try {
      const body = original && !path.startsWith('/_landing/')
        ? execFileSync('git', ['show', `origin/main:worker/public${path}`], { stdio: ['ignore', 'pipe', 'ignore'] })
        : await readFile(new URL(`.${path}`, publicDir));
      const ext = path.slice(path.lastIndexOf('.'));
      return new Response(body, { headers: { 'Content-Type': `${types[ext] || 'application/octet-stream'}; charset=utf-8` } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  },
};
createServer(async (incoming, outgoing) => {
  try {
    // Never allow local preview to enter a provider-backed API handler.
    const url = `http://127.0.0.1:${port}${incoming.url}`;
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
      outgoing.writeHead(503, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify({ error: 'Local preview: browser verification supplies API fixtures.' }));
      return;
    }
    const request = new Request(url, { method: incoming.method, headers: incoming.headers });
    const response = await worker.fetch(request, { ASSETS: assets }, { waitUntil() {} });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500);
    outgoing.end(error.message);
  }
}).listen(port, '127.0.0.1', () => console.log(`Home preview: http://127.0.0.1:${port}${original ? ' (origin/main)' : ''}`));
