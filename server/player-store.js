import { randomBytes, randomUUID } from 'node:crypto';
import { CONFIG } from './config.js';
import { ratingService } from './rating-service.js';

const players = new Map();
const tokens = new Map();

const cleanText=(value,max=24)=>String(value||'').replace(/[<>\u0000-\u001F]/g,'').replace(/\s+/g,' ').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
const dateKey=value=>String(value||nowIso()).slice(0,10);

function publicProfile(player){
  const quartetoRating=player.ratings.quarteto,contextoRating=player.ratings.contexto;
  return {
    id:player.id,name:player.name,bio:player.bio,quartetoRating,contextoRating,contextRating:contextoRating,ratings:{...player.ratings},
    divisions:{quarteto:ratingService.division(quartetoRating),contexto:ratingService.division(contextoRating)},
    rating:quartetoRating,level:player.level,
    provisionalRemaining:Math.max(0,CONFIG.PROVISIONAL_MATCHES-player.games),
    games:player.games,wins:player.wins,losses:player.losses,draws:player.draws,
    winStreak:player.winStreak,bestWinStreak:player.bestWinStreak,
    credits:player.credits,online:player.online,city:player.city,state:player.state,financialIdentityLinked:Boolean(player.financialUserId),stats:structuredClone(player.stats),
    recentRivals:[...player.recentRivals],rivalries:[...player.recentRivals].map(rivalId=>rivalrySnapshot(player,rivalId)).filter(Boolean),history:player.history.slice(0,20),ledger:player.ledger.slice(0,30)
  };
}

function rivalrySnapshot(player,rivalId){
  const rival=players.get(rivalId);if(!rival)return null;
  const meetings=player.history.filter(item=>item.opponentId===rivalId),byMode={};
  for(const mode of ['quarteto','contexto']){const rows=meetings.filter(item=>item.mode===mode);byMode[mode]={games:rows.length,wins:rows.filter(item=>item.result==='win').length,losses:rows.filter(item=>item.result==='loss').length,draws:rows.filter(item=>item.result==='draw').length};}
  return {rivalId,rivalName:rival.name,total:meetings.length,wins:meetings.filter(item=>item.result==='win').length,losses:meetings.filter(item=>item.result==='loss').length,draws:meetings.filter(item=>item.result==='draw').length,lastWinnerId:meetings[0]?.result==='draw'?null:meetings[0]?.result==='win'?player.id:rivalId,lastPlayedAt:meetings[0]?.endedAt||null,byMode};
}

function addLedger(player,{type,amount,matchId=null,tournamentId=null,description=''}){
  const before=player.credits;
  const after=before+amount;
  if(after<0)throw new Error('Créditos virtuais insuficientes.');
  player.credits=after;
  const entry={id:randomUUID(),type,amount,before,after,matchId,tournamentId,description:cleanText(description,80),createdAt:nowIso()};
  player.ledger.unshift(entry);
  if(player.ledger.length>100)player.ledger.length=100;
  return entry;
}

export function createPlayerSession(input={}){
  const id=randomUUID();
  const token=randomBytes(32).toString('hex');
  const suffix=id.slice(0,4).toUpperCase();
  const player={
    id,token,name:cleanText(input.name)||`Jogador-${suffix}`,city:cleanText(input.city,40)||null,state:cleanText(input.state,2).toUpperCase()||null,
    bio:'Pronto para competir.',ratings:{quarteto:CONFIG.RATING_INITIAL,contexto:CONFIG.RATING_INITIAL},level:1,games:0,wins:0,losses:0,draws:0,winStreak:0,bestWinStreak:0,
    stats:{quarteto:{games:0,wins:0,losses:0,draws:0,totalSolved:0,totalAttempts:0,totalElapsedMs:0,bestTimeMs:null},contexto:{games:0,wins:0,losses:0,draws:0,totalBestRank:0,totalAttempts:0,totalElapsedMs:0,discovered:0}},
    credits:0,ledger:[],history:[],recentRivals:new Set(),blockedPlayers:new Set(),reports:[],online:false,activeMatchId:null,financialUserId:null,createdAt:nowIso(),lastSeenAt:nowIso()
  };
  players.set(id,player);tokens.set(token,id);
  addLedger(player,{type:'welcome',amount:CONFIG.INITIAL_DEMO_CREDITS,description:'Créditos iniciais de demonstração'});
  return {player:publicProfile(player),token};
}

export function resumePlayerSession(playerId,token){
  const player=authenticatePlayer(playerId,token);
  player.lastSeenAt=nowIso();
  return {player:publicProfile(player),token};
}

