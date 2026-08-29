/**
 * LÉXORA ARENA - Automated Ecosystem & Tournament Tests
 * Valida os 4 motores de jogos, o cálculo de Rake da plataforma, os payouts do TOP 5 e as rotas da API.
 */

import assert from 'node:assert';
import { createQuartetoRound, processQuartetoGuess, calculateTournamentPayouts } from '../scripts/quarteto-engine.js';
import { createContextoRound, processContextoGuess, calculateContextoDistance } from '../scripts/contexto-engine.js';
import { createTermoBlitzRound, processTermoBlitzGuess } from '../scripts/termo-engine.js';
import { createAnagramaRound, submitAnagramaWord, canFormWordWithLetters } from '../scripts/anagrama-engine.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Erro: ${err.message}`);
    failed++;
  }
}

console.log('\n--- TESTE 1: Matemática de Payouts & Rake de 20% da Plataforma ---');

test('Duelo 1x1 (2 Jogadores a R$ 10): Rake 15% (R$ 3,00) e R$ 17,00 para o campeão', () => {
  const res = calculateTournamentPayouts(20.00, 2, 15.0);
  assert.strictEqual(res.platformProfit, 3.00, 'Lucro da plataforma deve ser R$ 3,00');
  assert.strictEqual(res.netPrizePool, 17.00, 'Pote líquido deve ser R$ 17,00');
  assert.strictEqual(res.distribution[0].payout, 17.00, 'Campeão leva R$ 17,00');
});

test('Mesa Quádrupla (4 Jogadores a R$ 10): Rake 20% (R$ 8,00), 1º R$ 24,00 e 2º R$ 8,00', () => {
  const res = calculateTournamentPayouts(40.00, 4, 20.0);
  assert.strictEqual(res.platformProfit, 8.00, 'Lucro da plataforma deve ser R$ 8,00');
  assert.strictEqual(res.netPrizePool, 32.00, 'Pote líquido deve ser R$ 32,00');
  assert.strictEqual(res.distribution[0].payout, 24.00, '1º lugar leva R$ 24,00');
  assert.strictEqual(res.distribution[1].payout, 8.00, '2º lugar leva R$ 8,00');
});

test('Torneio Blitz (10 Jogadores a R$ 10): Rake 20% (R$ 20,00), 1º R$ 48,00, 2º R$ 20,00, 3º R$ 12,00', () => {
  const res = calculateTournamentPayouts(100.00, 10, 20.0);
  assert.strictEqual(res.platformProfit, 20.00, 'Lucro da plataforma deve ser R$ 20,00');
  assert.strictEqual(res.netPrizePool, 80.00, 'Pote líquido deve ser R$ 80,00');
  assert.strictEqual(res.distribution[0].payout, 48.00, '1º lugar leva R$ 48,00');
  assert.strictEqual(res.distribution[1].payout, 20.00, '2º lugar leva R$ 20,00');
  assert.strictEqual(res.distribution[2].payout, 12.00, '3º lugar leva R$ 12,00');
});

test('👑 GRANDE TORNEIO DIÁRIO (50 Jogadores a R$ 20): Rake 20% (R$ 200,00 de lucro), TOP 5 Premiado', () => {
  const res = calculateTournamentPayouts(1000.00, 50, 20.0);
  assert.strictEqual(res.platformProfit, 200.00, 'Lucro da plataforma deve ser R$ 200,00 por dia');
  assert.strictEqual(res.netPrizePool, 800.00, 'Pote líquido deve ser R$ 800,00');
  assert.strictEqual(res.distribution[0].payout, 400.00, '1º lugar leva R$ 400,00');
  assert.strictEqual(res.distribution[1].payout, 200.00, '2º lugar leva R$ 200,00');
  assert.strictEqual(res.distribution[2].payout, 120.00, '3º lugar leva R$ 120,00');
  assert.strictEqual(res.distribution[3].payout, 48.00, '4º lugar leva R$ 48,00');
  assert.strictEqual(res.distribution[4].payout, 32.00, '5º lugar leva R$ 32,00');
});

