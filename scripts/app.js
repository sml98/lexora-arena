const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const VIEW_LABELS={home:'Início',play:'Jogar',tournaments:'Torneios',ranking:'Ranking',challenges:'Desafios',history:'Histórico',wallet:'Carteira',profile:'Perfil'};
const state={language:'pt',matchType:'ranked',bestOf:1,entryCents:1000,rankingMode:'quarteto',player:null,sound:localStorage.getItem('lexora_sound')!=='off',currentView:'home'};
let toastTimer,audioContext,lastHoverTarget,lastHoverAt=0;

function playSound(kind='tap',customFrequency){
  if(!state.sound)return;
  try{
    const AudioEngine=window.AudioContext||window.webkitAudioContext;audioContext??=new AudioEngine();if(audioContext.state==='suspended')void audioContext.resume();
    const presets={tap:[360,520,.025,.07,'sine'],nav:[260,620,.032,.11,'triangle'],hover:[190,260,.008,.045,'sine'],success:[520,880,.035,.16,'triangle'],error:[180,105,.03,.14,'sawtooth'],disable:[300,120,.025,.1,'sine'],game:[customFrequency||420,(customFrequency||420)*1.08,.032,.12,'triangle']};
    const [from,to,volume,duration,type]=presets[kind]||presets.tap,now=audioContext.currentTime,oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
    oscillator.type=type;oscillator.frequency.setValueAtTime(from,now);oscillator.frequency.exponentialRampToValueAtTime(Math.max(40,to),now+duration);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(volume,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);oscillator.connect(gain).connect(audioContext.destination);oscillator.start(now);oscillator.stop(now+duration+.02);
  }catch{}
}

function toast(message,type='success'){
  const node=$('#toast');node.textContent=message;node.dataset.type=type;node.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),3_400);
}

