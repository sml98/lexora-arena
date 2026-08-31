import { randomUUID } from 'node:crypto';

const signals=[];
const pairHistory=new Map();

export function analyzeMatch(match){
  const pair=[...match.playerIds].sort().join(':'),previous=pairHistory.get(pair)||{matches:0,winners:new Map()};previous.matches++;
  if(match.winnerId)previous.winners.set(match.winnerId,(previous.winners.get(match.winnerId)||0)+1);pairHistory.set(pair,previous);
  const reasons=[];let fraudScore=0;
  const riskFlags=[...match.players.values()].flatMap(state=>state.riskFlags||[]);
  if(riskFlags.includes('impossible_action_speed')){fraudScore+=35;reasons.push('impossible_action_speed');}
  if(previous.matches>=6){fraudScore+=20;reasons.push('repeated_opponents');}
  if(previous.matches>=8&&match.winnerId&&(previous.winners.get(match.winnerId)||0)/previous.matches>=.85){fraudScore+=30;reasons.push('one_sided_repeated_results');}
  if(match.financial&&previous.matches>=4){fraudScore+=20;reasons.push('financial_pair_frequency');}
  fraudScore=Math.min(100,fraudScore);
  if(reasons.length){const signal={id:randomUUID(),matchId:match.id,playerIds:[...match.playerIds],fraudScore,reasons,status:'open',createdAt:new Date().toISOString()};signals.unshift(signal);return signal;}
  return {fraudScore:0,reasons:[],status:'clear'};
}

export function listFraudSignals(limit=100){return signals.slice(0,Math.max(1,Math.min(Number(limit)||100,500))).map(item=>structuredClone(item));}
export function resolveFraudSignal(id,{status='cleared',resolution=''}={}){const signal=signals.find(item=>item.id===id);if(!signal)throw new Error('Sinal de fraude não encontrado.');if(!['cleared','confirmed','in_review'].includes(status))throw new Error('Status de revisão inválido.');signal.status=status;signal.resolution=String(resolution).slice(0,500);signal.resolvedAt=new Date().toISOString();return structuredClone(signal);}
export function resetFraudSignals(){signals.length=0;pairHistory.clear();}
