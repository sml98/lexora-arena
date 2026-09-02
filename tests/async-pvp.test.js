import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptAsyncChallenge,createAsyncChallenge,getAsyncChallenge,listAsyncChallenges,resetAsyncChallenges,submitAsyncGuess,sweepAsyncChallenges} from '../server/async-pvp-service.js';
import {clearSessions} from '../server/game-service.js';
import {createPlayerSession,resetPlayerStore} from '../server/player-store.js';

const guesses=['ABCDE','FGHIJ','KLMNO','PQRST','UVWXY','ZABCD','EFGHI','JKLMN','OPQRS'];
test.afterEach(()=>{resetAsyncChallenges();resetPlayerStore();clearSessions();});

test('PvP assíncrono preserva seed, oculta o primeiro resultado e conclui entre humanos',async()=>{
  const owner=createPlayerSession({name:'Ana'}).player,opponent=createPlayerSession({name:'Beto'}).player;
  let created=await createAsyncChallenge(owner.id,{mode:'quarteto',matchType:'ranked'});assert.equal(created.status,'owner_playing');assert.equal(created.result,null);
  for(const guess of guesses)await submitAsyncGuess(created.id,owner.id,guess);
  assert.equal(getAsyncChallenge(created.id,owner.id).status,'awaiting_opponent');assert.equal(listAsyncChallenges({mode:'quarteto'}).length,1);
  const accepted=await acceptAsyncChallenge(created.id,opponent.id);assert.equal(accepted.commitHash,created.commitHash);assert.equal(accepted.opponentFinished,true);assert.equal(accepted.result,null);assert.equal('results' in accepted,false);
  let final;for(const guess of guesses)final=await submitAsyncGuess(created.id,opponent.id,guess);
  assert.equal(final.challenge.status,'completed');assert.ok(final.challenge.result.winnerId);assert.equal(final.challenge.result.answers.length,4);assert.equal(final.challenge.engineVersion,'lexora-pvp-v6');
});

test('desafio assíncrono expira sem criar adversário fictício',async()=>{const owner=createPlayerSession({name:'Ana'}).player,created=await createAsyncChallenge(owner.id,{mode:'contexto',matchType:'casual'});const expired=await sweepAsyncChallenges(Date.now()+86_500_000);assert.deepEqual(expired,[created.id]);assert.equal(getAsyncChallenge(created.id,owner.id).status,'expired');assert.equal(listAsyncChallenges().length,0);});
