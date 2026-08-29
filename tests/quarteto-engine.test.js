/**
 * Quarteto Bet - Testes Unitários do Motor de Jogo e Modos de Aposta
 */

import {
  evaluateWordGuess,
  createQuartetoRound,
  processQuartetoGuess,
  GAME_MODES
} from '../scripts/quarteto-engine.js';

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

console.log('--- TESTE 1: Avaliação de Letras e Regra de Repetições ---');
// Teste clássico: segredo TERMO vs chute TEMPO
// T-E-M-P-O vs T-E-R-M-O
// T: verde (índice 0)
// E: verde (índice 1)
// M: amarelo (existe no segredo, índice 3)
// P: cinza (não existe)
// O: verde (índice 4)
const eval1 = evaluateWordGuess('TEMPO', 'TERMO');
assert(eval1[0].status === 'correct', 'Letra T deve ser verde (correct)');
assert(eval1[1].status === 'correct', 'Letra E deve ser verde (correct)');
assert(eval1[2].status === 'present', 'Letra M deve ser amarela (present) pois existe no segredo TERMO');
assert(eval1[3].status === 'absent', 'Letra P deve ser cinza (absent)');
assert(eval1[4].status === 'correct', 'Letra O deve ser verde (correct)');

// Teste de duplicata: segredo SAGAZ vs chute ARARA
// Letras 'A' em ARARA estão nos índices 0, 2, 4
// SAGAZ tem dois 'A's (índices 1 e 3)
const eval2 = evaluateWordGuess('ARARA', 'SAGAZ');
assert(eval2[0].status === 'present', 'Primeiro A (índice 0) do chute deve ser amarelo (present)');
assert(eval2[2].status === 'present', 'Segundo A (índice 2) do chute deve ser amarelo (present)');
assert(eval2[4].status === 'absent', 'Terceiro A (índice 4) do chute deve ser cinza (absent) pois SAGAZ só tem 2 As');

console.log('\n--- TESTE 2: Modo 1 - Pote Decrescente (Pot Decay) ---');
const secretsTest = ['TERMO', 'CASAL', 'VIVER', 'PLANO'];
const round1 = createQuartetoRound(GAME_MODES.POT_DECAY, 20.00, secretsTest);

assert(round1.currentPot === 20.00, 'Pote inicial deve ser R$ 20,00');
assert(round1.burnPenalty === 2.00, 'Penalidade de queima por erro deve ser R$ 2,00 (10% de R$ 20)');

// Chute errado queima R$ 2,00 do pote
const r1 = processQuartetoGuess(round1, 'FESTA');
assert(r1.ok === true, 'Chute deve ser aceito');
assert(round1.currentPot === 18.00, 'Pote deve cair para R$ 18,00 após 1 erro');

// Acertar a 1ª palavra 'TERMO' não queima o pote
const r2 = processQuartetoGuess(round1, 'TERMO');
assert(round1.quadrants[0].solved === true, 'Quadrante 0 deve ser resolvido');
assert(round1.currentPot === 18.00, 'Pote não deve queimar quando uma palavra é descoberta');

// Acertar as restantes 3 palavras
processQuartetoGuess(round1, 'CASAL');
processQuartetoGuess(round1, 'VIVER');
processQuartetoGuess(round1, 'PLANO');

assert(round1.isFinished === true, 'A partida deve ser finalizada');
assert(round1.isWin === true, 'Jogador deve vencer com as 4 palavras');
assert(round1.payout === 90.00, `Prêmio deve ser Pote Restante R$ 18,00 x 5 = R$ 90,00 (recebido: ${round1.payout})`);

console.log('\n--- TESTE 3: Modo 2 - Multiplicador por Velocidade (Speed Multiplier) ---');
const round2 = createQuartetoRound(GAME_MODES.SPEED_MULTIPLIER, 10.00, secretsTest);
processQuartetoGuess(round2, 'FESTA'); // 1
processQuartetoGuess(round2, 'LETRA'); // 2
processQuartetoGuess(round2, 'TERMO'); // 3
processQuartetoGuess(round2, 'CASAL'); // 4
processQuartetoGuess(round2, 'VIVER'); // 5
processQuartetoGuess(round2, 'PLANO'); // 6

assert(round2.isFinished === true, 'Partida deve ser concluída');
assert(round2.attemptsCount === 6, 'Deve ter usado exatamente 6 tentativas');
assert(round2.multiplierApplied === 10, '6 tentativas deve conceder multiplicador 10X');
assert(round2.payout === 100.00, 'Aposta de R$ 10 x 10 = R$ 100,00');

console.log('\n--- TESTE 4: Modo 3 - Recompensa Progressiva por Palavra ---');
const round3 = createQuartetoRound(GAME_MODES.PROGRESSIVE_REWARD, 20.00, secretsTest);
processQuartetoGuess(round3, 'TERMO'); // Acertou 1
processQuartetoGuess(round3, 'CASAL'); // Acertou 2
// Gastar as tentativas restantes errando de propósito
for (let i = 0; i < 7; i++) {
  processQuartetoGuess(round3, 'FESTA');
}

assert(round3.isFinished === true, 'Partida deve encerrar após 9 tentativas');
assert(round3.solvedCount === 2, 'Deve ter acertado 2 palavras');
assert(round3.payout === 10.00, `2 palavras devem pagar 50% da aposta de R$ 20 = R$ 10,00 (recebido: ${round3.payout})`);

console.log('\n======================================');
console.log(`RESULTADO DOS TESTES DO MOTOR QUARTETO: ${passed} passaram, ${failed} falharam.`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('Todos os testes do motor Quarteto Bet passaram com 100% de sucesso!');
  process.exit(0);
}
