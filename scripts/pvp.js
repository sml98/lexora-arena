const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const create=(tag,className='',text='')=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const ui=()=>window.LexoraUI;
const modeNames={quarteto:'QUARTETO',contexto:'CONTEXTO'};
let session=null,socket=null,reconnectAttempt=0,currentMatch=null,currentOpponent=null,currentResult=null,asyncChallenge=null,asyncPoll=null,clockTimer=null,queueOfferTimer=null,queued=false,latestShare='';
const tabId=crypto.randomUUID(),tabChannel='BroadcastChannel'in window?new BroadcastChannel('lexora-player-tabs'):null;

async function post(path,data){const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}),payload=await response.json();if(!response.ok)throw new Error(payload.error||'Falha de comunicação.');return payload;}

async function resolveStoredSession(){
  const playerId=sessionStorage.getItem('lexora_player_id'),token=sessionStorage.getItem('lexora_player_token');if(!playerId||!token)return null;let collision=false;
  if(tabChannel){const listener=event=>{if(event.data?.type==='collision'&&event.data.target===tabId)collision=true;};tabChannel.addEventListener('message',listener);tabChannel.postMessage({type:'claim',playerId,tabId});await new Promise(resolve=>setTimeout(resolve,90));tabChannel.removeEventListener('message',listener);}
  if(collision)return null;try{return await post('/api/pvp/session',{playerId,token});}catch{return null;}
}
if(tabChannel)tabChannel.addEventListener('message',event=>{if(event.data?.type==='claim'&&session?.player?.id===event.data.playerId&&event.data.tabId!==tabId)tabChannel.postMessage({type:'collision',target:event.data.tabId});});

async function initialize(){
  try{session=await resolveStoredSession()||await post('/api/pvp/session',{});sessionStorage.setItem('lexora_player_id',session.player.id);sessionStorage.setItem('lexora_player_token',session.token);ui()?.renderProfile(session.player);connect();const challenge=new URLSearchParams(location.search).get('challenge');if(challenge)session.pendingChallenge=challenge.toUpperCase();await resumeAsyncChallenge();}
  catch(error){ui()?.modal('Servidor indisponível',error.message,'!');}
}

function connect(){
  setConnection('connecting','Conectando à arena…');const protocol=location.protocol==='https:'?'wss:':'ws:';
  socket=new WebSocket(`${protocol}//${location.host}/ws?playerId=${encodeURIComponent(session.player.id)}&token=${encodeURIComponent(session.token)}`);
  socket.addEventListener('open',()=>{reconnectAttempt=0;setConnection('online','Conectado ao servidor');if(session.pendingChallenge){send('friend:join',{code:session.pendingChallenge});session.pendingChallenge=null;}});
  socket.addEventListener('message',event=>{try{handleMessage(JSON.parse(event.data));}catch(error){console.error('pvp_message_error',error);ui()?.toast('Não foi possível atualizar a arena.','error');}});
  socket.addEventListener('close',()=>{setConnection('offline','Reconectando…');setTimeout(connect,Math.min(8_000,500*2**reconnectAttempt++));});socket.addEventListener('error',()=>{});
}

function send(type,payload={}){if(socket?.readyState!==WebSocket.OPEN){ui()?.toast('A conexão ainda não está pronta.','error');return false;}socket.send(JSON.stringify({type,...payload}));return true;}
function handleMessage(message){
  if(message.type==='session:ready'){session.player=message.player;ui()?.renderProfile(message.player);$('#onlinePlayers').textContent=`${message.online||0} online`;return;}
  if(message.type==='presence'){$('#onlinePlayers').textContent=`${message.online||0} online`;return;}
  if(message.type==='queue:joined'||message.type==='queue:update'){queued=true;renderQueue(message.position||1);return;}
  if(message.type==='queue:left'){queued=false;showLobby();return;}
  if(message.type==='match:found'||message.type==='match:reconnected'){queued=false;beginMatch(message);return;}
  if(message.type==='match:started'){currentMatch=message.match;renderActiveGame();startClock();setConnection('online','Partida em andamento');return;}
  if(message.type==='match:update'){currentMatch=message.match;updateProgress();return;}
  if(message.type==='action:accepted'){currentMatch=message.match;applyActionResult(message.result);updateProgress();return;}
  if(message.type==='match:ended'){showResult(message);return;}
  if(message.type==='rematch:waiting'){setConnection('waiting','Aguardando o rival aceitar a revanche…');return;}
  if(message.type==='opponent:disconnected'){setConnection('waiting',`Rival desconectado — aguardando ${Math.round(message.graceMs/1000)}s`);return;}
  if(message.type==='friend:created'){shareInvite(message.code);return;}
  if(message.type==='player:blocked'){ui()?.toast('Jogador bloqueado.');return;}
  if(message.type==='player:reported'){ui()?.toast('Denúncia registrada para revisão.');return;}
  if(message.type==='session:replaced'){ui()?.toast('Esta sessão foi aberta em outra aba.','error');return;}
  if(message.type==='error'){ui()?.toast(message.message,'error');setConnection('error',message.message);return;}
}

