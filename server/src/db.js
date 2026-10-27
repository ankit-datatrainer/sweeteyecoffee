import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  // Laravel stores timestamps as UTC strings; keep them as strings and convert explicitly.
  dateStrings: true,
  decimalNumbers: true,
  charset: 'utf8mb4',
});

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function first(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/** Run `fn(conn)` inside a transaction; commits on success, rolls back on any error. */
export async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/** Current time as a UTC "YYYY-MM-DD HH:mm:ss" string, the format Laravel writes. */
export function nowUtc(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** "YYYY-MM-DD HH:mm:ss" (UTC, as stored) → ISO-8601, or null. */
export function toIso(value) {
  return value ? `${String(value).replace(' ', 'T')}Z` : null;
}
