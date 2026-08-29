/**
 * Neon Fortune Slots - Testes Automatizados do Modo Tigre da Sorte (Fortune Tiger)
 */

import { playFortuneTigerFeature, SYMBOLS } from '../scripts/slot-engine.js';

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

console.log('--- TESTE 1: Inicialização do Modo Tigre da Sorte ---');
const tigerResult = playFortuneTigerFeature(20.00, 'DIAMOND');
assert(tigerResult.luckySymbolId === 'DIAMOND', 'Símbolo da sorte deve ser DIAMOND');
assert(tigerResult.steps.length >= 1, 'Deve gerar etapas de respins');
assert(Array.isArray(tigerResult.finalGrid), 'Deve gerar grade final 5x3');
assert(tigerResult.finalLockedCount >= 2, 'Deve ter pelo menos 2 símbolos travados no início');

console.log('\n--- TESTE 2: Progressão dos Respins e Travamento de Símbolos ---');
let lockedNonDecreasing = true;
for (let i = 1; i < tigerResult.steps.length; i++) {
  if (tigerResult.steps[i].lockedCount < tigerResult.steps[i - 1].lockedCount) {
    lockedNonDecreasing = false;
    break;
  }
}
assert(lockedNonDecreasing, 'A contagem de símbolos travados nunca deve diminuir entre respins');

console.log('\n--- TESTE 3: Verificação de Multiplicador 10X em Tela Cheia ---');
// Simulação de 100 rodadas do Tigre para avaliar ocorrência de vitórias
let fullScreenFound = false;
let winsCount = 0;
const trials = 100;

for (let t = 0; t < trials; t++) {
  const res = playFortuneTigerFeature(20.00);
  if (res.totalWin > 0) winsCount++;
  if (res.isFullScreen) {
    fullScreenFound = true;
    assert(res.multiplierApplied === 10, 'Tela cheia deve aplicar multiplicador 10X!');
    assert(res.finalLockedCount === 15, 'Tela cheia deve ter exatamente 15 símbolos travados');
  }
}

assert(winsCount > 70, `A maioria das rodadas do Tigre deve resultar em vitória (${winsCount}/${trials})`);
console.log(`  Vitórias registradas no Tigre: ${winsCount}/${trials}`);
console.log(`  Tela Cheia atingida durante os testes: ${fullScreenFound ? 'SIM (10X Multiplicador ativado!)' : 'Não nesta amostra de 100'}`);

console.log('\n======================================');
console.log(`RESULTADO DOS TESTES DO TIGRINHO: ${passed} passaram, ${failed} falharam.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('Todos os testes do Modo Tigre passaram com sucesso!');
  process.exit(0);
}
