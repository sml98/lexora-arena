import { randomUUID } from 'node:crypto';
import { CONFIG } from './config.js';
import { createGameSession, createSharedChallenge, submitGameGuess } from './game-service.js';

const matches=new Map();
const activeByPlayer=new Map();
const allowedModes=new Set(['termo','anagrama','quarteto']);
const controlledFields=new Set(['score','points','time','elapsed','winner','win','result','rating']);

const event=(match,type,data={})=>match.events.push({id:randomUUID(),type,at:new Date().toISOString(),...data});
const playerState=id=>({playerId:id,sessionId:null,score:0,actions:0,errors:0,principalError:null,finished:false,finishedAt:null,elapsedMs:null,lastResult:null,words:[],maxStreak:0,currentStreak:0});

export function createMatch({playerIds,mode='termo',language='mixed',challenge=null,countdownMs=CONFIG.COUNTDOWN_MS,createdAt=Date.now()}={}){
  if(!Array.isArray(playerIds)||playerIds.length!==2||new Set(playerIds).size!==2)throw new Error('Uma partida PVP exige dois jogadores diferentes.');
  if(!allowedModes.has(mode))throw new Error('Modo PVP inválido.');
  if(playerIds.some(id=>activeByPlayer.has(id)))throw new Error('Um jogador já está em outra partida.');
  const shared=challenge||createSharedChallenge(mode,language);
  const id=randomUUID();
  const match={id,mode,language:shared.language||language,status:'created',createdAt,startAt:null,endAt:null,endedAt:null,countdownMs,durationMs:CONFIG.MATCH_DURATIONS_MS[mode],playerIds:[...playerIds],players:new Map(playerIds.map(id=>[id,playerState(id)])),challenge:shared,events:[],winnerId:null,tie:false,finishReason:null,recorded:false,rematchRequests:new Set()};
  matches.set(id,match);for(const playerId of playerIds)activeByPlayer.set(playerId,id);
  event(match,'match_created',{mode,language:match.language});
  return match;
}

export function startMatch(matchOrId,now=Date.now()){
  const match=typeof matchOrId==='string'?matches.get(matchOrId):matchOrId;
  if(!match)throw new Error('Partida não encontrada.');
  if(match.status!=='created')return match;
  match.status='countdown';match.startAt=now+match.countdownMs;match.endAt=match.startAt+match.durationMs;
  event(match,'countdown_started',{startAt:match.startAt,endAt:match.endAt});
  return match;
}

export function activateMatch(matchOrId,now=Date.now()){
  const match=typeof matchOrId==='string'?matches.get(matchOrId):matchOrId;
  if(!match)throw new Error('Partida não encontrada.');
  if(match.status==='countdown'&&now>=match.startAt){
    for(const state of match.players.values())if(!state.sessionId){const session=createGameSession(match.mode,{language:match.language,...match.challenge.sessionOptions});state.sessionId=session.sessionId;}
    match.status='active';event(match,'match_started');
  }
  return match;
}

export function validateAction(match,playerId,action){
  if(!match.playerIds.includes(playerId))throw new Error('Jogador não pertence a esta partida.');
  if(!action||typeof action!=='object'||Array.isArray(action))throw new Error('Ação inválida.');
  for(const field of Object.keys(action))if(controlledFields.has(field))throw new Error(`O campo ${field} é controlado pelo servidor.`);
  if(Object.keys(action).some(field=>field!=='guess'))throw new Error('A ação contém campos não permitidos.');
  const guess=String(action.guess||'').trim();
  if(!guess||guess.length>40)throw new Error('Tentativa vazia ou longa demais.');
  if(/[<>]/.test(guess))throw new Error('A tentativa contém caracteres não permitidos.');
  return {guess};
}

export function calculateScore(match,state,result,now=Date.now()){
  const elapsed=Math.max(0,now-match.startAt);
  if(match.mode==='termo')return result.win?Math.max(100,10_000+(6-result.attempts)*1_000-Math.floor(elapsed/20)):0;
  if(match.mode==='quarteto')return Math.max(0,result.solved.filter(Boolean).length*3_000+(9-result.attempts)*150-Math.floor(elapsed/50));
  return Math.max(0,result.score||0);
}

