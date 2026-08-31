import { randomUUID } from 'node:crypto';
import { MONEY_CONFIG, REAL_MONEY_ENABLED, assertRealMoneyReady } from './config.js';
import { getDatabase, withTransaction } from './database.js';
import { createPaymentProvider } from './payments/efi-provider.js';
import { decryptSensitive, sha256, verifyWebhookEnvelope } from './security.js';

const allowedBuckets = new Set(['available','locked','prize_pending','withdrawal_processing','commission']);
const positiveCents = value => {
  if(!/^\d+$/.test(String(value)))throw new Error('O valor deve ser informado em centavos inteiros positivos.');
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('O valor deve ser informado em centavos inteiros positivos.');
  return amount;
};

export function calculateDuelMoney(entryCents, commissionPercent = MONEY_CONFIG.platformCommissionPercent) {
  const entry = positiveCents(entryCents);
  if (!Number.isInteger(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) throw new Error('Comissão inválida.');
  const grossPotCents = entry * 2;
  const commissionCents = Math.floor(grossPotCents * commissionPercent / 100);
  return Object.freeze({ entryCents: entry, grossPotCents, commissionPercent, commissionCents, winnerPrizeCents: grossPotCents - commissionCents });
}

export function calculateTournamentMoney({ size, entryCents, commissionPercent = MONEY_CONFIG.tournamentCommissionPercent, distribution = { first: MONEY_CONFIG.firstPlacePercent, second: MONEY_CONFIG.secondPlacePercent, third: MONEY_CONFIG.thirdPlacePercent } }) {
  if (![8,16,32].includes(size)) throw new Error('Torneios financeiros aceitam 8, 16 ou 32 jogadores.');
  if (Object.values(distribution).reduce((sum, value) => sum + value, 0) !== 100) throw new Error('A distribuição do pódio deve somar 100%.');
  const grossPotCents = size * positiveCents(entryCents);
  const commissionCents = Math.floor(grossPotCents * commissionPercent / 100);
  const prizePoolCents = grossPotCents - commissionCents;
  const firstCents = Math.floor(prizePoolCents * distribution.first / 100);
  const secondCents = Math.floor(prizePoolCents * distribution.second / 100);
  return Object.freeze({ size, entryCents, grossPotCents, commissionPercent, commissionCents, prizePoolCents, prizes: { first: firstCents, second: secondCents, third: prizePoolCents - firstCents - secondCents } });
}

function canonicalLedgerHash(entry) {
  return sha256(JSON.stringify([entry.operationId, entry.accountId, entry.userId || '', entry.entryType, entry.amountCents, entry.before, entry.after, entry.currency, entry.previousHash || '', entry.matchId || '', entry.tournamentId || '', entry.externalId || '']));
}

async function accountForUpdate(client, ownerType, ownerId, bucket) {
  if (!allowedBuckets.has(bucket)) throw new Error('Conta financeira inválida.');
  const result = await client.query(`SELECT * FROM wallet_accounts WHERE owner_type=$1 AND owner_id IS NOT DISTINCT FROM $2 AND bucket=$3 AND currency='BRL' FOR UPDATE`, [ownerType, ownerId, bucket]);
  if (!result.rows[0]) throw new Error(`Conta ${bucket} não encontrada.`);
  return result.rows[0];
}

async function appendLedger(client, { operationId, ownerType = 'user', userId = null, bucket, entryType, amountCents, matchId = null, tournamentId = null, provider = null, externalId = null, reason = null }) {
  const account = await accountForUpdate(client, ownerType, ownerType === 'platform' ? null : userId, bucket);
  const before = Number(account.balance_cents), after = before + amountCents;
  if (after < 0) throw Object.assign(new Error('Saldo disponível insuficiente.'), { code: 'INSUFFICIENT_FUNDS', statusCode: 409 });
  const previous = await client.query('SELECT integrity_hash FROM ledger_entries ORDER BY sequence DESC LIMIT 1 FOR UPDATE');
  const entry = { operationId, accountId: account.id, userId: ownerType === 'user' ? userId : null, entryType, amountCents, before, after, currency: 'BRL', previousHash: previous.rows[0]?.integrity_hash || null, matchId, tournamentId, externalId };
  const integrityHash = canonicalLedgerHash(entry);
  await client.query('UPDATE wallet_accounts SET balance_cents=$2,version=version+1,updated_at=now() WHERE id=$1', [account.id, after]);
  await client.query(`INSERT INTO ledger_entries(operation_id,account_id,user_id,entry_type,amount_cents,balance_before_cents,balance_after_cents,match_id,tournament_id,provider,external_id,previous_hash,integrity_hash,reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [operationId, account.id, entry.userId, entryType, amountCents, before, after, matchId, tournamentId, provider, externalId, entry.previousHash, integrityHash, reason]);
  return { before, after, integrityHash };
}

async function assertEligible(client, userId, kind, amountCents) {
  const result = await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [userId]);
  const user = result.rows[0];
  if (!user) throw new Error('Usuário não encontrado.');
  if (user.status !== 'active' || user.self_excluded_until && new Date(user.self_excluded_until) > new Date()) throw Object.assign(new Error('Conta inelegível para operações financeiras.'), { statusCode: 403 });
  if (!user.email_verified_at || !user.phone_verified_at || user.kyc_status !== 'approved') throw Object.assign(new Error('Confirmação de contato e KYC aprovado são obrigatórios.'), { statusCode: 403 });
  const operationKind = kind === 'deposit' ? 'deposit' : kind.includes('tournament') ? 'tournament_reservation' : 'match_reservation';
  const sum = await client.query(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM money_operations WHERE user_id=$1 AND kind=$2 AND status NOT IN ('failed','cancelled','refunded') AND created_at>=date_trunc('day',now())`, [userId, operationKind]);
  const limit = kind === 'deposit' ? Number(user.daily_deposit_limit_cents) : Number(user.daily_entry_limit_cents);
  if (Number(sum.rows[0].total) + amountCents > limit) throw Object.assign(new Error('O limite diário responsável seria excedido.'), { code: 'RESPONSIBLE_LIMIT', statusCode: 409 });
  return user;
}

export async function getWallet(userId) {
  assertRealMoneyReady('Consulta de carteira');
  const [accounts, operations] = await Promise.all([
    getDatabase().query("SELECT bucket,balance_cents,currency,updated_at FROM wallet_accounts WHERE owner_type='user' AND owner_id=$1 ORDER BY bucket", [userId]),
    getDatabase().query('SELECT id,kind,amount_cents,fee_cents,status,provider,external_id,match_id,tournament_id,created_at,updated_at FROM money_operations WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [userId])
  ]);
  return { currency: 'BRL', balances: Object.fromEntries(accounts.rows.map(row => [row.bucket, Number(row.balance_cents)])), operations: operations.rows.map(row => ({ ...row, amount_cents: Number(row.amount_cents), fee_cents: Number(row.fee_cents) })) };
}

export async function createDeposit(userId, input, provider = createPaymentProvider()) {
  assertRealMoneyReady('Depósito Pix');
  const amountCents = positiveCents(input.amountCents), idempotencyKey = String(input.idempotencyKey || '').trim();
  if (idempotencyKey.length < 16 || idempotencyKey.length > 160) throw new Error('Chave de idempotência inválida.');
  const prepared = await withTransaction(async client => {
    const existing = await client.query("SELECT * FROM money_operations WHERE kind='deposit' AND idempotency_key=$1", [idempotencyKey]);
    if (existing.rows[0]) return { existing: true, operation: existing.rows[0] };
    const user = await assertEligible(client, userId, 'deposit', amountCents);
    const operation = await client.query(`INSERT INTO money_operations(user_id,kind,amount_cents,status,provider,idempotency_key)
      VALUES ($1,'deposit',$2,'created',$3,$4) RETURNING *`, [userId, amountCents, provider.name, idempotencyKey]);
    return { existing: false, operation: operation.rows[0], user };
  });
  if (prepared.existing) return prepared.operation;
  try {
    const response = await provider.createDeposit({ idempotencyKey, amountCents, user: { name: prepared.user.name, cpf: decryptSensitive(prepared.user.cpf_ciphertext) } });
    const result = await getDatabase().query("UPDATE money_operations SET status='pending',external_id=$2,metadata=$3,updated_at=now() WHERE id=$1 RETURNING *", [prepared.operation.id, response.externalId, JSON.stringify(response.providerPayload || {})]);
    return result.rows[0];
  } catch (error) {
    await getDatabase().query("UPDATE money_operations SET status='failed',failure_reason=$2,updated_at=now() WHERE id=$1", [prepared.operation.id, String(error.message).slice(0, 500)]);
    throw error;
  }
}

export async function processPaymentWebhook(rawBody, headers) {
  assertRealMoneyReady('Webhook Pix');
  if (!verifyWebhookEnvelope(rawBody, headers)) throw Object.assign(new Error('Webhook sem prova mTLS/assinatura válida.'), { statusCode: 401 });
  const payload = JSON.parse(rawBody);
  const events = Array.isArray(payload.pix) ? payload.pix : [];
  const results = [];
  for (const pix of events) {
    const externalEventId = String(pix.endToEndId || pix.e2eId || `${pix.txid}:${pix.horario || ''}`);
    const result = await withTransaction(async client => {
      const event = await client.query(`INSERT INTO payment_webhook_events(provider,external_event_id,payload_hash,verified)
        VALUES ('efi',$1,$2,true) ON CONFLICT(provider,external_event_id) DO NOTHING RETURNING id`, [externalEventId, sha256(JSON.stringify(pix))]);
      if (!event.rows[0]) return { duplicate: true, externalEventId };
      const operation = await client.query("SELECT * FROM money_operations WHERE kind='deposit' AND provider='efi' AND external_id=$1 FOR UPDATE", [pix.txid]);
      if (!operation.rows[0]) throw new Error('Depósito correspondente ao webhook não encontrado.');
      if (operation.rows[0].status === 'completed') return { duplicate: true, externalEventId };
      const amountCents = Math.round(Number(pix.valor) * 100);
      if (amountCents !== Number(operation.rows[0].amount_cents)) throw new Error('Valor do webhook diverge da cobrança registrada.');
      await appendLedger(client, { operationId: operation.rows[0].id, userId: operation.rows[0].user_id, bucket: 'available', entryType: 'pix_deposit_confirmed', amountCents, provider: 'efi', externalId: externalEventId, reason: 'Pix confirmado por webhook verificado' });
      await client.query("UPDATE money_operations SET status='completed',metadata=metadata||$2::jsonb,updated_at=now() WHERE id=$1", [operation.rows[0].id, JSON.stringify({ e2eId: externalEventId, paidAt: pix.horario })]);
      await client.query('UPDATE payment_webhook_events SET processed_at=now() WHERE id=$1', [event.rows[0].id]);
      return { duplicate: false, externalEventId, operationId: operation.rows[0].id };
    });
    results.push(result);
  }
  return { processed: results };
}

export async function reserveDuelEntries({ matchId, playerIds, entryCents, idempotencyKey }) {
  assertRealMoneyReady('Inscrição financeira no duelo');
  const money = calculateDuelMoney(entryCents);
  if (!Array.isArray(playerIds) || playerIds.length !== 2 || new Set(playerIds).size !== 2) throw new Error('O duelo exige dois usuários diferentes.');
  return withTransaction(async client => {
    for (const userId of [...playerIds].sort()) {
      await assertEligible(client, userId, 'match', money.entryCents);
      const key = `${idempotencyKey}:${userId}`;
      const inserted = await client.query(`INSERT INTO money_operations(user_id,kind,amount_cents,status,idempotency_key,match_id)
        VALUES ($1,'match_reservation',$2,'confirmed',$3,$4) ON CONFLICT(kind,idempotency_key) DO NOTHING RETURNING id`, [userId, money.entryCents, key, matchId]);
      if (!inserted.rows[0]) continue;
      await appendLedger(client, { operationId: inserted.rows[0].id, userId, bucket: 'available', entryType: 'match_entry_debit', amountCents: -money.entryCents, matchId });
      await appendLedger(client, { operationId: inserted.rows[0].id, userId, bucket: 'locked', entryType: 'match_entry_locked', amountCents: money.entryCents, matchId });
    }
    return money;
  });
}

export async function settleDuel({ matchId, playerIds, winnerId = null, tie = false, entryCents, idempotencyKey }) {
  assertRealMoneyReady('Liquidação do duelo');
  const money = calculateDuelMoney(entryCents);
  if (!tie && !playerIds.includes(winnerId)) throw new Error('Vencedor inválido.');
  return withTransaction(async client => {
    const existing = await client.query("SELECT id FROM money_operations WHERE kind='match_settlement' AND idempotency_key=$1", [idempotencyKey]);
    if (existing.rows[0]) return { ...money, duplicate: true };
    const operation = await client.query(`INSERT INTO money_operations(kind,amount_cents,status,idempotency_key,match_id,metadata)
      VALUES ('match_settlement',$1,'completed',$2,$3,$4) RETURNING id`, [money.grossPotCents, idempotencyKey, matchId, JSON.stringify({ playerIds, winnerId, tie })]);
    for (const userId of [...playerIds].sort()) await appendLedger(client, { operationId: operation.rows[0].id, userId, bucket: 'locked', entryType: tie ? 'draw_unlock' : 'settlement_consume_locked', amountCents: -money.entryCents, matchId });
    if (tie) {
      for (const userId of playerIds) await appendLedger(client, { operationId: operation.rows[0].id, userId, bucket: 'available', entryType: 'draw_refund', amountCents: money.entryCents, matchId });
    } else {
      await appendLedger(client, { operationId: operation.rows[0].id, ownerType: 'platform', bucket: 'commission', entryType: 'platform_commission', amountCents: money.commissionCents, matchId });
      await appendLedger(client, { operationId: operation.rows[0].id, userId: winnerId, bucket: 'prize_pending', entryType: 'prize_pending', amountCents: money.winnerPrizeCents, matchId });
      await appendLedger(client, { operationId: operation.rows[0].id, userId: winnerId, bucket: 'prize_pending', entryType: 'prize_release', amountCents: -money.winnerPrizeCents, matchId });
      await appendLedger(client, { operationId: operation.rows[0].id, userId: winnerId, bucket: 'available', entryType: 'duel_prize', amountCents: money.winnerPrizeCents, matchId });
    }
    return { ...money, duplicate: false };
  });
}

export async function recoverInterruptedDuels() {
  assertRealMoneyReady('Recuperação de partidas interrompidas');
  const result=await getDatabase().query("SELECT id,entry_cents FROM matches WHERE financial=true AND status IN ('created','countdown','active') ORDER BY created_at");
  const recovered=[];
  for(const match of result.rows){
    const players=await getDatabase().query('SELECT user_id FROM match_players WHERE match_id=$1 ORDER BY user_id',[match.id]);
    if(players.rows.length!==2)continue;
    await settleDuel({matchId:match.id,playerIds:players.rows.map(row=>row.user_id),tie:true,entryCents:Number(match.entry_cents),idempotencyKey:`restart-refund:${match.id}`});
    await getDatabase().query("UPDATE matches SET status='cancelled',finish_reason='server_restart_refund',ended_at=now(),settled_at=now() WHERE id=$1",[match.id]);
    recovered.push(match.id);
  }
  return recovered;
}

export async function requestWithdrawal(userId, input, provider = createPaymentProvider()) {
  assertRealMoneyReady('Saque Pix');
  const amountCents = positiveCents(input.amountCents), idempotencyKey = String(input.idempotencyKey || '').trim();
  if (amountCents < MONEY_CONFIG.minWithdrawalCents) throw new Error(`Saque mínimo: ${MONEY_CONFIG.minWithdrawalCents} centavos.`);
  if (idempotencyKey.length < 16 || idempotencyKey.length > 160) throw new Error('Chave de idempotência inválida.');
  const prepared = await withTransaction(async client => {
    const existing = await client.query("SELECT * FROM money_operations WHERE kind='withdrawal' AND idempotency_key=$1", [idempotencyKey]);
    if (existing.rows[0]) return { existing: true, operation: existing.rows[0] };
    const user = await assertEligible(client, userId, 'withdrawal', amountCents);
    const operation = await client.query(`INSERT INTO money_operations(user_id,kind,amount_cents,fee_cents,status,provider,idempotency_key,metadata)
      VALUES ($1,'withdrawal',$2,$3,'under_review',$4,$5,$6) RETURNING *`, [userId, amountCents, MONEY_CONFIG.withdrawalFeeCents, provider.name, idempotencyKey, JSON.stringify({ pixKeyHash: sha256(String(input.pixKey)) })]);
    await appendLedger(client, { operationId: operation.rows[0].id, userId, bucket: 'available', entryType: 'withdrawal_requested', amountCents: -(amountCents + MONEY_CONFIG.withdrawalFeeCents) });
    await appendLedger(client, { operationId: operation.rows[0].id, userId, bucket: 'withdrawal_processing', entryType: 'withdrawal_processing', amountCents });
    if(MONEY_CONFIG.withdrawalFeeCents)await appendLedger(client,{operationId:operation.rows[0].id,ownerType:'platform',bucket:'commission',entryType:'withdrawal_fee',amountCents:MONEY_CONFIG.withdrawalFeeCents});
    return { existing: false, operation: operation.rows[0], user };
  });
  if (prepared.existing) return prepared.operation;
  try {
    const response = await provider.createWithdrawal({ idempotencyKey, amountCents, pixKey: input.pixKey, cpf: decryptSensitive(prepared.user.cpf_ciphertext) });
    const result = await getDatabase().query("UPDATE money_operations SET status=$2,external_id=$3,metadata=metadata||$4::jsonb,updated_at=now() WHERE id=$1 RETURNING *", [prepared.operation.id, response.status, response.externalId, JSON.stringify({ e2eId: response.e2eId })]);
    return result.rows[0];
  } catch (error) {
    await withTransaction(async client => {
      const operation = await client.query('SELECT * FROM money_operations WHERE id=$1 FOR UPDATE', [prepared.operation.id]);
      if (!operation.rows[0] || operation.rows[0].status === 'failed') return;
      await appendLedger(client, { operationId: prepared.operation.id, userId, bucket: 'withdrawal_processing', entryType: 'withdrawal_failed', amountCents: -amountCents, reason: String(error.message).slice(0, 200) });
      await appendLedger(client, { operationId: prepared.operation.id, userId, bucket: 'available', entryType: 'withdrawal_refund', amountCents: amountCents + MONEY_CONFIG.withdrawalFeeCents });
      if(MONEY_CONFIG.withdrawalFeeCents)await appendLedger(client,{operationId:prepared.operation.id,ownerType:'platform',bucket:'commission',entryType:'withdrawal_fee_reversal',amountCents:-MONEY_CONFIG.withdrawalFeeCents,reason:String(error.message).slice(0,200)});
      await client.query("UPDATE money_operations SET status='failed',failure_reason=$2,updated_at=now() WHERE id=$1", [prepared.operation.id, String(error.message).slice(0, 500)]);
    });
    throw error;
  }
}

export async function listAdminTransactions(limit = 100) {
  assertRealMoneyReady('Painel administrativo');
  const safeLimit = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 100));
  const result = await getDatabase().query(`SELECT id,user_id,kind,amount_cents,fee_cents,currency,status,provider,external_id,match_id,tournament_id,failure_reason,created_at,updated_at
    FROM money_operations ORDER BY created_at DESC LIMIT $1`, [safeLimit]);
  return result.rows;
}

