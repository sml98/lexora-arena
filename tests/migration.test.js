import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql=(await Promise.all(['001_production_core.sql','002_competitive_arena.sql'].map(file=>readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')))).join('\n');

test('migration separa saldos e torna o ledger imutável',()=>{
  for(const bucket of ['available','locked','prize_pending','withdrawal_processing','commission'])assert.match(sql,new RegExp(`'${bucket}'`));
  assert.match(sql,/prevent_ledger_mutation/);assert.match(sql,/BEFORE UPDATE OR DELETE ON ledger_entries/);assert.match(sql,/balance_after_cents = balance_before_cents \+ amount_cents/);
});

test('migration inclui idempotência, partidas auditáveis, torneios e fraude',()=>{
  assert.match(sql,/UNIQUE \(kind, idempotency_key\)/);assert.match(sql,/challenge_commit_hash/);assert.match(sql,/match_events/);assert.match(sql,/tournament_matches/);assert.match(sql,/fraud_reviews/);assert.match(sql,/users_adult_birth_date/);
  assert.match(sql,/player_ratings/);assert.match(sql,/challenges/);assert.match(sql,/admin_actions/);assert.match(sql,/8,16,32,64,128/);
});
