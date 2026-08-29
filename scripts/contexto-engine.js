/**
 * LÉXORA - Contexto Arena Engine (Adivinhação Semântica Quente/Frio)
 * Calcula a proximidade semântica e contextual de palavras em português
 * retornando rankings de proximidade de #1 (palavra secreta) até #50.000 com temperaturas.
 */

import { normalizeWord, ALL_PORTUGUESE_WORDS } from './words.js';

// Clusters semânticos temáticos com pesos de associação conceitual
export const SEMANTIC_CLUSTERS = {
  ANIMAIS: {
    target: 'GATO',
    tier1: ['CACHORRO', 'FELINO', 'ANIMAL', 'PET', 'BICHANO', 'MIAU', 'FILHOTE', 'MAMIFERO', 'RACAO', 'VETERINARIO'],
    tier2: ['LEAO', 'TIGRE', 'ONCA', 'COELHO', 'CAVALO', 'VACA', 'PORCO', 'RATO', 'PASSARO', 'PEIXE', 'ZOOLOGICO', 'SELVAGEM'],
    tier3: ['FLORESTA', 'NATUREZA', 'FAUNA', 'ARVORE', 'PARQUE', 'TERRA', 'AGUA', 'PLANETA', 'BIOMA', 'ECOLOGIA'],
    tier4: ['CASA', 'FAMILIA', 'CRIANCA', 'BRINQUEDO', 'SOFA', 'CAMA', 'QUARTO', 'AMOR', 'CARINHO', 'VIDA']
  },
  TRANSPORTES: {
    target: 'CARRO',
    tier1: ['AUTOMOVEL', 'VEICULO', 'MOTOR', 'VOLANTE', 'PNEU', 'ESTRADA', 'RODOVIA', 'GARAGEM', 'PILOTO', 'COMBUSTIVEL'],
    tier2: ['MOTO', 'CAMINHAO', 'ONIBUS', 'BICICLETA', 'TREM', 'METRO', 'AVIAO', 'NAVIO', 'BARCO', 'TRANSPORTE', 'TRAFEGO'],
    tier3: ['CIDADE', 'RUA', 'ASFALTO', 'SEMAFORO', 'VIAGEM', 'DESTINO', 'VELOCIDADE', 'DISTANCIA', 'TURISMO'],
    tier4: ['TRABALHO', 'PESSOA', 'DIA', 'TEMPO', 'MUNDO', 'LUGAR', 'ENERGIA', 'MECANICA', 'OFICINA']
  },
  ALIMENTOS: {
    target: 'PIZZA',
    tier1: ['QUEIJO', 'MASSA', 'FORNO', 'MOLHO', 'TOMATE', 'COMIDA', 'REFEICAO', 'FATIA', 'ITALIA', 'RESTAURANTE'],
    tier2: ['HAMBURGUER', 'LANCHE', 'PAO', 'PASTA', 'MACARRAO', 'CARNE', 'SOPA', 'ARROZ', 'FEIJAO', 'SALADA', 'SOBREMESA'],
    tier3: ['COZINHA', 'CHEF', 'FOME', 'SABOR', 'DELICIA', 'PRATO', 'MESA', 'JANTAR', 'ALMOCO', 'BEBIDA'],
    tier4: ['FESTA', 'AMIGOS', 'NOITE', 'CASA', 'PEDIDO', 'ENTREGA', 'PRECO', 'CARDAPIO', 'SABOROSO']
  },
  NATUREZA: {
    target: 'PRAIA',
    tier1: ['MAR', 'OCEANO', 'AREIA', 'ONDA', 'SOL', 'VERAO', 'ORLA', 'LITORAL', 'SURF', 'CONCHA'],
    tier2: ['ILHA', 'AGUA', 'FERIAS', 'CALOR', 'VIAGEM', 'PEIXE', 'BARCO', 'NAVIO', 'COQUEIRO', 'BRISA', 'CEU'],
    tier3: ['NATUREZA', 'TERRA', 'RIO', 'LAGO', 'MONTANHA', 'FLORESTA', 'CLIMA', 'VENTO', 'PAISAGEM'],
    tier4: ['DESCANSO', 'FAMILIA', 'FOTOGRAFIA', 'FIM', 'SEMANA', 'ALEGRIA', 'HOTEL', 'PASSEIO']
  },
  TECNOLOGIA: {
    target: 'COMPUTADOR',
    tier1: ['NOTEBOOK', 'TECLADO', 'MOUSE', 'MONITOR', 'PROCESSADOR', 'SOFTWARE', 'PROGRAMA', 'INTERNET', 'TELA', 'HARDWARE'],
    tier2: ['CELULAR', 'SMARTPHONE', 'TABLET', 'ROBO', 'SISTEMA', 'DADOS', 'CODIGO', 'ARQUIVO', 'DIGITAL', 'CHIP', 'REDE'],
    tier3: ['TECNOLOGIA', 'CIENCIA', 'FUTURO', 'TRABALHO', 'JOGO', 'VIDEO', 'INFORMACAO', 'ELETRONICO', 'MEMORIA'],
    tier4: ['MODERNO', 'CRIATIVO', 'ESTUDO', 'ESCOLA', 'EMPRESA', 'ESCRITORIO', 'COMUNICACAO', 'CONEXAO']
  },
  SENTIMENTOS: {
    target: 'ALEGRIA',
    tier1: ['FELICIDADE', 'SORRISO', 'RISO', 'FESTA', 'COMEMORACAO', 'EUFORIA', 'PRAZER', 'ENTUSIASMO', 'VITORIA', 'CELEBRACAO'],
    tier2: ['AMOR', 'PAZ', 'ESPERANCA', 'CORACAO', 'ABRACO', 'AMIZADE', 'CARINHO', 'EMOCAO', 'SENTIMENTO', 'BONDADE'],
    tier3: ['VIDA', 'ALMA', 'MENTE', 'ENERGIA', 'LUZ', 'HARMONIA', 'SONHO', 'DESEJO', 'CORAGEM'],
    tier4: ['PESSOA', 'FAMILIA', 'MUNDO', 'MOMENTO', 'PRESENTE', 'HISTORIA', 'LEMBRANCA']
  }
};