export async function createFinancialTournament(input) {
  assertRealMoneyReady('Criação de torneio financeiro');
  const size=Number.parseInt(input.size,10),entryCents=positiveCents(input.entryCents),money=calculateTournamentMoney({size,entryCents});
  const result=await getDatabase().query(`INSERT INTO tournaments(name,size,mode,entry_cents,status,minimum_players,commission_percent,prize_distribution,starts_at)
    VALUES ($1,$2,$3,$4,'registration',$5,$6,$7,$8) RETURNING *`,[String(input.name||'Torneio Lexora').slice(0,100),size,['quarteto','contexto'].includes(input.mode)?input.mode:'quarteto',entryCents,Number.parseInt(input.minimumPlayers||size,10),money.commissionPercent,JSON.stringify({first:MONEY_CONFIG.firstPlacePercent,second:MONEY_CONFIG.secondPlacePercent,third:MONEY_CONFIG.thirdPlacePercent}),new Date(input.startsAt||Date.now()+3_600_000)]);
  return {...result.rows[0],money};
}

export async function listFinancialTournaments() {
  if(!REAL_MONEY_ENABLED)return [];
  const result=await getDatabase().query(`SELECT t.*,COUNT(e.user_id)::int AS registered FROM tournaments t LEFT JOIN tournament_entries e ON e.tournament_id=t.id AND e.status='confirmed' GROUP BY t.id ORDER BY t.starts_at`);
  return result.rows.map(tournament=>({...tournament,entry_cents:Number(tournament.entry_cents),quote:calculateTournamentMoney({size:tournament.size,entryCents:Number(tournament.entry_cents),commissionPercent:tournament.commission_percent,distribution:tournament.prize_distribution})}));
}

