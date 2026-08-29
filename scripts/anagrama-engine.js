/**
 * LÉXORA - Anagrama Rush Engine (Roda de 6 Letras em 90 Segundos)
 * O competidor forma o máximo de palavras válidas de 3 a 6 letras usando as letras da roda.
 */

import { ALL_PORTUGUESE_WORDS, normalizeWord } from './words.js';

export const ANAGRAM_ROUNDS_SEEDS = [
  { letters: ['B', 'R', 'A', 'S', 'I', 'L'], root: 'BRASIL' },
  { letters: ['M', 'E', 'S', 'T', 'R', 'E'], root: 'MESTRE' },
  { letters: ['C', 'A', 'S', 'A', 'D', 'O'], root: 'CASADO' },
  { letters: ['P', 'O', 'R', 'T', 'A', 'L'], root: 'PORTAL' },
  { letters: ['F', 'L', 'O', 'R', 'E', 'S'], root: 'FLORES' },
  { letters: ['V', 'I', 'A', 'G', 'E', 'M'], root: 'VIAGEM' },
  { letters: ['T', 'E', 'L', 'A', 'D', 'O'], root: 'TELADO' },
  { letters: ['J', 'A', 'R', 'D', 'I', 'M'], root: 'JARDIM' }
];

export const ANAGRAM_TIME_SECONDS = 90;

/**
 * Cria uma nova rodada de Anagrama Rush
 */
export function createAnagramaRound(customSeedIndex = null) {
  const seed = customSeedIndex !== null && ANAGRAM_ROUNDS_SEEDS[customSeedIndex]
    ? ANAGRAM_ROUNDS_SEEDS[customSeedIndex]
    : ANAGRAM_ROUNDS_SEEDS[Math.floor(Math.random() * ANAGRAM_ROUNDS_SEEDS.length)];

  // Embaralhar as 6 letras para a exibição na roda
  const shuffledLetters = [...seed.letters].sort(() => Math.random() - 0.5);

  return {
    id: `an_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    gameType: 'anagrama',
    seedRoot: seed.root,
    letters: shuffledLetters,
    foundWords: [],
    score: 0,
    isFinished: false,
    startTime: Date.now(),
    endTime: null,
    timeRemaining: ANAGRAM_TIME_SECONDS,
    message: 'Forme o maior número de palavras de 3 a 6 letras antes do tempo acabar!'
  };
}

/**
 * Valida se uma palavra pode ser formada usando o conjunto de letras disponível
 */
export function canFormWordWithLetters(word, availableLetters) {
  const lettersPool = [...availableLetters];
  for (const char of word) {
    const idx = lettersPool.indexOf(char);
    if (idx === -1) return false;
    lettersPool.splice(idx, 1);
  }
  return true;
}

/**
 * Processa uma tentativa de palavra no Anagrama Rush
 */
export function submitAnagramaWord(round, candidateWord) {
  if (round.isFinished) {
    return { ok: false, error: 'A partida de Anagrama já foi encerrada.' };
  }

  const clean = normalizeWord(candidateWord);

  if (clean.length < 3) {
    return { ok: false, error: 'Palavras devem ter pelo menos 3 letras.' };
  }

  if (clean.length > 6) {
    return { ok: false, error: 'A palavra excede o limite de 6 letras.' };
  }

  // Verificar se usa apenas as letras da roda
  if (!canFormWordWithLetters(clean, round.letters)) {
    return { ok: false, error: 'A palavra contém letras não presentes na roda.' };
  }

  // Verificar se já foi encontrada antes
  if (round.foundWords.some(w => w.word === clean)) {
    return { ok: false, error: `Você já encontrou "${clean}"!` };
  }

  // Verificar se é uma palavra legítima no dicionário
  // (Aceita se estiver no dicionário oficial ou tiver estrutura válida com vogais)
  const isDictionary = ALL_PORTUGUESE_WORDS.has(clean) || clean.length <= 4;
  if (!isDictionary && !isValidSubword(clean)) {
    return { ok: false, error: `"${clean}" não é uma palavra válida.` };
  }

  // Calcular pontuação pelo tamanho
  let pts = 0;
  if (clean.length === 3) pts = 10;
  else if (clean.length === 4) pts = 25;
  else if (clean.length === 5) pts = 50;
  else if (clean.length === 6) pts = 150; // Anagrama completo!

  round.score += pts;
  const wordEntry = {
    word: clean,
    points: pts,
    length: clean.length,
    isFullAnagram: clean.length === 6
  };
  round.foundWords.unshift(wordEntry);

  return {
    ok: true,
    round,
    wordEntry,
    score: round.score,
    message: clean.length === 6 ? `🔥 ANAGRAMA COMPLETO! +${pts} PONTOS!` : `+${pts} pontos!`
  };
}

function isValidSubword(w) {
  return /[AEIOU]/.test(w) && w.length >= 3;
}
