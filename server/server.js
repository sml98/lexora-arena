import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameSession, submitGameGuess, finishGameSession, getDictionaryCatalog } from './game-service.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml' };
const argument=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;};
const preferred = Number.parseInt(argument('--port') || process.env.PORT || '8080', 10);
const host = argument('--host') || process.env.HOST || '127.0.0.1';
const rates=new Map();

function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
function body(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',chunk=>{raw+=chunk;if(raw.length>100_000)reject(new Error('Requisição muito grande.'));});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('JSON inválido.'));}});req.on('error',reject);});}
function allow(req){const key=req.socket.remoteAddress||'local',now=Date.now(),entry=rates.get(key)||{start:now,count:0};if(now-entry.start>60_000){entry.start=now;entry.count=0;}entry.count++;rates.set(key,entry);return entry.count<=180;}

async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    if(url.pathname.startsWith('/api/')&&!allow(req))return json(res,429,{error:'Muitas tentativas. Aguarde alguns segundos.'});
    if(req.method==='GET'&&url.pathname==='/api/catalog')return json(res,200,getDictionaryCatalog());
    if(req.method==='POST'&&url.pathname==='/api/games/start'){const data=await body(req);return json(res,201,createGameSession(data.mode,{language:data.language}));}
    if(req.method==='POST'&&url.pathname==='/api/games/guess'){const data=await body(req);return json(res,200,submitGameGuess(data.sessionId,data.guess));}
    if(req.method==='POST'&&url.pathname==='/api/games/finish'){const data=await body(req);return json(res,200,finishGameSession(data.sessionId));}
    if(url.pathname==='/api/health')return json(res,200,{ok:true,date:new Date().toISOString()});
    let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const publicPath=pathname==='/index.html'||pathname.startsWith('/styles/')||pathname.startsWith('/scripts/');
    if(!publicPath)return json(res,404,{error:'Recurso não encontrado.'});
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, safe);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return json(res,404,{error:'Recurso não encontrado.'});
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control':'no-cache' });
    createReadStream(file).pipe(res);
  } catch(error) { json(res,400,{error:error.message||'Não foi possível processar a jogada.'}); }
}

function accessUrls(port){
  const urls=[`http://localhost:${port}`];
  if(host==='0.0.0.0'||host==='::')for(const addresses of Object.values(networkInterfaces()))for(const address of addresses||[])if(address.family==='IPv4'&&!address.internal)urls.push(`http://${address.address}:${port}`);
  return [...new Set(urls)];
}
function listen(port, attempts = 0) { const server = http.createServer(handler); server.once('error', err => { if (err.code === 'EADDRINUSE' && attempts < 9) listen(port + 1, attempts + 1); else throw err; }); server.listen(port, host, () => console.log(`Léxora disponível em:\n${accessUrls(port).map(url=>`  ${url}`).join('\n')}`)); }
listen(preferred);
