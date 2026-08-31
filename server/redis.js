import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';

let client;

export function redisConfigured() {
  return Boolean(process.env.REDIS_URL);
}

export async function getRedis() {
  if (!redisConfigured()) throw Object.assign(new Error('REDIS_URL não configurada.'), { code: 'REDIS_NOT_CONFIGURED', statusCode: 503 });
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 5_000, reconnectStrategy: retries => Math.min(retries * 100, 3_000) } });
    client.on('error', error => console.error(JSON.stringify({ level: 'error', event: 'redis_error', code: error.code })));
  }
  if (!client.isOpen) await client.connect();
  return client;
}

export async function checkRedis() {
  if (!redisConfigured()) return { configured: false, ready: false };
  try {
    const redis = await getRedis();
    return { configured: true, ready: (await redis.ping()) === 'PONG' };
  } catch (error) {
    return { configured: true, ready: false, error: String(error.code || error.message).slice(0, 80) };
  }
}

export async function withDistributedLock(key, ttlMs, callback) {
  const redis = await getRedis();
  const token = randomUUID();
  const acquired = await redis.set(`lock:${key}`, token, { NX: true, PX: ttlMs });
  if (!acquired) throw Object.assign(new Error('Operação concorrente em andamento.'), { code: 'LOCK_BUSY', statusCode: 409 });
  try { return await callback(); }
  finally {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", { keys: [`lock:${key}`], arguments: [token] });
  }
}

export async function closeRedis() {
  if (client?.isOpen) await client.quit();
  client = undefined;
}
