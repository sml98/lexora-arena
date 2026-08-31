const $ = (selector, root = document) => root.querySelector(selector);
const element = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
};
const money = cents => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
let status = null;
let token = sessionStorage.getItem('lexora_financial_token') || '';

async function api(path, { method = 'GET', body, auth = true, idempotency = false } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (auth && token) headers.authorization = `Bearer ${token}`;
  if (idempotency) headers['idempotency-key'] = crypto.randomUUID();
  const response = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Operação financeira recusada.');
  return payload;
}

async function initialize() {
  try {
    status = await api('/api/finance/status', { auth: false });
    const button = $('#financeOpenBtn');
    button.hidden = !status.enabled;
    if (status.enabled) button.addEventListener('click', openWallet);
  } catch {}
}

function field(name, label, type = 'text') {
  const wrapper = element('label', 'finance-field');
  const input = element('input');
  input.name = name;
  input.type = type;
  input.required = true;
  wrapper.append(element('span', '', label), input);
  return wrapper;
}

async function openWallet() {
  const overlay = element('div', 'finance-overlay');
  const dialog = element('section', 'finance-dialog');
  const header = element('header');
  const title = element('div');
  const close = element('button', '', '×');
  title.append(element('span', 'eyebrow', 'CARTEIRA FINANCEIRA'), element('h2', '', 'Lexora Arena'));
  close.type = 'button';
  close.setAttribute('aria-label', 'Fechar');
  close.addEventListener('click', () => overlay.remove());
  header.append(title, close);
  dialog.append(header);
  overlay.append(dialog);
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  if (token) await renderWallet(dialog);
  else renderAuth(dialog);
}

function renderAuth(dialog) {
  const tabs = element('div', 'finance-tabs');
  const loginButton = element('button', 'active', 'Entrar');
  const registerButton = element('button', '', 'Criar conta');
  const content = element('div', 'finance-content');
  tabs.append(loginButton, registerButton);
  dialog.append(tabs, content);
  const select = kind => {
    loginButton.classList.toggle('active', kind === 'login');
    registerButton.classList.toggle('active', kind === 'register');
    if (kind === 'login') renderLogin(content, dialog);
    else renderRegister(content);
  };
  loginButton.addEventListener('click', () => select('login'));
  registerButton.addEventListener('click', () => select('register'));
  select('login');
}

function renderLogin(content, dialog) {
  content.replaceChildren();
  const form = element('form', 'finance-form');
  form.append(field('email', 'E-mail', 'email'), field('password', 'Senha', 'password'));
  const submit = element('button', 'primary', 'Entrar com segurança');
  form.append(submit);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const result = await api('/api/financial/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(form)), auth: false });
      token = result.token;
      sessionStorage.setItem('lexora_financial_token', token);
      content.remove();
      $('.finance-tabs', dialog)?.remove();
      await renderWallet(dialog);
    } catch (error) { window.LexoraUI?.toast(error.message, 'error'); }
    finally { submit.disabled = false; }
  });
  content.append(form, element('p', 'finance-note', 'Apenas contas ativas, verificadas e com KYC aprovado podem operar.'));
}

function renderRegister(content) {
  content.replaceChildren();
  const form = element('form', 'finance-form finance-register');
  for (const spec of [['name','Nome completo'],['email','E-mail','email'],['phone','Telefone com DDD'],['cpf','CPF'],['birthDate','Data de nascimento','date'],['password','Senha com 12+ caracteres','password']]) form.append(field(...spec));
  for (const [name, label] of [['termsAccepted','Li e aceito os termos aprovados'],['privacyAccepted','Li e aceito a política de privacidade aprovada']]) {
    const wrapper = element('label', 'finance-check');
    const input = element('input');
    input.type = 'checkbox'; input.name = name;
    wrapper.append(input, element('span', '', label));
    form.append(wrapper);
  }
  const submit = element('button', 'primary', 'Enviar cadastro');
  form.append(submit);
  form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      data.termsAccepted = data.termsAccepted === 'on'; data.privacyAccepted = data.privacyAccepted === 'on';
      await api('/api/financial/auth/register', { method: 'POST', body: data, auth: false });
      window.LexoraUI?.modal('Cadastro recebido', 'Confirme seus contatos e conclua o KYC pelo provedor configurado. Nenhuma operação é liberada antes da aprovação.', '✓');
      form.reset();
    } catch (error) { window.LexoraUI?.toast(error.message, 'error'); }
    finally { submit.disabled = false; }
  });
  content.append(form, element('p', 'finance-note', 'Restrito a maiores de 18 anos. CPF é cifrado e nunca deve aparecer em logs.'));
}

