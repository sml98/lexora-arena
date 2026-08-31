import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSessions, createGameSession, createSharedChallenge, getDailyAllocationStats, getDictionaryCatalog, resetDailyAllocations, submitGameGuess } from '../server/game-service.js';

test.afterEach(clearSessions);

test('somente Quarteto e Contexto fazem parte do produto',()=>{
  for(const mode of ['termo','anagrama','relampago'])assert.throws(()=>createGameSession(mode),/Quarteto ou Contexto/);
  assert.equal(createGameSession('quarteto',{secrets:['TERMO','SAGAZ','NOBRE','IDEIA']}).mode,'quarteto');
  assert.equal(createGameSession('contexto',{challenge:{secret:'MUSICA',near:['SOM'],warm:['ARTE']}}).mode,'contexto');
});

test('alocação diária não reutiliza respostas entre novas partidas',()=>{
  resetDailyAllocations();createGameSession('quarteto');createGameSession('contexto');createGameSession('contexto');
  assert.deepEqual(getDailyAllocationStats(),{dayId:new Date().toISOString().slice(0,10),words:4,contexts:2});resetDailyAllocations();
});

test('desafio compartilhado não expõe segredos',()=>{
  const quarteto=createSharedChallenge('quarteto','pt');assert.equal(quarteto.public.boards,4);assert.equal('secrets'in quarteto.public,false);
  const contexto=createSharedChallenge('contexto','pt');assert.equal(contexto.public.maxAttempts,30);assert.equal('challenge'in contexto.public,false);resetDailyAllocations();
});

test('Quarteto aplica uma tentativa aos quatro painéis',()=>{
  const session=createGameSession('quarteto',{secrets:['TERMO','SAGAZ','NOBRE','IDEIA']}),result=submitGameGuess(session.sessionId,'TERMO');
  assert.equal(result.boards.length,4);assert.equal(result.boards[0].solved,true);assert.equal(result.answers,undefined);
});

test('Contexto é determinístico e recusa palavra repetida',()=>{
  const challenge={secret:'MUSICA',near:['SOM'],warm:['ARTE']},session=createGameSession('contexto',{challenge});
  assert.equal(submitGameGuess(session.sessionId,'SOM').rank,2);assert.throws(()=>submitGameGuess(session.sessionId,'som'),/Palavra já usada/);
});

test('catálogo mantém português, inglês e provedor semântico explícito',()=>{
  const catalog=getDictionaryCatalog();assert.ok(catalog.languages.pt.fiveLetters>8_000);assert.ok(catalog.languages.en.fiveLetters>4_000);assert.ok(catalog.languages.mixed.contexts>600);assert.equal(catalog.semanticProvider.deterministic,true);
});
