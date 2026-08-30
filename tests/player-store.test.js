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

test('Elo, provisórias, vitórias e ranking são calculados no servidor',()=>{
  const first=createPlayerSession({name:'Ana'}).player,second=createPlayerSession({name:'Beto'}).player;
  const profiles=recordRatedMatch({matchId:'m1',mode:'termo',language:'pt',playerIds:[first.id,second.id],winnerId:first.id,tie:false,results:{[first.id]:{score:100},[second.id]:{score:10}}});
  assert.ok(profiles[first.id].rating>1000);assert.ok(profiles[second.id].rating<1000);assert.equal(profiles[first.id].wins,1);assert.equal(profiles[first.id].provisionalRemaining,4);
  assert.equal(getRankings('all')[0].id,first.id);assert.equal('ledger' in getRankings('all')[0],false);
});

