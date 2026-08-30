import { randomUUID } from 'node:crypto';
import { debitDemoCredits, creditDemoCredits, getPublicPlayer } from './player-store.js';

const tournaments=new Map();
const validSizes=new Set([8,16,32]);

function roundName(totalPlayers,roundIndex,totalRounds){
  if(roundIndex===totalRounds-1)return 'Final';
  if(roundIndex===totalRounds-2)return 'Semifinal';
  if(totalPlayers/(2**roundIndex)===8)return 'Quartas de final';
  return `Rodada ${roundIndex+1}`;
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
  return {id:tournament.id,name:tournament.name,size:tournament.size,mode:tournament.mode,language:tournament.language,status:tournament.status,entryCredits:tournament.entryCredits,commissionPercent:tournament.commissionPercent,virtualPrizePool:tournament.virtualPrizePool,startsAt:tournament.startsAt,players:tournament.players.map(id=>getPublicPlayer(id)).filter(Boolean),bracket:tournament.bracket,podium:tournament.podium,history:tournament.history};
}

export function createTournament({name,mode='termo',language='mixed',size=8,entryCredits=4,commissionPercent=20,startsAt=Date.now()+3_600_000}={}){
  if(!validSizes.has(size))throw new Error('Torneios aceitam 8, 16 ou 32 jogadores.');
  if(!['termo','anagrama','quarteto'].includes(mode))throw new Error('Modo de torneio inválido.');
  const id=randomUUID();
  const gross=size*entryCredits,virtualPrizePool=Math.floor(gross*(100-commissionPercent)/100);
  const tournament={id,name:String(name||`Arena ${size}`).slice(0,50),mode,language,size,entryCredits,commissionPercent,virtualPrizePool,startsAt,status:'registration',players:[],bracket:buildBracket(size),podium:null,history:[],createdAt:new Date().toISOString()};
  tournaments.set(id,tournament);return publicTournament(tournament);
}

export function joinTournament(tournamentId,playerId){
  const tournament=tournaments.get(tournamentId);if(!tournament)throw new Error('Torneio não encontrado.');
  if(tournament.status!=='registration')throw new Error('As inscrições deste torneio foram encerradas.');
  if(tournament.players.includes(playerId))throw new Error('Jogador já inscrito neste torneio.');
  if(tournament.players.length>=tournament.size)throw new Error('Torneio lotado.');
  debitDemoCredits(playerId,tournament.entryCredits,{type:'tournament_entry',tournamentId,description:`Inscrição virtual: ${tournament.name}`});
  tournament.players.push(playerId);tournament.history.push({type:'joined',playerId,at:new Date().toISOString()});
  if(tournament.players.length===tournament.size){
    tournament.status='active';
    tournament.bracket.rounds[0].matches.forEach((match,index)=>{match.playerIds=[tournament.players[index*2],tournament.players[index*2+1]];match.status='ready';});
    tournament.history.push({type:'started',at:new Date().toISOString()});
  }
  return publicTournament(tournament);
}

function findBracketMatch(tournament,matchId){
  for(const round of tournament.bracket.rounds){const match=round.matches.find(item=>item.id===matchId);if(match)return {match,round};}
  if(tournament.bracket.thirdPlace.id===matchId)return {match:tournament.bracket.thirdPlace,round:{index:'third'}};
  return null;
}

export function recordTournamentResult(tournamentId,matchId,winnerId){
  const tournament=tournaments.get(tournamentId);if(!tournament||tournament.status!=='active')throw new Error('Torneio ativo não encontrado.');
  const found=findBracketMatch(tournament,matchId);if(!found)throw new Error('Confronto não encontrado.');
  const {match,round}=found;if(match.status==='finished')throw new Error('Confronto já finalizado.');
  if(!match.playerIds.includes(winnerId)||match.playerIds.some(id=>!id))throw new Error('Vencedor inválido para este confronto.');
  match.winnerId=winnerId;match.loserId=match.playerIds.find(id=>id!==winnerId);match.status='finished';
  tournament.history.push({type:'match_finished',matchId,winnerId,at:new Date().toISOString()});
  if(round.index==='third'){completeTournamentIfReady(tournament);return publicTournament(tournament);}
  const nextRound=tournament.bracket.rounds[round.index+1];
  if(nextRound){
    const next=nextRound.matches[Math.floor(match.index/2)];next.playerIds[match.index%2]=winnerId;if(next.playerIds.every(Boolean))next.status='ready';
    if(round.name==='Semifinal'){
      const third=tournament.bracket.thirdPlace;third.playerIds[match.index]=match.loserId;if(third.playerIds.every(Boolean))third.status='ready';
    }
  }
  completeTournamentIfReady(tournament);return publicTournament(tournament);
}

function completeTournamentIfReady(tournament){
  const final=tournament.bracket.rounds.at(-1).matches[0],third=tournament.bracket.thirdPlace;
  if(final.status!=='finished'||third.status!=='finished')return;
  tournament.status='completed';tournament.podium={first:final.winnerId,second:final.loserId,third:third.winnerId};
  const awards=[['first',.6],['second',.25],['third',.15]];
  for(const [place,share] of awards){const playerId=tournament.podium[place],amount=Math.floor(tournament.virtualPrizePool*share);creditDemoCredits(playerId,amount,{type:'tournament_prize',tournamentId:tournament.id,description:`${place} lugar — prêmio virtual`});}
  tournament.history.push({type:'completed',podium:tournament.podium,at:new Date().toISOString()});
}

export function getTournament(id){const tournament=tournaments.get(id);return tournament?publicTournament(tournament):null;}
export function listTournaments(){return [...tournaments.values()].map(publicTournament).sort((a,b)=>a.startsAt-b.startsAt);}
export function resetTournaments(){tournaments.clear();}
export function seedDemoTournaments(){
  if(tournaments.size)return listTournaments();
  createTournament({name:'Duelo Relâmpago',size:8,mode:'termo',entryCredits:4,startsAt:Date.now()+900_000});
  createTournament({name:'Copa Anagrama',size:16,mode:'anagrama',entryCredits:8,startsAt:Date.now()+3_600_000});
  createTournament({name:'Quarteto Grand Arena',size:32,mode:'quarteto',entryCredits:12,startsAt:Date.now()+86_400_000});
  return listTournaments();
}

