import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerSession, debitDemoCredits, getRankings, recordRatedMatch, resetPlayerStore } from '../server/player-store.js';
import { REAL_MONEY_ENABLED } from '../server/config.js';

test.afterEach(resetPlayerStore);

test('sessão anônima recebe créditos somente no ledger do servidor',()=>{
  const session=createPlayerSession({name:'<b>Ana</b>'});
  assert.equal(session.player.credits,100);assert.equal(session.player.ledger[0].before,0);assert.equal(session.player.ledger[0].after,100);assert.doesNotMatch(session.player.name,/[<>]/);assert.equal(REAL_MONEY_ENABLED,false);
  const entry=debitDemoCredits(session.player.id,2,{matchId:'m1'});assert.deepEqual([entry.before,entry.after],[100,98]);
});

test('ratings de Quarteto e Contexto são independentes',()=>{
  const first=createPlayerSession({name:'Ana'}).player,second=createPlayerSession({name:'Beto'}).player;
  const profiles=recordRatedMatch({matchId:'m1',mode:'quarteto',matchType:'ranked',language:'pt',playerIds:[first.id,second.id],winnerId:first.id,tie:false,results:{[first.id]:{score:100,solved:4,attempts:5,elapsedMs:50000},[second.id]:{score:10,solved:2,attempts:6,elapsedMs:60000}}});
  assert.ok(profiles[first.id].quartetoRating>1000);assert.equal(profiles[first.id].contextoRating,1000);assert.ok(profiles[second.id].quartetoRating<1000);assert.equal(profiles[first.id].wins,1);
  assert.equal(getRankings('all',{mode:'quarteto'})[0].id,first.id);assert.equal('ledger' in getRankings('all',{mode:'quarteto'})[0],false);
});

test('partida casual registra estatísticas sem alterar rating',()=>{
  const first=createPlayerSession({name:'Ana'}).player,second=createPlayerSession({name:'Beto'}).player;
  const profiles=recordRatedMatch({matchId:'m2',mode:'contexto',matchType:'casual',language:'pt',playerIds:[first.id,second.id],winnerId:first.id,results:{[first.id]:{bestRank:1,discovered:true,attempts:3,elapsedMs:1000},[second.id]:{bestRank:20,attempts:4,elapsedMs:120000}}});
  assert.equal(profiles[first.id].contextoRating,1000);assert.equal(profiles[first.id].stats.contexto.games,1);
});