export function authenticatePlayer(playerId,token){
  const player=players.get(String(playerId||''));
  if(!player||!token||tokens.get(String(token))!==player.id)throw new Error('Sessão de jogador inválida.');
  return player;
}

export function getPlayer(playerId){return players.get(playerId);}
export function getPublicPlayer(playerId){const player=players.get(playerId);return player?publicProfile(player):null;}
export function setPlayerOnline(playerId,online){const player=players.get(playerId);if(!player)return;player.online=Boolean(online);player.lastSeenAt=nowIso();}
export function setActiveMatch(playerId,matchId){const player=players.get(playerId);if(player)player.activeMatchId=matchId||null;}
export function linkFinancialIdentity(playerId,userId){const player=players.get(playerId);if(!player)throw new Error('Jogador não encontrado.');player.financialUserId=userId;return publicProfile(player);}
export function getFinancialUserId(playerId){return players.get(playerId)?.financialUserId||null;}
export function blockPlayer(playerId,targetId){const player=players.get(playerId);if(!player||!players.has(targetId)||playerId===targetId)throw new Error('Jogador inválido para bloqueio.');player.blockedPlayers.add(targetId);return {blocked:true,targetId};}
export function isBlockedEither(firstId,secondId){return Boolean(players.get(firstId)?.blockedPlayers.has(secondId)||players.get(secondId)?.blockedPlayers.has(firstId));}
export function reportPlayer(playerId,targetId,reason){const player=players.get(playerId);if(!player||!players.has(targetId)||playerId===targetId)throw new Error('Jogador inválido para denúncia.');const report={id:randomUUID(),targetId,reason:cleanText(reason,160)||'comportamento_inadequado',createdAt:nowIso(),status:'open'};player.reports.unshift(report);return report;}
export function onlineCount(){return [...players.values()].filter(player=>player.online).length;}

export function debitDemoCredits(playerId,amount,details={}){
  const player=players.get(playerId);if(!player)throw new Error('Jogador não encontrado.');
  return addLedger(player,{...details,type:details.type||'entry',amount:-Math.abs(amount)});
}

export function creditDemoCredits(playerId,amount,details={}){
  const player=players.get(playerId);if(!player)throw new Error('Jogador não encontrado.');
  return addLedger(player,{...details,type:details.type||'prize',amount:Math.abs(amount)});
}

export function recordRatedMatch({matchId,mode,language,matchType='ranked',playerIds,winnerId=null,tie=false,results,entryCents=0,prizeCents=0,endedAt=nowIso()}){
  const [first,second]=playerIds.map(id=>players.get(id));
  if(!first||!second)throw new Error('Jogadores da partida não encontrados.');
  const firstScore=tie ? .5 : winnerId===first.id ? 1 : 0;
  const secondScore=1-firstScore;
  const rated=matchType==='ranked'||matchType==='rewarded'||matchType==='tournament';
  const firstDelta=rated?ratingService.calculate({rating:first.ratings[mode],opponentRating:second.ratings[mode],outcome:tie?'draw':winnerId===first.id?'win':'loss'}):0;
  const secondDelta=-firstDelta;
  for(const [player,opponent,score,delta] of [[first,second,firstScore,firstDelta],[second,first,secondScore,secondDelta]]){
    const ratingBefore=player.ratings[mode];if(rated)player.ratings[mode]=Math.max(100,player.ratings[mode]+delta);player.games++;
    if(score===1){player.wins++;player.winStreak++;player.bestWinStreak=Math.max(player.bestWinStreak,player.winStreak);}
    else if(score===0){player.losses++;player.winStreak=0;}else{player.draws++;player.winStreak=0;}
    const modeStats=player.stats[mode];modeStats.games++;modeStats.totalAttempts+=results[player.id]?.attempts||0;modeStats.totalElapsedMs+=results[player.id]?.elapsedMs||0;
    if(score===1)modeStats.wins++;else if(score===0)modeStats.losses++;else modeStats.draws++;
    if(mode==='quarteto'){modeStats.totalSolved+=results[player.id]?.solved||0;const elapsed=results[player.id]?.elapsedMs;if(results[player.id]?.solved===4&&elapsed!==null)modeStats.bestTimeMs=modeStats.bestTimeMs===null?elapsed:Math.min(modeStats.bestTimeMs,elapsed);}
    else{modeStats.totalBestRank+=results[player.id]?.bestRank||9999;if(results[player.id]?.discovered)modeStats.discovered++;}
    player.level=1+Math.floor(player.games/5);player.recentRivals.delete(opponent.id);player.recentRivals.add(opponent.id);
    while(player.recentRivals.size>8)player.recentRivals.delete(player.recentRivals.values().next().value);
    player.history.unshift({matchId,mode,matchType,language,opponentId:opponent.id,opponentName:opponent.name,result:score===1?'win':score===0?'loss':'draw',ratingBefore,ratingAfter:player.ratings[mode],ratingDelta:delta,entryCents:Number(entryCents)||0,prizeCents:score===1?(Number(prizeCents)||0):0,score:results[player.id]?.score||0,summary:{solved:results[player.id]?.solved,bestRank:results[player.id]?.bestRank,attempts:results[player.id]?.attempts,elapsedMs:results[player.id]?.elapsedMs},endedAt});
    if(player.history.length>50)player.history.length=50;
  }
  return {[first.id]:publicProfile(first),[second.id]:publicProfile(second)};
}

