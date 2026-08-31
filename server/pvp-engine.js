import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { CONFIG } from './config.js';
import { createGameSession, createSharedChallenge, submitGameGuess } from './game-service.js';

const matches=new Map();
const activeByPlayer=new Map();
const allowedModes=new Set(['quarteto','contexto']);
const allowedMatchTypes=new Set(['casual','ranked','rewarded','tournament']);
const controlledFields=new Set(['score','points','time','elapsed','winner','win','result','rating','rank','solved']);
const hash=value=>createHash('sha256').update(value).digest('hex');

const event=(match,type,data={})=>{
  const previousHash=match.events.at(-1)?.integrityHash||null;
  const entry={id:randomUUID(),index:match.events.length,type,at:new Date().toISOString(),previousHash,...data};
  entry.integrityHash=hash(JSON.stringify(entry));match.events.push(entry);return entry;
};

const playerState=id=>({
  playerId:id,sessionId:null,score:0,actions:0,errors:0,principalError:null,finished:false,
  finishedAt:null,elapsedMs:null,lastResult:null,lastActionAt:null,focusChanges:0,riskFlags:[],words:[]
});

export function createMatch({playerIds,mode='quarteto',language='pt',matchType='ranked',challenge=null,countdownMs=CONFIG.COUNTDOWN_MS,createdAt=Date.now(),series=null}={}){
  if(!Array.isArray(playerIds)||playerIds.length!==2||new Set(playerIds).size!==2)throw new Error('Uma partida PVP exige dois jogadores diferentes.');
  if(!allowedModes.has(mode))throw new Error('Modo PVP inválido. Escolha Quarteto ou Contexto.');
  if(!allowedMatchTypes.has(matchType))throw new Error('Estado de partida inválido.');
  if(playerIds.some(id=>activeByPlayer.has(id)))throw new Error('Um jogador já está em outra partida.');
  const shared=challenge||createSharedChallenge(mode,language),id=randomUUID();
  const proofNonce=randomBytes(32).toString('hex'),challengeCommitHash=hash(`${JSON.stringify(shared.sessionOptions)}:${proofNonce}`);
  const normalizedSeries=series?{id:series.id||randomUUID(),bestOf:series.bestOf===3?3:1,wins:{...series.wins},gameNumber:series.gameNumber||1}:null;
  const match={
    id,mode,language:shared.language||language,matchType,status:'created',createdAt,startAt:null,endAt:null,endedAt:null,
    countdownMs,durationMs:CONFIG.MATCH_DURATIONS_MS[mode],playerIds:[...playerIds],players:new Map(playerIds.map(playerId=>[playerId,playerState(playerId)])),
    challenge:shared,proof:{challengeId:id,commitHash:challengeCommitHash,nonce:proofNonce},events:[],winnerId:null,tie:false,
    finishReason:null,recorded:false,rematchRequests:new Set(),series:normalizedSeries
  };
  matches.set(id,match);for(const playerId of playerIds)activeByPlayer.set(playerId,id);
  event(match,'match_created',{mode,language:match.language,matchType,seriesId:normalizedSeries?.id||null});return match;
}

export function startMatch(matchOrId,now=Date.now()){
  const match=typeof matchOrId==='string'?matches.get(matchOrId):matchOrId;
  if(!match)throw new Error('Partida não encontrada.');if(match.status!=='created')return match;
  match.status='countdown';match.startAt=now+match.countdownMs;match.endAt=match.startAt+match.durationMs;
  event(match,'countdown_started',{startAt:match.startAt,endAt:match.endAt});return match;
}

export function activateMatch(matchOrId,now=Date.now()){
  const match=typeof matchOrId==='string'?matches.get(matchOrId):matchOrId;
  if(!match)throw new Error('Partida não encontrada.');
  if(match.status==='countdown'&&now>=match.startAt){
    for(const state of match.players.values())if(!state.sessionId)state.sessionId=createGameSession(match.mode,{language:match.language,...match.challenge.sessionOptions}).sessionId;
    match.status='active';event(match,'match_started');
  }
  return match;
}

export function validateAction(match,playerId,action){
  if(!match.playerIds.includes(playerId))throw new Error('Jogador não pertence a esta partida.');
  if(!action||typeof action!=='object'||Array.isArray(action))throw new Error('Ação inválida.');
  for(const field of Object.keys(action))if(controlledFields.has(field))throw new Error(`O campo ${field} é controlado pelo servidor.`);
  if(Object.keys(action).some(field=>field!=='guess'))throw new Error('A ação contém campos não permitidos.');
  const guess=String(action.guess||'').trim();if(!guess||guess.length>40)throw new Error('Tentativa vazia ou longa demais.');
  if(/[<>]/.test(guess))throw new Error('A tentativa contém caracteres não permitidos.');return {guess};
}

export function calculateScore(match,state,result,now=Date.now()){
  const elapsed=Math.max(0,now-match.startAt);
  if(match.mode==='quarteto')return Math.max(0,result.solved.filter(Boolean).length*10_000-Math.floor(elapsed/100)-result.attempts*10);
  const discovered=result.bestRank===1?20_000:10_000-Math.min(9_999,result.bestRank);
  return Math.max(0,discovered-Math.floor(elapsed/250)-result.attempts*5);
}