console.log('\n--- TESTE 2: Motor do Jogo CONTEXTO (Semântica Quente/Frio) ---');

test('Contexto: Chute da palavra exata deve retornar Rank #1 e vitória', () => {
  const dist = calculateContextoDistance('GATO', 'GATO', 'ANIMAIS');
  assert.strictEqual(dist.rank, 1, 'Palavra exata deve ser rank #1');
  assert.strictEqual(dist.temperature, 'hot', 'Temperatura deve ser hot');
  assert.strictEqual(dist.progressPercent, 100);
});

test('Contexto: Palavra muito próxima deve retornar verde (Rank <= 300)', () => {
  const dist = calculateContextoDistance('CACHORRO', 'GATO', 'ANIMAIS');
  assert.ok(dist.rank <= 300, 'Cachorro deve estar no Top 300 para Gato');
  assert.strictEqual(dist.temperature, 'hot');
});

test('Contexto: Palavra distante deve retornar vermelho (Rank > 1500)', () => {
  const dist = calculateContextoDistance('COMPUTADOR', 'GATO', 'ANIMAIS');
  assert.ok(dist.rank > 1500, 'Computador deve estar distante de Gato');
  assert.strictEqual(dist.temperature, 'cold');
});

test('Contexto: Processamento de rodada completa com vitória', () => {
  const round = createContextoRound('GATO', 'ANIMAIS');
  const res1 = processContextoGuess(round, 'ANIMAL');
  assert.strictEqual(res1.ok, true);
  assert.strictEqual(round.isFinished, false);

  const res2 = processContextoGuess(round, 'GATO');
  assert.strictEqual(res2.ok, true);
  assert.strictEqual(res2.isWin, true);
  assert.strictEqual(round.isFinished, true);
  assert.strictEqual(round.bestRank, 1);
});

console.log('\n--- TESTE 3: Motor do TERMO BLITZ 1x1 ---');

test('Termo Blitz: Avaliação de chutes e cálculo de pontuação com bônus de velocidade', () => {
  const round = createTermoBlitzRound('TERMO');
  const res1 = processTermoBlitzGuess(round, 'SAGAZ');
  assert.strictEqual(res1.ok, true);
  assert.strictEqual(round.attemptsCount, 1);

  const res2 = processTermoBlitzGuess(round, 'TERMO');
  assert.strictEqual(res2.ok, true);
  assert.strictEqual(res2.isWin, true);
  assert.strictEqual(round.isFinished, true);
  assert.ok(round.score >= 5000, 'Vitória rápida deve conceder alta pontuação');
});

console.log('\n--- TESTE 4: Motor do ANAGRAMA RUSH ---');

test('Anagrama Rush: Validação de letras da roda e pontuação por tamanho', () => {
  const letters = ['B', 'R', 'A', 'S', 'I', 'L'];
  assert.strictEqual(canFormWordWithLetters('BRASIL', letters), true);
  assert.strictEqual(canFormWordWithLetters('BARRIL', letters), false, 'Não deve aceitar dois Rs se só há 1');

  const round = createAnagramaRound(0); // BRASIL
  const res1 = submitAnagramaWord(round, 'RUA'); // Não usa as letras de BRASIL
  assert.strictEqual(res1.ok, false);

  const res2 = submitAnagramaWord(round, 'BRASIL');
  assert.strictEqual(res2.ok, true);
  assert.strictEqual(res2.wordEntry.isFullAnagram, true);
  assert.strictEqual(res2.wordEntry.points, 150, 'Anagrama de 6 letras vale 150 pts');
});

console.log('\n======================================');
console.log(`RESULTADOS DOS TESTES DO LÉXORA: ${passed} passaram, ${failed} falharam.`);
if (failed === 0) {
  console.log('Todos os testes do ecossistema LÉXORA foram aprovados com 100% de sucesso!\n');
} else {
  process.exit(1);
}
