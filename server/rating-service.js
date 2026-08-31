import { CONFIG } from './config.js';

export class RatingService {
  expectedScore(rating,opponentRating){return 1/(1+10**((opponentRating-rating)/400));}
  calculate({rating,opponentRating,outcome,kFactor=CONFIG.RATING_K_FACTOR}){
    if(!['win','loss','draw'].includes(outcome))throw new Error('Resultado inválido para rating.');
    const score=outcome==='win'?1:outcome==='draw'?.5:0;
    return Math.round(kFactor*(score-this.expectedScore(rating,opponentRating)));
  }
  division(rating){return [...CONFIG.DIVISIONS].reverse().find(item=>rating>=item.min)?.name||CONFIG.DIVISIONS[0].name;}
}

export const ratingService=new RatingService();
