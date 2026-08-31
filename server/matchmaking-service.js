import { CONFIG } from './config.js';

export function expandRange(waitingMs,windows=CONFIG.MATCHMAKING_WINDOWS){return [...windows].reverse().find(window=>waitingMs>=window.afterMs)?.ratingRange||windows[0].ratingRange;}

export function findOpponent(queue,{now=Date.now(),blocked=()=>false}={}){
  for(let first=0;first<queue.length;first++)for(let second=first+1;second<queue.length;second++){
    const a=queue[first],b=queue[second],range=Math.max(expandRange(now-a.joinedAt),expandRange(now-b.joinedAt));
    if(Math.abs(a.rating-b.rating)<=range&&!blocked(a.playerId,b.playerId))return [first,second];
  }
  return null;
}

export class MatchmakingService {
  constructor(){this.queues=new Map();}
  joinQueue(key,entry){const queue=this.queues.get(key)||[];if(queue.some(item=>item.playerId===entry.playerId))throw new Error('Jogador já está na fila.');queue.push({...entry,joinedAt:entry.joinedAt||Date.now()});this.queues.set(key,queue);return queue.length;}
  leaveQueue(playerId){for(const queue of this.queues.values()){const index=queue.findIndex(entry=>entry.playerId===playerId);if(index>=0)queue.splice(index,1);}}
  findOpponent(key,options){return findOpponent(this.queues.get(key)||[],options);}
  createMatch(key,indices){const queue=this.queues.get(key)||[];if(!indices)return null;const [firstIndex,secondIndex]=indices,second=queue.splice(secondIndex,1)[0],first=queue.splice(firstIndex,1)[0];return [first,second];}
  snapshot(){return [...this.queues.entries()].map(([key,queue])=>({key,size:queue.length}));}
}
