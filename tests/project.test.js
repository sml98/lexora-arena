import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('a página principal é focada apenas em Quarteto e Contexto', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  for (const game of ['quarteto','contexto']) assert.match(html,new RegExp(`data-play="${game}"`));
  assert.doesNotMatch(html,/Termo Blitz|Anagrama Rush|Palavra Relâmpago/i);
  assert.match(html, /scripts\/app\.js/);
  assert.match(html, /scripts\/pvp\.js/);
  assert.match(html, /styles\/main\.css/);
});

test('IDs HTML não estão duplicados', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('arquivos principais não contêm escapes da cópia anterior', async () => {
  for (const file of ['index.html', 'styles/main.css', 'scripts/app.js', 'scripts/pvp.js', 'server/server.js']) {
    const content = await readFile(new URL(file, root), 'utf8');
    assert.doesNotMatch(content, /&#x20;|\\_URL|\\--/);
  }
});

test('cliente não contém saldo confiável nem injeta tentativas digitadas com HTML',async()=>{
  const app=await readFile(new URL('scripts/app.js',root),'utf8');
  const pvp=await readFile(new URL('scripts/pvp.js',root),'utf8');
  assert.doesNotMatch(app,/lexora_balance|insertAdjacentHTML/);
  assert.doesNotMatch(pvp,/insertAdjacentHTML/);
});
