import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createLexoraServer } from '../server/server.js';
import { clearPvpMatches } from '../server/pvp-engine.js';
import { resetPlayerStore } from '../server/player-store.js';

function messages(ws){
  const received=[],waiters=[];
  ws.on('message',raw=>{const message=JSON.parse(raw.toString());received.push(message);for(const waiter of [...waiters])if(waiter.type===message.type){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timer);waiter.resolve(message);}});
  return {received,waitFor(type,timeout=5_000){const existing=received.find(message=>message.type===type);if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const waiter={type,resolve,timer:null};waiters.push(waiter);waiter.timer=setTimeout(()=>{const index=waiters.indexOf(waiter);if(index>=0){waiters.splice(index,1);reject(new Error(`Timeout esperando ${type}`));}},timeout);});}};
}

async function createSession(base,name){const response=await fetch(`${base}/api/pvp/session`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});assert.equal(response.status,200);return response.json();}
function connect(base,session){const url=new URL(base);const ws=new WebSocket(`ws://${url.host}/ws?playerId=${session.player.id}&token=${session.token}`),inbox=messages(ws);return {ws,inbox};}

test('WebSocket conecta dois jogadores, faz matchmaking e permite reconexão sem expor segredo',async t=>{
  resetPlayerStore();clearPvpMatches();const app=createLexoraServer();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const port=app.server.address().port,base=`http://127.0.0.1:${port}`;
  const clients=[];t.after(async()=>{for(const client of clients)client.ws.close();app.realtime.close();await new Promise(resolve=>app.server.close(resolve));resetPlayerStore();clearPvpMatches();});
  const [ana,beto]=await Promise.all([createSession(base,'Ana'),createSession(base,'Beto')]);assert.notEqual(ana.player.id,beto.player.id);
  const first=connect(base,ana),second=connect(base,beto);clients.push(first,second);await Promise.all([once(first.ws,'open'),once(second.ws,'open')]);await Promise.all([first.inbox.waitFor('session:ready'),second.inbox.waitFor('session:ready')]);
  first.ws.send(JSON.stringify({type:'queue:join',mode:'termo',language:'pt'}));second.ws.send(JSON.stringify({type:'queue:join',mode:'termo',language:'pt'}));
  const [foundA,foundB]=await Promise.all([first.inbox.waitFor('match:found'),second.inbox.waitFor('match:found')]);
  assert.equal(foundA.match.id,foundB.match.id);assert.deepEqual(foundA.match.challenge,foundB.match.challenge);assert.doesNotMatch(JSON.stringify(foundA),/"secret"|"secrets"|"answer"/i);
  first.ws.close();await once(first.ws,'close');const reconnected=connect(base,ana);clients.push(reconnected);await once(reconnected.ws,'open');const restored=await reconnected.inbox.waitFor('match:reconnected');assert.equal(restored.match.id,foundA.match.id);
});

test('API declara dinheiro real desativado',async t=>{
  const app=createLexoraServer();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(async()=>{app.realtime.close();await new Promise(resolve=>app.server.close(resolve));});const base=`http://127.0.0.1:${app.server.address().port}`;
  const config=await (await fetch(`${base}/api/config`)).json();assert.equal(config.realMoneyEnabled,false);assert.equal(config.creditsLabel,'Créditos demo');
});
