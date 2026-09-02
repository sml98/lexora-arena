import { createHash } from 'node:crypto';
import { getRedis, redisConfigured } from './redis.js';

const normalize=value=>String(value||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('Ç','C');
const hashInt=text=>Number.parseInt(createHash('sha256').update(text).digest('hex').slice(0,8),16);
const memoryCache=new Map();

export class SemanticProvider {
  validateWord(){throw new Error('SemanticProvider.validateWord precisa ser implementado.');}
  getSimilarity(){throw new Error('SemanticProvider.getSimilarity precisa ser implementado.');}
  getRank(){throw new Error('SemanticProvider.getRank precisa ser implementado.');}
  getClosestWords(){throw new Error('SemanticProvider.getClosestWords precisa ser implementado.');}
  getWordMetadata(){throw new Error('SemanticProvider.getWordMetadata precisa ser implementado.');}
  getMetadata(){throw new Error('SemanticProvider.getMetadata precisa ser implementado.');}
}

export class LocalSemanticProvider extends SemanticProvider {
  constructor({version='local-groups-v2'}={}){super();this.version=version;}
  validateWord(word){const normalized=normalize(word);return normalized.length>=2&&normalized.length<=40&&/^[A-Z]+$/.test(normalized);}
  getRank(targetWord,guessedWord,context={}){
    const target=normalize(targetWord),guess=normalize(guessedWord),key=`${this.version}:${target}:${guess}`;
    if(memoryCache.has(key))return memoryCache.get(key);
    const near=(context.near||[]).map(normalize),warm=(context.warm||[]).map(normalize);
    let rank;
    if(guess===target)rank=1;
    else if(near.includes(guess))rank=2+near.indexOf(guess)*4;
    else if(warm.includes(guess))rank=50+warm.indexOf(guess)*55;
    else rank=400+hashInt(`${this.version}:${target}:${guess}`)%9_400;
    memoryCache.set(key,rank);void persistRedis(key,rank);return rank;
  }
  getSimilarity(targetWord,guessedWord,context={}){const rank=this.getRank(targetWord,guessedWord,context);return Math.max(0,1-Math.log10(rank)/4);}
  getClosestWords(_targetWord,context={},limit=10){return (context.near||[]).slice(0,Math.max(0,limit));}
  getWordMetadata(word){const normalized=normalize(word);return {normalized,length:normalized.length,valid:this.validateWord(normalized),language:'und'};}
  getMetadata(){return {provider:'local',version:this.version,deterministic:true,cache:redisConfigured()?'redis+memory':'memory'};}
}

async function persistRedis(key,rank){
  if(!redisConfigured())return;
  try{const redis=await getRedis();await redis.set(`semantic:${key}`,String(rank),{EX:86_400});}catch{/* O resultado local continua determinístico em modo degradado. */}
}

export const semanticProvider=new LocalSemanticProvider();
export const normalizeSemanticWord=normalize;
export function clearSemanticCache(){memoryCache.clear();}
