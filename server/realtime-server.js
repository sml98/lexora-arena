import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { CONFIG, REAL_MONEY_ENABLED } from './config.js';
import { authenticatePlayer, creditDemoCredits, debitDemoCredits, getPublicPlayer, onlineCount, recordRatedMatch, setActiveMatch, setPlayerOnline } from './player-store.js';
import { activateMatch, createMatch, finishMatch, getMatch, getMatchByPlayer, getRematchData, getResult, publicMatch, requestRematch, startMatch, submitAction } from './pvp-engine.js';

const safeSend=(ws,type,payload={})=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type,...payload}));};

export function createRealtimeService(httpServer){
  const wss=new WebSocketServer({noServer:true,maxPayload:CONFIG.MESSAGE_LIMIT_BYTES});
  const sockets=new Map(),queues=new Map(),queuedPlayers=new Set(),reconnectTimers=new Map(),matchTimers=new Map(),actionWindows=new Map(),invites=new Map(),lastMatchByPlayer=new Map();

  httpServer.on('upgrade',(request,socket,head)=>{
    try{
      const url=new URL(request.url,'http://localhost');
      if(url.pathname!=='/ws'){socket.destroy();return;}
      const player=authenticatePlayer(url.searchParams.get('playerId'),url.searchParams.get('token'));
      wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request,player));
    }catch{socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');socket.destroy();}
  });

  wss.on('connection',(ws,_request,player)=>{
    const previous=sockets.get(player.id);if(previous&&previous!==ws)safeSend(previous,'session:replaced');
    previous?.close(4001,'Nova conexão iniciada');sockets.set(player.id,ws);setPlayerOnline(player.id,true);
    const timer=reconnectTimers.get(player.id);if(timer){clearTimeout(timer);reconnectTimers.delete(player.id);}
    safeSend(ws,'session:ready',{player:getPublicPlayer(player.id),online:onlineCount(),realMoneyEnabled:REAL_MONEY_ENABLED});broadcastPresence();
    const active=getMatchByPlayer(player.id);
    if(active)safeSend(ws,'match:reconnected',matchPayload(active,player.id));
    else if(lastMatchByPlayer.has(player.id)){const match=getMatch(lastMatchByPlayer.get(player.id));if(match?.status==='ended')sendEnded(match,player.id);}

    ws.on('message',raw=>handleMessage(player.id,ws,raw));
    ws.on('close',()=>handleDisconnect(player.id,ws));
    ws.on('error',()=>{});
  });

  function handleMessage(playerId,ws,raw){
    try{
      if(raw.length>CONFIG.MESSAGE_LIMIT_BYTES)throw new Error('Mensagem excede o limite permitido.');
      const message=JSON.parse(raw.toString());if(!message||typeof message.type!=='string')throw new Error('Mensagem inválida.');
      if(message.type==='queue:join')return joinQueue(playerId,message);
      if(message.type==='queue:leave')return leaveQueue(playerId,true);
      if(message.type==='match:action')return handleAction(playerId,message);
      if(message.type==='match:abandon')return handleAbandon(playerId,message.matchId);
      if(message.type==='match:rematch')return handleRematch(playerId,message.matchId);
      if(message.type==='friend:create')return createInvite(playerId,message);
      if(message.type==='friend:join')return joinInvite(playerId,message.code);
      if(message.type==='ping')return safeSend(ws,'pong',{serverTime:Date.now()});
      throw new Error('Evento não permitido.');
    }catch(error){safeSend(ws,'error',{message:String(error.message||'Mensagem inválida.').slice(0,160)});}
  }

  function checkActionRate(playerId){
    const now=Date.now(),entry=actionWindows.get(playerId)||{start:now,count:0};if(now-entry.start>10_000){entry.start=now;entry.count=0;}entry.count++;actionWindows.set(playerId,entry);if(entry.count>CONFIG.ACTIONS_PER_10_SECONDS)throw new Error('Muitas ações em sequência. Aguarde alguns segundos.');
  }

  function joinQueue(playerId,message){
    if(getMatchByPlayer(playerId))throw new Error('Você já está em uma partida.');
    if(queuedPlayers.has(playerId))throw new Error('Você já está na fila.');
    const mode=['termo','anagrama','quarteto'].includes(message.mode)?message.mode:'termo';
    const language=['pt','en','mixed'].includes(message.language)?message.language:'mixed';
    const key=`${mode}:${language}`,queue=queues.get(key)||[];queue.push(playerId);queues.set(key,queue);queuedPlayers.add(playerId);
    safeSend(sockets.get(playerId),'queue:joined',{mode,language,position:queue.length});matchQueue(key);
  }

  function matchQueue(key){
    const queue=queues.get(key)||[];
    while(queue.length>=2){
      const first=nextConnected(queue),second=nextConnected(queue);if(!first||!second){if(first)queue.unshift(first);break;}
      queuedPlayers.delete(first);queuedPlayers.delete(second);const [mode,language]=key.split(':');
      try{createAndLaunch([first,second],mode,language);}catch(error){safeSend(sockets.get(first),'error',{message:error.message});safeSend(sockets.get(second),'error',{message:error.message});}
    }
    queue.forEach((playerId,index)=>safeSend(sockets.get(playerId),'queue:update',{position:index+1}));
  }

  function nextConnected(queue){while(queue.length){const id=queue.shift();if(sockets.get(id)?.readyState===WebSocket.OPEN)return id;queuedPlayers.delete(id);}return null;}

  function chargeEntry(playerIds,matchId){
    const charged=[];
    try{for(const playerId of playerIds){debitDemoCredits(playerId,CONFIG.DUEL_ENTRY_CREDITS,{type:'duel_entry',matchId,description:'Entrada virtual no Lexora Duelo'});charged.push(playerId);}}
    catch(error){for(const playerId of charged)creditDemoCredits(playerId,CONFIG.DUEL_ENTRY_CREDITS,{type:'entry_refund',matchId,description:'Estorno de entrada virtual'});throw error;}
  }

  function createAndLaunch(playerIds,mode,language){
    const match=createMatch({playerIds,mode,language});try{chargeEntry(playerIds,match.id);}catch(error){finishMatch(match.id,'cancelled');throw error;}startMatch(match);for(const id of playerIds)setActiveMatch(id,match.id);
    for(const id of playerIds)safeSend(sockets.get(id),'match:found',matchPayload(match,id));
    const startTimer=setTimeout(()=>{activateMatch(match.id);broadcastMatch(match,'match:started');},Math.max(0,match.startAt-Date.now()));
    const endTimer=setTimeout(()=>concludeMatch(match.id,'timeout'),Math.max(0,match.endAt-Date.now()+50));
    matchTimers.set(match.id,{startTimer,endTimer});return match;
  }

  function matchPayload(match,viewerId){
    const opponentId=match.playerIds.find(id=>id!==viewerId);
    return {match:publicMatch(match,viewerId),you:getPublicPlayer(viewerId),opponent:getPublicPlayer(opponentId),entryCredits:CONFIG.DUEL_ENTRY_CREDITS,realMoneyEnabled:REAL_MONEY_ENABLED};
  }

  function handleAction(playerId,message){
    checkActionRate(playerId);const match=getMatch(message.matchId);if(!match)throw new Error('Partida não encontrada.');
    const response=submitAction(match.id,playerId,message.action);
    safeSend(sockets.get(playerId),'action:accepted',{match:response.match,result:response.actionResult});
    broadcastMatch(match,'match:update');if(match.status==='ended')concludeMatch(match.id,match.finishReason);
  }

  function handleAbandon(playerId,matchId){
    const match=getMatch(matchId);if(!match||!match.playerIds.includes(playerId))throw new Error('Partida não encontrada.');
    concludeMatch(match.id,'abandonment',{abandonedPlayerId:playerId});
  }

  function concludeMatch(matchId,reason,details={}){
    const match=finishMatch(matchId,reason,Date.now(),details);const timers=matchTimers.get(match.id);if(timers){clearTimeout(timers.startTimer);clearTimeout(timers.endTimer);matchTimers.delete(match.id);}
    if(!match.recorded){
      const results=Object.fromEntries(match.playerIds.map(id=>[id,getResult(match.id,id).players[id]]));
      const profiles=recordRatedMatch({matchId:match.id,mode:match.mode,language:match.language,playerIds:match.playerIds,winnerId:match.winnerId,tie:match.tie,results});
      if(match.tie)for(const id of match.playerIds)creditDemoCredits(id,CONFIG.DUEL_ENTRY_CREDITS,{type:'draw_refund',matchId:match.id,description:'Devolução por empate'});
      else if(match.winnerId)creditDemoCredits(match.winnerId,CONFIG.DUEL_ENTRY_CREDITS*2,{type:'duel_prize',matchId:match.id,description:'Prêmio virtual do duelo'});
      match.recorded=true;match.profiles=profiles;
    }
    for(const id of match.playerIds){setActiveMatch(id,null);lastMatchByPlayer.set(id,match.id);sendEnded(match,id);}
    return match;
  }

  function sendEnded(match,playerId){
    const opponentId=match.playerIds.find(id=>id!==playerId);
    safeSend(sockets.get(playerId),'match:ended',{result:getResult(match.id,playerId),profile:getPublicPlayer(playerId),opponent:getPublicPlayer(opponentId)});
  }

  function broadcastMatch(match,type){for(const id of match.playerIds)safeSend(sockets.get(id),type,{match:publicMatch(match,id)});}

  function handleRematch(playerId,matchId){
    const response=requestRematch(matchId,playerId);safeSend(sockets.get(playerId),'rematch:waiting');
    if(response.ready){const data=getRematchData(matchId);createAndLaunch(data.playerIds,data.mode,data.language);}
  }

  function createInvite(playerId,message){
    if(getMatchByPlayer(playerId)||queuedPlayers.has(playerId))throw new Error('Saia da fila ou partida antes de criar um convite.');
    const code=randomBytes(4).toString('hex').toUpperCase(),mode=['termo','anagrama','quarteto'].includes(message.mode)?message.mode:'termo',language=['pt','en','mixed'].includes(message.language)?message.language:'mixed';
    invites.set(code,{code,ownerId:playerId,mode,language,expiresAt:Date.now()+600_000});safeSend(sockets.get(playerId),'friend:created',{code,expiresAt:Date.now()+600_000});
  }

  function joinInvite(playerId,code){
    const invite=invites.get(String(code||'').toUpperCase());if(!invite||invite.expiresAt<Date.now())throw new Error('Convite inválido ou expirado.');
    if(invite.ownerId===playerId)throw new Error('Use outra sessão para aceitar o convite.');
    if(!sockets.has(invite.ownerId))throw new Error('O jogador que criou o convite está offline.');
    invites.delete(invite.code);createAndLaunch([invite.ownerId,playerId],invite.mode,invite.language);
  }

  function leaveQueue(playerId,notify=false){
    if(!queuedPlayers.delete(playerId))return;
    for(const queue of queues.values()){const index=queue.indexOf(playerId);if(index>=0)queue.splice(index,1);}
    if(notify)safeSend(sockets.get(playerId),'queue:left');
  }

  function handleDisconnect(playerId,ws){
    if(sockets.get(playerId)!==ws)return;sockets.delete(playerId);setPlayerOnline(playerId,false);leaveQueue(playerId);broadcastPresence();
    const match=getMatchByPlayer(playerId);if(match&&match.status!=='ended'){
      const timer=setTimeout(()=>{reconnectTimers.delete(playerId);if(!sockets.has(playerId))concludeMatch(match.id,'abandonment',{abandonedPlayerId:playerId});},CONFIG.RECONNECT_GRACE_MS);
      reconnectTimers.set(playerId,timer);for(const otherId of match.playerIds.filter(id=>id!==playerId))safeSend(sockets.get(otherId),'opponent:disconnected',{graceMs:CONFIG.RECONNECT_GRACE_MS});
    }
  }

  function broadcastPresence(){for(const ws of sockets.values())safeSend(ws,'presence',{online:onlineCount()});}
  function close(){for(const timer of reconnectTimers.values())clearTimeout(timer);for(const timers of matchTimers.values()){clearTimeout(timers.startTimer);clearTimeout(timers.endTimer);}for(const ws of sockets.values())ws.close();wss.close();}
  return {wss,close,stats:()=>({connections:sockets.size,queued:queuedPlayers.size,invites:invites.size})};
}
