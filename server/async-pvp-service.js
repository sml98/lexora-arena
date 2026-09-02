import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {CONFIG,REAL_MONEY_ENABLED} from './config.js';
import {createGameSession,createSharedChallenge,submitGameGuess} from './game-service.js';
import {getFinancialUserId,getPublicPlayer,recordRatedMatch} from './player-store.js';
import {calculateDuelMoney,refundMatchEntry,reserveMatchEntry,settleDuel} from './financial-service.js';

const challenges=new Map();
const hash=value=>createHash('sha256').update(value).digest('hex');
const allowedStatus=new Set(['owner_playing','awaiting_opponent','opponent_playing']);

function safeResult(mode,result,elapsedMs){
  if(!result)return mode==='quarteto'?{solved:0,attempts:0,elapsedMs,score:0}:{discovered:false,bestRank:9999,attempts:0,elapsedMs,score:0};
  return mode==='quarteto'?{solved:result.solved.filter(Boolean).length,attempts:result.attempts,elapsedMs,score:result.score}:{discovered:result.bestRank===1,bestRank:result.bestRank,attempts:result.attempts,elapsedMs,score:result.score};
}

function compare(challenge,firstId,secondId){
  const a=challenge.results[firstId],b=challenge.results[secondId];
  if(challenge.mode==='quarteto'){
    if(a.solved!==b.solved)return a.solved>b.solved?firstId:secondId;
    if(a.elapsedMs!==b.elapsedMs)return a.elapsedMs<b.elapsedMs?firstId:secondId;
    if(a.attempts!==b.attempts)return a.attempts<b.attempts?firstId:secondId;
  }else{
    if(a.discovered!==b.discovered)return a.discovered?firstId:secondId;
    if(a.discovered&&a.elapsedMs!==b.elapsedMs)return a.elapsedMs<b.elapsedMs?firstId:secondId;
    if(a.discovered&&a.attempts!==b.attempts)return a.attempts<b.attempts?firstId:secondId;
    if(!a.discovered&&a.bestRank!==b.bestRank)return a.bestRank<b.bestRank?firstId:secondId;
    if(!a.discovered&&a.attempts!==b.attempts)return a.attempts<b.attempts?firstId:secondId;
  }
  return hash(`${challenge.commitHash}:${firstId}`).localeCompare(hash(`${challenge.commitHash}:${secondId}`))<=0?firstId:secondId;
}

function answers(challenge){return challenge.mode==='quarteto'?challenge.shared.sessionOptions.secrets:[challenge.shared.sessionOptions.challenge.secret];}

function publicChallenge(challenge,viewerId=null){
  const owner=getPublicPlayer(challenge.ownerId),opponent=challenge.opponentId?getPublicPlayer(challenge.opponentId):null,yourSession=viewerId?challenge.sessions[viewerId]:null;
  const base={id:challenge.id,code:challenge.code,mode:challenge.mode,language:challenge.language,matchType:challenge.matchType,bestOf:1,entryCents:challenge.entryCents,prizeCents:challenge.prizeCents,status:challenge.status,createdAt:challenge.createdAt,expiresAt:challenge.expiresAt,commitHash:challenge.commitHash,engineVersion:challenge.engineVersion,owner:owner?{id:owner.id,name:owner.name,rating:owner.ratings[challenge.mode],division:owner.divisions[challenge.mode]}:null,opponent:opponent?{id:opponent.id,name:opponent.name,rating:opponent.ratings[challenge.mode],division:opponent.divisions[challenge.mode]}:null};
  if(viewerId&&challenge.playerIds.includes(viewerId))Object.assign(base,{session:yourSession?.publicSession||null,playDeadlineAt:yourSession?.deadlineAt||null,durationMs:CONFIG.MATCH_DURATIONS_MS[challenge.mode],yourResult:challenge.results[viewerId]||null,yourActions:structuredClone(yourSession?.actions||[]),opponentFinished:Boolean(challenge.results[challenge.playerIds.find(id=>id!==viewerId)]),profile:challenge.profiles?.[viewerId]||getPublicPlayer(viewerId),result:challenge.status==='completed'?{winnerId:challenge.winnerId,tie:challenge.tie,results:structuredClone(challenge.results),answers:answers(challenge),integrityProof:{commitHash:challenge.commitHash,nonce:challenge.nonce}}:null});
  return base;
}

