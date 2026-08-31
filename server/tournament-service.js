import { randomUUID } from 'node:crypto';
import { debitDemoCredits, creditDemoCredits, getPublicPlayer } from './player-store.js';

const tournaments=new Map();
const validSizes=new Set([8,16,32,64,128]);
const validFormats=new Set(['qualifier','knockout','hybrid']);

function roundName(totalPlayers,roundIndex,totalRounds){
  if(roundIndex===totalRounds-1)return 'Final';if(roundIndex===totalRounds-2)return 'Semifinal';
  if(totalPlayers/(2**roundIndex)===8)return 'Quartas de final';return `Rodada ${roundIndex+1}`;
}

function buildBracket(size){
  const totalRounds=Math.log2(size),rounds=[];
  for(let roundIndex=0;roundIndex<totalRounds;roundIndex++){
    const matchCount=size/(2**(roundIndex+1));
    rounds.push({index:roundIndex,name:roundName(size,roundIndex,totalRounds),matches:Array.from({length:matchCount},(_,index)=>({id:randomUUID(),index,playerIds:[null,null],winnerId:null,loserId:null,status:'waiting'}))});
  }
  return {rounds,thirdPlace:{id:randomUUID(),playerIds:[null,null],winnerId:null,loserId:null,status:'waiting'}};
}

function publicTournament(tournament){
  return {id:tournament.id,name:tournament.name,size:tournament.size,mode:tournament.mode,language:tournament.language,format:tournament.format,status:tournament.status,entryCredits:tournament.entryCredits,commissionPercent:tournament.commissionPercent,virtualPrizePool:tournament.virtualPrizePool,sponsoredPrizeCents:tournament.sponsoredPrizeCents,startsAt:tournament.startsAt,recurrence:tournament.recurrence,players:tournament.players.map(id=>getPublicPlayer(id)).filter(Boolean),bracket:tournament.bracket,qualifyingRounds:tournament.qualifyingRounds,podium:tournament.podium,history:tournament.history};
}

export function createTournament({name,mode='quarteto',language='pt',format='knockout',size=8,entryCredits=0,commissionPercent=15,sponsoredPrizeCents=0,startsAt=Date.now()+3_600_000,recurrence=null}={}){
  if(!validSizes.has(size))throw new Error('Torneios aceitam 8, 16, 32, 64 ou 128 jogadores.');
  if(!['quarteto','contexto'].includes(mode))throw new Error('Modo de torneio inválido.');
  if(!validFormats.has(format))throw new Error('Formato de torneio inválido.');
  if(!Number.isInteger(entryCredits)||entryCredits<0)throw new Error('Entrada virtual inválida.');
  const id=randomUUID(),gross=size*entryCredits,virtualPrizePool=Math.floor(gross*(100-commissionPercent)/100);
  const tournament={id,name:String(name||`Arena ${size}`).slice(0,80),mode,language,format,size,entryCredits,commissionPercent,virtualPrizePool,sponsoredPrizeCents,startsAt,status:'registration',recurrence,players:[],bracket:format==='knockout'?buildBracket(size):null,qualifyingRounds:[],podium:null,history:[],createdAt:new Date().toISOString()};
  tournaments.set(id,tournament);return publicTournament(tournament);
}

export function joinTournament(tournamentId,playerId){
  const tournament=tournaments.get(tournamentId);if(!tournament)throw new Error('Torneio não encontrado.');
  if(tournament.status!=='registration')throw new Error('As inscrições deste torneio foram encerradas.');
  if(tournament.players.includes(playerId))throw new Error('Jogador já inscrito neste torneio.');
  if(tournament.players.length>=tournament.size)throw new Error('Torneio lotado.');
  if(!getPublicPlayer(playerId))throw new Error('Jogador não encontrado.');
  if(tournament.entryCredits>0)debitDemoCredits(playerId,tournament.entryCredits,{type:'tournament_entry',tournamentId,description:`Inscrição virtual: ${tournament.name}`});
  tournament.players.push(playerId);tournament.history.push({type:'joined',playerId,at:new Date().toISOString()});
  if(tournament.players.length===tournament.size)startTournament(tournamentId);return publicTournament(tournament);
}

export function startTournament(tournamentId){
  const tournament=tournaments.get(tournamentId);if(!tournament||tournament.status!=='registration')throw new Error('Torneio disponível para início não encontrado.');
  if(tournament.players.length<2)throw new Error('São necessários ao menos dois jogadores reais.');
  tournament.status='active';
  if(tournament.format==='knockout'){
    tournament.bracket=buildBracket(tournament.players.length);
    tournament.bracket.rounds[0].matches.forEach((match,index)=>{match.playerIds=[tournament.players[index*2],tournament.players[index*2+1]];match.status='ready';});
  }else createTournamentRound(tournamentId,{advanceCount:tournament.format==='hybrid'?Math.min(8,tournament.players.length/2):Math.max(2,tournament.players.length/2)});
  tournament.history.push({type:'started',at:new Date().toISOString()});return publicTournament(tournament);
}

export function createTournamentRound(tournamentId,{advanceCount}={}){
  const tournament=tournaments.get(tournamentId);if(!tournament||tournament.status!=='active')throw new Error('Torneio ativo não encontrado.');
  const round={id:randomUUID(),index:tournament.qualifyingRounds.length,status:'active',seed:randomUUID(),playerIds:[...(tournament.qualifyingRounds.at(-1)?.qualifiedIds||tournament.players)],advanceCount:Math.max(2,Math.min(advanceCount||2,tournament.players.length)),results:[],qualifiedIds:[]};
  tournament.qualifyingRounds.push(round);tournament.history.push({type:'round_started',roundId:round.id,at:new Date().toISOString()});return structuredClone(round);
}

