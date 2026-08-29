export const MAX_ATTEMPTS = 9;

export const WORDS = [
  'TERMO','SAGAZ','NOBRE','IDEIA','PODER','TEMPO','PLENA','MUNDO','CASAL','VIVER',
  'SONHO','JOGAR','CARTA','BRISA','GRUPO','FESTA','LUGAR','PARTE','CORPO','FORCA',
  'FORTE','VALOR','SORTE','VERBO','LIVRO','PLANO','HOMEM','PONTO','ROCHA','NORTE',
  'COISA','PASSO','CHAVE','FAVOR','REGRA','CAMPO','NAVIO','PEDRA','LINHA','FORMA',
  'LETRA','CANTO','CALMA','CARRO','CERTO','FOLHA','CHUVA','VENTO','SINAL','AROMA',
  'CORTE','DENTE','FAROL','GOLPE','HOTEL','JARRO','LIMPO','METRO','NUVEM','PRATA',
  'QUEDA','RADAR','SALTO','TORRE','VAPOR','ZEBRA','AMIGO','BARCO','COFRE','DISCO',
  'EXAME','HONRA','NOITE','PALCO','QUASE','RITMO','SENSO','AGUDO','BOTAO','CLUBE',
  'DUCHA','ETAPA','FEIXE','GRAVE','HEROI','JEITO','MUITO','NIVEL','ORDEM','POETA',
  'RAMPA','TARDE','UNICO','VISAO','BRAVO','CIRCO','DRAMA','ENVIO','FAIXA','GRADE',
  'JOVEM','LEGAL','MUDAR','PAPEL','QUILO','RAZAO','SERIO','TEXTO','AREIA','ASTRO',
  'AUTOR','AVISO','BACIA','BAILE','BAIXO','BANCO','BANDO','BANHO','BARRA','BATER',
  'BEIJO','BEBER','BICHO','BLOCO','BOMBA','BORDA','BRUTO','CABRA','CACAU','CAIXA',
  'CALDO','CALOR','CANAL','CARGA','CARNE','CASCA','CAUSA','CERCA','CHAPA','CHEFE',
  'CHORO','CICLO','CINTO','CLARO','CLIMA','COBRA','COLAR','CONTO','CORAL','CORDA',
  'COSTA','CRAVO','CRIME','CRISE','CRUEL','CULPA','CURSO','CURTO','DADOS','DARDO',
  'DENSO','DIETA','DIGNO','DIZER','DOBRO','DOCES','DUETO','DUPLA','DUZIA','ELITE',
  'ENTRE','EPOCA','ERROS','EXATO','FALHA','FALSO','FAZER','FELIZ','FERRO','FIBRA',
  'FINAL','FIRME','FOCOU','FONTE','FRACO','FRASE','FREIO','FRUTA','FUNDO','GARFO',
  'GARRA','GENTE','GESTO','GLOBO','GOSTO','GRAMA','GRATO','IDEAL','IGUAL','IMPAR',
  'JUNTO','JUSTO','LAGOA','LARGO','LENTO','LIMAO','LINDO','LOCAL','LOUCO','MAIOR',
  'MARCA','MASSA','MEDO','MENOR','MENTE','MESMO','METAL','MORRO','MORTE','MOTOR',
  'MOVER','MULHER','MUSICA','NEGRO','OBRA','OLHAR','OUVIR','PADRE','PAGAR','PASTA',
  'PEIXE','PERTO','PISTA','PRAIA','PRETO','PROVA','REINO','RESTO','ROSTO','ROUPA',
  'SABER','SAIDA','SANTO','SAUDE','SEGUIR','SERRA','SOBRE','TERRA','TRATO','TROCA',
  'VERDE','VIAGEM','VIDRO','VINHO','VISTA','VITAL','VIVER','VOLTA'
];

export function evaluateWordGuess(guessWord, secretWord) {
  const guess = guessWord.toUpperCase();
  const secret = secretWord.toUpperCase();
  const result = Array(5).fill(null);
  const remaining = {};
  for (const letter of secret) remaining[letter] = (remaining[letter] || 0) + 1;
  for (let i = 0; i < 5; i++) if (guess[i] === secret[i]) {
    result[i] = { letter: guess[i], status: 'correct' };
    remaining[guess[i]]--;
  }
  for (let i = 0; i < 5; i++) if (!result[i]) {
    const letter = guess[i];
    const present = remaining[letter] > 0;
    result[i] = { letter, status: present ? 'present' : 'absent' };
    if (present) remaining[letter]--;
  }
  return result;
}

export function createQuartetoRound(secrets) {
  const chosen = secrets || WORDS.filter(word => word.length === 5).sort(() => Math.random() - .5).slice(0, 4);
  return { secrets: chosen, attempts: 0, solved: [false,false,false,false], guesses: [[],[],[],[]], finished: false };
}

export function submitQuartetoGuess(round, rawGuess) {
  const guess = String(rawGuess || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (round.finished) return { ok:false, error:'A partida já terminou.' };
  if (!/^[A-Z]{5}$/.test(guess)) return { ok:false, error:'Digite uma palavra de exatamente 5 letras.' };
  round.secrets.forEach((secret, index) => {
    if (round.solved[index]) return;
    const tiles = evaluateWordGuess(guess, secret);
    round.guesses[index].push({ word:guess, tiles });
    if (guess === secret) round.solved[index] = true;
  });
  round.attempts++;
  round.finished = round.solved.every(Boolean) || round.attempts >= MAX_ATTEMPTS;
  return { ok:true, guess, finished:round.finished, win:round.solved.every(Boolean) };
}