export function getRivalry(playerId,rivalId){const player=players.get(playerId);if(!player)throw new Error('Jogador não encontrado.');const snapshot=rivalrySnapshot(player,rivalId);if(!snapshot)throw new Error('Rival não encontrado.');return snapshot;}

export function getBusinessMetrics(now=Date.now()){
  const periods={today:86_400_000,sevenDays:604_800_000,thirtyDays:2_592_000_000};
  const allHistory=[...players.values()].flatMap(player=>player.history.map(item=>({...item,playerId:player.id}))),uniqueMatches=rows=>[...new Map(rows.map(item=>[item.matchId,item])).values()];
  const paidAll=uniqueMatches(allHistory.filter(item=>item.entryCents>0));
  const summarize=windowMs=>{const rows=paidAll.filter(item=>Date.parse(item.endedAt)>=now-windowMs),gmvCents=rows.reduce((sum,item)=>sum+item.entryCents*2,0);return {paidMatches:rows.length,gmvCents,platformRevenueCents:Math.floor(gmvCents*CONFIG.PLATFORM_FEE_PERCENT/100)};};
  const payingUsers=new Set(allHistory.filter(item=>item.entryCents>0).map(item=>item.playerId));
  const activeSince=now-86_400_000,dailyActiveUsers=[...players.values()].filter(player=>Date.parse(player.lastSeenAt)>=activeSince).length;
  return {registeredUsers:players.size,dailyActiveUsers,payingUsers:payingUsers.size,paidMatches:paidAll.length,averagePaidMatchesPerUser:payingUsers.size?Math.round(paidAll.length/payingUsers.size*100)/100:0,averageEntryValueCents:paidAll.length?Math.round(paidAll.reduce((sum,item)=>sum+item.entryCents,0)/paidAll.length):0,periods:Object.fromEntries(Object.entries(periods).map(([name,windowMs])=>[name,summarize(windowMs)]))};
}

export function getRankings(period='all',filters={}){
  const mode=['quarteto','contexto'].includes(filters.mode)?filters.mode:'quarteto';
  const now=Date.now();const threshold=period==='daily'?now-86_400_000:period==='weekly'?now-604_800_000:period==='monthly'?now-2_592_000_000:0;
  return [...players.values()].filter(player=>player.stats[mode].games>0&&(!filters.city||player.city===filters.city)&&(!filters.state||player.state===filters.state)).map(player=>{
    const relevant=player.history.filter(item=>Date.parse(item.endedAt)>=threshold);
    const modeHistory=relevant.filter(item=>item.mode===mode),stats=player.stats[mode];
    return {id:player.id,name:player.name,mode,rating:player.ratings[mode],division:ratingService.division(player.ratings[mode]),games:stats.games,wins:stats.wins,losses:stats.losses,draws:stats.draws,winRate:stats.games?Math.round(stats.wins/stats.games*1000)/10:0,winStreak:player.winStreak,city:player.city,state:player.state,periodWins:modeHistory.filter(item=>item.result==='win').length,periodGames:modeHistory.length};
  }).sort((a,b)=>b.rating-a.rating||b.periodWins-a.periodWins||a.name.localeCompare(b.name)).slice(0,100).map((player,index)=>({...player,position:index+1}));
}

export function updatePlayerName(playerId,name){const player=players.get(playerId);if(!player)throw new Error('Jogador não encontrado.');player.name=cleanText(name)||player.name;return publicProfile(player);}
export function resetPlayerStore(){players.clear();tokens.clear();}
export function getPlayerStoreStats(){return {players:players.size,online:onlineCount(),date:dateKey()};}