export function submitTournamentRoundResult(tournamentId,roundId,playerId,result){
  const tournament=tournaments.get(tournamentId),round=tournament?.qualifyingRounds.find(item=>item.id===roundId);
  if(!round||round.status!=='active'||!round.playerIds.includes(playerId))throw new Error('Rodada classificatória ativa não encontrada.');
  if(round.results.some(item=>item.playerId===playerId))throw new Error('Resultado já enviado.');
  const safe=tournament.mode==='quarteto'?{playerId,solved:Number(result.solved)||0,elapsedMs:Number(result.elapsedMs)||Infinity,attempts:Number(result.attempts)||Infinity}:{playerId,discovered:Boolean(result.discovered),elapsedMs:Number(result.elapsedMs)||Infinity,attempts:Number(result.attempts)||Infinity,bestRank:Number(result.bestRank)||9999};
  round.results.push(safe);return structuredClone(safe);
}

function compareRound(mode,a,b){
  if(mode==='quarteto')return b.solved-a.solved||a.elapsedMs-b.elapsedMs||a.attempts-b.attempts||a.playerId.localeCompare(b.playerId);
  return Number(b.discovered)-Number(a.discovered)||(a.discovered?a.elapsedMs-b.elapsedMs:a.bestRank-b.bestRank)||a.attempts-b.attempts||a.playerId.localeCompare(b.playerId);
}

export function advanceTournamentRound(tournamentId,roundId){
  const tournament=tournaments.get(tournamentId),round=tournament?.qualifyingRounds.find(item=>item.id===roundId);
  if(!round||round.status!=='active')throw new Error('Rodada ativa não encontrada.');
  if(round.results.length!==round.playerIds.length)throw new Error('A rodada ainda possui jogadores sem resultado.');
  round.results.sort((a,b)=>compareRound(tournament.mode,a,b));round.qualifiedIds=round.results.slice(0,round.advanceCount).map(item=>item.playerId);round.status='completed';
  tournament.history.push({type:'round_completed',roundId,qualifiedIds:round.qualifiedIds,at:new Date().toISOString()});
  if(tournament.format==='hybrid'&&round.qualifiedIds.length<=8){tournament.bracket=buildBracket(round.qualifiedIds.length);tournament.bracket.rounds[0].matches.forEach((match,index)=>{match.playerIds=[round.qualifiedIds[index*2],round.qualifiedIds[index*2+1]];match.status='ready';});}
  else if(tournament.format==='qualifier'&&round.qualifiedIds.length<=2){tournament.podium={first:round.qualifiedIds[0],second:round.qualifiedIds[1],third:round.results[2]?.playerId||null};finishTournament(tournament);}
  return publicTournament(tournament);
}

function findBracketMatch(tournament,matchId){for(const round of tournament.bracket?.rounds||[]){const match=round.matches.find(item=>item.id===matchId);if(match)return {match,round};}if(tournament.bracket?.thirdPlace.id===matchId)return {match:tournament.bracket.thirdPlace,round:{index:'third'}};return null;}

export function recordTournamentResult(tournamentId,matchId,winnerId){
  const tournament=tournaments.get(tournamentId);if(!tournament||tournament.status!=='active')throw new Error('Torneio ativo não encontrado.');
  const found=findBracketMatch(tournament,matchId);if(!found)throw new Error('Confronto não encontrado.');
  const {match,round}=found;if(match.status==='finished')throw new Error('Confronto já finalizado.');if(!match.playerIds.includes(winnerId)||match.playerIds.some(id=>!id))throw new Error('Vencedor inválido para este confronto.');
  match.winnerId=winnerId;match.loserId=match.playerIds.find(id=>id!==winnerId);match.status='finished';tournament.history.push({type:'match_finished',matchId,winnerId,at:new Date().toISOString()});
  if(round.index==='third'){completeTournamentIfReady(tournament);return publicTournament(tournament);}const nextRound=tournament.bracket.rounds[round.index+1];
  if(nextRound){const next=nextRound.matches[Math.floor(match.index/2)];next.playerIds[match.index%2]=winnerId;if(next.playerIds.every(Boolean))next.status='ready';if(round.name==='Semifinal'){const third=tournament.bracket.thirdPlace;third.playerIds[match.index]=match.loserId;if(third.playerIds.every(Boolean))third.status='ready';}}
  completeTournamentIfReady(tournament);return publicTournament(tournament);
}

function completeTournamentIfReady(tournament){const final=tournament.bracket.rounds.at(-1).matches[0],third=tournament.bracket.thirdPlace;if(final.status!=='finished'||third.status!=='finished')return;tournament.podium={first:final.winnerId,second:final.loserId,third:third.winnerId};finishTournament(tournament);}
function finishTournament(tournament){tournament.status='completed';const awards=[['first',.6],['second',.25],['third',.15]];if(tournament.virtualPrizePool>0)for(const [place,share] of awards){const playerId=tournament.podium?.[place];if(playerId)creditDemoCredits(playerId,Math.floor(tournament.virtualPrizePool*share),{type:'tournament_prize',tournamentId:tournament.id,description:`${place} lugar — prêmio virtual`});}tournament.history.push({type:'completed',podium:tournament.podium,at:new Date().toISOString()});}

export function getTournament(id){const tournament=tournaments.get(id);return tournament?publicTournament(tournament):null;}
export function listTournaments(){return [...tournaments.values()].map(publicTournament).sort((a,b)=>a.startsAt-b.startsAt);}
export function resetTournaments(){tournaments.clear();}
export function seedDemoTournaments(){return listTournaments();}
