import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuartetoRound, evaluateWordGuess, submitQuartetoGuess } from '../scripts/quarteto-engine.js';

test('avalia letras repetidas sem marcar ocorrências extras', () => {
  assert.deepEqual(evaluateWordGuess('MASSA','CASAL').map(x=>x.status), ['absent','correct','correct','absent','present']);
});

test('o mesmo chute é aplicado aos quatro tabuleiros', () => {
  const round=createQuartetoRound(['TERMO','SAGAZ','NOBRE','IDEIA']);
  const result=submitQuartetoGuess(round,'TERMO');
  assert.equal(result.ok,true);
  assert.equal(round.attempts,1);
  assert.deepEqual(round.guesses.map(rows=>rows.length),[1,1,1,1]);
  assert.equal(round.solved[0],true);
});

test('encerra após resolver as quatro palavras', () => {
  const round=createQuartetoRound(['TERMO','SAGAZ','NOBRE','IDEIA']);
  for(const word of round.secrets) submitQuartetoGuess(round,word);
  assert.equal(round.finished,true);
  assert.equal(round.solved.every(Boolean),true);
});

test('aceita palavras de cinco letras mesmo fora da lista reduzida', () => {
  const round=createQuartetoRound(['TERMO','SAGAZ','NOBRE','IDEIA']);
  const result=submitQuartetoGuess(round,'ABCDE');
  assert.equal(result.ok,true);
  assert.equal(round.attempts,1);
});

test('normaliza palavras acentuadas', () => {
  const round=createQuartetoRound(['TERMO','SAGAZ','NOBRE','IDEIA']);
  const result=submitQuartetoGuess(round,'SÉRIO');
  assert.equal(result.ok,true);
  assert.equal(result.guess,'SERIO');
});
