import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameSession, submitGameGuess, finishGameSession, getDictionaryCatalog } from './game-service.js';
import { CONFIG, REAL_MONEY_ENABLED } from './config.js';
import { authenticatePlayer, createPlayerSession, getPlayerStoreStats, getRankings, resumePlayerSession, updatePlayerName } from './player-store.js';
import { createRealtimeService } from './realtime-server.js';
import { getTournament, joinTournament, listTournaments, seedDemoTournaments } from './tournament-service.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml' };
const argument=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;};
const preferred = Number.parseInt(argument('--port') || process.env.PORT || '8080', 10);
const host = argument('--host') || process.env.HOST || '127.0.0.1';
const rates=new Map();
seedDemoTournaments();

function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
function body(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',chunk=>{raw+=chunk;if(raw.length>100_000)reject(new Error('Requisição muito grande.'));});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('JSON inválido.'));}});req.on('error',reject);});}
function allow(req){const key=req.socket.remoteAddress||'local',now=Date.now(),entry=rates.get(key)||{start:now,count:0};if(now-entry.start>60_000){entry.start=now;entry.count=0;}entry.count++;rates.set(key,entry);return entry.count<=180;}

async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    if(url.pathname.startsWith('/api/')&&!allow(req))return json(res,429,{error:'Muitas tentativas. Aguarde alguns segundos.'});
    if(req.method==='GET'&&url.pathname==='/api/config')return json(res,200,{realMoneyEnabled:REAL_MONEY_ENABLED,creditsLabel:'Créditos demo',duelEntryCredits:CONFIG.DUEL_ENTRY_CREDITS,modes:['termo','anagrama','quarteto'],trainingModes:['contexto']});
    if(req.method==='GET'&&url.pathname==='/api/catalog')return json(res,200,getDictionaryCatalog());
    if(req.method==='POST'&&url.pathname==='/api/pvp/session'){const data=await body(req);const session=data.playerId&&data.token?resumePlayerSession(data.playerId,data.token):createPlayerSession({name:data.name,city:data.city,state:data.state});return json(res,200,session);}
    if(req.method==='POST'&&url.pathname==='/api/pvp/profile'){const data=await body(req);authenticatePlayer(data.playerId,data.token);return json(res,200,{player:updatePlayerName(data.playerId,data.name)});}
    if(req.method==='GET'&&url.pathname==='/api/rankings')return json(res,200,{period:url.searchParams.get('period')||'all',ranking:getRankings(url.searchParams.get('period')||'all',{city:url.searchParams.get('city')||undefined,state:url.searchParams.get('state')||undefined})});
    if(req.method==='GET'&&url.pathname==='/api/tournaments')return json(res,200,{tournaments:listTournaments(),realMoneyEnabled:REAL_MONEY_ENABLED});
    if(req.method==='GET'&&url.pathname.startsWith('/api/tournaments/'))return json(res,200,{tournament:getTournament(url.pathname.split('/').at(-1))});
    if(req.method==='POST'&&url.pathname==='/api/tournaments/join'){const data=await body(req);authenticatePlayer(data.playerId,data.token);return json(res,200,{tournament:joinTournament(data.tournamentId,data.playerId)});}
    if(req.method==='POST'&&url.pathname==='/api/games/start'){const data=await body(req);return json(res,201,createGameSession(data.mode,{language:data.language}));}
    if(req.method==='POST'&&url.pathname==='/api/games/guess'){const data=await body(req);return json(res,200,submitGameGuess(data.sessionId,data.guess));}
    if(req.method==='POST'&&url.pathname==='/api/games/finish'){const data=await body(req);return json(res,200,finishGameSession(data.sessionId));}
    if(url.pathname==='/api/health')return json(res,200,{ok:true,date:new Date().toISOString(),realMoneyEnabled:REAL_MONEY_ENABLED,...getPlayerStoreStats()});
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
export function createLexoraServer(){const server=http.createServer(handler);const realtime=createRealtimeService(server);return {server,realtime};}
function listen(port, attempts = 0) { const app=createLexoraServer();app.server.once('error', err => { app.realtime.close();if (err.code === 'EADDRINUSE' && attempts < 9) listen(port + 1, attempts + 1); else throw err; }); app.server.listen(port, host, () => console.log(`Léxora disponível em:\n${accessUrls(port).map(url=>`  ${url}`).join('\n')}`)); }
if(process.argv[1]===fileURLToPath(import.meta.url))listen(preferred);
