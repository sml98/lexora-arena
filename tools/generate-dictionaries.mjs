import { readFileSync, writeFileSync } from 'node:fs';

const SOURCES={
  ptBR:'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/pt_BR/pt_BR.dic',
  enUS:'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/en/en_US.dic'
};

const normalize=word=>word.split('/')[0].trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const extract=(path,min,max)=>[...new Set(readFileSync(path,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).slice(1).map(normalize).filter(word=>new RegExp(`^[A-Z]{${min},${max}}$`).test(word)))].sort();
const [ptPath,enPath]=process.argv.slice(2);
if(!ptPath||!enPath)throw new Error('Uso: node tools/generate-dictionaries.mjs /caminho/pt_BR.dic /caminho/en_US.dic');
const pt=extract(ptPath,5,5);
const en=extract(enPath,5,5);
const ptAnagram=extract(ptPath,3,6);
const enAnagram=extract(enPath,3,6);
const counts={ptBR:pt.length,enUS:en.length,ptBRAnagram:ptAnagram.length,enUSAnagram:enAnagram.length};
const output=`/** Generated from LibreOffice Hunspell dictionaries. Do not edit manually.\n * Verified: 2026-08-29\n * pt-BR: ${SOURCES.ptBR}\n * en-US: ${SOURCES.enUS}\n */\nexport const PT_BR_WORDS=${JSON.stringify(pt)};\nexport const EN_US_WORDS=${JSON.stringify(en)};\nexport const PT_BR_ANAGRAM_WORDS=${JSON.stringify(ptAnagram)};\nexport const EN_US_ANAGRAM_WORDS=${JSON.stringify(enAnagram)};\nexport const DICTIONARY_META=${JSON.stringify({verified:'2026-08-29',sources:SOURCES,counts})};\n`;
writeFileSync(new URL('../server/dictionaries.generated.js',import.meta.url),output);
console.log({...counts,totalFiveLetters:pt.length+en.length,totalAnagram:ptAnagram.length+enAnagram.length});