function startParticipant(challenge,playerId){const publicSession=createGameSession(challenge.mode,{language:challenge.language,...challenge.shared.sessionOptions});challenge.sessions[playerId]={sessionId:publicSession.sessionId,publicSession,startedAt:Date.now(),deadlineAt:Date.now()+CONFIG.MATCH_DURATIONS_MS[challenge.mode],lastResult:null,actions:[]};return publicSession;}

export async function createAsyncChallenge(ownerId,{mode='quarteto',language='pt',matchType='ranked',entryCents=0,expiresInMs=CONFIG.ASYNC_CHALLENGE_TTL_MS}={}){
  if(!CONFIG.FEATURES.asyncPvp)throw new Error('PvP assíncrono está desativado.');if(!getPublicPlayer(ownerId))throw new Error('Jogador não encontrado.');if(!['quarteto','contexto'].includes(mode))throw new Error('Modo inválido.');if(!['casual','ranked','rewarded'].includes(matchType))throw new Error('Tipo de partida inválido.');
  const financial=matchType==='rewarded';if(financial&&(!REAL_MONEY_ENABLED||!CONFIG.ALLOWED_ENTRY_CENTS.includes(entryCents)||entryCents===0))throw new Error('Partida premiada assíncrona indisponível neste ambiente.');
  const id=randomUUID(),shared=createSharedChallenge(mode,language),nonce=randomBytes(32).toString('hex'),commitHash=hash(`${JSON.stringify(shared.sessionOptions)}:${nonce}`),money=financial?calculateDuelMoney(entryCents):{winnerPrizeCents:0};
  const challenge={id,code:randomBytes(5).toString('hex').toUpperCase(),ownerId,opponentId:null,playerIds:[ownerId],mode,language:shared.language,matchType,entryCents:financial?entryCents:0,prizeCents:money.winnerPrizeCents,status:'owner_playing',createdAt:new Date().toISOString(),expiresAt:Date.now()+Math.max(60_000,Math.min(expiresInMs,CONFIG.ASYNC_CHALLENGE_TTL_MS)),shared,nonce,commitHash,engineVersion:'lexora-pvp-v6',sessions:{},results:{},winnerId:null,tie:false,settled:false};
  challenges.set(id,challenge);try{if(financial){const financialUserId=getFinancialUserId(ownerId);if(!financialUserId)throw new Error('Vincule uma identidade financeira verificada.');challenge.financialPlayerIds={[ownerId]:financialUserId};await reserveMatchEntry({matchId:id,userId:financialUserId,entryCents,idempotencyKey:`async-owner:${id}:${financialUserId}`});}startParticipant(challenge,ownerId);return publicChallenge(challenge,ownerId);}catch(error){challenges.delete(id);throw error;}
}

export async function acceptAsyncChallenge(challengeId,playerId){await sweepAsyncChallenges();const challenge=challenges.get(challengeId);if(!challenge||challenge.status!=='awaiting_opponent')throw new Error('Desafio assíncrono indisponível.');if(challenge.ownerId===playerId)throw new Error('Você não pode aceitar o próprio desafio.');if(!getPublicPlayer(playerId))throw new Error('Jogador não encontrado.');
  if(challenge.matchType==='rewarded'){const financialUserId=getFinancialUserId(playerId);if(!financialUserId)throw new Error('Vincule uma identidade financeira verificada.');challenge.financialPlayerIds[playerId]=financialUserId;await reserveMatchEntry({matchId:challenge.id,userId:financialUserId,entryCents:challenge.entryCents,idempotencyKey:`async-opponent:${challenge.id}:${financialUserId}`});}
  challenge.opponentId=playerId;challenge.playerIds.push(playerId);challenge.status='opponent_playing';startParticipant(challenge,playerId);return publicChallenge(challenge,playerId);
}

