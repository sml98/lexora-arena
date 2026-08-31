import { randomUUID } from 'node:crypto';
import { MONEY_CONFIG, assertRealMoneyReady } from './config.js';
import { getDatabase, withTransaction } from './database.js';
import { ageOnDate, cpfLookupHash, encryptSensitive, generateOpaqueToken, hashPassword, tokenHash, validateCpf, verifyPassword } from './security.js';

const clean = (value, max) => String(value || '').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const email = value => String(value || '').trim().toLowerCase();
const phone = value => String(value || '').replace(/[^\d+]/g, '');

export function validateRegistration(input, now = new Date()) {
  const data = {
    name: clean(input.name, 100),
    email: email(input.email),
    phone: phone(input.phone),
    cpf: String(input.cpf || '').replace(/\D/g, ''),
    birthDate: String(input.birthDate || ''),
    password: String(input.password || ''),
    termsAccepted: input.termsAccepted === true,
    privacyAccepted: input.privacyAccepted === true
  };
  if (data.name.length < 3) throw new Error('Informe o nome completo.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) throw new Error('E-mail inválido.');
  if (!/^\+?\d{10,15}$/.test(data.phone)) throw new Error('Telefone inválido.');
  if (!validateCpf(data.cpf)) throw new Error('CPF inválido.');
  if (ageOnDate(data.birthDate, now) < 18) throw Object.assign(new Error('A plataforma é restrita a maiores de 18 anos.'), { code: 'AGE_RESTRICTED' });
  if (data.password.length < 12 || data.password.length > 128) throw new Error('A senha deve ter entre 12 e 128 caracteres.');
  if (!data.termsAccepted || !data.privacyAccepted) throw new Error('É necessário aceitar os termos e a política de privacidade.');
  return data;
}

const publicUser = row => ({ id: row.id, name: row.name, email: row.email, phone: row.phone_e164, status: row.status, kycStatus: row.kyc_status, emailVerified: Boolean(row.email_verified_at), phoneVerified: Boolean(row.phone_verified_at), selfExcludedUntil: row.self_excluded_until, dailyEntryLimitCents: Number(row.daily_entry_limit_cents), dailyDepositLimitCents: Number(row.daily_deposit_limit_cents), createdAt: row.created_at });

export async function registerUser(input, context = {}) {
  assertRealMoneyReady('Cadastro financeiro');
  const data = validateRegistration(input);
  const passwordHash = await hashPassword(data.password);
  const userId = randomUUID();
  const cpfHash = cpfLookupHash(data.cpf);
  const cpfCiphertext = encryptSensitive(data.cpf);
  return withTransaction(async client => {
    const inserted = await client.query(`INSERT INTO users
      (id,name,email,phone_e164,password_hash,cpf_ciphertext,cpf_lookup_hash,birth_date,daily_entry_limit_cents,daily_deposit_limit_cents,terms_version,terms_accepted_at,privacy_version,privacy_accepted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),$12,now()) RETURNING *`,
    [userId, data.name, data.email, data.phone, passwordHash, cpfCiphertext, cpfHash, data.birthDate, MONEY_CONFIG.dailyEntryLimitCents, MONEY_CONFIG.dailyDepositLimitCents, context.termsVersion || '2026-08', context.privacyVersion || '2026-08']);
    for (const bucket of ['available','locked','prize_pending','withdrawal_processing']) {
      await client.query("INSERT INTO wallet_accounts(owner_type,owner_id,bucket,currency) VALUES ('user',$1,$2,'BRL')", [userId, bucket]);
    }
    return { user: publicUser(inserted.rows[0]) };
  });
}

export async function loginUser(input, requestMeta = {}) {
  assertRealMoneyReady('Autenticação financeira');
  const result = await getDatabase().query('SELECT * FROM users WHERE email=$1', [email(input.email)]);
  const user = result.rows[0];
  if (!user || !(await verifyPassword(input.password, user.password_hash))) throw Object.assign(new Error('Credenciais inválidas.'), { statusCode: 401 });
  if (user.status !== 'active') throw Object.assign(new Error(`Conta indisponível: ${user.status}.`), { statusCode: 403 });
  const token = generateOpaqueToken();
  await getDatabase().query(`INSERT INTO auth_sessions(user_id,token_hash,user_agent_hash,ip_hash,expires_at)
    VALUES ($1,$2,$3,$4,now()+interval '12 hours')`, [user.id, tokenHash(token), requestMeta.userAgentHash || null, requestMeta.ipHash || null]);
  return { token, expiresInSeconds: 43_200, user: publicUser(user) };
}

export async function authenticateFinancialRequest(req) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) throw Object.assign(new Error('Autenticação obrigatória.'), { statusCode: 401 });
  const result = await getDatabase().query(`SELECT u.*,s.id AS session_id FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`, [tokenHash(token)]);
  if (!result.rows[0]) throw Object.assign(new Error('Sessão inválida ou expirada.'), { statusCode: 401 });
  return result.rows[0];
}

export async function setSelfExclusion(userId, until) {
  const date = new Date(until);
  if (Number.isNaN(date.getTime()) || date <= new Date()) throw new Error('Informe uma data futura para a autoexclusão.');
  const result = await getDatabase().query("UPDATE users SET status='self_excluded',self_excluded_until=$2,updated_at=now() WHERE id=$1 RETURNING *", [userId, date]);
  return publicUser(result.rows[0]);
}

export async function setResponsibleLimits(userId, input) {
  const entry = Number.parseInt(input.dailyEntryLimitCents, 10);
  const deposit = Number.parseInt(input.dailyDepositLimitCents, 10);
  if (!Number.isInteger(entry) || entry <= 0 || !Number.isInteger(deposit) || deposit <= 0) throw new Error('Limites inválidos.');
  const current = await getDatabase().query('SELECT daily_entry_limit_cents,daily_deposit_limit_cents FROM users WHERE id=$1', [userId]);
  if (!current.rows[0]) throw new Error('Usuário não encontrado.');
  if (entry > Number(current.rows[0].daily_entry_limit_cents) || deposit > Number(current.rows[0].daily_deposit_limit_cents)) throw new Error('Aumentos de limite exigem fluxo de análise e período de espera.');
  const result = await getDatabase().query('UPDATE users SET daily_entry_limit_cents=$2,daily_deposit_limit_cents=$3,updated_at=now() WHERE id=$1 RETURNING *', [userId, entry, deposit]);
  return publicUser(result.rows[0]);
}
