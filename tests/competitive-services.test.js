import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRange, findOpponent } from '../server/matchmaking-service.js';
import { ratingService } from '../server/rating-service.js';
import { LocalSemanticProvider } from '../server/semantic-provider.js';
import { analyzeMatch, resetFraudSignals } from '../server/antifraud-service.js';
import { createChallenge, getChallenge, resetChallenges } from '../server/challenge-service.js';
import { createPlayerSession, resetPlayerStore } from '../server/player-store.js';
import { getDailyRanking, resetDailyChallenges, startDailyChallenge } from '../server/daily-challenge-service.js';

test.afterEach(()=>{resetFraudSignals();resetChallenges();resetDailyChallenges();resetPlayerStore();});

test('matchmaking expande ±100, ±200 e ±300 por tempo',()=>{assert.equal(expandRange(0),100);assert.equal(expandRange(10_000),200);assert.equal(expandRange(20_000),300);const now=30_000,queue=[{playerId:'a',rating:1000,joinedAt:now-20_000},{playerId:'b',rating:1250,joinedAt:now}];assert.deepEqual(findOpponent(queue,{now}),[0,1]);});
test('rating e divisões são determinísticos',()=>{assert.equal(ratingService.calculate({rating:1000,opponentRating:1000,outcome:'win'}),16);assert.equal(ratingService.division(1000),'Prata III');assert.equal(ratingService.division(2300),'Elite');});
test('provedor semântico retorna o mesmo rank para a mesma dupla',()=>{const provider=new LocalSemanticProvider(),context={near:['SOM'],warm:['ARTE']};assert.equal(provider.getRank('MUSICA','SOM',context),2);assert.equal(provider.getRank('MUSICA','SOM',context),2);assert.ok(provider.getSimilarity('MUSICA','SOM',context)>.8);});
test('desafio aberto contém código, rating correto e nenhuma atividade falsa',()=>{const player=createPlayerSession({name:'Ana'}).player,challenge=createChallenge(player.id,{mode:'contexto',matchType:'ranked',bestOf:3});assert.equal(challenge.owner.name,'Ana');assert.equal(challenge.bestOf,3);assert.equal(getChallenge(challenge.code).code,challenge.code);});
test('antifraude gera flags graduais sem banimento automático',()=>{const players=new Map([['a',{riskFlags:['impossible_action_speed']}],['b',{riskFlags:[]}]]),signal=analyzeMatch({id:'m1',playerIds:['a','b'],winnerId:'a',players,financial:false});assert.equal(signal.fraudScore,35);assert.equal(signal.status,'open');assert.ok(signal.reasons.includes('impossible_action_speed'));});
test('Daily Contexto usa alvo compartilhado e ranking autoritativo',()=>{const first=startDailyChallenge('a',{mode:'contexto',language:'pt'}),second=startDailyChallenge('b',{mode:'contexto',language:'pt'});assert.equal(first.dailyId,second.dailyId);assert.equal(getDailyRanking('contexto','pt').ranking.length,0);assert.ok(first.sessionId&&second.sessionId);});
