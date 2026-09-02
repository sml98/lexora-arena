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

test('menu principal abre oito telas independentes e mantém histórico navegável', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const app = await readFile(new URL('scripts/app.js', root), 'utf8');
  const panelViews = [...html.matchAll(/data-view-panel="([^"]+)"/g)]
    .flatMap(match => match[1].split(/\s+/));

  for (const view of ['home', 'play', 'tournaments', 'ranking', 'challenges', 'history', 'wallet', 'profile']) {
    assert.match(html, new RegExp(`data-view="${view}"`));
    assert.ok(panelViews.includes(view), `painel ausente para ${view}`);
  }

  assert.match(app, /history\.pushState/);
  assert.match(app, /addEventListener\('popstate'/);
  assert.match(app, /aria-current/);
});

test('interface explica regras, taxas e mantém sons opcionais', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const app = await readFile(new URL('scripts/app.js', root), 'utf8');

  for (const content of ['Como jogar Quarteto', 'Como jogar Contexto', '85% PRÊMIO', 'taxa fixa de 15%', 'COMO O RATING FUNCIONA', 'TRANSPARÊNCIA FINANCEIRA']) {
    assert.match(html, new RegExp(content));
  }

  assert.match(html, /class="lexora-mark"/);
  assert.match(html, /aria-label="85% para premiação e 15% para a plataforma"/);
  assert.match(app, /AudioContext/);
  assert.match(app, /aria-pressed/);
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
