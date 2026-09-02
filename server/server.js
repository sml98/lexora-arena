import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameSession, submitGameGuess, finishGameSession, getDictionaryCatalog } from './game-service.js';
import { CONFIG, MONEY_CONFIG, MONEY_READINESS, REAL_MONEY_ENABLED } from './config.js';
import { checkDatabase } from './database.js';
import { calculateDuelMoney, cancelFinancialTournament, createDeposit, createFinancialTournament, getFinancialBusinessMetrics, getWallet, joinFinancialTournament, listAdminTransactions, listFinancialTournaments, processPaymentWebhook, recoverInterruptedDuels, requestWithdrawal, settleFinancialTournament } from './financial-service.js';
import { authenticateFinancialRequest, loginUser, registerUser, setResponsibleLimits, setSelfExclusion } from './identity-service.js';
import { authenticatePlayer, createPlayerSession, getBusinessMetrics, getPlayerStoreStats, getRankings, getRivalry, linkFinancialIdentity, reportPlayer, resumePlayerSession, updatePlayerName } from './player-store.js';
import { checkRedis } from './redis.js';
import { createRealtimeService } from './realtime-server.js';
import { createPaymentWorker } from './payment-worker.js';
import { metricsSnapshot, observeHttp } from './metrics.js';
import { safeEqualHex, sha256 } from './security.js';
import { ensureProductTournaments, getTournament, joinTournament, listTournaments } from './tournament-service.js';
import { createChallenge, getChallenge, listOpenChallenges } from './challenge-service.js';
import { listFraudSignals, resolveFraudSignal } from './antifraud-service.js';
import { listAdminActions, recordAdminAction } from './admin-service.js';
import { getDailyRanking, startDailyChallenge, submitDailyGuess } from './daily-challenge-service.js';
import { acceptAsyncChallenge, cancelAsyncChallenge, createAsyncChallenge, getAsyncChallenge, listAsyncChallenges, submitAsyncGuess, sweepAsyncChallenges } from './async-pvp-service.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml' };
const argument=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;};
const preferred = Number.parseInt(argument('--port') || process.env.PORT || '8080', 10);
const host = argument('--host') || process.env.HOST || '127.0.0.1';
const rates=new Map();
ensureProductTournaments();

