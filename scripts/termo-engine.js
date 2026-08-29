/**
 * LÉXORA - Termo Blitz 1x1 Engine (Duelo Veloz de 1 Palavra em 60 Segundos)
 * Disputa direta de velocidade e precisão em 1 única palavra de 5 letras.
 */

import { evaluateWordGuess } from './quarteto-engine.js';
import { pickFourRandomWords, isValidWord, normalizeWord } from './words.js';

export const TERMO_MAX_ATTEMPTS = 6;
export const TERMO_ROUND_TIME_SECONDS = 60;

/**
 * Cria uma nova partida de Termo Blitz
 */
export function createTermoBlitzRound(customSecret = null) {
  const secret = customSecret || pickFourRandomWords()[0];

  return {
    id: `tb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    gameType: 'termo_blitz',
    secret: secret.toUpperCase(),
    attemptsCount: 0,
    maxAttempts: TERMO_MAX_ATTEMPTS,
    guesses: [],
    isFinished: false,
    isWin: false,
    startTime: Date.now(),
    endTime: null,
    timeSpentSeconds: 0,
    score: 0,
    message: 'Duelo iniciado! Você tem 60 segundos para decifrar a palavra.'
  };
}

/**
 * Processa um chute no Termo Blitz
 */
export function processTermoBlitzGuess(round, guessWord) {
  if (round.isFinished) {
    return { ok: false, error: 'A partida de Termo Blitz já foi finalizada.' };
  }

  const clean = normalizeWord(guessWord);
  if (clean.length !== 5) {
    return { ok: false, error: 'A palavra deve ter exatamente 5 letras.' };
  }

  if (!isValidWord(clean)) {
    return { ok: false, error: 'Palavra não encontrada no dicionário.' };
  }

  round.attemptsCount++;
  const tiles = evaluateWordGuess(clean, round.secret);
  round.guesses.push({
    word: clean,
    tiles
  });

  const now = Date.now();
  const elapsedSeconds = Math.min(TERMO_ROUND_TIME_SECONDS, Math.floor((now - round.startTime) / 1000));
  const remainingSeconds = Math.max(0, TERMO_ROUND_TIME_SECONDS - elapsedSeconds);

  // Vitória
  if (clean === round.secret) {
    round.isFinished = true;
    round.isWin = true;
    round.endTime = now;
    round.timeSpentSeconds = elapsedSeconds;
    // Pontuação: bônus por tentativas restantes + bônus de velocidade em segundos
    round.score = ((TERMO_MAX_ATTEMPTS - round.attemptsCount + 1) * 1000) + (remainingSeconds * 50);
    round.message = `⚡ VITÓRIA RELÂMPAGO! Decifrada em ${round.attemptsCount} chutes e ${elapsedSeconds}s!`;
  } else if (round.attemptsCount >= round.maxAttempts || remainingSeconds <= 0) {
    round.isFinished = true;
    round.isWin = false;
    round.endTime = now;
    round.timeSpentSeconds = elapsedSeconds;
    // Pontuação parcial por letras verdes e amarelas acumuladas
    let greenCount = 0;
    let yellowCount = 0;
    tiles.forEach(t => {
      if (t.status === 'correct') greenCount++;
      if (t.status === 'present') yellowCount++;
    });
    round.score = (greenCount * 100) + (yellowCount * 30);
    round.message = `Fim de jogo! A palavra era "${round.secret}".`;
  }

  return {
    ok: true,
    round,
    tiles,
    isWin: round.isWin
  };
}
