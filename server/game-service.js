import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateWordGuess } from '../scripts/quarteto-engine.js';
import { ALL_PORTUGUESE_WORDS } from '../scripts/words.js';
import { PT_BR_WORDS, EN_US_WORDS, DICTIONARY_META } from './dictionaries.generated.js';
import { semanticProvider } from './semantic-provider.js';

const sessions = new Map();
const DAY_MS = 86_400_000;
const DATA_DIR=join(dirname(fileURLToPath(import.meta.url)),'..','data');
const LEDGER_FILE=join(DATA_DIR,'daily-allocations.json');
const SERVER_SALT=process.env.LEXORA_GAME_SECRET||randomUUID();
const normalize = value => String(value || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('Ç','C');
const hashInt = text => Number.parseInt(createHash('sha256').update(text).digest('hex').slice(0, 8), 16);
const dayId = () => new Date().toISOString().slice(0, 10);

const GROUPS=[
  ['MUSICA','CANCAO','SOM','RITMO','MELODIA','CANTOR','BANDA','VIOLAO','PALCO','RADIO','DANCA','VOZ'],
  ['OCEANO','MAR','AGUA','ONDA','PRAIA','NAVIO','PEIXE','AZUL','COSTA','PORTO','AREIA','VENTO'],
  ['ESCOLA','ALUNO','PROFESSOR','AULA','ENSINO','LIVRO','TURMA','ESTUDO','CADERNO','LAPIS','PROVA','NOTA'],
  ['FUTEBOL','BOLA','GOL','TIME','CAMPO','JOGADOR','ESTADIO','CHUTE','TORCIDA','ARBITRO','REDE','CAMISA'],
  ['FLORESTA','ARVORE','MATA','FOLHA','VERDE','NATUREZA','ANIMAL','TRONCO','RAIZ','SELVA','PLANTA','TERRA'],
  ['TECNOLOGIA','COMPUTADOR','INTERNET','CODIGO','DIGITAL','DADOS','SISTEMA','REDE','TELA','ROBO','CELULAR','PROGRAMA'],
  ['COZINHA','PANELA','FOGAO','PRATO','GARFO','FACA','COMIDA','RECEITA','FORNO','COPO','MESA','TEMPERO'],
  ['CIDADE','RUA','PREDIO','PRACA','BAIRRO','TRANSITO','LOJA','PARQUE','PONTE','METRO','CENTRO','CALCADA'],
  ['SAUDE','MEDICO','HOSPITAL','REMÉDIO','CORPO','DOR','CURA','EXAME','PACIENTE','FEBRE','SONO','VIDA'],
  ['VIAGEM','AVIAO','HOTEL','MALA','MAPA','TURISTA','DESTINO','ESTRADA','PASSAGEM','FERIAS','PAIS','ROTA'],
  ['ANIMAL','CACHORRO','GATO','CAVALO','PASSARO','PEIXE','LEAO','TIGRE','LOBO','URSO','MACACO','COELHO'],
  ['EMOCAO','AMOR','MEDO','ALEGRIA','TRISTEZA','RAIVA','CALMA','SAUDADE','SORRISO','CHORO','CORAGEM','PAZ'],
  ['TRABALHO','EMPREGO','CHEFE','EQUIPE','SALARIO','PROJETO','REUNIAO','TAREFA','EMPRESA','META','CARREIRA','NEGOCIO'],
  ['CASA','QUARTO','SALA','PORTA','JANELA','TELHADO','COZINHA','BANHEIRO','JARDIM','PAREDE','CHAVE','MOVEIS'],
  ['CLIMA','CHUVA','SOL','NUVEM','VENTO','CALOR','FRIO','TEMPESTADE','NEVE','RAIO','UMIDADE','PREVISAO'],
  ['ARTE','PINTURA','TEATRO','CINEMA','POESIA','DANCA','ESCULTURA','DESENHO','COR','MUSEU','PALCO','CRIACAO'],
  ['FAMILIA','PAI','MAE','FILHO','FILHA','IRMAO','IRMA','AVO','TIO','TIA','PRIMO','CASAMENTO'],
  ['TRANSPORTE','CARRO','ONIBUS','TREM','BICICLETA','MOTO','TAXI','RODOVIA','MOTORISTA','ESTACAO','VIAGEM','PASSAGEIRO'],
  ['CIENCIA','PESQUISA','LABORATORIO','TEORIA','EXPERIENCIA','DESCOBERTA','CIENTISTA','QUIMICA','FISICA','BIOLOGIA','ATOMO','CELULA'],
  ['ESPACO','UNIVERSO','PLANETA','ESTRELA','LUA','SOL','GALAXIA','COMETA','ASTEROIDE','ORBITA','ASTRONAUTA','FOGUETE'],
  ['DINHEIRO','MOEDA','NOTA','BANCO','PRECO','COMPRA','VENDA','LUCRO','CONTA','CARTEIRA','PAGAMENTO','ECONOMIA'],
  ['JUSTICA','LEI','JUIZ','TRIBUNAL','DIREITO','ADVOGADO','CRIME','PENA','PROCESSO','PROVA','SENTENCA','POLICIA'],
  ['ROUPA','CAMISA','CALCA','VESTIDO','SAPATO','CASACO','CHAPEU','SAIA','MEIA','BOLSA','CINTO','TECIDO'],
  ['ESPORTE','ATLETA','JOGO','CORRIDA','TENIS','NATACAO','BASQUETE','VOLEI','MEDALHA','TREINO','CAMPEAO','EQUIPE'],
  ['AGRICULTURA','FAZENDA','CAMPO','TRATOR','COLHEITA','SEMENTE','MILHO','ARROZ','GADO','SOLO','CELEIRO','PLANTACAO'],
  ['ESCRITORIO','MESA','CADEIRA','PAPEL','CANETA','COMPUTADOR','ARQUIVO','AGENDA','REUNIAO','DOCUMENTO','TELEFONE','EMPRESA'],
  ['FESTA','BOLO','VELA','PRESENTE','MUSICA','DANCA','CONVITE','ANIVERSARIO','AMIGOS','BEBIDA','DECORACAO','ALEGRIA'],
  ['LINGUAGEM','PALAVRA','FRASE','TEXTO','IDIOMA','LETRA','GRAMATICA','LEITURA','ESCRITA','DISCURSO','DICIONARIO','TRADUCAO'],
  ['HISTORIA','PASSADO','MEMORIA','GUERRA','REI','RAINHA','IMPERIO','REVOLUCAO','DOCUMENTO','MUSEU','DATA','POVO'],
  ['ENERGIA','ELETRICIDADE','LUZ','BATERIA','MOTOR','TOMADA','USINA','SOLAR','EOLICA','CALOR','POTENCIA','CABO'],
  ['COMERCIO','MERCADO','CLIENTE','PRODUTO','PRECO','VENDA','COMPRA','LOJA','CAIXA','ESTOQUE','FORNECEDOR','NEGOCIO'],
  ['CORPO','CABECA','BRACO','PERNA','MAO','PE','CORACAO','PULMAO','SANGUE','OSSO','MUSCULO','PELE']
];
const EN_GROUPS=[
  ['MUSIC','SONG','SOUND','RHYTHM','MELODY','SINGER','BAND','GUITAR','STAGE','RADIO','DANCE','VOICE'],
  ['OCEAN','SEA','WATER','WAVE','BEACH','SHIP','FISH','BLUE','COAST','PORT','SAND','WIND'],
  ['SCHOOL','STUDENT','TEACHER','CLASS','BOOK','STUDY','PENCIL','TEST','GRADE','LESSON','DESK','LEARN'],
  ['SOCCER','BALL','GOAL','TEAM','FIELD','PLAYER','STADIUM','KICK','CROWD','REFEREE','NET','SHIRT'],
  ['FOREST','TREE','LEAF','GREEN','NATURE','ANIMAL','TRUNK','ROOT','JUNGLE','PLANT','EARTH','RAIN'],
  ['TECHNOLOGY','COMPUTER','INTERNET','CODE','DIGITAL','DATA','SYSTEM','NETWORK','SCREEN','ROBOT','PHONE','PROGRAM'],
  ['KITCHEN','PAN','STOVE','PLATE','FORK','KNIFE','FOOD','RECIPE','OVEN','CUP','TABLE','SPICE'],
  ['CITY','STREET','BUILDING','SQUARE','TRAFFIC','STORE','PARK','BRIDGE','SUBWAY','CENTER','SIDEWALK','TOWER'],
  ['HEALTH','DOCTOR','HOSPITAL','MEDICINE','BODY','PAIN','CURE','EXAM','PATIENT','FEVER','SLEEP','LIFE'],
  ['TRAVEL','AIRPLANE','HOTEL','BAG','MAP','TOURIST','DESTINATION','ROAD','TICKET','VACATION','COUNTRY','ROUTE'],
  ['ANIMAL','DOG','CAT','HORSE','BIRD','FISH','LION','TIGER','WOLF','BEAR','MONKEY','RABBIT'],
  ['EMOTION','LOVE','FEAR','JOY','SADNESS','ANGER','CALM','LONGING','SMILE','CRY','COURAGE','PEACE'],
  ['WORK','JOB','BOSS','TEAM','SALARY','PROJECT','MEETING','TASK','COMPANY','TARGET','CAREER','BUSINESS'],
  ['HOUSE','ROOM','HALL','DOOR','WINDOW','ROOF','KITCHEN','BATHROOM','GARDEN','WALL','KEY','FURNITURE'],
  ['WEATHER','RAIN','SUN','CLOUD','WIND','HEAT','COLD','STORM','SNOW','LIGHTNING','HUMIDITY','FORECAST'],
  ['ART','PAINTING','THEATER','CINEMA','POETRY','DANCE','SCULPTURE','DRAWING','COLOR','MUSEUM','STAGE','CREATION'],
  ['FAMILY','FATHER','MOTHER','SON','DAUGHTER','BROTHER','SISTER','GRANDPARENT','UNCLE','AUNT','COUSIN','MARRIAGE'],
  ['TRANSPORT','CAR','BUS','TRAIN','BICYCLE','MOTORCYCLE','TAXI','HIGHWAY','DRIVER','STATION','TRAVEL','PASSENGER'],
  ['SCIENCE','RESEARCH','LABORATORY','THEORY','EXPERIMENT','DISCOVERY','SCIENTIST','CHEMISTRY','PHYSICS','BIOLOGY','ATOM','CELL'],
  ['SPACE','UNIVERSE','PLANET','STAR','MOON','SUN','GALAXY','COMET','ASTEROID','ORBIT','ASTRONAUT','ROCKET'],
  ['MONEY','COIN','BILL','BANK','PRICE','PURCHASE','SALE','PROFIT','ACCOUNT','WALLET','PAYMENT','ECONOMY'],
  ['JUSTICE','LAW','JUDGE','COURT','RIGHT','LAWYER','CRIME','PENALTY','PROCESS','EVIDENCE','SENTENCE','POLICE'],
  ['CLOTHING','SHIRT','PANTS','DRESS','SHOE','COAT','HAT','SKIRT','SOCK','BAG','BELT','FABRIC'],
  ['SPORT','ATHLETE','GAME','RACE','TENNIS','SWIMMING','BASKETBALL','VOLLEYBALL','MEDAL','TRAINING','CHAMPION','TEAM'],
  ['AGRICULTURE','FARM','FIELD','TRACTOR','HARVEST','SEED','CORN','RICE','CATTLE','SOIL','BARN','PLANTATION'],
  ['OFFICE','DESK','CHAIR','PAPER','PEN','COMPUTER','FILE','CALENDAR','MEETING','DOCUMENT','PHONE','COMPANY'],
  ['PARTY','CAKE','CANDLE','GIFT','MUSIC','DANCE','INVITATION','BIRTHDAY','FRIENDS','DRINK','DECORATION','JOY'],
  ['LANGUAGE','WORD','SENTENCE','TEXT','IDIOM','LETTER','GRAMMAR','READING','WRITING','SPEECH','DICTIONARY','TRANSLATION'],
  ['HISTORY','PAST','MEMORY','WAR','KING','QUEEN','EMPIRE','REVOLUTION','DOCUMENT','MUSEUM','DATE','PEOPLE'],
  ['ENERGY','ELECTRICITY','LIGHT','BATTERY','ENGINE','OUTLET','POWERPLANT','SOLAR','WIND','HEAT','POWER','CABLE'],
  ['COMMERCE','MARKET','CUSTOMER','PRODUCT','PRICE','SALE','PURCHASE','STORE','CHECKOUT','STOCK','SUPPLIER','BUSINESS'],
  ['BODY','HEAD','ARM','LEG','HAND','FOOT','HEART','LUNG','BLOOD','BONE','MUSCLE','SKIN']
];
const makeContext=groups=>[...new Map(groups.flatMap((group,index)=>group.map(secret=>({secret:normalize(secret),near:group.filter(w=>normalize(w)!==normalize(secret)).map(normalize),warm:groups[(index+1)%groups.length].slice(0,6).map(normalize)}))).map(item=>[item.secret,item])).values()];
const CONTEXTO_PT=makeContext(GROUPS),CONTEXTO_EN=makeContext(EN_GROUPS);
const WORD_POOL_PT=[...new Set([...ALL_PORTUGUESE_WORDS,...PT_BR_WORDS])].filter(word=>/^[A-Z]{5}$/.test(word));
const WORD_POOL_EN=EN_US_WORDS;
const WORD_POOL=[...new Set([...WORD_POOL_PT,...WORD_POOL_EN])];
function languagePools(language){
  if(language==='pt')return {words:WORD_POOL_PT,contexts:CONTEXTO_PT};
  if(language==='en')return {words:WORD_POOL_EN,contexts:CONTEXTO_EN};
  return {words:WORD_POOL,contexts:[...CONTEXTO_PT,...CONTEXTO_EN]};
}

function emptyLedger(){return {dayId:dayId(),words:[],contexts:[]};}
function loadLedger(){try{const data=JSON.parse(readFileSync(LEDGER_FILE,'utf8'));return data.dayId===dayId()?data:emptyLedger();}catch{return emptyLedger();}}
let ledger=loadLedger();
function persistLedger(){mkdirSync(DATA_DIR,{recursive:true});const tmp=`${LEDGER_FILE}.tmp`;writeFileSync(tmp,JSON.stringify(ledger,null,2));renameSync(tmp,LEDGER_FILE);}
function ensureDay(){if(ledger.dayId!==dayId()){ledger=emptyLedger();persistLedger();}}
function allocate(kind,candidates,count,getId=value=>value){
  ensureDay();const used=new Set(ledger[kind]);const seed=`${ledger.dayId}:${kind}:${SERVER_SALT}`;
  const available=candidates.filter(item=>!used.has(getId(item))).map((item,index)=>({item,index,rank:hashInt(`${seed}:${getId(item)}`)})).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(entry=>entry.item);
  if(available.length<count)throw new Error(`Conteúdo diário esgotado para este modo. Nenhuma resposta será repetida; tente novamente amanhã.`);
  const selected=available.slice(0,count);ledger[kind].push(...selected.map(getId));persistLedger();return selected;
}
export function createSharedChallenge(mode,language='mixed'){
  if(!['quarteto','contexto'].includes(mode))throw new Error('Este modo não está disponível na arena competitiva.');
  const safeLanguage=['pt','en','mixed'].includes(language)?language:'mixed';
  const pools=languagePools(safeLanguage);
  if(mode==='quarteto'){
    const secrets=allocate('words',pools.words,4);
    return {mode,language:safeLanguage,sessionOptions:{secrets},public:{boards:4,maxAttempts:9}};
  }
  const challenge=allocate('contexts',pools.contexts,1,item=>item.secret)[0];
  return {mode,language:safeLanguage,sessionOptions:{challenge},public:{maxAttempts:30,semanticProvider:semanticProvider.getMetadata()}};
}

export function createGameSession(mode, options={}) {
  if (!['quarteto','contexto'].includes(mode)) throw new Error('Modo de jogo inválido. Escolha Quarteto ou Contexto.');
  const id=randomUUID();
  const language=['pt','en','mixed'].includes(options.language)?options.language:'mixed';
  const pools=languagePools(language);
  const session={ id, mode, language, dayId:dayId(), createdAt:Date.now(), expiresAt:Date.now()+DAY_MS, attempts:0, used:new Set(), score:0, finished:false };
  if(mode==='quarteto') Object.assign(session,{ secrets:options.secrets || allocate('words',pools.words,4), solved:[false,false,false,false], maxAttempts:9 });
  if(mode==='contexto') Object.assign(session,{ challenge:options.challenge || allocate('contexts',pools.contexts,1,item=>item.secret)[0], maxAttempts:30, bestRank:9999 });
  sessions.set(id,session);
  return publicStart(session);
}

function publicStart(s) {
  const pools=languagePools(s.language);
  const base={sessionId:s.id,mode:s.mode,language:s.language,dayId:s.dayId,roundId:s.id.slice(0,8),expiresAt:s.expiresAt,dictionaries:DICTIONARY_META.counts,stock:{fiveLetters:pools.words.length,contexts:pools.contexts.length}};
  if(s.mode==='quarteto') return {...base,boards:4,maxAttempts:s.maxAttempts};
  return {...base,maxAttempts:s.maxAttempts,semanticProvider:semanticProvider.getMetadata()};
}

function getSession(id) {
  const s=sessions.get(id);
  if(!s || s.expiresAt<Date.now()) throw new Error('Partida expirada. Inicie uma nova rodada.');
  return s;
}

function validateGuess(s, raw, {five=false}={}) {
  const guess=normalize(raw);
  if(five && !/^[A-Z]{5}$/.test(guess)) throw new Error('Digite uma palavra de exatamente 5 letras.');
  if(!five && (guess.length<2 || !/^[A-Z]+$/.test(guess))) throw new Error('Digite uma palavra válida.');
  if(s.used.has(guess)) throw new Error('Palavra já usada.');
  s.used.add(guess);
  return guess;
}

export function submitGameGuess(sessionId, rawGuess) {
  const s=getSession(sessionId);
  if(s.finished) throw new Error('A partida já terminou.');
  if(s.mode==='quarteto') return guessQuarteto(s,rawGuess);
  return guessContexto(s,rawGuess);
}

function guessQuarteto(s,raw) {
  const guess=validateGuess(s,raw,{five:true}); s.attempts++;
  const boards=s.secrets.map((secret,i)=>{
    if(s.solved[i]) return {solved:true,tiles:null};
    const tiles=evaluateWordGuess(guess,secret);
    if(guess===secret) s.solved[i]=true;
    return {solved:s.solved[i],tiles};
  });
  const win=s.solved.every(Boolean); s.finished=win||s.attempts>=s.maxAttempts;
  s.score=s.solved.filter(Boolean).length*2500+(s.maxAttempts-s.attempts)*120;
  return {guess,attempts:s.attempts,boards,solved:s.solved,score:s.score,finished:s.finished,win,answers:s.finished?s.secrets:undefined};
}

function guessContexto(s,raw) {
  const guess=validateGuess(s,raw); s.attempts++;
  const c=s.challenge;const rank=semanticProvider.getRank(c.secret,guess,c);
  s.bestRank=Math.min(s.bestRank,rank); const win=rank===1;
  s.finished=win||s.attempts>=s.maxAttempts; s.score=Math.max(0,11000-s.bestRank-s.attempts*45);
  const temperature=rank<=10?'hot':rank<=100?'warm':rank<=1000?'mild':'cold';
  return {guess,rank,bestRank:s.bestRank,temperature,attempts:s.attempts,score:s.score,finished:s.finished,win,answer:s.finished?c.secret:undefined};
}

export function finishGameSession(sessionId) {
  const s=getSession(sessionId);
  s.finished=true;
  return {finished:true,score:s.score};
}

export function clearSessions(){ sessions.clear(); }
export function resetDailyAllocations(){ledger=emptyLedger();persistLedger();}
export function getDailyAllocationStats(){ensureDay();return {dayId:ledger.dayId,words:new Set(ledger.words).size,contexts:new Set(ledger.contexts).size};}
export function getDictionaryCatalog(){
  const describe=language=>{const pools=languagePools(language);return {fiveLetters:pools.words.length,contexts:pools.contexts.length};};
  return {verified:DICTIONARY_META.verified,sources:DICTIONARY_META.sources,semanticProvider:semanticProvider.getMetadata(),languages:{pt:describe('pt'),en:describe('en'),mixed:describe('mixed')}};
}
