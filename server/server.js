import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml' };
const preferred = Number.parseInt(process.env.PORT || '8080', 10);

function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, safe);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404, {'content-type':'application/json'}); return res.end(JSON.stringify({ error:'Recurso não encontrado.' })); }
  res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': extname(file)==='.html'?'no-cache':'public, max-age=300' });
  createReadStream(file).pipe(res);
}

function listen(port, attempts = 0) { const server = http.createServer(handler); server.once('error', err => { if (err.code === 'EADDRINUSE' && attempts < 9) listen(port + 1, attempts + 1); else throw err; }); server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Léxora disponível em http://localhost:${port}`)); }
listen(preferred);