export async function joinFinancialTournament(userId,tournamentId,idempotencyKey) {
  assertRealMoneyReady('Inscrição financeira no torneio');
  if(String(idempotencyKey||'').length<16)throw new Error('Chave de idempotência inválida.');
  return withTransaction(async client=>{
    const tournamentResult=await client.query("SELECT * FROM tournaments WHERE id=$1 FOR UPDATE",[tournamentId]),tournament=tournamentResult.rows[0];
    if(!tournament||tournament.status!=='registration')throw new Error('Torneio indisponível para inscrição.');
    const count=await client.query("SELECT COUNT(*)::int AS total FROM tournament_entries WHERE tournament_id=$1 AND status='confirmed'",[tournamentId]);
    if(count.rows[0].total>=tournament.size)throw new Error('Torneio lotado.');
    await assertEligible(client,userId,'tournament',Number(tournament.entry_cents));
    const operation=await client.query(`INSERT INTO money_operations(user_id,kind,amount_cents,status,idempotency_key,tournament_id)
      VALUES ($1,'tournament_reservation',$2,'confirmed',$3,$4) ON CONFLICT(kind,idempotency_key) DO NOTHING RETURNING id`,[userId,tournament.entry_cents,idempotencyKey,tournamentId]);
    if(!operation.rows[0])return {duplicate:true,tournamentId};
    await appendLedger(client,{operationId:operation.rows[0].id,userId,bucket:'available',entryType:'tournament_entry_debit',amountCents:-Number(tournament.entry_cents),tournamentId});
    await appendLedger(client,{operationId:operation.rows[0].id,userId,bucket:'locked',entryType:'tournament_entry_locked',amountCents:Number(tournament.entry_cents),tournamentId});
    await client.query("INSERT INTO tournament_entries(tournament_id,user_id,operation_id,status) VALUES ($1,$2,$3,'confirmed')",[tournamentId,userId,operation.rows[0].id]);
    if(count.rows[0].total+1===tournament.size)await client.query("UPDATE tournaments SET status='active' WHERE id=$1",[tournamentId]);
    return {duplicate:false,tournamentId,registered:count.rows[0].total+1,size:tournament.size};
  });
}