const securityHeaders={
  'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};
function json(res,status,data){res.writeHead(status,{...securityHeaders,'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
function rawBody(req,limit=100_000){return new Promise((resolve,reject)=>{let raw='',done=false;req.on('data',chunk=>{if(done)return;raw+=chunk;if(Buffer.byteLength(raw)>limit){done=true;reject(Object.assign(new Error('Requisição muito grande.'),{statusCode:413}));req.destroy();}});req.on('end',()=>{if(!done)resolve(raw);});req.on('error',reject);});}
async function body(req){const raw=await rawBody(req);try{return raw?JSON.parse(raw):{};}catch{throw Object.assign(new Error('JSON inválido.'),{statusCode:400});}}
function allow(req){const key=req.socket.remoteAddress||'local',now=Date.now(),entry=rates.get(key)||{start:now,count:0};if(now-entry.start>60_000){entry.start=now;entry.count=0;}entry.count++;rates.set(key,entry);return entry.count<=180;}
function originAllowed(req){const origin=req.headers.origin;if(!origin)return true;try{const parsed=new URL(origin);const sameHost=parsed.host===req.headers.host;const configured=String(process.env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean);return sameHost||configured.includes(origin);}catch{return false;}}
function assertAdmin(req){const provided=sha256(String(req.headers['x-admin-token']||'')),expected=sha256(String(process.env.ADMIN_API_TOKEN||'missing'));if(!process.env.ADMIN_API_TOKEN||!safeEqualHex(provided,expected))throw Object.assign(new Error('Acesso administrativo negado.'),{statusCode:403});}
const requestMeta=req=>({userAgentHash:req.headers['user-agent']?sha256(req.headers['user-agent']):null,ipHash:sha256(req.socket.remoteAddress||'unknown')});

async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    if(url.pathname.startsWith('/api/')&&!allow(req))return json(res,429,{error:'Muitas tentativas. Aguarde alguns segundos.'});
    if(url.pathname.startsWith('/api/')&&!originAllowed(req))return json(res,403,{error:'Origem não autorizada.'});
    if(req.method==='GET'&&url.pathname==='/api/config')return json(res,200,{realMoneyEnabled:REAL_MONEY_ENABLED,modes:['quarteto','contexto'],matchTypes:['casual','ranked',...(REAL_MONEY_ENABLED?['rewarded']:[])],entryCents:CONFIG.ALLOWED_ENTRY_CENTS,durationsMs:CONFIG.MATCH_DURATIONS_MS,matchmakingWindows:CONFIG.MATCHMAKING_WINDOWS,divisions:CONFIG.DIVISIONS,features:CONFIG.FEATURES});
    if(req.method==='GET'&&url.pathname==='/api/finance/status')return json(res,200,{enabled:REAL_MONEY_ENABLED,requested:MONEY_READINESS.requested,blockers:MONEY_READINESS.blockers,legalReviewStatus:MONEY_CONFIG.legalReviewStatus,paymentProvider:MONEY_CONFIG.paymentProvider,commissionPercent:MONEY_CONFIG.platformCommissionPercent,minWithdrawalCents:MONEY_CONFIG.minWithdrawalCents,withdrawalFeeCents:MONEY_CONFIG.withdrawalFeeCents,currency:'BRL',notice:REAL_MONEY_ENABLED?'Operações financeiras habilitadas.':'Depósitos, inscrições financeiras e saques estão bloqueados.'});
    if(req.method==='GET'&&url.pathname==='/api/finance/quote'){const quote=calculateDuelMoney(url.searchParams.get('entryCents'));return json(res,200,quote);}
    if(req.method==='POST'&&url.pathname==='/api/financial/auth/register')return json(res,201,await registerUser(await body(req)));
    if(req.method==='POST'&&url.pathname==='/api/financial/auth/login')return json(res,200,await loginUser(await body(req),requestMeta(req)));
    if(req.method==='POST'&&url.pathname==='/api/pvp/link-financial'){const user=await authenticateFinancialRequest(req);const data=await body(req);authenticatePlayer(data.playerId,data.playerToken);return json(res,200,{player:linkFinancialIdentity(data.playerId,user.id)});}
    if(req.method==='GET'&&url.pathname==='/api/wallet'){const user=await authenticateFinancialRequest(req);return json(res,200,await getWallet(user.id));}
    if(req.method==='POST'&&url.pathname==='/api/wallet/deposits'){const user=await authenticateFinancialRequest(req);const data=await body(req);data.idempotencyKey=req.headers['idempotency-key']||data.idempotencyKey;return json(res,202,{operation:await createDeposit(user.id,data)});}
    if(req.method==='POST'&&url.pathname==='/api/wallet/withdrawals'){const user=await authenticateFinancialRequest(req);const data=await body(req);data.idempotencyKey=req.headers['idempotency-key']||data.idempotencyKey;return json(res,202,{operation:await requestWithdrawal(user.id,data)});}
    if(req.method==='POST'&&url.pathname==='/api/responsible/self-exclusion'){const user=await authenticateFinancialRequest(req);const data=await body(req);return json(res,200,{user:await setSelfExclusion(user.id,data.until)});}
    if(req.method==='POST'&&url.pathname==='/api/responsible/limits'){const user=await authenticateFinancialRequest(req);return json(res,200,{user:await setResponsibleLimits(user.id,await body(req))});}
    if(req.method==='GET'&&url.pathname==='/api/financial/tournaments')return json(res,200,{tournaments:await listFinancialTournaments(),enabled:REAL_MONEY_ENABLED});
    if(req.method==='POST'&&url.pathname.match(/^\/api\/financial\/tournaments\/[^/]+\/join$/)){const user=await authenticateFinancialRequest(req),tournamentId=url.pathname.split('/')[4],data=await body(req),key=req.headers['idempotency-key']||data.idempotencyKey;return json(res,200,await joinFinancialTournament(user.id,tournamentId,key));}
    if(req.method==='POST'&&url.pathname==='/api/webhooks/efi/pix'){const raw=await rawBody(req,250_000);return json(res,200,await processPaymentWebhook(raw,req.headers));}
    if(req.method==='GET'&&url.pathname==='/api/admin/transactions'){assertAdmin(req);return json(res,200,{transactions:REAL_MONEY_ENABLED?await listAdminTransactions(url.searchParams.get('limit')):[],financialModeEnabled:REAL_MONEY_ENABLED});}
    if(req.method==='GET'&&url.pathname==='/api/admin/metrics'){assertAdmin(req);const local=getBusinessMetrics(),financial=REAL_MONEY_ENABLED?await getFinancialBusinessMetrics():{registeredUsers:local.registeredUsers,dailyActiveUsers:local.dailyActiveUsers,payingUsers:0,deposits:0,withdrawals:0,paidMatches:0,averageEntryValueCents:0,periods:{today:{gmvCents:0,platformRevenueCents:0},sevenDays:{gmvCents:0,platformRevenueCents:0},thirtyDays:{gmvCents:0,platformRevenueCents:0}}};return json(res,200,metricsSnapshot({players:getPlayerStoreStats(),business:financial,tournaments:{total:listTournaments().length,active:listTournaments().filter(item=>item.status==='active').length},realtime:'available'}));}
    if(req.method==='POST'&&url.pathname==='/api/admin/tournaments'){assertAdmin(req);return json(res,201,{tournament:await createFinancialTournament(await body(req))});}
    if(req.method==='POST'&&url.pathname.match(/^\/api\/admin\/tournaments\/[^/]+\/cancel$/)){assertAdmin(req);const tournamentId=url.pathname.split('/')[4],data=await body(req);return json(res,200,await cancelFinancialTournament(tournamentId,data.reason,req.headers['idempotency-key']||data.idempotencyKey));}
    if(req.method==='POST'&&url.pathname.match(/^\/api\/admin\/tournaments\/[^/]+\/settle$/)){assertAdmin(req);const tournamentId=url.pathname.split('/')[4],data=await body(req);return json(res,200,await settleFinancialTournament(tournamentId,data.podium,req.headers['idempotency-key']||data.idempotencyKey));}
    if(req.method==='GET'&&url.pathname==='/api/catalog')return json(res,200,getDictionaryCatalog());
    if(req.method==='POST'&&url.pathname==='/api/pvp/session'){const data=await body(req);const session=data.playerId&&data.token?resumePlayerSession(data.playerId,data.token):createPlayerSession({name:data.name,city:data.city,state:data.state});return json(res,200,session);}
    if(req.method==='POST'&&url.pathname==='/api/pvp/profile'){const data=await body(req);authenticatePlayer(data.playerId,data.token);return json(res,200,{player:updatePlayerName(data.playerId,data.name)});}
    if(req.method==='GET'&&url.pathname==='/api/rankings')return json(res,200,{period:url.searchParams.get('period')||'all',mode:url.searchParams.get('mode')||'quarteto',ranking:getRankings(url.searchParams.get('period')||'all',{mode:url.searchParams.get('mode')||'quarteto',city:url.searchParams.get('city')||undefined,state:url.searchParams.get('state')||undefined})});
    if(req.method==='GET'&&url.pathname==='/api/tournaments')return json(res,200,{tournaments:listTournaments(),realMoneyEnabled:REAL_MONEY_ENABLED});
    if(req.method==='GET'&&url.pathname.startsWith('/api/tournaments/'))return json(res,200,{tournament:getTournament(url.pathname.split('/').at(-1))});
    if(req.method==='POST'&&url.pathname==='/api/tournaments/join'){const data=await body(req);authenticatePlayer(data.playerId,data.token);return json(res,200,{tournament:joinTournament(data.tournamentId,data.playerId)});}
    if(req.method==='GET'&&url.pathname==='/api/challenges')return json(res,200,{challenges:listOpenChallenges()});
    if(req.method==='GET'&&url.pathname.startsWith('/api/challenges/'))return json(res,200,{challenge:getChallenge(url.pathname.split('/').at(-1))});
    if(req.method==='POST'&&url.pathname==='/api/challenges'){const data=await body(req);authenticatePlayer(data.playerId,data.token);return json(res,201,{challenge:createChallenge(data.playerId,data)});}
    if(req.method==='GET'&&url.pathname==='/api/async-challenges'){await sweepAsyncChallenges();return json(res,200,{challenges:listAsyncChallenges({mode:url.searchParams.get('mode')||undefined,language:url.searchParams.get('language')||undefined,matchType:url.searchParams.get('matchType')||undefined})});}
    if(req.method==='POST'&&url.pathname==='/api/async-challenges'){const data=await body(req);authenticatePlayer(data.playerId,data.token);return json(res,201,{challenge:await createAsyncChallenge(data.playerId,data)});}
    if(req.method==='POST'&&url.pathname.match(/^\/api\/async-challenges\/[^/]+\/accept$/)){const data=await body(req),id=url.pathname.split('/')[3];authenticatePlayer(data.playerId,data.token);return json(res,200,{challenge:await acceptAsyncChallenge(id,data.playerId)});}
    if(req.method==='POST'&&url.pathname.match(/^\/api\/async-challenges\/[^/]+\/guess$/)){const data=await body(req),id=url.pathname.split('/')[3];authenticatePlayer(data.playerId,data.token);return json(res,200,await submitAsyncGuess(id,data.playerId,data.guess));}
    if(req.method==='POST'&&url.pathname.match(/^\/api\/async-challenges\/[^/]+\/cancel$/)){const data=await body(req),id=url.pathname.split('/')[3];authenticatePlayer(data.playerId,data.token);return json(res,200,{challenge:await cancelAsyncChallenge(id,data.playerId)});}
    if(req.method==='POST'&&url.pathname.match(/^\/api\/async-challenges\/[^/]+\/view$/)){const data=await body(req),id=url.pathname.split('/')[3];authenticatePlayer(data.playerId,data.token);const challenge=getAsyncChallenge(id,data.playerId);if(!challenge)throw new Error('Desafio não encontrado.');return json(res,200,{challenge});}
    if(req.method==='POST'&&url.pathname.match(/^\/api\/rivalries\/[^/]+$/)){const data=await body(req);authenticatePlayer(data.playerId,data.token);return json(res,200,{rivalry:getRivalry(data.playerId,url.pathname.split('/')[3])});}
    if(req.method==='POST'&&url.pathname==='/api/pvp/report'){const data=await body(req);authenticatePlayer(data.playerId,data.token);const rivalry=getRivalry(data.playerId,data.targetId);if(!rivalry.total)throw new Error('Só é possível denunciar um rival recente.');return json(res,201,{report:reportPlayer(data.playerId,data.targetId,data.reason)});}
    if(req.method==='GET'&&url.pathname==='/api/daily/rankings')return json(res,200,getDailyRanking(url.searchParams.get('mode')||'quarteto',url.searchParams.get('language')||'pt'));
    if(req.method==='POST'&&url.pathname==='/api/daily/start'){const data=await body(req);authenticatePlayer(data.playerId,data.token);return json(res,201,startDailyChallenge(data.playerId,data));}
    if(req.method==='POST'&&url.pathname==='/api/daily/guess'){const data=await body(req);authenticatePlayer(data.playerId,data.token);return json(res,200,submitDailyGuess(data.playerId,data.sessionId,data.guess));}
    if(req.method==='GET'&&url.pathname==='/api/admin/fraud-signals'){assertAdmin(req);return json(res,200,{signals:listFraudSignals(url.searchParams.get('limit'))});}
    if(req.method==='POST'&&url.pathname.match(/^\/api\/admin\/fraud-signals\/[^/]+\/resolve$/)){assertAdmin(req);const id=url.pathname.split('/')[4],data=await body(req),signal=resolveFraudSignal(id,data);return json(res,200,{signal,audit:recordAdminAction({action:'fraud_signal_resolved',targetType:'fraud_signal',targetId:id,reason:data.resolution,metadata:{status:data.status}})});}
    if(req.method==='GET'&&url.pathname==='/api/admin/audit'){assertAdmin(req);return json(res,200,{actions:listAdminActions(url.searchParams.get('limit'))});}
    if(req.method==='POST'&&url.pathname==='/api/games/start'){const data=await body(req);return json(res,201,createGameSession(data.mode,{language:data.language}));}
    if(req.method==='POST'&&url.pathname==='/api/games/guess'){const data=await body(req);return json(res,200,submitGameGuess(data.sessionId,data.guess));}
    if(req.method==='POST'&&url.pathname==='/api/games/finish'){const data=await body(req);return json(res,200,finishGameSession(data.sessionId));}
    if(url.pathname==='/api/health'){const [database,redis]=await Promise.all([checkDatabase(),checkRedis()]);return json(res,200,{ok:true,date:new Date().toISOString(),realMoneyEnabled:REAL_MONEY_ENABLED,moneyRequested:MONEY_READINESS.requested,infrastructure:{database,redis},...getPlayerStoreStats()});}
    let pathname = url.pathname === '/' ? '/index.html' : url.pathname==='/admin'?'/admin.html':url.pathname;
    const publicPath=pathname==='/index.html'||pathname==='/admin.html'||pathname.startsWith('/styles/')||pathname.startsWith('/scripts/');
    if(!publicPath)return json(res,404,{error:'Recurso não encontrado.'});
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, safe);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return json(res,404,{error:'Recurso não encontrado.'});
    res.writeHead(200, { ...securityHeaders,'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control':'no-cache' });
    createReadStream(file).pipe(res);
  } catch(error) { json(res,error.statusCode||400,{error:error.message||'Não foi possível processar a solicitação.',code:error.code,blockers:error.blockers}); }
}

function accessUrls(port){
  const urls=[`http://localhost:${port}`];
  if(host==='0.0.0.0'||host==='::')for(const addresses of Object.values(networkInterfaces()))for(const address of addresses||[])if(address.family==='IPv4'&&!address.internal)urls.push(`http://${address.address}:${port}`);
  return [...new Set(urls)];
}
export function createLexoraServer(){const server=http.createServer((req,res)=>{const start=Date.now();res.once('finish',()=>{observeHttp(res.statusCode);if(process.env.STRUCTURED_HTTP_LOGS==='true')console.log(JSON.stringify({level:'info',event:'http_request',method:req.method,path:String(req.url||'').split('?')[0],status:res.statusCode,durationMs:Date.now()-start}));});void handler(req,res);});const realtime=createRealtimeService(server),payments=createPaymentWorker();server.on('close',()=>payments.close());return {server,realtime,payments};}
async function listen(port, attempts = 0) {
  if(REAL_MONEY_ENABLED){const [database,redis]=await Promise.all([checkDatabase(),checkRedis()]);if(!database.ready||!redis.ready)throw new Error('Inicialização financeira recusada: PostgreSQL e Redis precisam estar saudáveis.');const recovered=await recoverInterruptedDuels();if(recovered.length)console.warn(JSON.stringify({level:'warn',event:'interrupted_matches_refunded',count:recovered.length}));}
  const app=createLexoraServer();app.server.once('error', err => { app.realtime.close();if (err.code === 'EADDRINUSE' && attempts < 9) void listen(port + 1, attempts + 1); else throw err; }); app.server.listen(port, host, () => console.log(`Léxora disponível em:\n${accessUrls(port).map(url=>`  ${url}`).join('\n')}`));
}
if(process.argv[1]===fileURLToPath(import.meta.url))listen(preferred).catch(error=>{console.error(JSON.stringify({level:'fatal',event:'startup_failed',message:error.message}));process.exitCode=1;});