export async function submitAsyncGuess(challengeId,playerId,guess){await sweepAsyncChallenges();const challenge=challenges.get(challengeId);if(!challenge||!allowedStatus.has(challenge.status)||!challenge.playerIds.includes(playerId))throw new Error('Desafio assíncrono inválido.');const tracking=challenge.sessions[playerId];if(!tracking||challenge.results[playerId])throw new Error('Sua participação já foi concluída.');if(Date.now()>tracking.deadlineAt)return finalizeParticipant(challenge,playerId);
  const result=submitGameGuess(tracking.sessionId,guess);tracking.lastResult=result;tracking.actions.push({...result,answer:undefined,answers:undefined});if(result.finished)return finalizeParticipant(challenge,playerId);return {challenge:publicChallenge(challenge,playerId),actionResult:{...result,answer:undefined,answers:undefined}};
}

async function finalizeParticipant(challenge,playerId){const tracking=challenge.sessions[playerId],elapsedMs=Math.min(CONFIG.MATCH_DURATIONS_MS[challenge.mode],Math.max(0,Date.now()-tracking.startedAt));challenge.results[playerId]=safeResult(challenge.mode,tracking.lastResult,elapsedMs);
  if(playerId===challenge.ownerId&&challenge.playerIds.length===1){challenge.status='awaiting_opponent';return {challenge:publicChallenge(challenge,playerId),actionResult:tracking.lastResult?{...tracking.lastResult,answer:undefined,answers:undefined}:null,finished:true};}
  if(challenge.playerIds.length===2&&challenge.playerIds.every(id=>challenge.results[id])){challenge.winnerId=compare(challenge,...challenge.playerIds);challenge.status='completed';challenge.completedAt=new Date().toISOString();const profiles=recordRatedMatch({matchId:challenge.id,mode:challenge.mode,language:challenge.language,matchType:challenge.matchType,playerIds:challenge.playerIds,winnerId:challenge.winnerId,results:challenge.results,entryCents:challenge.entryCents,prizeCents:challenge.prizeCents,endedAt:challenge.completedAt});challenge.profiles=profiles;
    if(challenge.matchType==='rewarded'&&!challenge.settled){challenge.settled=true;await settleDuel({matchId:challenge.id,playerIds:challenge.playerIds.map(id=>challenge.financialPlayerIds[id]),winnerId:challenge.financialPlayerIds[challenge.winnerId],entryCents:challenge.entryCents,idempotencyKey:`async-settle:${challenge.id}`});}}
  return {challenge:publicChallenge(challenge,playerId),actionResult:tracking.lastResult?{...tracking.lastResult,answer:undefined,answers:undefined}:null,finished:true};
}

export function getAsyncChallenge(challengeId,viewerId=null){const challenge=challenges.get(challengeId);return challenge?publicChallenge(challenge,viewerId):null;}
export function listAsyncChallenges({mode,language,matchType}={}){return [...challenges.values()].filter(item=>item.status==='awaiting_opponent'&&item.expiresAt>Date.now()&&(!mode||item.mode===mode)&&(!language||item.language===language)&&(!matchType||item.matchType===matchType)).map(item=>publicChallenge(item));}
export async function cancelAsyncChallenge(challengeId,ownerId,reason='cancelled'){const challenge=challenges.get(challengeId);if(!challenge||challenge.ownerId!==ownerId||!['owner_playing','awaiting_opponent'].includes(challenge.status))throw new Error('Desafio não pode ser cancelado.');challenge.status=reason;if(challenge.matchType==='rewarded'&&!challenge.refunded){challenge.refunded=true;await refundMatchEntry({matchId:challenge.id,userId:challenge.financialPlayerIds[ownerId],entryCents:challenge.entryCents,idempotencyKey:`async-refund:${challenge.id}`,reason});}return publicChallenge(challenge,ownerId);}
export async function sweepAsyncChallenges(now=Date.now()){const expired=[];for(const challenge of challenges.values())if(['owner_playing','awaiting_opponent'].includes(challenge.status)&&challenge.expiresAt<=now){await cancelAsyncChallenge(challenge.id,challenge.ownerId,'expired');expired.push(challenge.id);}return expired;}
export function resetAsyncChallenges(){challenges.clear();}