export function submitAction(matchId,playerId,action,now=Date.now()){
  const match=matches.get(matchId);if(!match)throw new Error('Partida não encontrada.');
  activateMatch(match,now);
  if(match.status==='ended')throw new Error('A partida já terminou.');
  if(now<match.startAt)throw new Error('Aguarde o fim da contagem regressiva.');
  if(now>=match.endAt){finishMatch(match.id,'timeout',now);throw new Error('O tempo da partida terminou.');}
  if(match.status!=='active')throw new Error('A partida ainda não está ativa.');
  const state=match.players.get(playerId);if(state.finished)throw new Error('Você já concluiu esta partida.');
  try{
    const safeAction=validateAction(match,playerId,action);
    const result=submitGameGuess(state.sessionId,safeAction.guess);
    state.actions++;state.lastResult=result;state.score=calculateScore(match,state,result,now);state.words.push(result.guess);state.currentStreak++;state.maxStreak=Math.max(state.maxStreak,state.currentStreak);
    if(result.finished){state.finished=true;state.finishedAt=now;state.elapsedMs=now-match.startAt;}
    event(match,'action_accepted',{playerId,actionNumber:state.actions});
    if([...match.players.values()].every(player=>player.finished))finishMatch(match.id,'completed',now);
    return {match:publicMatch(match,playerId),actionResult:safeActionResult(match,result,state)};
  }catch(error){state.errors++;state.currentStreak=0;state.principalError=String(error.message||'Ação inválida.').slice(0,120);event(match,'action_rejected',{playerId,reason:state.principalError});throw error;}
}

function safeActionResult(match,result,state){
  if(match.mode==='termo')return {guess:result.guess,tiles:result.tiles,attempts:result.attempts,finished:state.finished,score:state.score};
  if(match.mode==='quarteto')return {guess:result.guess,boards:result.boards,solved:result.solved,attempts:result.attempts,finished:state.finished,score:state.score};
  return {guess:result.guess,points:result.points,found:result.found,score:state.score,finished:false};
}

function comparisonPhrase(match,viewerId){
  if(match.tie)return 'Empate: vocês terminaram com o mesmo desempenho.';
  const viewer=match.players.get(viewerId),opponent=match.players.get(match.playerIds.find(id=>id!==viewerId));
  const won=match.winnerId===viewerId,prefix=won?'Você venceu':'Você perdeu';
  if(match.finishReason==='abandonment')return won?'Seu adversário abandonou a partida.':'A partida terminou porque você se desconectou.';
  if(match.mode==='anagrama'){
    const difference=Math.abs(viewer.words.length-opponent.words.length);
    return `${prefix} por ${difference||Math.abs(viewer.score-opponent.score)} ${difference===1?'palavra':'pontos'}.`;
  }
  if(match.mode==='quarteto'){
    const own=viewer.lastResult?.solved?.filter(Boolean).length||0,other=opponent.lastResult?.solved?.filter(Boolean).length||0;
    if(own!==other)return `${prefix}: diferença de ${Math.abs(own-other)} ${Math.abs(own-other)===1?'palavra resolvida':'palavras resolvidas'}.`;
  }
  const attemptDifference=Math.abs((viewer.lastResult?.attempts||0)-(opponent.lastResult?.attempts||0));
  const timeDifference=Math.abs((viewer.elapsedMs||match.durationMs)-(opponent.elapsedMs||match.durationMs));
  if(attemptDifference)return `${prefix} por ${attemptDifference} ${attemptDifference===1?'tentativa':'tentativas'} e ${(timeDifference/1000).toFixed(1)} segundo.`;
  return `A partida foi decidida por ${(timeDifference/1000).toFixed(1)} segundo.`;
}

function answers(match){
  const options=match.challenge.sessionOptions;
  if(match.mode==='termo')return [options.secret];
  if(match.mode==='quarteto')return options.secrets;
  return [];
}

