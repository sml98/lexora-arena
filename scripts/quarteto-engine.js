/**
 * Quarteto Bet - Motor de Jogo e Avaliação de Apostas
 * Suporta 4 tabuleiros simultâneos de 5 letras em 9 tentativas e os 3 Modos de Aposta.
 */

import { pickFourRandomWords, isValidWord } from './words.js';

export const GAME_MODES = {
  POT_DECAY: 'pot_decay',
  SPEED_MULTIPLIER: 'speed_multiplier',
  PROGRESSIVE_REWARD: 'progressive_reward'
};

export const MAX_ATTEMPTS = 9;

/**
 * Avalia as letras de um chute de 5 letras contra uma palavra secreta
 * Implementa as regras precisas de letras repetidas do Termo/Wordle
 */
export function evaluateWordGuess(guessWord, secretWord) {
  const guess = guessWord.toUpperCase();
  const secret = secretWord.toUpperCase();

  const result = Array(5).fill(null);
  const secretLetterCount = {};

  // Contagem de letras na palavra secreta
  for (let i = 0; i < 5; i++) {
    const char = secret[i];
    secretLetterCount[char] = (secretLetterCount[char] || 0) + 1;
  }

  // 1ª Passagem: Marcar acertos exatos (Verde / Correct)
  for (let i = 0; i < 5; i++) {
    if (guess[i] === secret[i]) {
      result[i] = { letter: guess[i], status: 'correct' };
      secretLetterCount[guess[i]]--;
    }
  }

  // 2ª Passagem: Marcar letras existentes em outra posição (Amarelo / Present) ou ausentes (Cinza / Absent)
  for (let i = 0; i < 5; i++) {
    if (!result[i]) {
      const char = guess[i];
      if (secretLetterCount[char] && secretLetterCount[char] > 0) {
        result[i] = { letter: char, status: 'present' };
        secretLetterCount[char]--;
      } else {
        result[i] = { letter: char, status: 'absent' };
      }
    }
  }

  return result;
}

/**
 * Cria uma nova partida do Quarteto Bet
 */
export function createQuartetoRound(mode = GAME_MODES.POT_DECAY, betAmount = 20.00, customSecrets = null) {
  const secrets = customSecrets || pickFourRandomWords();

  // No modo Pote Decrescente, a queima por erro é 10% do valor da aposta
  const burnPenalty = Math.max(1, Math.round(betAmount * 0.10 * 100) / 100);

  return {
    id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    mode,
    betAmount: parseFloat(betAmount),
    currentPot: parseFloat(betAmount),
    burnPenalty,
    secrets, // 4 palavras secretas
    quadrants: [
      { id: 0, secret: secrets[0], solved: false, solvedAtAttempt: null, guesses: [] },
      { id: 1, secret: secrets[1], solved: false, solvedAtAttempt: null, guesses: [] },
      { id: 2, secret: secrets[2], solved: false, solvedAtAttempt: null, guesses: [] },
      { id: 3, secret: secrets[3], solved: false, solvedAtAttempt: null, guesses: [] }
    ],
    attemptsCount: 0,
    maxAttempts: MAX_ATTEMPTS,
    solvedCount: 0,
    isFinished: false,
    isWin: false,
    payout: 0,
    multiplierApplied: 0,
    message: 'Partida iniciada! Digite sua primeira palavra de 5 letras.'
  };
}

/**
 * Processa um chute de palavra em todos os 4 quadrantes
 */
export function processQuartetoGuess(round, guessWord) {
  if (round.isFinished) {
    return { ok: false, error: 'A partida já foi concluída.' };
  }

  const cleanGuess = (guessWord || '').trim().toUpperCase();

  if (cleanGuess.length !== 5) {
    return { ok: false, error: 'A palavra deve ter exatamente 5 letras.' };
  }

  if (!isValidWord(cleanGuess)) {
    return { ok: false, error: 'Palavra não encontrada no dicionário.' };
  }

  round.attemptsCount++;
  let anyNewWordSolvedThisTurn = false;

  // Processar o chute para cada um dos 4 quadrantes
  round.quadrants.forEach(quad => {
    if (!quad.solved) {
      const evalResult = evaluateWordGuess(cleanGuess, quad.secret);
      quad.guesses.push({
        word: cleanGuess,
        tiles: evalResult
      });

      if (cleanGuess === quad.secret) {
        quad.solved = true;
        quad.solvedAtAttempt = round.attemptsCount;
        anyNewWordSolvedThisTurn = true;
        round.solvedCount++;
      }
    }
  });

  // Atualizações financeiras por Modo de Aposta:
  if (round.mode === GAME_MODES.POT_DECAY) {
    // Se não acertou nenhuma palavra neste turno, queima uma fatia do pote
    if (!anyNewWordSolvedThisTurn) {
      round.currentPot = Math.max(0, Math.round((round.currentPot - round.burnPenalty) * 100) / 100);
    }
  }

  // Verificar se o jogo terminou
  const allSolved = (round.solvedCount === 4);
  const reachedMaxAttempts = (round.attemptsCount >= round.maxAttempts);

  if (allSolved || reachedMaxAttempts) {
    round.isFinished = true;
    round.isWin = allSolved;
    calculateFinalPayout(round);
  }

  return {
    ok: true,
    round,
    anyNewWordSolvedThisTurn,
    allSolved
  };
}

/**
 * Calcula o prêmio final com base no modo selecionado
 */
