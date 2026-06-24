import { createClient } from '@libsql/client';

export function makeClient({ url, authToken } = {}) {
  return createClient({ url, authToken });
}

export async function initSchema(client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS menus (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT,
      votes       INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    DEFAULT (datetime('now'))
    )
  `);
  // 기존 테이블에는 CREATE TABLE IF NOT EXISTS로 컬럼이 안 붙으므로 별도 마이그레이션.
  const cols = await client.execute('PRAGMA table_info(menus)');
  const hasCategory = cols.rows.some((r) => r.name === 'category');
  if (!hasCategory) {
    await client.execute('ALTER TABLE menus ADD COLUMN category TEXT');
  }
}
