import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const normalizeCpf = value => String(value || '').replace(/\D/g, '');

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(value, secret) {
  if (!secret) throw new Error('Segredo HMAC ausente.');
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function safeEqualHex(left, right) {
  try {
    const a = Buffer.from(String(left), 'hex');
    const b = Buffer.from(String(right), 'hex');
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  } catch { return false; }
}

export function validateCpf(value) {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = length => {
    let sum = 0;
    for (let index = 0; index < length; index++) sum += Number(cpf[index]) * (length + 1 - index);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function ageOnDate(birthDate, reference = new Date()) {
  const birth = new Date(`${birthDate}T12:00:00Z`);
  if (Number.isNaN(birth.getTime())) return -1;
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = reference.getUTCMonth() < birth.getUTCMonth() || (reference.getUTCMonth() === birth.getUTCMonth() && reference.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

export async function hashPassword(password) {
  const value = String(password || '');
  if (value.length < 12 || value.length > 128) throw new Error('A senha deve ter entre 12 e 128 caracteres.');
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${Buffer.from(derived).toString('base64')}`;
}

export async function verifyPassword(password, encoded) {
  const [algorithm, n, r, p, salt64, expected64] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !salt64 || !expected64) return false;
  const expected = Buffer.from(expected64, 'base64');
  const actual = await scrypt(String(password || ''), Buffer.from(salt64, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(expected, Buffer.from(actual));
}

function encryptionKey() {
  const source = process.env.DATA_ENCRYPTION_KEY;
  if (!source || source.length < 32) throw new Error('DATA_ENCRYPTION_KEY não configurada com segurança.');
  return createHash('sha256').update(source).digest();
}

export function encryptSensitive(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(buffer => buffer.toString('base64url')).join('.');
}

export function decryptSensitive(payload) {
  const [iv64, tag64, encrypted64] = String(payload || '').split('.');
  if (!iv64 || !tag64 || !encrypted64) throw new Error('Dado criptografado inválido.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted64, 'base64url')), decipher.final()]).toString('utf8');
}

export function cpfLookupHash(cpf) {
  if (!validateCpf(cpf)) throw new Error('CPF inválido.');
  const secret = process.env.CPF_LOOKUP_SECRET;
  if (!secret || secret.length < 32) throw new Error('CPF_LOOKUP_SECRET não configurado com segurança.');
  return hmacSha256(normalizeCpf(cpf), secret);
}

export function generateOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function tokenHash(token) {
  return sha256(String(token || ''));
}

export function verifyWebhookEnvelope(rawBody, headers) {
  const proxyProof = headers['x-lexora-mtls-verified'];
  const proxyExpected = hmacSha256('efi-mtls-verified', process.env.WEBHOOK_TRUSTED_PROXY_SECRET);
  const signature = headers['x-lexora-webhook-signature'];
  const expected = hmacSha256(rawBody, process.env.WEBHOOK_SECRET);
  return safeEqualHex(proxyProof, proxyExpected) && safeEqualHex(signature, expected);
}
