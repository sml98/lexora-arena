import { randomBytes, randomUUID } from 'node:crypto';
import { CONFIG } from './config.js';
import { getPublicPlayer } from './player-store.js';

const challenges=new Map();
const cleanCode=value=>String(value||'').trim().toUpperCase();

export function createChallenge(ownerId,{mode='quarteto',language='pt',matchType='casual',bestOf=1,entryCents=0,targetId=null,open=true}={}){
  if(!getPublicPlayer(ownerId))throw new Error('Jogador não encontrado.');if(!['quarteto','contexto'].includes(mode))throw new Error('Jogo inválido.');
  if(!['casual','ranked','rewarded'].includes(matchType))throw new Error('Tipo de desafio inválido.');if(![1,3].includes(bestOf))throw new Error('Série inválida.');
  if(matchType==='rewarded'&&!CONFIG.ALLOWED_ENTRY_CENTS.includes(entryCents))throw new Error('Valor de entrada inválido.');
  const challenge={id:randomUUID(),code:randomBytes(4).toString('hex').toUpperCase(),ownerId,targetId,mode,language,matchType,bestOf,entryCents,open:Boolean(open),status:'open',createdAt:new Date().toISOString(),expiresAt:Date.now()+600_000};
  challenges.set(challenge.code,challenge);return publicChallenge(challenge);
}

function publicChallenge(challenge){const owner=getPublicPlayer(challenge.ownerId);return {...challenge,owner:owner?{id:owner.id,name:owner.name,rating:owner.ratings[challenge.mode],division:owner.divisions[challenge.mode]}:null,prizeCents:challenge.entryCents?Math.floor(challenge.entryCents*2*(100-CONFIG.PLATFORM_FEE_PERCENT)/100):0};}
export function getChallenge(code){const challenge=challenges.get(cleanCode(code));if(!challenge||challenge.expiresAt<Date.now()||challenge.status!=='open')return null;return publicChallenge(challenge);}
export function listOpenChallenges(){return [...challenges.values()].filter(item=>item.open&&item.status==='open'&&item.expiresAt>Date.now()).map(publicChallenge);}
export function acceptChallenge(code,playerId){const challenge=challenges.get(cleanCode(code));if(!challenge||challenge.status!=='open'||challenge.expiresAt<Date.now())throw new Error('Desafio inválido ou expirado.');if(challenge.ownerId===playerId)throw new Error('Você não pode aceitar o próprio desafio.');if(challenge.targetId&&challenge.targetId!==playerId)throw new Error('Este desafio foi enviado a outro jogador.');challenge.status='accepted';challenge.acceptedBy=playerId;challenge.acceptedAt=new Date().toISOString();return publicChallenge(challenge);}
export function closeChallenge(code,status='cancelled'){const challenge=challenges.get(cleanCode(code));if(challenge)challenge.status=status;}
export function resetChallenges(){challenges.clear();}