function addMoneyOperations(content) {
  const section = element('section', 'wallet-operations');
  const depositForm = element('form');
  const deposit = element('input');
  const depositButton = element('button', 'primary', 'Gerar Pix');
  deposit.type = 'number'; deposit.min = '0.01'; deposit.step = '0.01'; deposit.placeholder = 'Valor do depósito (R$)';
  depositForm.append(deposit, depositButton);
  depositForm.addEventListener('submit', async event => {
    event.preventDefault(); depositButton.disabled = true;
    try {
      const amountCents = Math.round(Number(deposit.value) * 100);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Informe um valor válido.');
      const result = await api('/api/wallet/deposits', { method: 'POST', body: { amountCents }, idempotency: true });
      window.LexoraUI?.modal('Cobrança Pix criada', `Status: ${result.operation.status}. O saldo só será creditado após webhook ou reconciliação confirmada.`, 'PIX');
    } catch (error) { window.LexoraUI?.toast(error.message, 'error'); }
    finally { depositButton.disabled = false; }
  });

  const withdrawForm = element('form');
  const withdraw = element('input');
  const pixKey = element('input');
  const withdrawButton = element('button', '', 'Solicitar saque');
  withdraw.type = 'number'; withdraw.min = String(status.minWithdrawalCents / 100); withdraw.step = '0.01'; withdraw.placeholder = `Saque mínimo ${money(status.minWithdrawalCents)}`;
  pixKey.placeholder = 'Chave Pix da sua titularidade';
  withdrawForm.append(withdraw, pixKey, withdrawButton);
  withdrawForm.addEventListener('submit', async event => {
    event.preventDefault(); withdrawButton.disabled = true;
    try {
      const amountCents = Math.round(Number(withdraw.value) * 100);
      if (!confirm(`Solicitar saque de ${money(amountCents)} para uma chave validada como sua?`)) return;
      const result = await api('/api/wallet/withdrawals', { method: 'POST', body: { amountCents, pixKey: pixKey.value }, idempotency: true });
      window.LexoraUI?.modal('Saque solicitado', `Status: ${result.operation.status}. Acompanhe o histórico da carteira.`, 'PIX');
    } catch (error) { window.LexoraUI?.toast(error.message, 'error'); }
    finally { withdrawButton.disabled = false; }
  });
  section.append(element('h3', '', 'Depósito e saque Pix'), element('p', '', 'Valores só mudam após confirmação do provedor. Saque exige chave da mesma titularidade.'), depositForm, withdrawForm);
  content.append(section);
}

function addFinancialPlay(content, dialog) {
  const play = element('section', 'financial-play');
  play.append(element('h3', '', 'Entrar em duelo financeiro'), element('p', '', `Comissão transparente: ${status.commissionPercent}%. A revanche nunca confirma nova entrada automaticamente.`));
  const controls = element('div', 'financial-controls');
  const mode = element('select');
  const entry = element('select');
  const button = element('button', 'primary', 'Ver composição e confirmar');
  for (const [value,label] of [['quarteto','Quarteto'],['contexto','Contexto']]) { const option=element('option','',label); option.value=value; mode.append(option); }
  for (const cents of [200,500,1000]) { const option=element('option','',money(cents)); option.value=String(cents); entry.append(option); }
  button.addEventListener('click', async () => {
    try {
      const quote = await api(`/api/finance/quote?entryCents=${entry.value}`, { auth: false });
      const text = `Entrada: ${money(quote.entryCents)} por jogador\nPote: ${money(quote.grossPotCents)}\nComissão Lexora (${quote.commissionPercent}%): ${money(quote.commissionCents)}\nPrêmio do vencedor: ${money(quote.winnerPrizeCents)}\n\nConfirmar esta entrada?`;
      if (!confirm(text)) return;
      dialog.closest('.finance-overlay').remove();
      await window.LexoraPvp.joinFinancialQueue(mode.value, quote.entryCents, token);
    } catch (error) { window.LexoraUI?.toast(error.message, 'error'); }
  });
  controls.append(mode, entry, button); play.append(controls); content.append(play);
}

async function renderWallet(dialog) {
  try {
    const wallet = await api('/api/wallet');
    const content = element('div', 'finance-content');
    const balances = element('div', 'wallet-balances');
    for (const [bucket,label] of [['available','Disponível'],['locked','Bloqueado'],['prize_pending','Prêmio pendente'],['withdrawal_processing','Saque em processamento']]) {
      const card = element('div'); card.append(element('span', '', label), element('strong', '', money(wallet.balances[bucket]))); balances.append(card);
    }
    content.append(balances); addMoneyOperations(content); addFinancialPlay(content, dialog);
    const logout = element('button', 'finance-logout', 'Sair da carteira');
    logout.addEventListener('click', () => { token=''; sessionStorage.removeItem('lexora_financial_token'); dialog.closest('.finance-overlay').remove(); });
    content.append(logout); dialog.append(content);
  } catch (error) {
    token=''; sessionStorage.removeItem('lexora_financial_token'); window.LexoraUI?.toast(error.message, 'error'); dialog.closest('.finance-overlay')?.remove();
  }
}

initialize();
