/**
 * Neon Fortune Slots - Teste de Margem da Casa (House Edge & RTP)
 * Simulação de Monte Carlo com 10.000 giros comprovando que a CASA SEMPRE LUCRA.
 */

import { generateSpinGrid, evaluateSpin, playFortuneTigerFeature } from '../scripts/slot-engine.js';

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

console.log('--- SIMULAÇÃO DE MONTE CARLO: 10.000 GIROS COMPLETOS ---');
const SPINS = 10000;
const BET = 20.00;

let totalWagered = 0;
let totalWon = 0;
let regularWins = 0;
let tigerTriggers = 0;
let fullScreen10xCount = 0;

for (let s = 0; s < SPINS; s++) {
  totalWagered += BET;

  // Disparo orgânico e aleatório do Tigre (~2% de probabilidade = 1 a cada ~50 giros)
  const isTiger = (Math.random() < 0.02);

  if (isTiger) {
    tigerTriggers++;
    const fortune = playFortuneTigerFeature(BET);
    totalWon += fortune.totalWin;
    if (fortune.isFullScreen) fullScreen10xCount++;
  } else {
    const grid = generateSpinGrid();
    const res = evaluateSpin(grid, BET);
    totalWon += res.totalWin;
    if (res.isWin) regularWins++;
  }
}

const houseProfit = totalWagered - totalWon;
const houseEdge = (houseProfit / totalWagered) * 100;
const rtp = (totalWon / totalWagered) * 100;

console.log(`  Total Apostado pelos Jogadores: R$ ${totalWagered.toFixed(2)}`);
console.log(`  Total Pago em Prêmios: R$ ${totalWon.toFixed(2)}`);
console.log(`  LUCRO LÍQUIDO DA CASA (CASSINO): R$ ${houseProfit.toFixed(2)}`);
console.log(`  Margem da Casa (House Edge): ${houseEdge.toFixed(2)}%`);
console.log(`  Retorno ao Jogador (RTP): ${rtp.toFixed(2)}%`);
console.log(`  Vezes que o Tigrinho soltou a carta: ${tigerTriggers} de ${SPINS}`);
console.log(`  Vezes que atingiu Tela Cheia 10X: ${fullScreen10xCount} vezes`);

console.log('\n--- VERIFICAÇÃO DAS REGRAS DO CASSINO ---');
assert(totalWagered > totalWon, `A CASA NUNCA DEVE PERDER: Total apostado (R$ ${totalWagered}) deve ser maior que prêmios pagos (R$ ${totalWon.toFixed(2)})`);
assert(houseProfit > 0, `O lucro líquido da casa deve ser positivo (+R$ ${houseProfit.toFixed(2)})`);
assert(rtp >= 88 && rtp <= 96, `RTP deve estar na faixa comercial justa de 88% a 96% (${rtp.toFixed(2)}%)`);
assert(houseEdge >= 4 && houseEdge <= 12, `Margem da casa deve ser sólida entre 4% e 12% (${houseEdge.toFixed(2)}%)`);

console.log('\n======================================');
console.log(`RESULTADO DOS TESTES DE MARGEM DA CASA: ${passed} passaram, ${failed} falharam.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('Comprovado matematicamente: A Casa sempre tem vantagem e lucra no longo prazo!');
  process.exit(0);
}