export function calculateFinalPayout(round) {
  const bet = round.betAmount;

  if (round.mode === GAME_MODES.POT_DECAY) {
    // Modo 1: Pote Decrescente
    // Se descobriu as 4 palavras, multiplica o pote restante por 5X!
    if (round.isWin && round.currentPot > 0) {
      round.multiplierApplied = 5;
      round.payout = Math.round(round.currentPot * 5 * 100) / 100;
      round.message = `🔥 QUARTETO COMPLETO! Pote restante de R$ ${round.currentPot.toFixed(2)} x 5 = R$ ${round.payout.toFixed(2)}!`;
    } else {
      round.payout = 0;
      round.message = 'Tentativas esgotadas! O pote queimou por completo.';
    }
  } else if (round.mode === GAME_MODES.SPEED_MULTIPLIER) {
    // Modo 2: Multiplicador por Velocidade
    if (round.isWin) {
      let mult = 0;
      if (round.attemptsCount <= 6) mult = 10;
      else if (round.attemptsCount === 7) mult = 4;
      else if (round.attemptsCount === 8) mult = 2;
      else if (round.attemptsCount === 9) mult = 1;

      round.multiplierApplied = mult;
      round.payout = Math.round(bet * mult * 100) / 100;
      round.message = `⚡ RESOLVIDO EM ${round.attemptsCount} TENTATIVAS! Multiplicador ${mult}X = R$ ${round.payout.toFixed(2)}!`;
    } else {
      round.payout = 0;
      round.message = 'Fim de jogo! Não conseguiu fechar o Quarteto em 9 tentativas.';
    }
  } else if (round.mode === GAME_MODES.PROGRESSIVE_REWARD) {
    // Modo 3: Recompensa Progressiva por Palavra
    const rewards = {
      0: 0,
      1: 0.20, // 20% do valor da aposta
      2: 0.50, // 50%
      3: 1.00, // 100% (recupera aposta)
      4: 3.50  // 350% (Jackpot Quarteto Completo!)
    };

    const mult = rewards[round.solvedCount] || 0;
    round.multiplierApplied = mult;
    round.payout = Math.round(bet * mult * 100) / 100;

    if (round.solvedCount === 4) {
      round.message = `🏆 JACKPOT QUARTETO COMPLETO! 4 palavras decifradas = R$ ${round.payout.toFixed(2)} (3.5X)!`;
    } else if (round.solvedCount > 0) {
      round.message = `Parabéns! Você decifrou ${round.solvedCount} palavras e faturou R$ ${round.payout.toFixed(2)}!`;
    } else {
      round.payout = 0;
      round.message = 'Nenhuma palavra foi desvendada nesta partida.';
    }
  }

  return round.payout;
}

/**
 * Calcula a pontuação competitiva para ranqueamento de torneios
 */
export function calculateTournamentScore(round, timeSpentSeconds = 120) {
  if (round.isWin) {
    const attemptsBonus = (MAX_ATTEMPTS - round.attemptsCount + 1) * 2000;
    const speedBonus = Math.max(0, (300 - timeSpentSeconds) * 10);
    return 10000 + attemptsBonus + speedBonus;
  }

  let greenCount = 0;
  let yellowCount = 0;
  round.quadrants.forEach(q => {
    q.guesses.forEach(row => {
      row.tiles.forEach(t => {
        if (t.status === 'correct') greenCount++;
        if (t.status === 'present') yellowCount++;
      });
    });
  });

  return (round.solvedCount * 2000) + (greenCount * 50) + (yellowCount * 15);
}

/**
 * Calcula o Rake legal da plataforma e a divisão exata de prêmios por posição
 */
export function calculateTournamentPayouts(totalPot, maxPlayers, rakePercent = 20) {
  const platformProfit = Math.round(totalPot * (rakePercent / 100) * 100) / 100;
  const netPrizePool = Math.round((totalPot - platformProfit) * 100) / 100;

  let distribution = [];
  if (maxPlayers <= 2) {
    // Duelo 1x1: Campeão leva 100% do pote líquido
    distribution = [
      { rank: 1, percent: 1.00, payout: netPrizePool, label: '1º Lugar (Campeão)' }
    ];
  } else if (maxPlayers <= 4) {
    // Mesa Quádrupla (4 jogadores)
    distribution = [
      { rank: 1, percent: 0.75, payout: Math.round(netPrizePool * 0.75 * 100) / 100, label: '1º Lugar' },
      { rank: 2, percent: 0.25, payout: Math.round(netPrizePool * 0.25 * 100) / 100, label: '2º Lugar' }
    ];
  } else if (maxPlayers <= 16) {
    // Torneio de 8 a 16 jogadores (Top 3 Premiados)
    distribution = [
      { rank: 1, percent: 0.60, payout: Math.round(netPrizePool * 0.60 * 100) / 100, label: '1º Lugar' },
      { rank: 2, percent: 0.25, payout: Math.round(netPrizePool * 0.25 * 100) / 100, label: '2º Lugar' },
      { rank: 3, percent: 0.15, payout: Math.round(netPrizePool * 0.15 * 100) / 100, label: '3º Lugar' }
    ];
  } else {
    // Grande Torneio Diário (20 a 50+ jogadores - TOP 5 Premiado)
    distribution = [
      { rank: 1, percent: 0.50, payout: Math.round(netPrizePool * 0.50 * 100) / 100, label: '1º Lugar' },
      { rank: 2, percent: 0.25, payout: Math.round(netPrizePool * 0.25 * 100) / 100, label: '2º Lugar' },
      { rank: 3, percent: 0.15, payout: Math.round(netPrizePool * 0.15 * 100) / 100, label: '3º Lugar' },
      { rank: 4, percent: 0.06, payout: Math.round(netPrizePool * 0.06 * 100) / 100, label: '4º Lugar' },
      { rank: 5, percent: 0.04, payout: Math.round(netPrizePool * 0.04 * 100) / 100, label: '5º Lugar' }
    ];
  }

  return {
    totalPot,
    rakePercent,
    platformProfit,
    netPrizePool,
    distribution
  };
}

