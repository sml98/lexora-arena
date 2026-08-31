import { getDatabase, withTransaction } from './database.js';
import { encryptSensitive } from './security.js';

export async function persistFinancialMatch(match) {
  if (!match.financial) return;
  await withTransaction(async client => {
    await client.query(`INSERT INTO matches
      (id,mode,language,status,financial,entry_cents,gross_pot_cents,commission_cents,prize_cents,challenge_id,challenge_commit_hash,challenge_ciphertext,created_at)
      VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10,$11,to_timestamp($12/1000.0))`,
    [match.id,match.mode,match.language,match.status,match.financial.entryCents,match.financial.grossPotCents,match.financial.commissionCents,match.financial.winnerPrizeCents,match.proof.challengeId,match.proof.commitHash,encryptSensitive(JSON.stringify({challenge:match.challenge.sessionOptions,nonce:match.proof.nonce})),match.createdAt]);
    for (const userId of match.financial.playerIds) await client.query('INSERT INTO match_players(match_id,user_id) VALUES ($1,$2)', [match.id,userId]);
    for (const event of match.events) await insertEvent(client,match,event);
  });
}

async function insertEvent(client,match,event) {
  const playerIndex=event.playerId?match.playerIds.indexOf(event.playerId):-1,userId=playerIndex>=0?match.financial.playerIds[playerIndex]:null;
  const safePayload={...event};delete safePayload.id;delete safePayload.index;delete safePayload.type;delete safePayload.at;delete safePayload.playerId;delete safePayload.previousHash;delete safePayload.integrityHash;
  await client.query(`INSERT INTO match_events(id,match_id,event_index,user_id,event_type,safe_payload,previous_hash,integrity_hash,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(match_id,event_index) DO NOTHING`, [event.id,match.id,event.index,userId,event.type,JSON.stringify(safePayload),event.previousHash,event.integrityHash,event.at]);
}

export async function persistLatestFinancialEvent(match) {
  if (!match.financial) return;
  const event=match.events.at(-1);if(!event)return;
  await withTransaction(client=>insertEvent(client,match,event));
}

export async function completeFinancialMatchRecord(match) {
  if (!match.financial) return;
  await withTransaction(async client => {
    const existing=await client.query('SELECT challenge_commit_hash FROM matches WHERE id=$1 FOR UPDATE',[match.id]);
    if(!existing.rows[0]||existing.rows[0].challenge_commit_hash!==match.proof.commitHash)throw new Error('Compromisso de integridade da partida não confere.');
    for(const event of match.events)await insertEvent(client,match,event);
    const winnerIndex=match.playerIds.indexOf(match.winnerId),winnerId=winnerIndex>=0?match.financial.playerIds[winnerIndex]:null;
    await client.query(`UPDATE matches SET status='ended',winner_id=$2,tie=$3,finish_reason=$4,challenge_reveal=$5,ended_at=to_timestamp($6/1000.0)
      WHERE id=$1`,[match.id,winnerId,match.tie,match.finishReason,JSON.stringify({challenge:match.challenge.sessionOptions,nonce:match.proof.nonce}),match.endedAt]);
    for(let index=0;index<match.playerIds.length;index++){
      const state=match.players.get(match.playerIds[index]);
      await client.query('UPDATE match_players SET score=$3,elapsed_ms=$4,result=$5 WHERE match_id=$1 AND user_id=$2',[match.id,match.financial.playerIds[index],state.score,state.elapsedMs,match.tie?'draw':match.winnerId===match.playerIds[index]?'win':'loss']);
    }
  });
}

export async function markFinancialMatchSettled(matchId,status='settled') {
  await getDatabase().query("UPDATE matches SET status=$2,settled_at=CASE WHEN $2='settled' THEN now() ELSE settled_at END WHERE id=$1",[matchId,status]);
}
