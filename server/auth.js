/**
 * Neon Fortune Slots - Authentication & Security Module
 * Criptografia de senhas (scrypt) e assinatura JWT nativa sem dependências externas.
 */

import crypto from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'neon_fortune_slots_super_secret_key_2026_jwt';
const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 dias

/**
 * Gera hash criptográfico seguro para a senha
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

/**
 * Valida a senha comparando com o hash e salt armazenados
 */
export function verifyPassword(password, hash, salt) {
  try {
    const key = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(hash));
  } catch {
    return false;
  }
}

/**
 * Gera um token JWT com algoritmo HS256
 */
export function createToken(payload) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const exp = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const fullPayload = { ...payload, exp };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Valida e decodifica um token JWT
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;

  // Recalcular assinatura esperada
  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  if (signature !== expectedSignature) {
    return null; // Assinatura inválida / token adulterado
  }

  try {
    const payloadJson = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    // Verificar expiração
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Token expirado
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extrai o token do cabeçalho HTTP Authorization: Bearer <token>
 */
export function extractTokenFromHeader(authHeader) {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }
  return null;
}