export async function cancelFinancialTournament(tournamentId,reason,idempotencyKey) {
  assertRealMoneyReady('Cancelamento do torneio');
  return withTransaction(async client=>{
    const tournamentResult=await client.query("SELECT * FROM tournaments WHERE id=$1 FOR UPDATE",[tournamentId]),tournament=tournamentResult.rows[0];
    if(!tournament)throw new Error('Torneio não encontrado.');
    if(['completed','cancelled'].includes(tournament.status))return {duplicate:true,status:tournament.status};
    const operation=await client.query(`INSERT INTO money_operations(kind,amount_cents,status,idempotency_key,tournament_id,metadata)
      VALUES ('tournament_settlement',$1,'refunded',$2,$3,$4) ON CONFLICT(kind,idempotency_key) DO NOTHING RETURNING id`,[Number(tournament.entry_cents)*tournament.size,idempotencyKey,tournamentId,JSON.stringify({reason})]);
    if(!operation.rows[0])return {duplicate:true,status:'cancelled'};
    const entries=await client.query("SELECT user_id FROM tournament_entries WHERE tournament_id=$1 AND status='confirmed' ORDER BY user_id",[tournamentId]);
    for(const entry of entries.rows){await appendLedger(client,{operationId:operation.rows[0].id,userId:entry.user_id,bucket:'locked',entryType:'tournament_cancel_unlock',amountCents:-Number(tournament.entry_cents),tournamentId});await appendLedger(client,{operationId:operation.rows[0].id,userId:entry.user_id,bucket:'available',entryType:'tournament_cancel_refund',amountCents:Number(tournament.entry_cents),tournamentId});}
    await client.query("UPDATE tournament_entries SET status='refunded' WHERE tournament_id=$1",[tournamentId]);
    await client.query("UPDATE tournaments SET status='cancelled',cancelled_at=now(),cancellation_reason=$2 WHERE id=$1",[tournamentId,String(reason||'Mínimo de jogadores não atingido').slice(0,500)]);
    return {duplicate:false,status:'cancelled',refunded:entries.rows.length};
  });
}

