const $=(selector,root=document)=>root.querySelector(selector);
const create=(tag,className='',text='')=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const formatNumber=value=>new Intl.NumberFormat('pt-BR').format(value||0);
const modeNames={termo:'Termo Blitz',anagrama:'Anagrama Rush',quarteto:'Quarteto Masters'};
const ui=()=>window.LexoraUI;

let session=null,socket=null,reconnectAttempt=0,currentMatch=null,currentOpponent=null,currentResult=null,countdownTimer=null,pendingInvite=null,queued=false;
const tabId=crypto.randomUUID();
const tabChannel='BroadcastChannel' in window?new BroadcastChannel('lexora-player-tabs'):null;

async function post(path,data){const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Falha de comunicação.');return payload;}

async function resolveStoredSession(){
  const playerId=sessionStorage.getItem('lexora_player_id'),token=sessionStorage.getItem('lexora_player_token');
  if(!playerId||!token)return null;
  let collision=false;
  if(tabChannel){
    const listener=event=>{if(event.data?.type==='collision'&&event.data.target===tabId)collision=true;};tabChannel.addEventListener('message',listener);tabChannel.postMessage({type:'claim',playerId,tabId});await new Promise(resolve=>setTimeout(resolve,100));tabChannel.removeEventListener('message',listener);
  }
  if(collision)return null;
  try{return await post('/api/pvp/session',{playerId,token});}catch{return null;}
}

if(tabChannel)tabChannel.addEventListener('message',event=>{if(event.data?.type==='claim'&&session?.player?.id===event.data.playerId&&event.data.tabId!==tabId)tabChannel.postMessage({type:'collision',target:event.data.tabId});});

async function initialize(){
  session=await resolveStoredSession()||await post('/api/pvp/session',{});
  sessionStorage.setItem('lexora_player_id',session.player.id);sessionStorage.setItem('lexora_player_token',session.token);
  renderProfile(session.player);connect();loadLobbyData();
  const invite=new URLSearchParams(location.search).get('challenge');if(invite)pendingInvite=invite.toUpperCase();
}

function connect(){
  setConnection('connecting','Conectando à arena…');
  const protocol=location.protocol==='https:'?'wss:':'ws:';
  socket=new WebSocket(`${protocol}//${location.host}/ws?playerId=${encodeURIComponent(session.player.id)}&token=${encodeURIComponent(session.token)}`);
  socket.addEventListener('open',()=>{reconnectAttempt=0;setConnection('online','Conectado ao servidor');if(pendingInvite){send('friend:join',{code:pendingInvite});pendingInvite=null;}});
  socket.addEventListener('message',event=>{try{handleMessage(JSON.parse(event.data));}catch{ui()?.toast('Mensagem inválida recebida do servidor.','error');}});
  socket.addEventListener('close',()=>{setConnection('offline','Reconectando…');const delay=Math.min(8000,500*2**reconnectAttempt++);setTimeout(connect,delay);});
  socket.addEventListener('error',()=>{});
}

function send(type,payload={}){if(socket?.readyState!==WebSocket.OPEN){ui()?.toast('A conexão ainda não está pronta.','error');return false;}socket.send(JSON.stringify({type,...payload}));return true;}

function handleMessage(message){
  if(message.type==='session:ready'){session.player=message.player;renderProfile(message.player);$('#onlinePlayers').textContent=`${message.online} online`;return;}
  if(message.type==='presence'){const count=message.online||0;$('#onlinePlayers').textContent=`${count} ${count===1?'online':'online'}`;return;}
  if(message.type==='queue:joined'||message.type==='queue:update'){queued=true;renderQueue(message.position||1);return;}
  if(message.type==='queue:left'){queued=false;showLobby();return;}
  if(message.type==='match:found'||message.type==='match:reconnected'){queued=false;beginMatch(message);return;}
  if(message.type==='match:started'){currentMatch=message.match;setInputsEnabled(true);startClock();setConnection('online','Partida em andamento');return;}
  if(message.type==='match:update'){currentMatch=message.match;updateScores();return;}
  if(message.type==='action:accepted'){currentMatch=message.match;applyActionResult(message.result);updateScores();return;}
  if(message.type==='match:ended'){showResult(message);return;}
  if(message.type==='rematch:waiting'){setConnection('waiting','Aguardando o rival aceitar a revanche…');return;}
  if(message.type==='opponent:disconnected'){setConnection('waiting',`Rival desconectado — aguardando ${Math.round(message.graceMs/1000)}s`);return;}
  if(message.type==='friend:created'){shareInvite(message.code);return;}
  if(message.type==='session:replaced'){ui()?.toast('Esta sessão foi aberta em outra aba.','error');return;}
  if(message.type==='error'){ui()?.toast(message.message,'error');setConnection('error',message.message);return;}
}

function setConnection(state,text){const node=$('#connectionState');node.dataset.state=state;$('span',node).textContent=text;}
function showPvp(){document.querySelectorAll('.screen').forEach(screen=>screen.classList.remove('active'));$('#pvpArena').classList.add('active');window.scrollTo(0,0);}
function showLobby(){clearInterval(countdownTimer);currentMatch=null;queued=false;document.querySelectorAll('.screen').forEach(screen=>screen.classList.remove('active'));$('#lobby').classList.add('active');loadLobbyData();window.scrollTo({top:0,behavior:'smooth'});}

function joinQueue(mode){
  if(!session||socket?.readyState!==WebSocket.OPEN)return ui()?.toast('Aguarde a conexão com a arena.','error');
  showPvp();currentResult=null;$('#pvpResult').hidden=true;$('#pvpSurface').hidden=false;$('#pvpMode').textContent=modeNames[mode];$('#pvpOpponentName').textContent='Procurando…';$('#pvpTimer').textContent='FILA';renderQueue(1);send('queue:join',{mode,language:ui()?.getLanguage()||'mixed'});
}

function renderQueue(position){const surface=$('#pvpSurface');surface.replaceChildren();const loader=create('div','matchmaking-loader');loader.append(create('i'),create('h2','',position>1?`Posição ${position} na fila`:'Procurando adversário…'),create('p','','Estamos buscando outro jogador real com a mesma arena e idioma.'));const cancel=create('button','', 'Cancelar busca');cancel.addEventListener('click',()=>send('queue:leave'));loader.append(cancel);surface.append(loader);setConnection('waiting','Matchmaking em andamento');}

function beginMatch(payload){
  currentMatch=payload.match;currentOpponent=payload.opponent;showPvp();$('#pvpResult').hidden=true;$('#pvpSurface').hidden=false;$('#pvpYouName').textContent=payload.you?.name||session.player.name;$('#pvpOpponentName').textContent=currentOpponent?.name||'Rival';$('#pvpMode').textContent=`${modeNames[currentMatch.mode]} • ${String(currentMatch.language).toUpperCase()}`;renderChallenge(currentMatch);updateScores();setInputsEnabled(false);startClock();setConnection(currentMatch.status==='active'?'online':'waiting',currentMatch.status==='active'?'Partida em andamento':'Mesmo desafio confirmado • preparando duelo');
}

function startClock(){clearInterval(countdownTimer);const tick=()=>{if(!currentMatch)return;const now=Date.now();if(now<currentMatch.startAt){$('#pvpTimer').textContent=`Começa em ${Math.max(1,Math.ceil((currentMatch.startAt-now)/1000))}`;return;}const remaining=Math.max(0,Math.ceil((currentMatch.endAt-now)/1000));$('#pvpTimer').textContent=`${remaining}s`;if(remaining===0)clearInterval(countdownTimer);};tick();countdownTimer=setInterval(tick,200);}
function setInputsEnabled(enabled){$('#pvpSurface').querySelectorAll('input,button').forEach(control=>{if(!control.dataset.always)control.disabled=!enabled;});}

function renderChallenge(match){if(match.mode==='termo')renderTermo(match);if(match.mode==='anagrama')renderAnagrama(match);if(match.mode==='quarteto')renderQuarteto(match);}

function addWordForm(surface,instruction){const p=create('p','mode-instruction',instruction),form=create('form','word-input'),input=create('input'),button=create('button','primary','Enviar');input.placeholder='Digite uma palavra';input.autocomplete='off';input.setAttribute('aria-label','Palavra');form.append(input,button);surface.append(p,form);form.addEventListener('submit',event=>{event.preventDefault();const guess=input.value.trim();if(!guess)return;if(send('match:action',{matchId:currentMatch.id,action:{guess}}))input.value='';});return input;}

function renderTermo(match){const surface=$('#pvpSurface');surface.replaceChildren();const note=create('div','duel-equality','⚖ Vocês receberam exatamente a mesma palavra.');surface.append(note);const grid=create('div','termo-grid pvp-termo');for(let row=0;row<6;row++){const line=create('div');line.dataset.row=String(row);for(let col=0;col<5;col++)line.append(create('span'));grid.append(line);}surface.append(grid);const input=addWordForm(surface,'Acerte em até seis tentativas. Em empate de acertos, o menor tempo vence.');input.maxLength=5;}

function renderAnagrama(match){const surface=$('#pvpSurface');surface.replaceChildren(create('div','duel-equality','⚖ Mesmas letras e o mesmo cronômetro para os dois jogadores.'));const current=create('div','anagrama-current','Monte uma palavra'),letters=create('div','letters anagrama-letters');let word='';for(const letter of match.challenge.letters){const button=create('button','letter',letter);button.addEventListener('click',()=>{if(button.disabled)return;word+=letter;button.disabled=true;current.textContent=word;});letters.append(button);}const actions=create('div','anagrama-actions'),clear=create('button','','Limpar'),submit=create('button','primary','Validar palavra'),list=create('div','guess-list');clear.addEventListener('click',()=>{word='';current.textContent='Monte uma palavra';letters.querySelectorAll('button').forEach(button=>button.disabled=false);});submit.addEventListener('click',()=>{if(word&&send('match:action',{matchId:currentMatch.id,action:{guess:word}}))clear.click();});actions.append(clear,submit);surface.append(current,letters,actions,list);}

function renderQuarteto(match){const surface=$('#pvpSurface');surface.replaceChildren(create('div','duel-equality','⚖ Quatro palavras idênticas para os dois jogadores.'));const stage=create('div','quarteto-stage pvp-quarteto');for(let board=0;board<4;board++){const card=create('section','quarteto-card');card.dataset.board=String(board);const header=create('header');header.append(create('span','',`PALAVRA ${board+1}`),create('b','','EM JOGO'));const grid=create('div','quarteto-grid');for(let row=0;row<9;row++){const line=create('div','quarteto-row');line.dataset.row=String(row);for(let col=0;col<5;col++)line.append(create('span','quarteto-tile'));grid.append(line);}card.append(header,grid);stage.append(card);}surface.append(stage);const input=addWordForm(surface,'Uma tentativa vale para os quatro tabuleiros. Erros consomem uma das nove rodadas.');input.maxLength=5;}

function applyActionResult(result){
  if(currentMatch.mode==='termo'){
    const tiles=document.querySelectorAll(`#pvpSurface .termo-grid [data-row="${result.attempts-1}"] span`);tiles.forEach((tile,index)=>{tile.textContent=result.tiles[index].letter;tile.className=`${result.tiles[index].status} reveal`;});
  }else if(currentMatch.mode==='quarteto'){
    result.boards.forEach((board,index)=>{if(!board.tiles)return;const tiles=document.querySelectorAll(`#pvpSurface [data-board="${index}"] [data-row="${result.attempts-1}"] .quarteto-tile`);tiles.forEach((tile,tileIndex)=>{tile.textContent=board.tiles[tileIndex].letter;tile.className=`quarteto-tile ${board.tiles[tileIndex].status} reveal`;});if(board.solved){const card=$(`#pvpSurface [data-board="${index}"]`);card.classList.add('solved');$('header b',card).textContent='RESOLVIDA';}});
  }else{
    ui()?.prependGuess($('#pvpSurface .guess-list'),{word:result.guess,detail:`+${result.points} pts`,className:'pop'});
  }
  ui()?.toast(`Jogada validada • ${formatNumber(result.score)} pontos`);
}

function updateScores(){if(!currentMatch)return;const own=currentMatch.scores?.[session.player.id]?.score||0,otherId=currentMatch.playerIds?.find(id=>id!==session.player.id),other=currentMatch.scores?.[otherId]?.score||0;$('#pvpYouScore').textContent=formatNumber(own);$('#pvpOpponentScore').textContent=formatNumber(other);}

function showResult(message){
  clearInterval(countdownTimer);currentResult=message.result;currentMatch=currentMatch||{id:message.result.matchId};currentMatch.status='ended';session.player=message.profile;renderProfile(message.profile);$('#pvpSurface').hidden=true;const panel=$('#pvpResult');panel.hidden=false;const won=currentResult.outcome==='win',draw=currentResult.outcome==='draw';$('#pvpResultIcon').textContent=won?'🏆':draw?'≈':'◇';$('#pvpResultTitle').textContent=won?'Você venceu!':draw?'Empate técnico':'Derrota por pouco';$('#pvpResultPhrase').textContent=currentResult.phrase;$('#pvpAnswers').textContent=currentResult.answers?.length?`Resposta${currentResult.answers.length>1?'s':''}: ${currentResult.answers.join(', ')}`:'';
  const comparison=$('#pvpComparison');comparison.replaceChildren();for(const playerId of Object.keys(currentResult.players)){const stats=currentResult.players[playerId],row=create('div',playerId===session.player.id?'you':'');row.append(create('strong','',playerId===session.player.id?'Você':message.opponent.name),create('span','',`${formatNumber(stats.score)} pts`),create('small','',`${stats.attempts} ações • ${stats.words} palavras • ${(stats.elapsedMs/1000).toFixed(1)}s • sequência ${stats.maxStreak}`),create('small','',`Principal erro: ${stats.principalError}`));comparison.append(row);}setConnection('ended','Partida encerrada • resultado calculado pelo servidor');$('#shareLatestBtn').disabled=false;loadLobbyData();
}

function renderProfile(profile){if(!profile)return;$('#balanceText').textContent=`${formatNumber(profile.credits)} CR`;$('#profileName').textContent=profile.name;const metrics=$('#profileMetrics');metrics.replaceChildren();for(const [value,label] of [[profile.rating,'rating Elo'],[profile.level,'nível'],[profile.wins,'vitórias'],[profile.winStreak,'sequência']]){const item=create('div');item.append(create('b','',String(value)),create('span','',label));metrics.append(item);}const recent=$('#recentMatches');recent.replaceChildren();if(!profile.history?.length)recent.append(create('p','','Nenhuma partida disputada.'));else for(const match of profile.history.slice(0,5)){const row=create('div',`recent-${match.result}`);row.append(create('b','',match.result==='win'?'Vitória':match.result==='loss'?'Derrota':'Empate'),create('span','',`${match.opponentName} • ${match.ratingDelta>=0?'+':''}${match.ratingDelta} Elo`));recent.append(row);}}

async function loadLobbyData(){try{const [rankingResponse,tournamentsResponse]=await Promise.all([fetch('/api/rankings?period=all'),fetch('/api/tournaments')]);renderRanking((await rankingResponse.json()).ranking||[]);renderTournaments((await tournamentsResponse.json()).tournaments||[]);}catch{}}
function renderRanking(ranking){const list=$('#rankingList');list.replaceChildren();if(!ranking.length)return list.append(create('li','','Aguardando as primeiras partidas.'));for(const player of ranking.slice(0,8)){const item=create('li');item.append(create('b','',`#${player.position}`),create('span','',player.name),create('strong','',`${player.rating} Elo`));list.append(item);}}
function renderTournaments(tournaments){const grid=$('#tournamentGrid');grid.replaceChildren();for(const tournament of tournaments){const card=create('article','tournament-card'),top=create('div');top.append(create('span','',`${tournament.size} JOGADORES`),create('b','',tournament.status==='registration'?'INSCRIÇÕES':tournament.status==='completed'?'ENCERRADO':'EM ANDAMENTO'));const title=create('h3','',tournament.name),description=create('p','',`${modeNames[tournament.mode]} • entrada ${tournament.entryCredits} CR • prêmio virtual ${tournament.virtualPrizePool} CR`),footer=create('div'),players=create('span','',`${tournament.players.length}/${tournament.size} inscritos`),actions=create('div','tournament-actions'),details=create('button','','Ver chave'),join=create('button','', 'Inscrever');details.addEventListener('click',()=>showTournament(tournament));join.disabled=tournament.status!=='registration'||tournament.players.some(player=>player.id===session?.player?.id);join.addEventListener('click',()=>joinTournament(tournament.id));actions.append(details,join);footer.append(players,actions);card.append(top,title,description,footer);grid.append(card);}}
function showTournament(tournament){
  const overlay=create('div','tournament-overlay'),dialog=create('section','tournament-dialog'),header=create('header'),titleWrap=create('div'),close=create('button','','×');titleWrap.append(create('span','eyebrow','CHAVE VIRTUAL'),create('h2','',tournament.name),create('p','',`${tournament.players.length}/${tournament.size} jogadores • comissão apenas demonstrativa de ${tournament.commissionPercent}% • prêmio ${tournament.virtualPrizePool} CR`));close.setAttribute('aria-label','Fechar chave');close.addEventListener('click',()=>overlay.remove());header.append(titleWrap,close);dialog.append(header);
  const bracket=create('div','bracket-view');for(const round of tournament.bracket.rounds){const column=create('div','bracket-round');column.append(create('h3','',round.name));for(const match of round.matches){const card=create('div','bracket-match');for(const playerId of match.playerIds){const player=tournament.players.find(item=>item.id===playerId);const line=create('span',playerId===match.winnerId?'winner':'',player?.name||'Aguardando jogador');card.append(line);}column.append(card);}bracket.append(column);}const third=create('div','bracket-round');third.append(create('h3','','3º lugar'));const thirdMatch=create('div','bracket-match');for(const playerId of tournament.bracket.thirdPlace.playerIds){const player=tournament.players.find(item=>item.id===playerId);thirdMatch.append(create('span',playerId===tournament.bracket.thirdPlace.winnerId?'winner':'',player?.name||'Aguardando semifinal'));}third.append(thirdMatch);bracket.append(third);dialog.append(bracket);
  if(tournament.podium){const podium=create('div','virtual-podium');for(const [place,label] of [['second','2º'],['first','1º'],['third','3º']]){const player=tournament.players.find(item=>item.id===tournament.podium[place]),step=create('div',place);step.append(create('b','',label),create('span','',player?.name||'—'));podium.append(step);}dialog.append(podium);}
  dialog.append(create('p','tournament-history',`${tournament.history.length} eventos registrados no histórico deste torneio.`));overlay.append(dialog);overlay.addEventListener('click',event=>{if(event.target===overlay)overlay.remove();});document.body.append(overlay);
}
async function joinTournament(tournamentId){try{await post('/api/tournaments/join',{tournamentId,playerId:session.player.id,token:session.token});session=await post('/api/pvp/session',{playerId:session.player.id,token:session.token});renderProfile(session.player);loadLobbyData();ui()?.toast('Inscrição virtual confirmada.');}catch(error){ui()?.toast(error.message,'error');}}

async function shareInvite(code){const url=new URL(location.href);url.search='';url.searchParams.set('challenge',code);try{await navigator.clipboard.writeText(url.href);ui()?.modal('Convite copiado',`Envie o link ao seu amigo. O convite ${code} expira em 10 minutos.`,'◎');}catch{ui()?.modal('Código do desafio',`Peça ao seu amigo para abrir este código: ${code}`,'◎');}}
function shareText(){if(!currentResult)return;return `Joguei uma partida no Lexora Arena.\n${currentResult.phrase}\nAgora quero revanche.`;}
async function copyResult(){const text=shareText();if(!text)return ui()?.toast('Dispute uma partida primeiro.','error');try{await navigator.clipboard.writeText(text);ui()?.toast('Resultado copiado.');}catch{ui()?.modal('Compartilhe seu resultado',text,'↗');}}

document.addEventListener('click',event=>{const mode=event.target.closest('[data-pvp]')?.dataset.pvp;if(mode)joinQueue(mode);});
$('#pvpBackBtn').addEventListener('click',()=>{if(queued){send('queue:leave');return;}if(currentMatch&&currentMatch.status!=='ended'&&confirm('Abandonar esta partida dará a vitória ao adversário. Continuar?'))send('match:abandon',{matchId:currentMatch.id});else if(!currentMatch||currentMatch.status==='ended')showLobby();});
$('#resultLobbyBtn').addEventListener('click',showLobby);$('#rematchBtn').addEventListener('click',()=>{if(currentResult)send('match:rematch',{matchId:currentResult.matchId});});$('#copyResultBtn').addEventListener('click',copyResult);$('#shareLatestBtn').addEventListener('click',copyResult);
$('#friendBtn').addEventListener('click',()=>send('friend:create',{mode:'termo',language:ui()?.getLanguage()||'mixed'}));
$('#profileBtn').addEventListener('click',async()=>{const name=prompt('Nome público na arena:',session?.player?.name||'');if(!name)return;try{const response=await post('/api/pvp/profile',{playerId:session.player.id,token:session.token,name});session.player=response.player;renderProfile(response.player);ui()?.toast('Perfil atualizado.');}catch(error){ui()?.toast(error.message,'error');}});

initialize().catch(error=>{setConnection('error','Não foi possível criar a sessão.');ui()?.toast(error.message,'error');});
