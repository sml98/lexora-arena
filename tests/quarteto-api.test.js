/**
 * Quarteto Bet - Testes Automatizados de API e Fluxo de Apostas
 */

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

const BASE_URL = 'http://127.0.0.1:8080';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('--- TESTE 1: Autenticação & Depósito PIX para Apostas no Quarteto ---');
  const user = {
    username: `leitor_${Date.now()}`,
    email: `palavras_${Date.now()}@cassino.com`,
    password: 'senha_segura_123'
  };

  const regRes = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(user)
  });
  assert(regRes.status === 201, 'Deve registrar usuário com sucesso');

  const token = regRes.data.token;
  const authHeaders = { Authorization: `Bearer ${token}` };

  // Depósito de R$ 100 via PIX Sandbox
  const depRes = await request('/api/wallet/deposit/create', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ amount: 100.00 })
  });
  assert(depRes.status === 200, 'Cobrança PIX gerada com sucesso');

  const payRes = await request('/api/wallet/deposit/simulate-pay', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ transactionId: depRes.data.transactionId })
  });
  assert(payRes.data.newBalance === 100.00, 'Saldo da carteira deve ser R$ 100,00');

  console.log('\n--- TESTE 2: Iniciar Partida de Quarteto Bet (POST /api/quarteto/start) ---');
  const startRes = await request('/api/quarteto/start', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      mode: 'pot_decay',
      betAmount: 20.00
    })
  });

  assert(startRes.status === 200, 'Deve iniciar partida do Quarteto Bet');
  assert(startRes.data.newBalance === 80.00, 'Saldo deve deduzir R$ 20,00 da aposta inicial');
  assert(startRes.data.round.id, 'Deve retornar ID de partida ativo');
  assert(startRes.data.round.quadrants.length === 4, 'Deve conter exatamente 4 quadrantes');
  assert(startRes.data.round.quadrants[0].secret === null, 'A palavra secreta NÃO deve vazar para o cliente');

  const roundId = startRes.data.round.id;

  console.log('\n--- TESTE 3: Enviar Chute de Palavra (POST /api/quarteto/guess) ---');
  const guessRes = await request('/api/quarteto/guess', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      roundId,
      guess: 'TERMO'
    })
  });

  assert(guessRes.status === 200, 'Chute deve ser processado com sucesso');
  assert(guessRes.data.round.attemptsCount === 1, 'Contagem de tentativas deve ser 1');
  assert(guessRes.data.round.quadrants[0].guesses.length === 1, 'Quadrante deve ter 1 linha de chute avaliada');
  assert(guessRes.data.round.quadrants[0].guesses[0].tiles.length === 5, 'Cada linha deve ter 5 letras avaliadas');

  console.log('\n--- TESTE 4: Validação de Palavra Inexistente no Dicionário ---');
  const invalidRes = await request('/api/quarteto/guess', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      roundId,
      guess: 'ZZZZZ'
    })
  });

  assert(invalidRes.status === 400, 'Palavra inexistente deve retornar HTTP 400');
  assert(invalidRes.data.error.includes('dicionário'), 'Deve retornar mensagem de palavra não encontrada');

  console.log('\n======================================');
  console.log(`RESULTADO DOS TESTES DO BACKEND QUARTETO: ${passed} passaram, ${failed} falharam.`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('Todos os testes de API do Quarteto Bet passaram com sucesso!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
