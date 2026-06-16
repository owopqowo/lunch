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
}
