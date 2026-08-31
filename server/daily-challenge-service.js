import { createSharedChallenge, createGameSession, submitGameGuess } from './game-service.js';

const definitions=new Map(),sessions=new Map(),rankings=new Map();
const dayId=()=>new Date().toISOString().slice(0,10);
const key=(mode,language)=>`${dayId()}:${mode}:${language}`;

function definition(mode,language){
  if(!['quarteto','contexto'].includes(mode))throw new Error('Desafio diário inválido.');
  const id=key(mode,language);if(!definitions.has(id))definitions.set(id,{id,mode,language,challenge:createSharedChallenge(mode,language),createdAt:new Date().toISOString()});return definitions.get(id);
}

export function startDailyChallenge(playerId,{mode='quarteto',language='pt'}={}){
  const daily=definition(mode,language),session=createGameSession(mode,{language,...daily.challenge.sessionOptions});sessions.set(session.sessionId,{dailyId:daily.id,playerId,mode,startedAt:Date.now(),finished:false});
  return {...session,dailyId:daily.id,title:`Daily ${mode==='quarteto'?'Quarteto':'Contexto'}`};
}

export function submitDailyGuess(playerId,sessionId,guess){
  const tracking=sessions.get(sessionId);if(!tracking||tracking.playerId!==playerId)throw new Error('Sessão diária inválida.');if(tracking.finished)throw new Error('Desafio diário já concluído.');
  const result=submitGameGuess(sessionId,guess);if(result.finished){tracking.finished=true;tracking.elapsedMs=Date.now()-tracking.startedAt;const entry={playerId,mode:tracking.mode,elapsedMs:tracking.elapsedMs,attempts:result.attempts,solved:result.solved?.filter(Boolean).length||0,bestRank:result.bestRank||9999,discovered:result.bestRank===1,completedAt:new Date().toISOString()};const list=rankings.get(tracking.dailyId)||[];if(!list.some(item=>item.playerId===playerId))list.push(entry);rankings.set(tracking.dailyId,list);}
  return {...result,elapsedMs:tracking.elapsedMs};
}

function compare(mode,a,b){if(mode==='quarteto')return b.solved-a.solved||a.elapsedMs-b.elapsedMs||a.attempts-b.attempts||a.playerId.localeCompare(b.playerId);return Number(b.discovered)-Number(a.discovered)||(a.discovered?a.elapsedMs-b.elapsedMs:a.bestRank-b.bestRank)||a.attempts-b.attempts||a.playerId.localeCompare(b.playerId);}
export function getDailyRanking(mode='quarteto',language='pt'){const id=key(mode,language),list=[...(rankings.get(id)||[])].sort((a,b)=>compare(mode,a,b));return {dailyId:id,mode,language,ranking:list.map((entry,index)=>({...entry,position:index+1}))};}
export function resetDailyChallenges(){definitions.clear();sessions.clear();rankings.clear();}
