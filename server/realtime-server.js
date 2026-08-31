import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { CONFIG, REAL_MONEY_ENABLED } from './config.js';
import { reserveDuelEntries, settleDuel } from './financial-service.js';
import { completeFinancialMatchRecord, markFinancialMatchSettled, persistFinancialMatch, persistLatestFinancialEvent } from './match-persistence.js';
import { authenticatePlayer, blockPlayer, creditDemoCredits, debitDemoCredits, getFinancialUserId, getPublicPlayer, isBlockedEither, onlineCount, recordRatedMatch, reportPlayer, setActiveMatch, setPlayerOnline } from './player-store.js';
import { activateMatch, createMatch, finishMatch, getMatch, getMatchByPlayer, getRematchData, getResult, publicMatch, recordTelemetryEvent, requestRematch, startMatch, submitAction } from './pvp-engine.js';
import { findOpponent } from './matchmaking-service.js';
import { analyzeMatch } from './antifraud-service.js';
import { acceptChallenge, closeChallenge, createChallenge, getChallenge, listOpenChallenges } from './challenge-service.js';

const safeSend=(ws,type,payload={})=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type,...payload}));};

export function createRealtimeService(httpServer){
  const wss=new WebSocketServer({noServer:true,maxPayload:CONFIG.MESSAGE_LIMIT_BYTES});
  const sockets=new Map(),queues=new Map(),queuedPlayers=new Set(),reconnectTimers=new Map(),matchTimers=new Map(),actionWindows=new Map(),lastMatchByPlayer=new Map();
  const queueTicker=setInterval(()=>{for(const key of queues.keys())void matchQueue(key);},2_000);
  queueTicker.unref?.();

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

    ws.on('message',raw=>{void handleMessage(player.id,ws,raw);});
    ws.on('close',()=>handleDisconnect(player.id,ws));
    ws.on('error',()=>{});
  });

  async function handleMessage(playerId,ws,raw){
    try{
      if(raw.length>CONFIG.MESSAGE_LIMIT_BYTES)throw new Error('Mensagem excede o limite permitido.');
      const message=JSON.parse(raw.toString());if(!message||typeof message.type!=='string')throw new Error('Mensagem inválida.');
      if(message.type==='queue:join')return await joinQueue(playerId,message);
      if(message.type==='queue:leave')return leaveQueue(playerId,true);
      if(message.type==='match:action')return await handleAction(playerId,message);
      if(message.type==='match:abandon')return await handleAbandon(playerId,message.matchId);
      if(message.type==='match:rematch')return await handleRematch(playerId,message.matchId,message.acceptedEntryCents);
      if(message.type==='friend:create')return createInvite(playerId,message);
      if(message.type==='friend:join')return await joinInvite(playerId,message.code);
      if(message.type==='player:block')return handleBlock(playerId,message.targetId);
      if(message.type==='player:report')return handleReport(playerId,message.targetId,message.reason);
      if(message.type==='telemetry:focus')return await handleFocus(playerId,message);
      if(message.type==='ping')return safeSend(ws,'pong',{serverTime:Date.now()});
      throw new Error('Evento não permitido.');
    }catch(error){safeSend(ws,'error',{message:String(error.message||'Mensagem inválida.').slice(0,160)});}
  }

  function checkActionRate(playerId){
    const now=Date.now(),entry=actionWindows.get(playerId)||{start:now,count:0};if(now-entry.start>10_000){entry.start=now;entry.count=0;}entry.count++;actionWindows.set(playerId,entry);if(entry.count>CONFIG.ACTIONS_PER_10_SECONDS)throw new Error('Muitas ações em sequência. Aguarde alguns segundos.');
  }

  async function joinQueue(playerId,message){
    if(getMatchByPlayer(playerId))throw new Error('Você já está em uma partida.');
    if(queuedPlayers.has(playerId))throw new Error('Você já está na fila.');
    const mode=['quarteto','contexto'].includes(message.mode)?message.mode:'quarteto';
    const language=['pt','en','mixed'].includes(message.language)?message.language:'mixed';
    const financial=message.financial===true;
    const entryCents=financial?Number.parseInt(message.entryCents,10):0;
    const matchType=financial?'rewarded':['casual','ranked'].includes(message.matchType)?message.matchType:'ranked';
    const bestOf=message.bestOf===3?3:1;
    if(financial){if(!REAL_MONEY_ENABLED)throw new Error('Partidas premiadas estão bloqueadas neste ambiente.');if(!getFinancialUserId(playerId))throw new Error('Vincule uma identidade financeira verificada.');if(!CONFIG.ALLOWED_ENTRY_CENTS.includes(entryCents)||entryCents===0)throw new Error('Escolha uma entrada de R$ 2, R$ 5 ou R$ 10.');}
    const profile=getPublicPlayer(playerId),rating=profile?.ratings?.[mode]||CONFIG.RATING_INITIAL,key=`${mode}:${language}:${matchType}:${entryCents}:${bestOf}`,queue=queues.get(key)||[];
    queue.push({playerId,rating,joinedAt:Date.now()});queues.set(key,queue);queuedPlayers.add(playerId);
    safeSend(sockets.get(playerId),'queue:joined',{mode,language,matchType,financial,entryCents,bestOf,position:queue.length});await matchQueue(key);
  }

  async function matchQueue(key){
    const queue=queues.get(key)||[];
    pruneQueue(queue);let pair=findOpponent(queue,{blocked:isBlockedEither});if(!pair)return;
    const [firstIndex,secondIndex]=pair,second=queue.splice(secondIndex,1)[0],first=queue.splice(firstIndex,1)[0];
    queuedPlayers.delete(first.playerId);queuedPlayers.delete(second.playerId);const [mode,language,matchType,entryRaw,bestOfRaw]=key.split(':');
    try{await createAndLaunch([first.playerId,second.playerId],mode,language,{financial:matchType==='rewarded',entryCents:Number(entryRaw),matchType,bestOf:Number(bestOfRaw)});}catch(error){safeSend(sockets.get(first.playerId),'error',{message:error.message});safeSend(sockets.get(second.playerId),'error',{message:error.message});}
    queue.forEach((entry,index)=>safeSend(sockets.get(entry.playerId),'queue:update',{position:index+1}));
  }

  function pruneQueue(queue){for(let index=queue.length-1;index>=0;index--)if(sockets.get(queue[index].playerId)?.readyState!==WebSocket.OPEN){queuedPlayers.delete(queue[index].playerId);queue.splice(index,1);}}

  async function createAndLaunch(playerIds,mode,language,options={financial:false,entryCents:0,matchType:'ranked',bestOf:1,series:null}){
    const series=options.series||(options.bestOf===3?{bestOf:3,wins:Object.fromEntries(playerIds.map(id=>[id,0])),gameNumber:1}:null);
    const match=createMatch({playerIds,mode,language,matchType:options.matchType,series});
    try{
      if(options.financial){
        const financialPlayerIds=playerIds.map(getFinancialUserId);const quote=await reserveDuelEntries({matchId:match.id,playerIds:financialPlayerIds,entryCents:options.entryCents,idempotencyKey:`match-reserve:${match.id}`});
        match.financial={...quote,playerIds:financialPlayerIds,settlementStatus:'reserved'};await persistFinancialMatch(match);
      }
    }catch(error){if(match.financial)await settleDuel({matchId:match.id,playerIds:match.financial.playerIds,tie:true,entryCents:match.financial.entryCents,idempotencyKey:`launch-refund:${match.id}`}).catch(()=>{});finishMatch(match.id,'cancelled');throw error;}
    startMatch(match);for(const id of playerIds)setActiveMatch(id,match.id);
    for(const id of playerIds)safeSend(sockets.get(id),'match:found',matchPayload(match,id));
    const startTimer=setTimeout(()=>{activateMatch(match.id);broadcastMatch(match,'match:started');},Math.max(0,match.startAt-Date.now()));
    const endTimer=setTimeout(()=>{void concludeMatch(match.id,'timeout');},Math.max(0,match.endAt-Date.now()+50));
    matchTimers.set(match.id,{startTimer,endTimer});return match;
  }

  function matchPayload(match,viewerId){
    const opponentId=match.playerIds.find(id=>id!==viewerId);
    return {match:publicMatch(match,viewerId),you:getPublicPlayer(viewerId),opponent:getPublicPlayer(opponentId),entryCredits:match.financial?0:CONFIG.DUEL_ENTRY_CREDITS,financial:match.financial?{entryCents:match.financial.entryCents,grossPotCents:match.financial.grossPotCents,commissionPercent:match.financial.commissionPercent,commissionCents:match.financial.commissionCents,winnerPrizeCents:match.financial.winnerPrizeCents}:null,realMoneyEnabled:REAL_MONEY_ENABLED};
  }

  async function handleAction(playerId,message){
    checkActionRate(playerId);const match=getMatch(message.matchId);if(!match)throw new Error('Partida não encontrada.');
    const response=submitAction(match.id,playerId,message.action);
    if(match.financial)await persistLatestFinancialEvent(match);
    safeSend(sockets.get(playerId),'action:accepted',{match:response.match,result:response.actionResult});
    broadcastMatch(match,'match:update');if(match.status==='ended')await concludeMatch(match.id,match.finishReason);
  }

  async function handleFocus(playerId,message){const match=getMatch(message.matchId);recordTelemetryEvent(message.matchId,playerId,{focused:message.focused});if(match?.financial)await persistLatestFinancialEvent(match);}
  function handleBlock(playerId,targetId){const match=getMatchByPlayer(playerId);if(match?.status!=='ended'&&match?.playerIds.includes(targetId))throw new Error('O bloqueio fica disponível depois do encerramento.');safeSend(sockets.get(playerId),'player:blocked',blockPlayer(playerId,targetId));}
  function handleReport(playerId,targetId,reason){const match=lastMatchByPlayer.get(playerId);const previous=match?getMatch(match):null;if(!previous?.playerIds.includes(targetId))throw new Error('Só é possível denunciar um rival recente.');const report=reportPlayer(playerId,targetId,reason);safeSend(sockets.get(playerId),'player:reported',{reportId:report.id});}

  async function handleAbandon(playerId,matchId){
    const match=getMatch(matchId);if(!match||!match.playerIds.includes(playerId))throw new Error('Partida não encontrada.');
    await concludeMatch(match.id,'abandonment',{abandonedPlayerId:playerId});
  }

  async function concludeMatch(matchId,reason,details={}){
    const match=finishMatch(matchId,reason,Date.now(),details);const timers=matchTimers.get(match.id);if(timers){clearTimeout(timers.startTimer);clearTimeout(timers.endTimer);matchTimers.delete(match.id);}
    if(!match.recorded){match.recorded=true;
      const results=Object.fromEntries(match.playerIds.map(id=>[id,getResult(match.id,id).players[id]]));
      const profiles=recordRatedMatch({matchId:match.id,mode:match.mode,matchType:match.matchType,language:match.language,playerIds:match.playerIds,winnerId:match.winnerId,tie:match.tie,results});
      match.fraudReview=analyzeMatch(match);
      if(match.financial){
        match.financial.settlementStatus='processing';
        try{await completeFinancialMatchRecord(match);const winnerIndex=match.playerIds.indexOf(match.winnerId);const financialWinnerId=winnerIndex>=0?match.financial.playerIds[winnerIndex]:null;await settleDuel({matchId:match.id,playerIds:match.financial.playerIds,winnerId:financialWinnerId,tie:match.tie,entryCents:match.financial.entryCents,idempotencyKey:`match-settlement:${match.id}`});await markFinancialMatchSettled(match.id);match.financial.settlementStatus='completed';}
        catch(error){match.financial.settlementStatus='under_review';match.financial.settlementError=String(error.message).slice(0,160);await markFinancialMatchSettled(match.id,'under_review').catch(()=>{});}
      }
      match.profiles=profiles;
    }
    for(const id of match.playerIds){setActiveMatch(id,null);lastMatchByPlayer.set(id,match.id);sendEnded(match,id);}
    return match;
  }

  function sendEnded(match,playerId){
    const opponentId=match.playerIds.find(id=>id!==playerId);
    safeSend(sockets.get(playerId),'match:ended',{result:getResult(match.id,playerId),profile:getPublicPlayer(playerId),opponent:getPublicPlayer(opponentId)});
  }

  function broadcastMatch(match,type){for(const id of match.playerIds)safeSend(sockets.get(id),type,{match:publicMatch(match,id)});}

  async function handleRematch(playerId,matchId,acceptedEntryCents){
    const previous=getMatch(matchId);if(previous?.financial&&Number(acceptedEntryCents)!==previous.financial.entryCents)throw new Error('Confirme explicitamente o mesmo valor de entrada para a revanche.');
    const response=requestRematch(matchId,playerId);safeSend(sockets.get(playerId),'rematch:waiting');
    if(response.ready){const data=getRematchData(matchId);await createAndLaunch(data.playerIds,data.mode,data.language,{financial:Boolean(previous?.financial),entryCents:previous?.financial?.entryCents||0,matchType:data.matchType,bestOf:data.series?.bestOf||1,series:data.series});}
  }

  function createInvite(playerId,message){
    if(getMatchByPlayer(playerId)||queuedPlayers.has(playerId))throw new Error('Saia da fila ou partida antes de criar um convite.');
    const challenge=createChallenge(playerId,{mode:message.mode,language:message.language,matchType:message.matchType,bestOf:message.bestOf,open:true});safeSend(sockets.get(playerId),'friend:created',challenge);
  }

  async function joinInvite(playerId,code){
    const invite=getChallenge(code);if(!invite)throw new Error('Convite inválido ou expirado.');
    if(invite.ownerId===playerId)throw new Error('Use outra sessão para aceitar o convite.');
    if(isBlockedEither(invite.ownerId,playerId))throw new Error('Este desafio não está disponível entre os jogadores.');
    if(!sockets.has(invite.ownerId))throw new Error('O jogador que criou o convite está offline.');
    acceptChallenge(invite.code,playerId);closeChallenge(invite.code,'accepted');await createAndLaunch([invite.ownerId,playerId],invite.mode,invite.language,{matchType:invite.matchType,bestOf:invite.bestOf});
  }

  function leaveQueue(playerId,notify=false){
    if(!queuedPlayers.delete(playerId))return;
    for(const queue of queues.values()){const index=queue.findIndex(entry=>entry.playerId===playerId);if(index>=0)queue.splice(index,1);}
    if(notify)safeSend(sockets.get(playerId),'queue:left');
  }

  function handleDisconnect(playerId,ws){
    if(sockets.get(playerId)!==ws)return;sockets.delete(playerId);setPlayerOnline(playerId,false);leaveQueue(playerId);broadcastPresence();
    const match=getMatchByPlayer(playerId);if(match&&match.status!=='ended'){
      const timer=setTimeout(()=>{reconnectTimers.delete(playerId);if(!sockets.has(playerId))void concludeMatch(match.id,'abandonment',{abandonedPlayerId:playerId});},CONFIG.RECONNECT_GRACE_MS);
      reconnectTimers.set(playerId,timer);for(const otherId of match.playerIds.filter(id=>id!==playerId))safeSend(sockets.get(otherId),'opponent:disconnected',{graceMs:CONFIG.RECONNECT_GRACE_MS});
    }
  }

  function broadcastPresence(){for(const ws of sockets.values())safeSend(ws,'presence',{online:onlineCount()});}
  function close(){clearInterval(queueTicker);for(const timer of reconnectTimers.values())clearTimeout(timer);for(const timers of matchTimers.values()){clearTimeout(timers.startTimer);clearTimeout(timers.endTimer);}for(const ws of sockets.values())ws.close();wss.close();}
  return {wss,close,stats:()=>({connections:sockets.size,queued:queuedPlayers.size,invites:listOpenChallenges().length})};
}
