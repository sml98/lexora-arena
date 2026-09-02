import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerSession, resetPlayerStore } from '../server/player-store.js';
import { calculateTournamentPreview, createMasterTournament, createSprintTournament, createTournament, getTournament, joinTournament, listTournaments, recordTournamentResult, resetTournaments, tickTournaments } from '../server/tournament-service.js';

test.afterEach(()=>{resetTournaments();resetPlayerStore();});

test('torneio virtual de 8 jogadores cria chave, terceiro lugar e pódio',()=>{
  const players=Array.from({length:8},(_,index)=>createPlayerSession({name:`P${index+1}`}).player);
  const tournament=createTournament({name:'Teste',size:8,entryCredits:4,mode:'quarteto'});
  for(const player of players)joinTournament(tournament.id,player.id);
  let state=getTournament(tournament.id);assert.equal(state.status,'active');assert.equal(state.bracket.rounds[0].matches.length,4);
  for(const round of state.bracket.rounds){
    state=getTournament(tournament.id);
    for(const match of state.bracket.rounds[round.index].matches)if(match.status==='ready')recordTournamentResult(tournament.id,match.id,match.playerIds[0]);
  }
  state=getTournament(tournament.id);assert.equal(state.bracket.thirdPlace.status,'ready');recordTournamentResult(tournament.id,state.bracket.thirdPlace.id,state.bracket.thirdPlace.playerIds[0]);
  state=getTournament(tournament.id);assert.equal(state.status,'completed');assert.ok(state.podium.first&&state.podium.second&&state.podium.third);assert.equal(state.commissionPercent,15);
});

test('aceita 8, 16, 32, 64 e 128 jogadores',()=>{for(const size of [8,16,32,64,128])assert.equal(createTournament({size}).size,size);assert.throws(()=>createTournament({size:4}),/8, 16, 32, 64 ou 128/);});

test('Sprint inicia countdown em 32 e cria o próximo ao começar',()=>{const sprint=createSprintTournament({sequence:184});const players=Array.from({length:32},(_,index)=>createPlayerSession({name:`S${index}`}).player);for(const player of players)joinTournament(sprint.id,player.id);let state=getTournament(sprint.id);assert.equal(state.minimumReached,true);assert.ok(state.countdownStartsAt);tickTournaments(state.countdownStartsAt);state=getTournament(sprint.id);assert.equal(state.status,'active');const next=listTournaments().find(item=>item.name.includes('#185'));assert.equal(next.status,'registration');assert.equal(next.players.length,0);});

test('Master usa 16/20/24 e prêmio dinâmico 55/30/15',()=>{const master=createMasterTournament();assert.deepEqual([master.minPlayers,master.idealPlayers,master.maxPlayers],[16,20,24]);const preview=calculateTournamentPreview({participants:20,entryCents:5000});assert.equal(preview.grossPotCents,100000);assert.equal(preview.commissionCents,15000);assert.deepEqual(preview.prizes,{first:46750,second:25500,third:12750});});