/**
 * Calcula a distância / ranking semântico de um chute contra a palavra secreta
 */
export function calculateContextoDistance(guessWord, secretWord, clusterKey = 'ANIMAIS') {
  const guess = normalizeWord(guessWord);
  const secret = normalizeWord(secretWord);

  // 1. Acerto exato (#1)
  if (guess === secret) {
    return {
      rank: 1,
      word: guess,
      temperature: 'hot', // 'hot' (verde), 'warm' (amarelo), 'cold' (vermelho)
      progressPercent: 100,
      label: '🏆 PALAVRA SECRETA!'
    };
  }

  const cluster = SEMANTIC_CLUSTERS[clusterKey] || SEMANTIC_CLUSTERS.ANIMAIS;

  // 2. Nível 1: Muito perto (Posição #2 a #300)
  const tier1Idx = cluster.tier1.indexOf(guess);
  if (tier1Idx !== -1) {
    const rank = Math.max(2, tier1Idx * 25 + Math.floor(Math.random() * 15) + 2);
    return {
      rank,
      word: guess,
      temperature: 'hot',
      progressPercent: Math.round(99 - (rank / 300) * 19),
      label: 'MUITO PERTO!'
    };
  }

  // 3. Nível 2: Perto (Posição #301 a #1.500)
  const tier2Idx = cluster.tier2.indexOf(guess);
  if (tier2Idx !== -1) {
    const rank = 300 + tier2Idx * 90 + Math.floor(Math.random() * 40) + 1;
    return {
      rank,
      word: guess,
      temperature: 'warm',
      progressPercent: Math.round(79 - ((rank - 300) / 1200) * 39),
      label: 'PERTO'
    };
  }

  // 4. Nível 3: Contexto geral (Posição #1.501 a #5.000)
  const tier3Idx = cluster.tier3.indexOf(guess);
  if (tier3Idx !== -1) {
    const rank = 1500 + tier3Idx * 280 + Math.floor(Math.random() * 100) + 1;
    return {
      rank,
      word: guess,
      temperature: 'cold',
      progressPercent: Math.round(39 - ((rank - 1500) / 3500) * 20),
      label: 'LONGE'
    };
  }

  // 5. Nível 4: Distante (Posição #5.001 a #15.000)
  const tier4Idx = cluster.tier4.indexOf(guess);
  if (tier4Idx !== -1) {
    const rank = 5000 + tier4Idx * 900 + Math.floor(Math.random() * 200) + 1;
    return {
      rank,
      word: guess,
      temperature: 'cold',
      progressPercent: Math.round(19 - ((rank - 5000) / 10000) * 10),
      label: 'MUITO LONGE'
    };
  }

  // 6. Palavra genérica não mapeada (Cálculo hash determinístico entre #15.001 e #48.000)
  let hash = 0;
  for (let i = 0; i < guess.length; i++) {
    hash = (hash << 5) - hash + guess.charCodeAt(i);
    hash |= 0;
  }
  const deterministicRank = 15000 + (Math.abs(hash) % 33000);

  return {
    rank: deterministicRank,
    word: guess,
    temperature: 'cold',
    progressPercent: Math.max(1, Math.round(9 - (deterministicRank / 48000) * 8)),
    label: 'MUITO LONGE'
  };
}

