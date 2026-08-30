import test from 'node:test';
import assert from 'node:assert/strict';
import { activateMatch, clearPvpMatches, createMatch, finishMatch, getRematchData, getResult, requestRematch, startMatch, submitAction, validateAction } from '../server/pvp-engine.js';

const termoChallenge={mode:'termo',language:'pt',sessionOptions:{secret:'TERMO'},public:{wordLength:5,maxAttempts:6}};
const createTermo=(ids=['p1','p2'],now=1_000)=>{const match=createMatch({playerIds:ids,mode:'termo',language:'pt',challenge:termoChallenge,countdownMs:0,createdAt:now});startMatch(match,now);activateMatch(match,now);return match;};

test.afterEach(clearPvpMatches);

test('cria duas sessões com o mesmo desafio sem expor a palavra',()=>{
  const match=createTermo();
  assert.notEqual(match.players.get('p1').sessionId,match.players.get('p2').sessionId);
  assert.deepEqual(match.challenge.public,{wordLength:5,maxAttempts:6});
  assert.doesNotMatch(JSON.stringify(match.challenge.public),/TERMO/);
});

test('servidor calcula vitória, derrota, tempo e frase comparativa',()=>{
  const match=createTermo();
  submitAction(match.id,'p1',{guess:'TERMO'},2_000);
  for(const [index,guess] of ['IDEIA','SAGAZ','NOBRE','HOTEL','ARENA','PLANO'].entries())submitAction(match.id,'p2',{guess},3_000+index*100);
  const winner=getResult(match.id,'p1'),loser=getResult(match.id,'p2');
  assert.equal(winner.outcome,'win');assert.equal(loser.outcome,'loss');assert.equal(winner.winnerId,'p1');
  assert.ok(winner.players.p1.score>winner.players.p2.score);assert.match(loser.phrase,/Você perdeu/);
});

test('empate real é preservado',()=>{
  const match=createTermo();submitAction(match.id,'p1',{guess:'TERMO'},2_000);submitAction(match.id,'p2',{guess:'TERMO'},2_000);
  assert.equal(getResult(match.id,'p1').outcome,'draw');
});

test('timeout e abandono são decididos no servidor',()=>{
  const timeout=createTermo(['a','b']);finishMatch(timeout.id,'timeout',timeout.endAt);assert.equal(getResult(timeout.id,'a').finishReason,'timeout');clearPvpMatches();
  const abandoned=createTermo(['a','b']);finishMatch(abandoned.id,'abandonment',2_000,{abandonedPlayerId:'a'});assert.equal(getResult(abandoned.id,'b').outcome,'win');assert.match(getResult(abandoned.id,'a').phrase,/desconectou/);
});

test('bloqueia adulteração de pontuação e conteúdo HTML',()=>{
  const match=createTermo();
  assert.throws(()=>validateAction(match,'p1',{guess:'TERMO',score:999999}),/controlado pelo servidor/);
  assert.throws(()=>submitAction(match.id,'p1',{guess:'<script>alert(1)<\/script>'},2_000),/caracteres não permitidos/);
  finishMatch(match.id,'timeout',match.endAt);assert.equal(getResult(match.id,'p1').players.p1.errors,1);assert.match(getResult(match.id,'p1').players.p1.principalError,/caracteres/);
});

test('revanche exige aceite dos dois jogadores e mantém a mesma entrada',()=>{
  const match=createTermo();finishMatch(match.id,'timeout',match.endAt);
  assert.equal(requestRematch(match.id,'p1').ready,false);assert.equal(requestRematch(match.id,'p2').ready,true);
  assert.equal(getRematchData(match.id).entryCredits,2);
});
