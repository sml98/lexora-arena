/**
 * Neon Fortune Slots - Testes Automatizados do Motor Matemático
 */

import {
  SYMBOLS,
  PAYLINES,
  TOTAL_PAYLINES,
  generateSpinGrid,
  evaluateSpin,
  playGamble,
  playFortuneTigerFeature
} from '../scripts/slot-engine.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('--- TESTE 1: Configuração Básica de Símbolos e Linhas ---');
assert(Object.keys(SYMBOLS).length === 12, 'Deve haver 12 símbolos configurados');
assert(PAYLINES.length === 20, 'Devem existir exatamente 20 paylines');
assert(TOTAL_PAYLINES === 20, 'TOTAL_PAYLINES deve ser 20');

console.log('\n--- TESTE 2: Avaliação de Vitória em Linha Simples (3 Diamantes) ---');
const mockGridWin3 = [
  ['CHERRY', 'DIAMOND', 'LEMON'],
  ['WATERMELON', 'DIAMOND', 'GRAPES'],
  ['CLOVER', 'DIAMOND', 'STAR'],
  ['BELL', 'CHERRY', 'SEVEN'],
  ['CROWN', 'LEMON', 'WATERMELON']
];

const res1 = evaluateSpin(mockGridWin3, 20.00);
assert(res1.isWin === true, 'Deve identificar vitória');
assert(res1.winningLines.length >= 1, 'Deve conter pelo menos 1 linha premiada');

const line1 = res1.winningLines.find(l => l.lineId === 1);
assert(line1 !== undefined, 'Linha central (id 1) deve estar premiada');
assert(line1 && line1.count === 3, 'Deve haver 3 diamantes consecutivos');
assert(line1 && line1.symbolId === 'DIAMOND', 'Símbolo premiado deve ser DIAMOND');
assert(line1 && line1.payout === 50.00, `Pagamento da linha central deve ser R$ 50.00 (recebido: ${line1?.payout})`);

console.log('\n--- TESTE 3: Substituição de WILD ---');
const mockGridWild = [
  ['CHERRY', 'DIAMOND', 'LEMON'],
  ['WATERMELON', 'WILD', 'GRAPES'],
  ['CLOVER', 'DIAMOND', 'STAR'],
  ['BELL', 'DIAMOND', 'SEVEN'],
  ['CROWN', 'LEMON', 'WATERMELON']
];

const resWild = evaluateSpin(mockGridWild, 20.00);
const wildLine = resWild.winningLines.find(l => l.lineId === 1);
assert(wildLine !== undefined, 'Linha central com Wild deve estar premiada');
assert(wildLine && wildLine.count === 4, 'Deve contar 4 diamantes com a ajuda do Wild');
assert(wildLine && wildLine.payout === 160.00, `Pagamento da linha com Wild deve ser R$ 160.00 (recebido: ${wildLine?.payout})`);

console.log('\n--- TESTE 4: Disparo de SCATTER e Free Spins ---');
const mockGridScatter = [
  ['SCATTER', 'DIAMOND', 'LEMON'],
  ['WATERMELON', 'CHERRY', 'GRAPES'],
  ['CLOVER', 'SCATTER', 'STAR'],
  ['BELL', 'LEMON', 'SEVEN'],
  ['CROWN', 'LEMON', 'SCATTER']
];

const resScatter = evaluateSpin(mockGridScatter, 20.00);
assert(resScatter.scatterCount === 3, 'Deve detectar exatamente 3 Scatters');
assert(resScatter.freeSpinsAwarded === 8, '3 Scatters devem conceder 8 Rodadas Grátis');
assert(resScatter.scatterWin === 40.00, `3 Scatters devem pagar 2x total bet = R$ 40.00 (recebido: ${resScatter.scatterWin})`);

console.log('\n--- TESTE 5: Multiplicador de Free Spins (3x) ---');
const resMultiplier = evaluateSpin(mockGridWin3, 20.00, 3);
const lineMulti = resMultiplier.winningLines.find(l => l.lineId === 1);
assert(lineMulti && lineMulti.payout === 150.00, `Pagamento com multiplicador 3x deve ser 3 * 50 = R$ 150.00 (recebido: ${lineMulti?.payout})`);

console.log('\n--- TESTE 6: Minijogo de Duplicação (Gamble) ---');
let gambleWins = 0;
const gambleTrials = 500;
for (let i = 0; i < gambleTrials; i++) {
  const g = playGamble('red', 10.00);
  if (g.won) gambleWins++;
}
const gambleWinRate = gambleWins / gambleTrials;
assert(gambleWinRate >= 0.40 && gambleWinRate <= 0.60, `Taxa de vitória no Gamble deve ser próxima a 50% (amostra de ${gambleTrials}: ${(gambleWinRate * 100).toFixed(1)}%)`);

console.log('\n--- TESTE 7: Simulação Estatística com Modo Tigre Orgânico (10.000 Giros) ---');
const SPINS_COUNT = 10000;
const BET_AMOUNT = 20.00;
let totalWagered = 0;
let totalReturned = 0;
let hits = 0;
let tigerCount = 0;

for (let s = 0; s < SPINS_COUNT; s++) {
  totalWagered += BET_AMOUNT;
  if (Math.random() < 0.018) {
    tigerCount++;
    const tRes = playFortuneTigerFeature(BET_AMOUNT);
    totalReturned += tRes.totalWin;
    if (tRes.totalWin > 0) hits++;
  } else {
    const grid = generateSpinGrid();
    const evalRes = evaluateSpin(grid, BET_AMOUNT);
    totalReturned += evalRes.totalWin;
    if (evalRes.isWin) hits++;
  }
}

const rtp = (totalReturned / totalWagered) * 100;
const hitFreq = (hits / SPINS_COUNT) * 100;

console.log(`  Total apostado: R$ ${totalWagered.toFixed(2)}`);
console.log(`  Total retornado: R$ ${totalReturned.toFixed(2)}`);
console.log(`  RTP calculado na simulação: ${rtp.toFixed(2)}%`);
console.log(`  Hit Frequency (Frequência de acerto): ${hitFreq.toFixed(2)}%`);
console.log(`  Gatilhos do Tigrinho: ${tigerCount} vezes`);

assert(totalWagered > totalReturned, 'A Casa sempre deve reter lucro no longo prazo');
assert(rtp >= 75 && rtp <= 96, `RTP deve estar na faixa comercial justa (${rtp.toFixed(2)}%)`);
assert(hitFreq >= 35 && hitFreq <= 55, `Frequência de vitórias deve manter o jogador entretido (${hitFreq.toFixed(2)}%)`);

console.log('\n======================================');
console.log(`RESULTADO DOS TESTES: ${passed} passaram, ${failed} falharam.`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('Todos os testes do motor matemático e margem da casa passaram com sucesso!');
  process.exit(0);
}