function modal(title,text,icon='✦'){$('#modalTitle').textContent=title;$('#modalText').textContent=text;$('#modalIcon').textContent=icon;$('#modal').hidden=false;$('#modalAction').focus();}
function closeModal(){$('#modal').hidden=true;}
function applyView(view){
  const safeView=VIEW_LABELS[view]?view:'home';state.currentView=safeView;$('#lobby').dataset.activeView=safeView;
  $$('[data-view-panel]').forEach(panel=>{panel.hidden=!panel.dataset.viewPanel.split(/\s+/).includes(safeView);});
  $$('[data-view]').forEach(button=>{const active=button.dataset.view===safeView;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  document.title=`${VIEW_LABELS[safeView]} • Léxora Arena`;
}
function showLobby(){document.querySelectorAll('.screen').forEach(screen=>screen.classList.remove('active'));$('#lobby').classList.add('active');applyView(state.currentView);window.scrollTo({top:0,behavior:'auto'});}

function navigate(view,{historyMode='push'}={}){
  const safeView=VIEW_LABELS[view]?view:'home';state.currentView=safeView;showLobby();
  const nextHash=`#${safeView}`;if(historyMode==='push'&&location.hash!==nextHash)history.pushState({view:safeView},'',nextHash);else if(historyMode==='replace')history.replaceState({view:safeView},'',nextHash);
}

function selectGroup(containerSelector,attribute,callback){
  $(containerSelector)?.addEventListener('click',event=>{const button=event.target.closest(`[${attribute}]`);if(!button||button.disabled)return;$$(`[${attribute}]`,$(containerSelector)).forEach(item=>item.classList.toggle('active',item===button));callback(button.dataset[attribute.replace('data-','').replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]);});
}

function renderProfile(player){
  state.player=player;const initial=(player.name||'J').slice(0,1).toUpperCase();
  $('#profileName').textContent=player.name;$('#avatarInitial').textContent=initial;$('#heroInitial').textContent=initial;
  $('#quartetoRating').textContent=player.quartetoRating;$('#contextoRating').textContent=player.contextoRating;
  $('#quartetoDivision').textContent=player.divisions.quarteto;$('#contextoDivision').textContent=player.divisions.contexto;
  $('#profileDivision').textContent=`${player.games} partida${player.games===1?'':'s'} • ${player.wins} vitória${player.wins===1?'':'s'}`;
  $('#profileGames').textContent=player.games;$('#profileWins').textContent=player.wins;$('#profileWinRate').textContent=player.games?`${Math.round(player.wins/player.games*100)}%`:'0%';
  renderHistory(player.history||[]);renderRivalries(player.rivalries||[]);void loadRankings();
}

function formatTime(ms){if(!Number.isFinite(ms))return '—';const seconds=Math.max(0,Math.round(ms/1000));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function renderHistory(history){
  const root=$('#recentMatches');root.replaceChildren();
  if(!history.length){root.innerHTML='<div class="empty-state"><span>↻</span><b>Nenhuma partida disputada</b><small>Seu primeiro resultado aparecerá aqui.</small></div>';$('#shareLatestBtn').disabled=true;return;}
  history.slice(0,8).forEach(item=>{const row=document.createElement('article');row.className='history-row';const result={win:'VITÓRIA',loss:'DERROTA',draw:'ANULADA'}[item.result];const detail=item.mode==='quarteto'?`${item.summary?.solved??0}/4 • ${formatTime(item.summary?.elapsedMs)}`:`#${item.summary?.bestRank??9999} • ${item.summary?.attempts??0} tentativas`,money=item.entryCents?` • entrada ${(item.entryCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} • prêmio ${(item.prizeCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`:'';row.innerHTML=`<div><b>${item.mode.toUpperCase()} • VS ${escapeHtml(item.opponentName)}</b><small>${detail} • ${item.matchType?.toUpperCase()||'RANKED'}${money} • ${new Date(item.endedAt).toLocaleDateString('pt-BR')}</small></div><strong class="${item.result}">${result} ${item.ratingDelta?`${item.ratingDelta>0?'+':''}${item.ratingDelta}`:''}</strong>`;root.append(row);});
  $('#shareLatestBtn').disabled=false;
}

function renderRivalries(rivalries){const root=$('#rivalryList');root.replaceChildren();if(!rivalries.length){root.innerHTML='<div class="empty-state"><small>As rivalidades surgem somente depois de partidas reais.</small></div>';return;}rivalries.slice(0,6).forEach(item=>{const row=document.createElement('article');row.className='rivalry-row';row.innerHTML=`<div><b>${escapeHtml(state.player?.name)} <em>${item.wins}</em> × <em>${item.losses}</em> ${escapeHtml(item.rivalName)}</b><small>Quarteto ${item.byMode.quarteto.wins}–${item.byMode.quarteto.losses} • Contexto ${item.byMode.contexto.wins}–${item.byMode.contexto.losses}</small></div><button class="glass-button" data-rival-id="${item.rivalId}">DESAFIAR</button>`;root.append(row);});}

function escapeHtml(value){return String(value||'').replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));}
async function getJson(path){const response=await fetch(path),payload=await response.json();if(!response.ok)throw new Error(payload.error||'Falha ao carregar dados.');return payload;}

async function loadRankings(){
  try{const {ranking}=await getJson(`/api/rankings?period=all&mode=${state.rankingMode}`),root=$('#rankingList');root.replaceChildren();
    if(!ranking.length){root.innerHTML='<li class="empty-state">Nenhuma partida ranqueada ainda.</li>';return;}
    ranking.slice(0,8).forEach(entry=>{const li=document.createElement('li');li.innerHTML=`<b>#${entry.position}</b><span>${escapeHtml(entry.name)}<small> ${entry.division}</small></span><strong>${entry.rating}</strong>`;root.append(li);});
  }catch(error){toast(error.message,'error');}
}

async function loadTournaments(){
  try{const {tournaments}=await getJson('/api/tournaments'),root=$('#tournamentGrid');root.replaceChildren();
    if(!tournaments.length){root.innerHTML='<div class="empty-state"><span>◇</span><b>Nenhum torneio aberto</b><small>Volte em breve para a próxima competição.</small></div>';return;}
    tournaments.slice(0,3).forEach(item=>{const row=document.createElement('article');row.className='challenge-row tournament-row';const quote=item.financialPreview,entry=item.entryCents?`${(item.entryCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`:'GRÁTIS';row.innerHTML=`<div><b>${escapeHtml(item.name)} • ${item.mode.toUpperCase()}</b><small>${item.players.length}/${item.minPlayers} mínimos • máximo ${item.maxPlayers} • ${entry}<br>Arrecadação ${(quote.grossPotCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} • taxa ${(quote.commissionCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} • premiação ${(quote.prizePoolCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</small></div><button class="glass-button">${item.missingMinimum?`FALTAM ${item.missingMinimum}`:'MÍNIMO ATINGIDO'}</button>`;row.querySelector('button').addEventListener('click',()=>modal(item.name,`${item.players.length} participantes reais. Premiação atual: ${(quote.prizePoolCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}. 1º: ${(quote.prizes.first/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}; 2º: ${(quote.prizes.second/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}; 3º: ${(quote.prizes.third/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}. Inscrições financeiras permanecem bloqueadas até a carteira estar habilitada.`,'♜'));root.append(row);});
  }catch(error){toast(error.message,'error');}
}

async function loadChallenges(){
  try{const {challenges}=await getJson('/api/challenges'),root=$('#challengeList');root.replaceChildren();
    if(!challenges.length){root.innerHTML='<div class="empty-state"><span>◇</span><b>Nenhum desafio aberto</b><small>Crie um link e convide um amigo.</small></div>';return;}
    challenges.slice(0,8).forEach(item=>{const row=document.createElement('article');row.className='challenge-row';row.innerHTML=`<div><b>${escapeHtml(item.owner?.name||'Jogador')} • ${item.mode.toUpperCase()}</b><small>${item.matchType.toUpperCase()} • rating ${item.owner?.rating||1000}</small></div><button class="glass-button" data-join-challenge="${item.code}">ACEITAR</button>`;root.append(row);});
  }catch(error){toast(error.message,'error');}
}

async function loadAsyncChallenges(){
  try{const {challenges}=await getJson(`/api/async-challenges?language=${state.language}`),root=$('#asyncChallengeList');root.replaceChildren();
    if(!challenges.length){root.innerHTML='<div class="empty-state"><span>⌛</span><b>Nenhum resultado humano aguardando</b><small>Crie um desafio e jogue agora; a seed ficará protegida no servidor.</small></div>';return;}
    challenges.slice(0,8).forEach(item=>{const row=document.createElement('article');row.className='challenge-row async';const entry=item.entryCents?` • ${(item.entryCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`:'';row.innerHTML=`<div><b>${escapeHtml(item.owner?.name||'Jogador')} • ${item.mode.toUpperCase()}</b><small>${item.matchType.toUpperCase()}${entry} • resultado oculto • expira em ${Math.max(1,Math.ceil((item.expiresAt-Date.now())/3_600_000))}h</small></div><button class="glass-button" data-accept-async="${item.id}">ACEITAR</button>`;root.append(row);});
  }catch(error){toast(error.message,'error');}
}

$$('[data-view]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.view)));
$$('[data-scroll]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.scroll)));
selectGroup('#matchTypeSelect','data-match-type',value=>state.matchType=value);
selectGroup('#bestOfSelect','data-best-of',value=>state.bestOf=Number(value));
selectGroup('#languageSelect','data-language',value=>state.language=value);
selectGroup('#entryValueSelect','data-entry-cents',value=>state.entryCents=Number(value));
$$('[data-ranking-mode]').forEach(button=>button.addEventListener('click',()=>{$$('[data-ranking-mode]').forEach(item=>item.classList.toggle('active',item===button));state.rankingMode=button.dataset.rankingMode;void loadRankings();}));
$$('.spotlight').forEach(card=>card.addEventListener('pointermove',event=>{const bounds=card.getBoundingClientRect();card.style.setProperty('--mx',`${event.clientX-bounds.left}px`);card.style.setProperty('--my',`${event.clientY-bounds.top}px`);}));
$('#closeModal').addEventListener('click',closeModal);$('#modalAction').addEventListener('click',closeModal);$('#modal').addEventListener('click',event=>{if(event.target.id==='modal')closeModal();});
$('#soundBtn').textContent=state.sound?'♪':'×';$('#soundBtn').setAttribute('aria-pressed',String(state.sound));
$('#soundBtn').addEventListener('click',event=>{if(state.sound)playSound('disable');state.sound=!state.sound;localStorage.setItem('lexora_sound',state.sound?'on':'off');event.currentTarget.textContent=state.sound?'♪':'×';event.currentTarget.setAttribute('aria-pressed',String(state.sound));if(state.sound)playSound('success');toast(state.sound?'Sons ativados':'Sons desativados');});
$('#shareLatestBtn').addEventListener('click',()=>window.LexoraPvp?.shareLatest());
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.id==='soundBtn'||button.disabled)return;playSound(button.matches('[data-view],[data-scroll]')?'nav':'tap');});
document.addEventListener('pointerover',event=>{if(event.pointerType&&event.pointerType!=='mouse')return;const target=event.target.closest('button,.game-card,.explain-grid article');const now=performance.now();if(!target||target===lastHoverTarget||now-lastHoverAt<90)return;lastHoverTarget=target;lastHoverAt=now;playSound('hover');});
document.addEventListener('pointerout',event=>{if(lastHoverTarget&&event.target.closest('button,.game-card,.explain-grid article')===lastHoverTarget)lastHoverTarget=null;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});
window.addEventListener('popstate',()=>navigate(location.hash.slice(1)||'home',{historyMode:'none'}));

window.LexoraUI={toast,modal,showLobby,navigate,renderProfile,playSound,getLanguage:()=>state.language,getPlayConfig:()=>({language:state.language,matchType:state.matchType,bestOf:state.bestOf,entryCents:state.entryCents}),soundEnabled:()=>state.sound,reloadData:()=>Promise.all([loadRankings(),loadChallenges(),loadAsyncChallenges(),loadTournaments()])};
navigate(location.hash.slice(1)||'home',{historyMode:'replace'});
void Promise.all([loadRankings(),loadChallenges(),loadAsyncChallenges(),loadTournaments()]);