export async function settleFinancialTournament(tournamentId,podium,idempotencyKey) {
  assertRealMoneyReady('Liquidação do torneio');
  return withTransaction(async client=>{
    const tournamentResult=await client.query("SELECT * FROM tournaments WHERE id=$1 FOR UPDATE",[tournamentId]),tournament=tournamentResult.rows[0];
    if(!tournament||tournament.status!=='active')throw new Error('Torneio ativo não encontrado.');
    const entries=await client.query("SELECT user_id FROM tournament_entries WHERE tournament_id=$1 AND status='confirmed' ORDER BY user_id",[tournamentId]);
    if(entries.rows.length!==tournament.size)throw new Error('A chave não está completa.');
    const entrants=new Set(entries.rows.map(row=>row.user_id)),winners=[podium.first,podium.second,podium.third];
    if(new Set(winners).size!==3||winners.some(id=>!entrants.has(id)))throw new Error('Pódio inválido.');
    const money=calculateTournamentMoney({size:tournament.size,entryCents:Number(tournament.entry_cents),commissionPercent:tournament.commission_percent,distribution:tournament.prize_distribution});
    const operation=await client.query(`INSERT INTO money_operations(kind,amount_cents,status,idempotency_key,tournament_id,metadata)
      VALUES ('tournament_settlement',$1,'completed',$2,$3,$4) ON CONFLICT(kind,idempotency_key) DO NOTHING RETURNING id`,[money.grossPotCents,idempotencyKey,tournamentId,JSON.stringify({podium})]);
    if(!operation.rows[0])return {...money,duplicate:true};
    for(const entry of entries.rows)await appendLedger(client,{operationId:operation.rows[0].id,userId:entry.user_id,bucket:'locked',entryType:'tournament_settlement_consume',amountCents:-Number(tournament.entry_cents),tournamentId});
    await appendLedger(client,{operationId:operation.rows[0].id,ownerType:'platform',bucket:'commission',entryType:'tournament_commission',amountCents:money.commissionCents,tournamentId});
    for(const [place,userId] of Object.entries(podium)){const amount=money.prizes[place];await appendLedger(client,{operationId:operation.rows[0].id,userId,bucket:'prize_pending',entryType:`tournament_${place}_pending`,amountCents:amount,tournamentId});await appendLedger(client,{operationId:operation.rows[0].id,userId,bucket:'prize_pending',entryType:`tournament_${place}_release`,amountCents:-amount,tournamentId});await appendLedger(client,{operationId:operation.rows[0].id,userId,bucket:'available',entryType:`tournament_${place}_prize`,amountCents:amount,tournamentId});}
    await client.query("UPDATE tournaments SET status='completed',settled_at=now() WHERE id=$1",[tournamentId]);
    return {...money,duplicate:false};
  });
}

