/**
 * Neon Fortune Slots - Testes Automatizados de API e Banco de Dados
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
  console.log('--- TESTE 1: Cadastro de Novo Usuário (POST /api/auth/register) ---');
  const testUser = {
    username: `apostador_${Date.now()}`,
    email: `teste_${Date.now()}@cassino.com`,
    password: 'senha_segura_123'
  };

  const regRes = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(testUser)
  });

  assert(regRes.status === 201, 'Deve retornar status HTTP 201 (Created)');
  assert(regRes.data.token, 'Deve retornar token JWT');
  assert(regRes.data.user.username === testUser.username, 'Deve retornar o nome de usuário criado');
  assert(regRes.data.user.balance === 0, 'Novo usuário deve começar com saldo 0.00');

  const token = regRes.data.token;
  const authHeaders = { Authorization: `Bearer ${token}` };

  console.log('\n--- TESTE 2: Obter Perfil do Usuário Autenticado (GET /api/auth/me) ---');
  const meRes = await request('/api/auth/me', {
    method: 'GET',
    headers: authHeaders
  });

  assert(meRes.status === 200, 'Deve retornar status HTTP 200');
  assert(meRes.data.user.email === testUser.email, 'Deve retornar os dados do perfil correto');

  console.log('\n--- TESTE 3: Criar Depósito PIX Sandbox (POST /api/wallet/deposit/create) ---');
  const depRes = await request('/api/wallet/deposit/create', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ amount: 150.00 })
  });

  assert(depRes.status === 200, 'Deve gerar cobrança PIX com sucesso');
  assert(depRes.data.transactionId, 'Deve gerar ID de transação no banco de dados');
  assert(depRes.data.pixCode.startsWith('000201'), 'Deve gerar payload de PIX Copia e Cola válido');
  const txId = depRes.data.transactionId;

  console.log('\n--- TESTE 4: Simulação de Pagamento Bancário Instantâneo (POST /api/wallet/deposit/simulate-pay) ---');
  const payRes = await request('/api/wallet/deposit/simulate-pay', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ transactionId: txId })
  });

  assert(payRes.status === 200, 'Deve aprovar depósito no sandbox');
  assert(payRes.data.newBalance === 150.00, 'Saldo da carteira deve ser atualizado para R$ 150,00 no SQLite');

  console.log('\n--- TESTE 5: Giro com Aposta Deduzida do Saldo SQLite (POST /api/game/spin) ---');
  const spinRes = await request('/api/game/spin', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ betAmount: 20.00 })
  });

  assert(spinRes.status === 200, 'Deve processar giro no servidor com sucesso');
  assert(spinRes.data.previousBalance === 150.00, 'Saldo anterior deve ser R$ 150,00');
  assert(spinRes.data.newBalance >= 0, 'Novo saldo deve ser calculado no banco');

  console.log('\n--- TESTE 6: Saque via PIX (POST /api/wallet/withdraw) ---');
  const withdrawRes = await request('/api/wallet/withdraw', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      amount: 10.00,
      pixKey: 'usuario@banco.com',
      pixType: 'email'
    })
  });

  assert(withdrawRes.status === 200, 'Deve processar saque via PIX com sucesso');
  assert(withdrawRes.data.transactionId, 'Deve registrar transação de saque no SQLite');

  console.log('\n--- TESTE 7: Histórico de Transações Bancárias (GET /api/wallet/transactions) ---');
  const txListRes = await request('/api/wallet/transactions', {
    method: 'GET',
    headers: authHeaders
  });

  assert(txListRes.status === 200, 'Deve retornar histórico');
  assert(txListRes.data.transactions.length >= 2, 'Deve conter transações de depósito e saque gravadas');

  console.log('\n======================================');
  console.log(`RESULTADO DOS TESTES DE API: ${passed} passaram, ${failed} falharam.`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('Todos os testes de API, Autenticação e Banco de Dados passaram com sucesso!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
