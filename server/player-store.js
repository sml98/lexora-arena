import { randomBytes, randomUUID } from 'node:crypto';
import { CONFIG } from './config.js';

const players = new Map();
const tokens = new Map();

const cleanText=(value,max=24)=>String(value||'').replace(/[<>\u0000-\u001F]/g,'').replace(/\s+/g,' ').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
const dateKey=value=>String(value||nowIso()).slice(0,10);

function publicProfile(player){
  return {
    id:player.id,name:player.name,rating:player.rating,level:player.level,
    provisionalRemaining:Math.max(0,CONFIG.PROVISIONAL_MATCHES-player.games),
    games:player.games,wins:player.wins,losses:player.losses,draws:player.draws,
    winStreak:player.winStreak,bestWinStreak:player.bestWinStreak,
    credits:player.credits,online:player.online,city:player.city,state:player.state,
    recentRivals:[...player.recentRivals],history:player.history.slice(0,20),ledger:player.ledger.slice(0,30)
  };
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
    rating:CONFIG.RATING_INITIAL,level:1,games:0,wins:0,losses:0,draws:0,winStreak:0,bestWinStreak:0,
    credits:0,ledger:[],history:[],recentRivals:new Set(),online:false,activeMatchId:null,createdAt:nowIso(),lastSeenAt:nowIso()
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
export function onlineCount(){return [...players.values()].filter(player=>player.online).length;}

export function debitDemoCredits(playerId,amount,details={}){
  const player=players.get(playerId);if(!player)throw new Error('Jogador não encontrado.');
  return addLedger(player,{...details,type:details.type||'entry',amount:-Math.abs(amount)});
}

export function creditDemoCredits(playerId,amount,details={}){
  const player=players.get(playerId);if(!player)throw new Error('Jogador não encontrado.');
  return addLedger(player,{...details,type:details.type||'prize',amount:Math.abs(amount)});
}

function expectedScore(a,b){return 1/(1+10**((b-a)/400));}

export function recordRatedMatch({matchId,mode,language,playerIds,winnerId=null,tie=false,results,endedAt=nowIso()}){
  const [first,second]=playerIds.map(id=>players.get(id));
  if(!first||!second)throw new Error('Jogadores da partida não encontrados.');
  const firstScore=tie ? .5 : winnerId===first.id ? 1 : 0;
  const secondScore=1-firstScore;
  const firstDelta=Math.round(CONFIG.RATING_K_FACTOR*(firstScore-expectedScore(first.rating,second.rating)));
  const secondDelta=-firstDelta;
  for(const [player,opponent,score,delta] of [[first,second,firstScore,firstDelta],[second,first,secondScore,secondDelta]]){
    player.rating=Math.max(100,player.rating+delta);player.games++;
    if(score===1){player.wins++;player.winStreak++;player.bestWinStreak=Math.max(player.bestWinStreak,player.winStreak);}
    else if(score===0){player.losses++;player.winStreak=0;}else{player.draws++;player.winStreak=0;}
    player.level=1+Math.floor(player.games/5);player.recentRivals.delete(opponent.id);player.recentRivals.add(opponent.id);
    while(player.recentRivals.size>8)player.recentRivals.delete(player.recentRivals.values().next().value);
    player.history.unshift({matchId,mode,language,opponentId:opponent.id,opponentName:opponent.name,result:score===1?'win':score===0?'loss':'draw',ratingDelta:delta,score:results[player.id]?.score||0,endedAt});
    if(player.history.length>50)player.history.length=50;
  }
  return {[first.id]:publicProfile(first),[second.id]:publicProfile(second)};
}

export function getRankings(period='all',filters={}){
  const now=Date.now();const threshold=period==='daily'?now-86_400_000:period==='weekly'?now-604_800_000:0;
  return [...players.values()].filter(player=>(!filters.city||player.city===filters.city)&&(!filters.state||player.state===filters.state)).map(player=>{
    const relevant=player.history.filter(item=>Date.parse(item.endedAt)>=threshold);
    return {id:player.id,name:player.name,rating:player.rating,level:player.level,games:player.games,wins:player.wins,losses:player.losses,draws:player.draws,winStreak:player.winStreak,city:player.city,state:player.state,periodWins:relevant.filter(item=>item.result==='win').length,periodGames:relevant.length};
  }).sort((a,b)=>b.periodWins-a.periodWins||b.rating-a.rating||a.name.localeCompare(b.name)).slice(0,100).map((player,index)=>({...player,position:index+1}));
}

export function updatePlayerName(playerId,name){const player=players.get(playerId);if(!player)throw new Error('Jogador não encontrado.');player.name=cleanText(name)||player.name;return publicProfile(player);}
export function resetPlayerStore(){players.clear();tokens.clear();}
export function getPlayerStoreStats(){return {players:players.size,online:onlineCount(),date:dateKey()};}