export function submitAction(matchId,playerId,action,now=Date.now()){
  const match=matches.get(matchId);if(!match)throw new Error('Partida não encontrada.');activateMatch(match,now);
  if(match.status==='ended')throw new Error('A partida já terminou.');
  if(now<match.startAt)throw new Error('Aguarde o fim da contagem regressiva.');
  if(now>=match.endAt){finishMatch(match.id,'timeout',now);throw new Error('O tempo da partida terminou.');}
  if(match.status!=='active')throw new Error('A partida ainda não está ativa.');
  const state=match.players.get(playerId);if(state.finished)throw new Error('Você já concluiu esta partida.');
  try{
    if(state.lastActionAt&&now-state.lastActionAt<100){state.riskFlags.push('impossible_action_speed');throw new Error('Ação rápida demais. Aguarde antes de enviar novamente.');}
    const safeAction=validateAction(match,playerId,action),result=submitGameGuess(state.sessionId,safeAction.guess);
    state.actions++;state.lastResult=result;state.score=calculateScore(match,state,result,now);state.words.push(result.guess);state.lastActionAt=now;
    if(result.finished){state.finished=true;state.finishedAt=now;state.elapsedMs=now-match.startAt;}
    event(match,'action_accepted',{playerId,actionNumber:state.actions,guess:safeAction.guess,progress:progressFor(match,state)});
    if(result.win||[...match.players.values()].every(player=>player.finished))finishMatch(match.id,'completed',now);
    return {match:publicMatch(match,playerId),actionResult:safeActionResult(match,result,state)};
  }catch(error){state.errors++;state.principalError=String(error.message||'Ação inválida.').slice(0,120);event(match,'action_rejected',{playerId,reason:state.principalError});throw error;}
}

function safeActionResult(match,result,state){
  if(match.mode==='quarteto')return {guess:result.guess,boards:result.boards,solved:result.solved,attempts:result.attempts,finished:state.finished,score:state.score};
  return {guess:result.guess,rank:result.rank,bestRank:result.bestRank,temperature:result.temperature,attempts:result.attempts,finished:state.finished,score:state.score};
}

function attempts(state){return state.lastResult?.attempts||state.actions;}
function solved(state){return state.lastResult?.solved?.filter(Boolean).length||0;}
function bestRank(state){return state.lastResult?.bestRank||9_999;}
function elapsed(match,state){return state.elapsedMs??match.durationMs;}

function comparePlayers(match,a,b){
  if(match.mode==='quarteto'){
    if(solved(a)!==solved(b))return solved(b)-solved(a);
    if(elapsed(match,a)!==elapsed(match,b))return elapsed(match,a)-elapsed(match,b);
    if(attempts(a)!==attempts(b))return attempts(a)-attempts(b);
  }else{
    const aFound=bestRank(a)===1,bFound=bestRank(b)===1;
    if(aFound!==bFound)return aFound?-1:1;
    if(aFound&&elapsed(match,a)!==elapsed(match,b))return elapsed(match,a)-elapsed(match,b);
    if(aFound&&attempts(a)!==attempts(b))return attempts(a)-attempts(b);
    if(!aFound&&bestRank(a)!==bestRank(b))return bestRank(a)-bestRank(b);
    if(!aFound&&attempts(a)!==attempts(b))return attempts(a)-attempts(b);
  }
  return hash(`${match.proof.commitHash}:${a.playerId}`).localeCompare(hash(`${match.proof.commitHash}:${b.playerId}`));
}

export function finishMatch(matchId,reason='completed',now=Date.now(),details={}){
  const match=matches.get(matchId);if(!match)throw new Error('Partida não encontrada.');if(match.status==='ended')return match;
  match.status='ended';match.endedAt=now;match.finishReason=reason;
  for(const state of match.players.values())if(state.elapsedMs===null)state.elapsedMs=Math.min(match.durationMs,Math.max(0,now-(match.startAt||now)));
  if(reason==='server_failure'){match.tie=true;match.cancelled=true;}
  else if(reason==='abandonment'&&details.abandonedPlayerId)match.winnerId=match.playerIds.find(id=>id!==details.abandonedPlayerId);
  else{const [a,b]=match.playerIds.map(id=>match.players.get(id));match.winnerId=comparePlayers(match,a,b)<=0?a.playerId:b.playerId;}
  if(match.series&&match.winnerId){match.series.wins[match.winnerId]=(match.series.wins[match.winnerId]||0)+1;match.series.complete=match.series.wins[match.winnerId]>=Math.ceil(match.series.bestOf/2);}
  for(const playerId of match.playerIds)activeByPlayer.delete(playerId);
  event(match,'match_finished',{reason,winnerId:match.winnerId,tie:match.tie,seriesComplete:match.series?.complete||false});return match;
}

function progressFor(match,state){
  if(match.mode==='quarteto')return {solved:solved(state),total:4,status:state.finished?'finished':'playing'};
  return {bestRank:bestRank(state),found:bestRank(state)===1,status:state.finished?'finished':'playing'};
}