export async function reconcilePendingPayments(provider=createPaymentProvider()) {
  assertRealMoneyReady('Reconciliação de pagamentos');
  const pending=await getDatabase().query(`SELECT * FROM money_operations WHERE provider=$1 AND external_id IS NOT NULL
    AND ((kind='deposit' AND status='pending') OR (kind='withdrawal' AND status IN ('sent','pending','under_review'))) ORDER BY created_at LIMIT 50`,[provider.name]);
  const results=[];
  for(const operation of pending.rows){
    try{
      const remote=operation.kind==='deposit'?await provider.getDeposit(operation.external_id):await provider.getWithdrawal(operation.external_id);
      if(operation.kind==='deposit'&&remote.status==='confirmed'){
        await withTransaction(async client=>{const locked=await client.query('SELECT * FROM money_operations WHERE id=$1 FOR UPDATE',[operation.id]);if(locked.rows[0].status!=='pending')return;await appendLedger(client,{operationId:operation.id,userId:operation.user_id,bucket:'available',entryType:'pix_deposit_reconciled',amountCents:Number(operation.amount_cents),provider:provider.name,externalId:operation.external_id,reason:'Confirmação por consulta idempotente ao provedor'});await client.query("UPDATE money_operations SET status='completed',metadata=metadata||$2::jsonb,updated_at=now() WHERE id=$1",[operation.id,JSON.stringify({reconciledAt:new Date().toISOString()})]);});
        results.push({operationId:operation.id,status:'completed'});
      }else if(operation.kind==='withdrawal'&&['completed','failed'].includes(remote.status)){
        await withTransaction(async client=>{const locked=await client.query('SELECT * FROM money_operations WHERE id=$1 FOR UPDATE',[operation.id]);if(!['sent','pending','under_review'].includes(locked.rows[0].status))return;const amount=Number(operation.amount_cents),fee=Number(operation.fee_cents);await appendLedger(client,{operationId:operation.id,userId:operation.user_id,bucket:'withdrawal_processing',entryType:remote.status==='completed'?'withdrawal_completed':'withdrawal_rejected',amountCents:-amount,provider:provider.name,externalId:operation.external_id});if(remote.status==='failed'){await appendLedger(client,{operationId:operation.id,userId:operation.user_id,bucket:'available',entryType:'withdrawal_rejected_refund',amountCents:amount+fee,provider:provider.name,externalId:operation.external_id});if(fee)await appendLedger(client,{operationId:operation.id,ownerType:'platform',bucket:'commission',entryType:'withdrawal_fee_reversal',amountCents:-fee,provider:provider.name,externalId:operation.external_id});}await client.query('UPDATE money_operations SET status=$2,updated_at=now() WHERE id=$1',[operation.id,remote.status]);});
        results.push({operationId:operation.id,status:remote.status});
      }
    }catch(error){results.push({operationId:operation.id,status:'retry',error:String(error.message).slice(0,120)});}
  }
  return results;
}
