import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameSession, submitGameGuess, finishGameSession, clearSessions, resetDailyAllocations, getDailyAllocationStats, getDictionaryCatalog } from '../server/game-service.js';

test.afterEach(clearSessions);

test('alocação diária global nunca reutiliza respostas entre partidas',()=>{
  resetDailyAllocations();
  createGameSession('quarteto');
  createGameSession('termo');
  createGameSession('contexto');
  createGameSession('contexto');
  createGameSession('anagrama');
  createGameSession('anagrama');
  assert.deepEqual(getDailyAllocationStats(),{dayId:new Date().toISOString().slice(0,10),words:5,contexts:2,anagrams:2});
  resetDailyAllocations();
});

test('cada partida recebe identificador independente sem expor respostas',()=>{
  const a=createGameSession('quarteto',{secrets:['TERMO','SAGAZ','NOBRE','IDEIA'],nonce:'a'});
  const b=createGameSession('quarteto',{secrets:['TERMO','SAGAZ','NOBRE','IDEIA'],nonce:'b'});
  assert.notEqual(a.sessionId,b.sessionId);
  assert.equal(a.dayId,b.dayId);
  assert.equal('secrets' in a,false);
});

test('suporta rodadas em inglês, português e modo misto',()=>{
  const en=createGameSession('termo',{secret:'APPLE',language:'en'});
  const pt=createGameSession('termo',{secret:'TERMO',language:'pt'});
  const mixed=createGameSession('termo',{secret:'HOTEL',language:'mixed'});
  assert.deepEqual([en.language,pt.language,mixed.language],['en','pt','mixed']);
  assert.ok(en.dictionaries.ptBR>8000);
  assert.ok(en.dictionaries.enUS>4000);
  const catalog=getDictionaryCatalog();
  assert.equal(catalog.languages.mixed.fiveLetters,17607);
  assert.equal(catalog.languages.mixed.anagramWords,48542);
  assert.ok(catalog.languages.mixed.contexts>600);
});

test('Quarteto aplica a mesma tentativa aos quatro tabuleiros no servidor',()=>{
  const s=createGameSession('quarteto',{secrets:['TERMO','SAGAZ','NOBRE','IDEIA']});
  const result=submitGameGuess(s.sessionId,'TERMO');
  assert.equal(result.boards.length,4);
  assert.equal(result.boards[0].solved,true);
  assert.equal(result.answers,undefined);
});

test('Contexto bloqueia palavra repetida com mensagem clara',()=>{
  const challenge={secret:'MUSICA',near:['SOM'],warm:['ARTE']};
  const s=createGameSession('contexto',{challenge});
  submitGameGuess(s.sessionId,'MUNDO');
  assert.throws(()=>submitGameGuess(s.sessionId,'mundo'),/Palavra já usada/);
});

test('Termo protege a resposta até o fim da partida',()=>{
  const s=createGameSession('termo',{secret:'TERMO'});
  const first=submitGameGuess(s.sessionId,'IDEIA');
  assert.equal(first.answer,undefined);
  const win=submitGameGuess(s.sessionId,'TERMO');
  assert.equal(win.win,true);
  assert.equal(win.answer,'TERMO');
});

test('Anagrama bloqueia repetição e letras indisponíveis',()=>{
  const challenge={letters:'ARENAS',words:['ARENA','ARENAS','SER']};
  const s=createGameSession('anagrama',{challenge,duration:60});
  submitGameGuess(s.sessionId,'ARENA');
  assert.throws(()=>submitGameGuess(s.sessionId,'ARENA'),/Palavra já usada/);
  assert.throws(()=>submitGameGuess(s.sessionId,'PORTA'),/letras disponíveis/);
  const expired=createGameSession('anagrama',{challenge,duration:0});
  const end=finishGameSession(expired.sessionId);
  assert.equal(end.finished,true);
});