function resultStats(match,state){return {playerId:state.playerId,score:state.score,elapsedMs:state.elapsedMs,attempts:attempts(state),solved:solved(state),bestRank:bestRank(state),discovered:bestRank(state)===1,errors:state.errors,principalError:state.principalError||'Nenhuma ação inválida.'};}

function comparisonPhrase(match,viewerId){
  if(match.tie)return 'Partida anulada: nenhum rating ou saldo foi alterado.';
  const won=match.winnerId===viewerId,prefix=won?'Você venceu':'Você perdeu';
  if(match.finishReason==='abandonment')return won?'Rival desconectado: vitória por abandono.':'Derrota por abandono após o período de reconexão.';
  const viewer=match.players.get(viewerId),opponent=match.players.get(match.playerIds.find(id=>id!==viewerId));
  if(match.mode==='quarteto'&&solved(viewer)!==solved(opponent))return `${prefix}: ${solved(viewer)}/4 contra ${solved(opponent)}/4.`;
  if(match.mode==='contexto'&&bestRank(viewer)!==bestRank(opponent))return `${prefix}: melhor posição #${bestRank(viewer)} contra #${bestRank(opponent)}.`;
  return `${prefix} pelo desempate de tempo e tentativas.`;
}

function answers(match){return match.mode==='quarteto'?match.challenge.sessionOptions.secrets:[match.challenge.sessionOptions.challenge.secret];}

export function getResult(matchId,viewerId){
  const match=matches.get(matchId);if(!match)throw new Error('Partida não encontrada.');if(match.status!=='ended')throw new Error('A partida ainda não terminou.');
  if(!match.playerIds.includes(viewerId))throw new Error('Jogador não pertence a esta partida.');
  const opponentId=match.playerIds.find(id=>id!==viewerId),viewer=match.players.get(viewerId),opponent=match.players.get(opponentId);
  return {matchId:match.id,mode:match.mode,matchType:match.matchType,language:match.language,winnerId:match.winnerId,tie:match.tie,outcome:match.tie?'draw':match.winnerId===viewerId?'win':'loss',phrase:comparisonPhrase(match,viewerId),finishReason:match.finishReason,answers:answers(match),series:match.series,integrityProof:{challengeId:match.proof.challengeId,commitHash:match.proof.commitHash,nonce:match.proof.nonce,challenge:match.challenge.sessionOptions,finalEventHash:match.events.at(-1)?.integrityHash||null},players:{[viewerId]:resultStats(match,viewer),[opponentId]:resultStats(match,opponent)}};
}

export function recordTelemetryEvent(matchId,playerId,{focused}){const match=matches.get(matchId);if(!match||match.status!=='active'||!match.playerIds.includes(playerId))throw new Error('Partida ativa não encontrada.');const state=match.players.get(playerId);state.focusChanges++;event(match,'focus_changed',{playerId,focused:Boolean(focused),changeNumber:state.focusChanges});return {recorded:true};}

export function publicMatch(matchOrId,viewerId){
  const match=typeof matchOrId==='string'?matches.get(matchOrId):matchOrId;if(!match)return null;
  const progress=Object.fromEntries(match.playerIds.map(id=>[id,progressFor(match,match.players.get(id))]));
  return {id:match.id,mode:match.mode,matchType:match.matchType,language:match.language,status:match.status,startAt:match.startAt,endAt:match.endAt,durationMs:match.durationMs,challenge:{...match.challenge.public,commitHash:match.proof.commitHash,challengeId:match.proof.challengeId},financial:match.financial?{entryCents:match.financial.entryCents,grossPotCents:match.financial.grossPotCents,commissionPercent:match.financial.commissionPercent,winnerPrizeCents:match.financial.winnerPrizeCents,settlementStatus:match.financial.settlementStatus}:null,series:match.series,playerIds:[...match.playerIds],viewer:viewerId?resultStats(match,match.players.get(viewerId)):undefined,progress};
}

export function getRematchData(matchId){const match=matches.get(matchId);if(!match||match.status!=='ended')throw new Error('Partida encerrada não encontrada.');return {previousMatchId:match.id,playerIds:[...match.playerIds],mode:match.mode,language:match.language,matchType:match.matchType,series:match.series&&!match.series.complete?{...match.series,gameNumber:match.series.gameNumber+1}:null,entryCredits:CONFIG.DUEL_ENTRY_CREDITS};}
export function requestRematch(matchId,playerId){const match=matches.get(matchId);if(!match||match.status!=='ended')throw new Error('Partida encerrada não encontrada.');if(!match.playerIds.includes(playerId))throw new Error('Jogador inválido.');match.rematchRequests.add(playerId);event(match,'rematch_requested',{playerId});return {ready:match.rematchRequests.size===2,data:getRematchData(matchId)};}
export function getMatch(matchId){return matches.get(matchId);}
export function getMatchByPlayer(playerId){const id=activeByPlayer.get(playerId);return id?matches.get(id):null;}
export function clearPvpMatches(){matches.clear();activeByPlayer.clear();}