function setConnection(state,text){const node=$('#connectionState');if(!node)return;node.dataset.state=state;$('span',node).textContent=text;}
function showArena(){document.querySelectorAll('.screen').forEach(screen=>screen.classList.remove('active'));$('#pvpArena').classList.add('active');window.scrollTo(0,0);}
function showLobby(){clearInterval(clockTimer);clearTimeout(queueOfferTimer);currentMatch=null;queued=false;ui()?.showLobby();ui()?.reloadData();}

function joinQueue(mode,override={}){
  if(!session||socket?.readyState!==WebSocket.OPEN)return ui()?.toast('Aguarde a conexão com a arena.','error');
  const config={...ui()?.getPlayConfig(),...override};if(config.matchType==='rewarded')return ui()?.toast('Partidas premiadas estão bloqueadas neste ambiente.','error');
  showArena();currentResult=null;$('#pvpResult').hidden=true;$('#pvpSurface').hidden=false;$('#pvpMode').textContent=modeNames[mode];$('#seriesState').textContent=config.bestOf===3?'MELHOR DE 3':config.matchType.toUpperCase();$('#pvpOpponentName').textContent='Procurando…';$('#pvpTimer').textContent='FILA';renderQueue(1);send('queue:join',{mode,...config});
}

async function joinFinancialQueue(mode,entryCents,financialToken){
  const response=await fetch('/api/pvp/link-financial',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${financialToken}`},body:JSON.stringify({playerId:session.player.id,playerToken:session.token})}),payload=await response.json();if(!response.ok)throw new Error(payload.error||'Não foi possível vincular a identidade.');
  session.player=payload.player;showArena();$('#pvpResult').hidden=true;$('#pvpSurface').hidden=false;$('#pvpMode').textContent=modeNames[mode];renderQueue(1);send('queue:join',{mode,language:ui()?.getLanguage()||'pt',matchType:'rewarded',financial:true,entryCents,bestOf:1});
}

function renderQueue(position){
  const root=$('#pvpSurface');root.replaceChildren();const loader=create('div','matchmaking-loader');const radar=create('div','radar');const title=create('h2','',position>1?`Posição ${position} na fila`:'Buscando rival compatível…');const copy=create('p','','A faixa começa em ±100 de rating e se expande com o tempo. Apenas jogadores reais entram nesta fila.');const cancel=create('button','glass-button','CANCELAR BUSCA');cancel.addEventListener('click',()=>send('queue:leave'));loader.append(radar,title,copy,cancel);root.append(loader);setConnection('waiting','Matchmaking em andamento');
  clearTimeout(queueOfferTimer);queueOfferTimer=setTimeout(()=>{if(!queued||!root.isConnected)return;const asyncButton=create('button','neon-button cyan','CRIAR DESAFIO ASSÍNCRONO');const note=create('small','async-offer','Nenhum rival online? Jogue agora e aguarde a resposta de outra pessoa.');asyncButton.addEventListener('click',()=>{send('queue:leave');void createAsyncChallengeFlow($('#pvpMode').textContent.toLowerCase()==='contexto'?'contexto':'quarteto');});loader.append(note,asyncButton);},20_000);
}

const playerAuth=()=>({playerId:session.player.id,token:session.token});
function syntheticAsyncMatch(challenge){const selfResult=challenge.yourResult||{},finished=Boolean(challenge.yourResult),opponentId=challenge.owner?.id===session.player.id?(challenge.opponent?.id||'future-human'):challenge.owner?.id,opponentProgress=challenge.opponentFinished?(challenge.mode==='quarteto'?{solved:0,total:4,status:'finished'}:{bestRank:9999,found:false,status:'finished'}):{};return {id:challenge.id,mode:challenge.mode,language:challenge.language,matchType:challenge.matchType,status:'active',startAt:(challenge.playDeadlineAt||Date.now()+challenge.durationMs)-challenge.durationMs,endAt:challenge.playDeadlineAt||Date.now()+challenge.durationMs,durationMs:challenge.durationMs,challenge:{...(challenge.session||{}),commitHash:challenge.commitHash},series:null,progress:{[session.player.id]:challenge.mode==='quarteto'?{solved:selfResult.solved||0,total:4,status:finished?'finished':'playing'}:{bestRank:selfResult.bestRank||9999,found:Boolean(selfResult.discovered),status:finished?'finished':'playing'},[opponentId]:opponentProgress}};}

async function createAsyncChallengeFlow(mode){try{const config=ui()?.getPlayConfig()||{};if(config.matchType==='rewarded')throw new Error('Ative e valide a carteira antes de criar um desafio premiado.');if(config.bestOf===3)ui()?.toast('No assíncrono, cada desafio é uma partida única; BO3 continua disponível ao vivo.');const {challenge}=await post('/api/async-challenges',{...playerAuth(),mode,language:config.language,matchType:config.matchType,entryCents:config.entryCents});sessionStorage.setItem('lexora_async_challenge',challenge.id);beginAsyncChallenge(challenge);}catch(error){ui()?.toast(error.message,'error');}}
async function acceptAsyncChallengeFlow(id){try{const {challenge}=await post(`/api/async-challenges/${id}/accept`,playerAuth());sessionStorage.setItem('lexora_async_challenge',challenge.id);beginAsyncChallenge(challenge);}catch(error){ui()?.toast(error.message,'error');ui()?.reloadData();}}
async function resumeAsyncChallenge(){const id=sessionStorage.getItem('lexora_async_challenge');if(!id)return;try{const {challenge}=await post(`/api/async-challenges/${id}/view`,playerAuth());if(challenge.status==='completed')showAsyncResult(challenge);else if(challenge.status==='awaiting_opponent')showAsyncWaiting(challenge);else if(['owner_playing','opponent_playing'].includes(challenge.status))beginAsyncChallenge(challenge);else sessionStorage.removeItem('lexora_async_challenge');}catch{sessionStorage.removeItem('lexora_async_challenge');}}

function beginAsyncChallenge(challenge){clearInterval(asyncPoll);asyncChallenge=challenge;currentResult=null;currentOpponent=challenge.owner?.id===session.player.id?(challenge.opponent||{id:'future-human',name:'Rival humano'}):challenge.owner;currentMatch=syntheticAsyncMatch(challenge);showArena();$('#pvpResult').hidden=true;$('#pvpSurface').hidden=false;$('#pvpMode').textContent=modeNames[challenge.mode];$('#seriesState').textContent='PVP ASSÍNCRONO';$('#pvpYouName').textContent=session.player.name;$('#pvpYouAvatar').textContent=session.player.name.slice(0,1).toUpperCase();$('#pvpOpponentName').textContent=currentOpponent?.name||'Resultado oculto';$('#pvpRivalAvatar').textContent=(currentOpponent?.name||'?').slice(0,1).toUpperCase();setConnection('online','Desafio assíncrono • mesma seed protegida');renderActiveGame();for(const action of challenge.yourActions||[])applyActionResult(action);updateProgress();startClock();}

async function submitGuess(guess){if(!asyncChallenge)return send('match:action',{matchId:currentMatch.id,action:{guess}});try{const response=await post(`/api/async-challenges/${asyncChallenge.id}/guess`,{...playerAuth(),guess});asyncChallenge=response.challenge;currentMatch=syntheticAsyncMatch(asyncChallenge);if(response.actionResult)applyActionResult(response.actionResult);updateProgress();if(asyncChallenge.status==='awaiting_opponent')showAsyncWaiting(asyncChallenge);else if(asyncChallenge.status==='completed')showAsyncResult(asyncChallenge);return true;}catch(error){ui()?.toast(error.message,'error');return false;}}

function showAsyncWaiting(challenge){clearInterval(clockTimer);asyncChallenge=challenge;showArena();$('#pvpTimer').textContent='AGUARDA';$('#pvpOpponentName').textContent='Próximo humano';const root=$('#pvpSurface');root.hidden=false;root.innerHTML='<div class="matchmaking-loader async-wait"><div class="radar"></div><h2>RESULTADO SELADO NO SERVIDOR</h2><p>Seu placar está oculto. Outro jogador receberá exatamente a mesma seed, tempo, regras e versão do engine.</p><button class="glass-button" data-async-lobby>VOLTAR AO LOBBY</button></div>';root.querySelector('[data-async-lobby]').addEventListener('click',showLobby);setConnection('waiting','Aguardando outro jogador real');clearInterval(asyncPoll);asyncPoll=setInterval(async()=>{try{const {challenge:latest}=await post(`/api/async-challenges/${challenge.id}/view`,playerAuth());if(latest.status==='completed'){clearInterval(asyncPoll);showAsyncResult(latest);}else if(['expired','cancelled'].includes(latest.status)){clearInterval(asyncPoll);sessionStorage.removeItem('lexora_async_challenge');ui()?.toast('Desafio expirado; nenhuma comissão foi cobrada.','error');showLobby();}}catch{}},5_000);}

function showAsyncResult(challenge){clearInterval(asyncPoll);asyncChallenge=challenge;sessionStorage.removeItem('lexora_async_challenge');const opponent=challenge.owner?.id===session.player.id?challenge.opponent:challenge.owner,result=challenge.result,won=result.winnerId===session.player.id;currentOpponent=opponent;currentMatch=syntheticAsyncMatch(challenge);const phrase=won?'Você venceu o desafio assíncrono pelos critérios oficiais.':'O rival venceu o desafio assíncrono pelos critérios oficiais.';showResult({profile:challenge.profile||session.player,opponent,result:{matchId:challenge.id,mode:challenge.mode,matchType:challenge.matchType,language:challenge.language,winnerId:result.winnerId,tie:false,outcome:won?'win':'loss',phrase,finishReason:'async_completed',answers:result.answers,series:null,integrityProof:{challengeId:challenge.id,commitHash:result.integrityProof.commitHash,nonce:result.integrityProof.nonce,finalEventHash:null},players:result.results}});}

function beginMatch(payload){
  asyncChallenge=null;clearInterval(asyncPoll);
  showArena();currentMatch=payload.match;currentOpponent=payload.opponent;session.player=payload.you;ui()?.renderProfile(payload.you);
  $('#pvpYouName').textContent=payload.you.name;$('#pvpYouAvatar').textContent=payload.you.name.slice(0,1).toUpperCase();$('#pvpOpponentName').textContent=payload.opponent.name;$('#pvpRivalAvatar').textContent=payload.opponent.name.slice(0,1).toUpperCase();$('#pvpMode').textContent=modeNames[currentMatch.mode];
  $('#seriesState').textContent=currentMatch.series?`JOGO ${currentMatch.series.gameNumber} • MELHOR DE ${currentMatch.series.bestOf}`:currentMatch.matchType.toUpperCase();
  if(currentMatch.status==='active')renderActiveGame();else renderFound();startClock();
}

function renderFound(){const root=$('#pvpSurface');root.replaceChildren();const overlay=create('div','found-overlay');overlay.innerHTML='<small>ADVERSÁRIO ENCONTRADO</small><h2>MESMAS CONDIÇÕES. UM VENCEDOR.</h2><strong>3</strong>';root.append(overlay);let value=3;const timer=setInterval(()=>{value--;const node=$('strong',overlay);if(value>0){node.textContent=value;tone(330+value*120);}else{clearInterval(timer);node.textContent='JOGAR';}},900);}

function renderActiveGame(){if(!currentMatch)return;arenaAbort.abort();arenaAbort=new AbortController();if(currentMatch.mode==='quarteto')renderQuarteto();else renderContexto();updateProgress();}
function updateProgress(){
  if(!currentMatch)return;const you=currentMatch.progress?.[session.player.id]||{},rival=currentMatch.progress?.[currentOpponent?.id]||{};
  if(currentMatch.mode==='quarteto'){$('#pvpYouScore').textContent=`${you.solved||0}/4`;$('#pvpOpponentScore').textContent=`${rival.solved||0}/4`;$$('.progress-card.you i').forEach((node,index)=>node.classList.toggle('on',index<(you.solved||0)));$$('.progress-card.rival i').forEach((node,index)=>node.classList.toggle('on',index<(rival.solved||0)));}
  else{$('#pvpYouScore').textContent=you.bestRank>=9999?'—':`#${you.bestRank}`;$('#pvpOpponentScore').textContent=rival.bestRank>=9999?'—':`#${rival.bestRank}`;const toProgress=rank=>rank>=9999?2:Math.max(3,100-Math.log10(Math.max(1,rank))*25),race=$('.race-track');race?.style.setProperty('--you',`${toProgress(you.bestRank)}%`);race?.style.setProperty('--rival',`${toProgress(rival.bestRank)}%`);}
}

function progressHeader(){return `<div class="duel-progress"><article class="progress-card you"><header><span>VOCÊ</span><b>PROGRESSO</b></header><div class="progress-track">${'<i></i>'.repeat(4)}</div></article><article class="progress-card rival"><header><span>RIVAL</span><b>PROGRESSO</b></header><div class="progress-track">${'<i></i>'.repeat(4)}</div></article></div>`;}

function renderQuarteto(){
  const root=$('#pvpSurface'),max=currentMatch.challenge.maxAttempts||9;let typing='',attempt=0,solved=[false,false,false,false],busy=false;
  root.innerHTML=`${progressHeader()}<div class="quarteto-stage">${[0,1,2,3].map(board=>`<section class="quarteto-board" data-board="${board}"><header><span>PALAVRA ${board+1}</span><b>EM JOGO</b></header>${Array.from({length:max},(_,row)=>`<div class="quarteto-row" data-row="${row}">${'<span class="quarteto-tile"></span>'.repeat(5)}</div>`).join('')}</section>`).join('')}</div><p class="quarteto-message">Uma tentativa alimenta os quatro painéis. As letras do rival nunca são exibidas.</p><div class="quarteto-keyboard">${['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'].map(row=>`<div>${[...row].map(key=>`<button data-key="${key}">${key}</button>`).join('')}</div>`).join('')}<div><button class="wide" data-key="ENTER">ENTER</button><button class="wide" data-key="BACKSPACE">⌫ APAGAR</button></div></div>`;
  const refresh=()=>{for(let board=0;board<4;board++){if(solved[board])continue;root.querySelectorAll(`[data-board="${board}"] [data-row="${attempt}"] .quarteto-tile`).forEach((tile,index)=>{tile.textContent=typing[index]||'';tile.classList.toggle('typing',Boolean(typing[index]));});}};
  const submit=()=>{if(busy)return;busy=true;Promise.resolve(submitGuess(typing)).finally(()=>setTimeout(()=>busy=false,350));};
  const keyInput=raw=>{const key=String(raw).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace('Ç','C');if(key==='ENTER')submit();else if(key==='BACKSPACE'){typing=typing.slice(0,-1);refresh();}else if(/^[A-Z]$/.test(key)&&typing.length<5){typing+=key;refresh();tone(180);}};
  root.querySelector('.quarteto-keyboard').addEventListener('click',event=>{const key=event.target.closest('[data-key]')?.dataset.key;if(key)keyInput(key);});
  const keydown=event=>{if($('#pvpArena').classList.contains('active'))keyInput(event.key);};document.addEventListener('keydown',keydown,{signal:arenaAbort.signal});
  root._apply=result=>{result.boards.forEach((board,index)=>{if(!board.tiles)return;root.querySelectorAll(`[data-board="${index}"] [data-row="${attempt}"] .quarteto-tile`).forEach((tile,tileIndex)=>{tile.textContent=board.tiles[tileIndex].letter;tile.className=`quarteto-tile ${board.tiles[tileIndex].status}`;});if(board.solved){const section=root.querySelector(`[data-board="${index}"]`);section.classList.add('solved');$('header b',section).textContent='RESOLVIDA';}});solved=result.solved;attempt=result.attempts;typing='';$('.quarteto-message',root).textContent=`${solved.filter(Boolean).length}/4 resolvidas • ${attempt}/${max} tentativas`;tone(solved.some(Boolean)?520:240);refresh();};
  refresh();
}

let arenaAbort=new AbortController();
function renderContexto(){
  const root=$('#pvpSurface');
  root.innerHTML=`<div class="semantic-race"><div class="runner you">VOCÊ <b>—</b></div><div class="race-track"><i class="race-marker you"></i><i class="race-marker rival"></i></div><div class="runner rival">RIVAL <b>—</b></div></div><section class="contexto-core"><span class="eyebrow">CORRIDA SEMÂNTICA</span><h2>Encontre o conceito secreto</h2><p>Quanto menor a posição, mais próximo. A palavra do rival permanece privada.</p><form class="word-form"><input autocomplete="off" maxlength="40" placeholder="DIGITE SUA TENTATIVA…" aria-label="Tentativa do Contexto"><button class="neon-button magenta">ENVIAR</button></form><div class="guess-list"></div></section>`;
  const form=$('.word-form',root),input=$('input',form);form.addEventListener('submit',event=>{event.preventDefault();const guess=input.value.trim();if(guess)Promise.resolve(submitGuess(guess)).then(accepted=>{if(accepted)input.value='';});});input.focus();
  root._apply=result=>{const row=create('article',`guess-row ${result.temperature}`);row.innerHTML=`<b>${result.guess}</b><strong>#${result.rank}</strong>`;$('.guess-list',root).prepend(row);$('.runner.you b',root).textContent=`#${result.bestRank}`;tone(result.rank===1?720:Math.max(180,520-result.rank/30));};
}

function applyActionResult(result){const root=$('#pvpSurface');root?._apply?.(result);}
function startClock(){clearInterval(clockTimer);const update=()=>{if(!currentMatch?.endAt)return;const remaining=Math.max(0,currentMatch.endAt-Date.now()),total=currentMatch.durationMs||120_000,seconds=Math.ceil(remaining/1000);$('#pvpTimer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;const ring=$('#countdownRing');ring.style.setProperty('--progress',`${remaining/total*100}%`);ring.classList.toggle('danger',remaining<=10_000);};update();clockTimer=setInterval(update,250);}

function showResult(message){
  clearInterval(clockTimer);arenaAbort.abort();arenaAbort=new AbortController();currentResult=message.result;session.player=message.profile;currentOpponent=message.opponent;ui()?.renderProfile(message.profile);$('#pvpSurface').hidden=true;$('#pvpResult').hidden=false;
  const won=currentResult.outcome==='win';$('#pvpResultIcon').textContent=won?'✦':currentResult.outcome==='draw'?'◇':'×';$('#pvpResultTitle').textContent=won?'VITÓRIA':currentResult.outcome==='draw'?'PARTIDA ANULADA':'DERROTA';$('#pvpResultPhrase').textContent=currentResult.phrase;
  const own=currentResult.players[session.player.id],opponent=currentResult.players[currentOpponent.id],metric=currentResult.mode==='quarteto'?['PALAVRAS',`${own.solved}/4`,`${opponent.solved}/4`]:['MELHOR POSIÇÃO',`#${own.bestRank}`,`#${opponent.bestRank}`];
  $('#pvpComparison').innerHTML=`<div><strong>VOCÊ</strong><span>${metric[1]}</span><small>${metric[0]} • ${own.attempts} tentativas</small></div><div><strong>${escapeHtml(currentOpponent.name)}</strong><span>${metric[2]}</span><small>${metric[0]} • ${opponent.attempts} tentativas</small></div>`;
  $('#pvpAnswers').textContent=`Resposta${currentResult.answers.length>1?'s':''}: ${currentResult.answers.join(' • ')}`;$('#pvpIntegrity').textContent=`Prova ${currentResult.integrityProof.commitHash.slice(0,18)}… • cadeia ${currentResult.integrityProof.finalEventHash?.slice(0,18)||'—'}…`;
  $('#seriesState').textContent=currentResult.series?`SÉRIE ${Object.values(currentResult.series.wins).join(' × ')}`:currentResult.matchType.toUpperCase();
  latestShare=`${modeNames[currentResult.mode]} • ${won?'VITÓRIA':'RESULTADO'}\n${metric[1]} vs ${metric[2]}\n${currentResult.phrase}\nProve que você é melhor na Léxora Arena.`;tone(won?840:180);ui()?.reloadData();
}

function escapeHtml(value){return String(value||'').replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));}
async function shareLatest(){if(!latestShare)return ui()?.toast('Conclua uma partida primeiro.','error');try{await navigator.clipboard.writeText(latestShare);ui()?.toast('Resultado copiado.');}catch{ui()?.modal('Compartilhe seu resultado',latestShare,'◇');}}
function shareInvite(code){const url=`${location.origin}${location.pathname}?challenge=${code}`;navigator.clipboard?.writeText(url).then(()=>ui()?.modal('Desafio criado','Link copiado. Envie para seu rival; ele terá 10 minutos para aceitar.','◇')).catch(()=>ui()?.modal('Desafio criado',url,'◇'));ui()?.reloadData();}
function tone(frequency=240){ui()?.playSound?.('game',frequency);}

document.addEventListener('visibilitychange',()=>{if(currentMatch?.status==='active')send('telemetry:focus',{matchId:currentMatch.id,focused:!document.hidden});});
document.addEventListener('click',event=>{const mode=event.target.closest('[data-play]')?.dataset.play;if(mode)joinQueue(mode);const code=event.target.closest('[data-join-challenge]')?.dataset.joinChallenge;if(code)send('friend:join',{code});const asyncId=event.target.closest('[data-accept-async]')?.dataset.acceptAsync;if(asyncId)void acceptAsyncChallengeFlow(asyncId);const rivalId=event.target.closest('[data-rival-id]')?.dataset.rivalId;if(rivalId){const config=ui()?.getPlayConfig();send('friend:create',{mode:'quarteto',...config,targetId:rivalId});}});
$('#friendBtn').addEventListener('click',()=>{const config=ui()?.getPlayConfig();send('friend:create',{mode:'quarteto',...config});});
$('#asyncCreateBtn').addEventListener('click',()=>void createAsyncChallengeFlow('quarteto'));
$('#pvpBackBtn').addEventListener('click',()=>{if(queued)send('queue:leave');else if(asyncChallenge){ui()?.toast('Sua rodada assíncrona permanece protegida no servidor.');showLobby();}else if(currentMatch&&currentMatch.status!=='ended'){if(confirm('Sair agora causará derrota por abandono. Continuar?'))send('match:abandon',{matchId:currentMatch.id});}else showLobby();});
$('#resultLobbyBtn').addEventListener('click',showLobby);$('#rematchBtn').addEventListener('click',()=>{if(currentResult?.finishReason==='async_completed')void createAsyncChallengeFlow(currentResult.mode);else send('match:rematch',{matchId:currentResult.matchId,acceptedEntryCents:currentMatch?.financial?.entryCents});});$('#copyResultBtn').addEventListener('click',shareLatest);
$('#reportRivalBtn').addEventListener('click',()=>{if(!currentOpponent)return;if(currentResult?.finishReason==='async_completed')void post('/api/pvp/report',{...playerAuth(),targetId:currentOpponent.id,reason:'conduta_suspeita'}).then(()=>ui()?.toast('Denúncia registrada para revisão.')).catch(error=>ui()?.toast(error.message,'error'));else send('player:report',{targetId:currentOpponent.id,reason:'conduta_suspeita'});});$('#blockRivalBtn').addEventListener('click',()=>currentOpponent&&send('player:block',{targetId:currentOpponent.id}));

window.LexoraPvp={joinQueue,joinFinancialQueue,createAsyncChallenge:createAsyncChallengeFlow,acceptAsyncChallenge:acceptAsyncChallengeFlow,shareLatest};void initialize();
