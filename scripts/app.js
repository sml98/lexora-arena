const $ = (q, root = document) => root.querySelector(q);
const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const prices = { quarteto: 5, contexto: 3, termo: 4, anagrama: 2, grand: 20 };
const titles = { quarteto: 'Quarteto Masters', contexto: 'Contexto', termo: 'Termo Blitz', anagrama: 'Anagrama Rush' };
let balance = Number(localStorage.getItem('lexora_balance') || 100);
let sound = true;

function save() { localStorage.setItem('lexora_balance', String(balance)); $('#balanceText').textContent = money(balance); }
function toast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); }
function modal(title, text, icon = '✦') { $('#modalTitle').textContent = title; $('#modalText').textContent = text; $('#modalIcon').textContent = icon; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
function countdown() { const now = new Date(); const target = new Date(); target.setHours(21, 0, 0, 0); if (now >= target) target.setDate(target.getDate() + 1); const s = Math.floor((target - now) / 1000); $('#countdown').textContent = [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':'); }
function showLobby() { $('#arena').classList.remove('active'); $('#lobby').classList.add('active'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function join(game) { const price = prices[game]; if (balance < price) return modal('Saldo insuficiente', `Você precisa de ${money(price)} para entrar nesta arena.`, '◒'); balance -= price; save(); if (game === 'grand') return modal('Inscrição confirmada!', 'Sua vaga no Grand Major das 21:00 está garantida. Boa sorte!', '♛'); openGame(game); }
function openGame(game) { $('#lobby').classList.remove('active'); $('#arena').classList.add('active'); $('#arenaTitle').textContent = titles[game]; $('#arenaTag').textContent = 'PARTIDA EM ANDAMENTO'; renderGame(game); window.scrollTo(0, 0); }
function inputTemplate(text, placeholder = 'Digite uma palavra') { return `<div class="game-intro"><p>${text}</p></div><form class="word-input"><input minlength="3" autocomplete="off" placeholder="${placeholder}" aria-label="Palavra"><button class="primary">Enviar</button></form><div class="guess-list"></div>`; }
function renderGame(game) {
  const surface = $('#gameSurface'); let tries = 0;
  if (game === 'quarteto') { surface.innerHTML = `<div class="letters">${['P','O','N','T','E','S'].map(l=>`<span class="letter">${l}</span>`).join('')}</div>${inputTemplate('Encontre palavras relacionadas à pista: <b>CONEXÕES</b>. Você tem seis tentativas.')}`; $('#scoreLabel').textContent='TENTATIVAS'; $('#scoreValue').textContent='0 / 6'; }
  if (game === 'contexto') { surface.innerHTML = `<div class="game-intro"><span class="big-icon">◎</span><h3>Qual é a palavra secreta?</h3></div>${inputTemplate('Cada tentativa revela o quanto sua palavra está semanticamente próxima do segredo.')}`; $('#scoreLabel').textContent='MELHOR POSIÇÃO'; $('#scoreValue').textContent='—'; }
  if (game === 'termo') { surface.innerHTML = `<div class="letters">${['?','?','?','?','?'].map(l=>`<span class="letter">${l}</span>`).join('')}</div>${inputTemplate('Acerte a palavra de cinco letras. As cores indicam letras certas e presentes.')}`; $('#scoreLabel').textContent='TENTATIVAS'; $('#scoreValue').textContent='0 / 6'; }
  if (game === 'anagrama') { surface.innerHTML = `<div class="game-intro"><p>Use as letras abaixo para criar palavras.</p></div><div class="letters">${['A','R','E','N','A','S'].map(l=>`<button class="letter" type="button">${l}</button>`).join('')}</div>${inputTemplate('Forme o maior número possível de palavras em 90 segundos.')}`; $('#scoreLabel').textContent='PONTOS'; $('#scoreValue').textContent='0'; }
  const form = $('form', surface); const list = $('.guess-list', surface); form.addEventListener('submit', e => { e.preventDefault(); const input = $('input', form); const word = input.value.trim().toUpperCase(); if (!word) return; tries++; const rank = Math.max(1, 850 - tries * 117 - word.length * 31); list.insertAdjacentHTML('afterbegin', `<div class="guess-row"><b>${word}</b><span>${game==='contexto' ? '#'+rank : '+'+word.length*10+' pts'}</span></div>`); $('#scoreValue').textContent = game==='contexto' ? '#'+rank : game==='anagrama' ? String(tries*word.length*10) : `${tries} / 6`; input.value=''; if (tries===6 && game!=='contexto' && game!=='anagrama') modal('Rodada concluída', 'Boa partida! Volte ao lobby para escolher um novo desafio.', '🏆'); });
}

document.addEventListener('click', e => { const game = e.target.closest('[data-game]')?.dataset.game; const grand = e.target.closest('[data-join]')?.dataset.join; if (game) join(game); if (grand) join(grand); });
$('#homeBtn').addEventListener('click', showLobby); $('#backBtn').addEventListener('click', showLobby); $('#depositBtn').addEventListener('click', () => { balance += 50; save(); modal('Depósito simulado', 'R$ 50,00 foram adicionados ao seu saldo de demonstração.', '✓'); });
$('#soundBtn').addEventListener('click', e => { sound=!sound; e.currentTarget.textContent=sound?'♪':'×'; toast(sound?'Sons ativados':'Sons desativados'); });
$('#closeModal').addEventListener('click', closeModal); $('#modalAction').addEventListener('click', closeModal); $('#modal').addEventListener('click', e => { if(e.target.id==='modal') closeModal(); });
document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });
save(); countdown(); setInterval(countdown, 1000);
