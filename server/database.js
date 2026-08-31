import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const migrationsUrl = new URL('../migrations/', import.meta.url);
let pool;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase() {
  if (!databaseConfigured()) throw Object.assign(new Error('DATABASE_URL não configurada.'), { code: 'DATABASE_NOT_CONFIGURED', statusCode: 503 });
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number.parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined
    });
  }
  return pool;
}

export async function withTransaction(callback, { isolation = 'SERIALIZABLE' } = {}) {
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations() {
  const directory=fileURLToPath(migrationsUrl),files=(await readdir(directory)).filter(file=>/^\d+_.+\.sql$/.test(file)).sort();
  for(const file of files){const sql=await readFile(new URL(file,migrationsUrl),'utf8');await getDatabase().query(sql);}
  return files;
}

export async function checkDatabase() {
  if (!databaseConfigured()) return { configured: false, ready: false };
  try {
    const result = await getDatabase().query('SELECT current_database() AS database, now() AS checked_at');
    return { configured: true, ready: true, database: result.rows[0].database, checkedAt: result.rows[0].checked_at };
  } catch (error) {
    return { configured: true, ready: false, error: String(error.code || error.message).slice(0, 80) };
  }
}

export async function closeDatabase() {
  if (pool) await pool.end();
  pool = undefined;
}
