import test from 'node:test';
import assert from 'node:assert/strict';
import { activateMatch, clearPvpMatches, createMatch, finishMatch, getRematchData, getResult, publicMatch, requestRematch, startMatch, submitAction, validateAction } from '../server/pvp-engine.js';

const quartetoChallenge={mode:'quarteto',language:'pt',sessionOptions:{secrets:['TERMO','SAGAZ','NOBRE','IDEIA']},public:{boards:4,maxAttempts:9}};
const contextoChallenge={mode:'contexto',language:'pt',sessionOptions:{challenge:{secret:'MUSICA',near:['SOM','RITMO'],warm:['ARTE']}},public:{maxAttempts:30}};
function activeMatch({mode='quarteto',challenge=quartetoChallenge,ids=['p1','p2'],series=null}={}){const match=createMatch({playerIds:ids,mode,language:'pt',challenge,countdownMs:0,createdAt:1_000,series});startMatch(match,1_000);activateMatch(match,1_000);return match;}

test.afterEach(clearPvpMatches);

test('cria sessões privadas com um compromisso público do mesmo desafio',()=>{
  const match=activeMatch();assert.notEqual(match.players.get('p1').sessionId,match.players.get('p2').sessionId);assert.doesNotMatch(JSON.stringify(publicMatch(match,'p1').challenge),/TERMO|SAGAZ|NOBRE|IDEIA/);
});

test('Quarteto decide primeiro por palavras resolvidas',()=>{
  const match=activeMatch();submitAction(match.id,'p1',{guess:'TERMO'},2_000);submitAction(match.id,'p1',{guess:'SAGAZ'},2_200);submitAction(match.id,'p2',{guess:'TERMO'},2_000);finishMatch(match.id,'timeout',match.endAt);
  assert.equal(getResult(match.id,'p1').outcome,'win');assert.match(getResult(match.id,'p2').phrase,/Você perdeu/);
});

test('Contexto termina quando o primeiro jogador descobre o alvo',()=>{
  const match=activeMatch({mode:'contexto',challenge:contextoChallenge});submitAction(match.id,'p1',{guess:'SOM'},2_000);submitAction(match.id,'p2',{guess:'ARTE'},2_000);submitAction(match.id,'p1',{guess:'MUSICA'},2_200);
  const result=getResult(match.id,'p1');assert.equal(result.outcome,'win');assert.equal(result.players.p1.bestRank,1);assert.equal(result.answers[0],'MUSICA');
});

test('estado público do rival não revela letras nem tentativas',()=>{
  const match=activeMatch();submitAction(match.id,'p1',{guess:'TERMO'},2_000);const state=publicMatch(match,'p2');assert.deepEqual(state.progress.p1,{solved:1,total:4,status:'playing'});assert.equal('attempts'in state.progress.p1,false);assert.doesNotMatch(JSON.stringify(state),/TERMO/);
});

test('abandono e falha de servidor são decididos no backend',()=>{
  const abandoned=activeMatch({ids:['a','b']});finishMatch(abandoned.id,'abandonment',2_000,{abandonedPlayerId:'a'});assert.equal(getResult(abandoned.id,'b').outcome,'win');clearPvpMatches();
  const cancelled=activeMatch({ids:['a','b']});finishMatch(cancelled.id,'server_failure',2_000);assert.equal(getResult(cancelled.id,'a').outcome,'draw');
});

test('bloqueia adulteração de placar e conteúdo HTML',()=>{
  const match=activeMatch();assert.throws(()=>validateAction(match,'p1',{guess:'TERMO',score:999999}),/controlado pelo servidor/);assert.throws(()=>submitAction(match.id,'p1',{guess:'<script>'},2_000),/caracteres não permitidos/);
});

test('revanche exige os dois aceites e BO3 preserva a série',()=>{
  const match=activeMatch({series:{bestOf:3,wins:{p1:0,p2:0},gameNumber:1}});finishMatch(match.id,'timeout',match.endAt);assert.equal(requestRematch(match.id,'p1').ready,false);assert.equal(requestRematch(match.id,'p2').ready,true);const data=getRematchData(match.id);assert.equal(data.series.bestOf,3);assert.equal(data.series.gameNumber,2);
});