/**
 * Cria uma nova rodada do Contexto
 */
export function createContextoRound(customSecret = null, customCluster = 'ANIMAIS') {
  const clusterKeys = Object.keys(SEMANTIC_CLUSTERS);
  const clusterKey = customCluster || clusterKeys[Math.floor(Math.random() * clusterKeys.length)];
  const cluster = SEMANTIC_CLUSTERS[clusterKey];
  const secret = customSecret || cluster.target;

  return {
    id: `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    gameType: 'contexto',
    clusterKey,
    secret,
    attemptsCount: 0,
    maxAttempts: 25, // Em duelos e torneios
    guesses: [], // Lista de todos os chutes ordenados por proximidade (menor rank primeiro)
    isFinished: false,
    isWin: false,
    bestRank: 99999,
    score: 0,
    startTime: Date.now(),
    message: 'Digite qualquer palavra em português para testar a proximidade semântica!'
  };
}

/**
 * Processa um chute no Contexto
 */
export function processContextoGuess(round, guessWord) {
  if (round.isFinished) {
    return { ok: false, error: 'A partida de Contexto já foi concluída.' };
  }

  const clean = normalizeWord(guessWord);
  if (!clean || clean.length < 2) {
    return { ok: false, error: 'Digite uma palavra com pelo menos 2 letras.' };
  }

  // Verificar se o chute já foi feito antes
  if (round.guesses.some(g => g.word === clean)) {
    return { ok: false, error: `Você já tentou a palavra "${clean}".` };
  }

  round.attemptsCount++;
  const evalResult = calculateContextoDistance(clean, round.secret, round.clusterKey);

  // Inserir e ordenar por proximidade (rank menor no topo)
  round.guesses.push(evalResult);
  round.guesses.sort((a, b) => a.rank - b.rank);

  if (evalResult.rank < round.bestRank) {
    round.bestRank = evalResult.rank;
  }

  // Vitória se acertar a palavra #1
  if (evalResult.rank === 1) {
    round.isFinished = true;
    round.isWin = true;
    round.score = Math.max(100, 5000 - (round.attemptsCount * 150));
    round.message = `🎉 BRILHANTE! Você decifrou a palavra secreta "${round.secret}" em ${round.attemptsCount} tentativas!`;
  } else if (round.attemptsCount >= round.maxAttempts) {
    round.isFinished = true;
    round.isWin = false;
    round.score = Math.max(10, 1000 - Math.min(990, round.bestRank));
    round.message = `Fim das tentativas! A palavra secreta era "${round.secret}". Seu melhor ranking foi #${round.bestRank}.`;
  }

  return {
    ok: true,
    round,
    evalResult,
    isWin: round.isWin
  };
}
