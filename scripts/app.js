const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const state={language:'pt',matchType:'ranked',bestOf:1,rankingMode:'quarteto',player:null,sound:true};
let toastTimer;

function toast(message,type='success'){
  const node=$('#toast');node.textContent=message;node.dataset.type=type;node.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),3_400);
}

function modal(title,text,icon='✦'){$('#modalTitle').textContent=title;$('#modalText').textContent=text;$('#modalIcon').textContent=icon;$('#modal').hidden=false;$('#modalAction').focus();}
function closeModal(){$('#modal').hidden=true;}
function showLobby(){document.querySelectorAll('.screen').forEach(screen=>screen.classList.remove('active'));$('#lobby').classList.add('active');window.scrollTo({top:0,behavior:'smooth'});}

function navigate(view){
  if(view==='home'){showLobby();window.scrollTo({top:0,behavior:'smooth'});}else{
    showLobby();const target=$(`[data-section="${view}"]`)||$(`#${view}Section`);target?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  $$('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
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
  renderHistory(player.history||[]);void loadRankings();
}

function formatTime(ms){if(!Number.isFinite(ms))return '—';const seconds=Math.max(0,Math.round(ms/1000));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function renderHistory(history){
  const root=$('#recentMatches');root.replaceChildren();
  if(!history.length){root.innerHTML='<div class="empty-state"><span>↻</span><b>Nenhuma partida disputada</b><small>Seu primeiro resultado aparecerá aqui.</small></div>';$('#shareLatestBtn').disabled=true;return;}
  history.slice(0,8).forEach(item=>{const row=document.createElement('article');row.className='history-row';const result={win:'VITÓRIA',loss:'DERROTA',draw:'ANULADA'}[item.result];const detail=item.mode==='quarteto'?`${item.summary?.solved??0}/4 • ${formatTime(item.summary?.elapsedMs)}`:`#${item.summary?.bestRank??9999} • ${item.summary?.attempts??0} tentativas`;row.innerHTML=`<div><b>${item.mode.toUpperCase()} • VS ${escapeHtml(item.opponentName)}</b><small>${detail} • ${item.matchType?.toUpperCase()||'RANKED'}</small></div><strong class="${item.result}">${result} ${item.ratingDelta?`${item.ratingDelta>0?'+':''}${item.ratingDelta}`:''}</strong>`;root.append(row);});
  $('#shareLatestBtn').disabled=false;
}

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
    tournaments.slice(0,3).forEach(item=>{const row=document.createElement('article');row.className='challenge-row';row.innerHTML=`<div><b>${escapeHtml(item.name)} • ${item.mode.toUpperCase()}</b><small>${item.players.length}/${item.size} jogadores • ${item.format.toUpperCase()}</small></div><button class="glass-button" data-tournament-id="${item.id}">VER</button>`;root.append(row);});
  }catch(error){toast(error.message,'error');}
}

async function loadChallenges(){
  try{const {challenges}=await getJson('/api/challenges'),root=$('#challengeList');root.replaceChildren();
    if(!challenges.length){root.innerHTML='<div class="empty-state"><span>◇</span><b>Nenhum desafio aberto</b><small>Crie um link e convide um amigo.</small></div>';return;}
    challenges.slice(0,8).forEach(item=>{const row=document.createElement('article');row.className='challenge-row';row.innerHTML=`<div><b>${escapeHtml(item.owner?.name||'Jogador')} • ${item.mode.toUpperCase()}</b><small>${item.matchType.toUpperCase()} • rating ${item.owner?.rating||1000}</small></div><button class="glass-button" data-join-challenge="${item.code}">ACEITAR</button>`;root.append(row);});
  }catch(error){toast(error.message,'error');}
}

$$('[data-view]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.view)));
$$('[data-scroll]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.scroll)));
selectGroup('#matchTypeSelect','data-match-type',value=>state.matchType=value);
selectGroup('#bestOfSelect','data-best-of',value=>state.bestOf=Number(value));
selectGroup('#languageSelect','data-language',value=>state.language=value);
$$('[data-ranking-mode]').forEach(button=>button.addEventListener('click',()=>{$$('[data-ranking-mode]').forEach(item=>item.classList.toggle('active',item===button));state.rankingMode=button.dataset.rankingMode;void loadRankings();}));
$$('.spotlight').forEach(card=>card.addEventListener('pointermove',event=>{const bounds=card.getBoundingClientRect();card.style.setProperty('--mx',`${event.clientX-bounds.left}px`);card.style.setProperty('--my',`${event.clientY-bounds.top}px`);}));
$('#closeModal').addEventListener('click',closeModal);$('#modalAction').addEventListener('click',closeModal);$('#modal').addEventListener('click',event=>{if(event.target.id==='modal')closeModal();});
$('#soundBtn').addEventListener('click',event=>{state.sound=!state.sound;event.currentTarget.textContent=state.sound?'♪':'×';toast(state.sound?'Sons ativados':'Sons desativados');});
$('#shareLatestBtn').addEventListener('click',()=>window.LexoraPvp?.shareLatest());
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});

window.LexoraUI={toast,modal,showLobby,navigate,renderProfile,getLanguage:()=>state.language,getPlayConfig:()=>({language:state.language,matchType:state.matchType,bestOf:state.bestOf}),soundEnabled:()=>state.sound,reloadData:()=>Promise.all([loadRankings(),loadChallenges(),loadTournaments()])};
void Promise.all([loadRankings(),loadChallenges(),loadTournaments()]);
