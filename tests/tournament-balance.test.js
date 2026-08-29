/** Regression: an authenticated player with exactly the entry fee can join. */
import assert from 'node:assert/strict';

const BASE_URL = 'http://127.0.0.1:8080';

async function request(path, token, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}

const unique = Date.now();
const registration = await request('/api/auth/register', null, {
  username: `torneio_${unique}`,
  email: `torneio_${unique}@lexora.test`,
  password: 'senha_segura_123'
});
assert.equal(registration.status, 201);
const token = registration.data.token;

const deposit = await request('/api/wallet/deposit/create', token, { amount: 20 });
assert.equal(deposit.status, 200);

const payment = await request('/api/wallet/deposit/simulate-pay', token, {
  transactionId: deposit.data.transactionId
});
assert.equal(payment.status, 200);
assert.equal(payment.data.newBalance, 20);

const join = await request('/api/tournaments/join', token, {
  tournamentId: 'tour_daily_major'
});
assert.equal(join.status, 200, join.data.error);
assert.equal(join.data.newBalance, 0);

console.log('✓ Depósito de R$ 20 permite inscrição de R$ 20 e deixa saldo R$ 0.');
