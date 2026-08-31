import https from 'node:https';
import { sha256 } from '../security.js';

const centsToBrl = cents => (cents / 100).toFixed(2);

function requestJson(url, { method = 'GET', headers = {}, body, pfx, passphrase } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method,
      pfx,
      passphrase,
      rejectUnauthorized: true,
      headers: { accept: 'application/json', ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}), ...headers }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw: raw.slice(0, 500) }; }
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve({ status: response.statusCode, data, headers: response.headers });
        const error = new Error(data.mensagem || data.detail || data.title || `Efí respondeu HTTP ${response.statusCode}.`);
        error.statusCode = response.statusCode;
        error.providerResponse = data;
        reject(error);
      });
    });
    req.setTimeout(15_000, () => req.destroy(new Error('Timeout na comunicação com a Efí.')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export class EfiPixProvider {
  constructor(env = process.env) {
    this.name = 'efi';
    this.baseUrl = env.EFI_API_BASE_URL || (env.EFI_SANDBOX === 'false' ? 'https://pix.api.efipay.com.br' : 'https://pix-h.api.efipay.com.br');
    this.clientId = env.EFI_CLIENT_ID;
    this.clientSecret = env.EFI_CLIENT_SECRET;
    this.pixKey = env.EFI_PIX_KEY;
    this.pfx = env.EFI_CERTIFICATE_BASE64 ? Buffer.from(env.EFI_CERTIFICATE_BASE64, 'base64') : null;
    this.passphrase = env.EFI_CERTIFICATE_PASSPHRASE || undefined;
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  assertConfigured() {
    if (![this.clientId, this.clientSecret, this.pixKey, this.pfx].every(Boolean)) throw Object.assign(new Error('Credenciais/certificado Efí ausentes.'), { code: 'PROVIDER_NOT_CONFIGURED', statusCode: 503 });
  }

  async token() {
    this.assertConfigured();
    if (this.accessToken && this.tokenExpiresAt > Date.now() + 30_000) return this.accessToken;
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await requestJson(`${this.baseUrl}/oauth/token`, { method: 'POST', pfx: this.pfx, passphrase: this.passphrase, headers: { authorization: `Basic ${credentials}` }, body: { grant_type: 'client_credentials' } });
    this.accessToken = response.data.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(60, Number(response.data.expires_in || 300) - 30) * 1_000;
    return this.accessToken;
  }

  async request(path, options = {}) {
    const token = await this.token();
    return requestJson(`${this.baseUrl}${path}`, { ...options, pfx: this.pfx, passphrase: this.passphrase, headers: { authorization: `Bearer ${token}`, ...options.headers } });
  }

  async createDeposit({ idempotencyKey, amountCents, user }) {
    const txid = `LEXORA${sha256(idempotencyKey).slice(0, 29)}`;
    const response = await this.request(`/v2/cob/${txid}`, { method: 'PUT', body: {
      calendario: { expiracao: 3_600 },
      devedor: { cpf: String(user.cpf).replace(/\D/g, ''), nome: user.name },
      valor: { original: centsToBrl(amountCents) },
      chave: this.pixKey,
      solicitacaoPagador: 'Depósito na carteira Lexora Arena'
    } });
    return { externalId: txid, status: 'pending', location: response.data.location, providerPayload: { calendario: response.data.calendario, location: response.data.location } };
  }

  async getDeposit(externalId) {
    const response = await this.request(`/v2/cob/${encodeURIComponent(externalId)}`);
    return { externalId, status: response.data.status === 'CONCLUIDA' ? 'confirmed' : 'pending', providerPayload: response.data };
  }

  async refundDeposit({ e2eId, refundId, amountCents }) {
    const id = sha256(refundId).slice(0, 35);
    const response = await this.request(`/v2/pix/${encodeURIComponent(e2eId)}/devolucao/${id}`, { method: 'PUT', body: { valor: centsToBrl(amountCents) } });
    return { externalId: id, status: String(response.data.status || '').toUpperCase() === 'DEVOLVIDO' ? 'completed' : 'pending', providerPayload: response.data };
  }

  async createWithdrawal({ idempotencyKey, amountCents, pixKey, cpf }) {
    const idEnvio = sha256(idempotencyKey).slice(0, 32);
    const response = await this.request(`/v3/gn/pix/${idEnvio}`, { method: 'PUT', body: {
      valor: centsToBrl(amountCents),
      pagador: { chave: this.pixKey, infoPagador: 'Saque Lexora Arena' },
      favorecido: { chave: pixKey, cpf: String(cpf).replace(/\D/g, '') }
    } });
    return { externalId: idEnvio, e2eId: response.data.e2eId, status: 'sent', providerPayload: { status: response.data.status, horario: response.data.horario } };
  }

  async getWithdrawal(externalId) {
    const response = await this.request(`/v2/gn/pix/enviados/id-envio/${encodeURIComponent(externalId)}`);
    const map = { REALIZADO: 'completed', EM_PROCESSAMENTO: 'sent', NAO_REALIZADO: 'failed' };
    return { externalId, status: map[response.data.status] || 'pending', providerPayload: response.data };
  }
}

export function createPaymentProvider() {
  if ((process.env.PAYMENT_PROVIDER || 'disabled') !== 'efi') throw Object.assign(new Error('Nenhum provedor financeiro de produção selecionado.'), { code: 'PROVIDER_DISABLED', statusCode: 503 });
  return new EfiPixProvider();
}