export function finishMatch(matchId,reason='completed',now=Date.now(),details={}){
  const match=matches.get(matchId);if(!match)throw new Error('Partida não encontrada.');
  if(match.status==='ended')return match;
  match.status='ended';match.endedAt=now;match.finishReason=reason;
  for(const state of match.players.values()){
    if(state.elapsedMs===null)state.elapsedMs=Math.min(match.durationMs,Math.max(0,now-match.startAt));
  }
  if(reason==='abandonment'&&details.abandonedPlayerId){match.winnerId=match.playerIds.find(id=>id!==details.abandonedPlayerId);}
  else{
    const [a,b]=match.playerIds.map(id=>match.players.get(id));
    if(a.score===b.score){
      if(a.finished&&b.finished&&a.elapsedMs!==b.elapsedMs)match.winnerId=a.elapsedMs<b.elapsedMs?a.playerId:b.playerId;
      else match.tie=true;
    }else match.winnerId=a.score>b.score?a.playerId:b.playerId;
  }
  for(const playerId of match.playerIds)activeByPlayer.delete(playerId);
  event(match,'match_finished',{reason,winnerId:match.winnerId,tie:match.tie});
  return match;
}

export function getResult(matchId,viewerId){
  const match=matches.get(matchId);if(!match)throw new Error('Partida não encontrada.');
  if(match.status!=='ended')throw new Error('A partida ainda não terminou.');
  if(!match.playerIds.includes(viewerId))throw new Error('Jogador não pertence a esta partida.');
  const opponentId=match.playerIds.find(id=>id!==viewerId),viewer=match.players.get(viewerId),opponent=match.players.get(opponentId);
  return {matchId:match.id,mode:match.mode,language:match.language,winnerId:match.winnerId,tie:match.tie,outcome:match.tie?'draw':match.winnerId===viewerId?'win':'loss',phrase:comparisonPhrase(match,viewerId),finishReason:match.finishReason,scoreDifference:Math.abs(viewer.score-opponent.score),timeDifferenceMs:Math.abs(viewer.elapsedMs-opponent.elapsedMs),answers:answers(match),players:{[viewerId]:resultStats(viewer),[opponentId]:resultStats(opponent)}};
}

function resultStats(state){return {playerId:state.playerId,score:state.score,elapsedMs:state.elapsedMs,attempts:state.lastResult?.attempts||state.actions,words:state.words.length,solved:state.lastResult?.solved?.filter(Boolean).length||Number(Boolean(state.lastResult?.win)),maxStreak:state.maxStreak,errors:state.errors,principalError:state.principalError||'Nenhuma ação inválida.'};}

export function publicMatch(matchOrId,viewerId){
  const match=typeof matchOrId==='string'?matches.get(matchOrId):matchOrId;if(!match)return null;
  return {id:match.id,mode:match.mode,language:match.language,status:match.status,startAt:match.startAt,endAt:match.endAt,durationMs:match.durationMs,challenge:match.challenge.public,playerIds:[...match.playerIds],viewer:viewerId?resultStats(match.players.get(viewerId)):undefined,scores:Object.fromEntries([...match.players].map(([id,state])=>[id,{score:state.score,actions:state.actions,finished:state.finished}]))};
}

export function getRematchData(matchId){const match=matches.get(matchId);if(!match||match.status!=='ended')throw new Error('Partida encerrada não encontrada.');return {previousMatchId:match.id,playerIds:[...match.playerIds],mode:match.mode,language:match.language,entryCredits:CONFIG.DUEL_ENTRY_CREDITS};}
export function requestRematch(matchId,playerId){const match=matches.get(matchId);if(!match||match.status!=='ended')throw new Error('Partida encerrada não encontrada.');if(!match.playerIds.includes(playerId))throw new Error('Jogador inválido.');match.rematchRequests.add(playerId);event(match,'rematch_requested',{playerId});return {ready:match.rematchRequests.size===2,data:getRematchData(matchId)};}
export function getMatch(matchId){return matches.get(matchId);}
export function getMatchByPlayer(playerId){const id=activeByPlayer.get(playerId);return id?matches.get(id):null;}
export function clearPvpMatches(){matches.clear();activeByPlayer.clear();}
