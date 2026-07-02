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

  // 추가·수정·삭제는 직접 반영하지 않고 요청으로 쌓아 관리자가 검토한다.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT    NOT NULL,                       -- 'add' | 'edit' | 'delete'
      menu_id     INTEGER,                                -- edit/delete 대상 메뉴 (add는 null)
      name        TEXT,                                   -- add/edit: 제안하는 식당 이름
      description TEXT,                                   -- add/edit: 제안하는 메뉴 설명
      reason      TEXT,                                   -- 요청 사유 (선택)
      status      TEXT    NOT NULL DEFAULT 'pending',     -- 'pending' | 'approved' | 'rejected'
      created_at  TEXT    DEFAULT (datetime('now'))
    )
  `);

  // 한줄평은 requests와 달리 즉시 반영된다(덧붙이는 콘텐츠라 어뷰징 표면이 작다).
  await client.execute(`
    CREATE TABLE IF NOT EXISTS reviews (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_id    INTEGER NOT NULL,                        -- 대상 식당 (menus.id)
      body       TEXT    NOT NULL,                        -- 한줄평 본문 (텍스트, ≤100자)
      device_id  TEXT,                                    -- 익명 식별자 (도배 최소 방지용)
      created_at TEXT    DEFAULT (datetime('now'))
    )
  `);
}

// 식당명을 정규화한다(공백 제거 + 소문자). 중복 판정의 기준.
export function normalizeName(name) {
  return (name ?? '').replace(/\s+/g, '').toLowerCase();
}

// 같은 이름(정규화 기준)의 식당이 이미 있는지 확인한다.
// excludeId가 주어지면 그 id는 제외(자기 자신과의 충돌 방지).
export async function isDuplicateName(client, name, excludeId = null) {
  const sql = excludeId == null
    ? "SELECT id FROM menus WHERE lower(replace(name, ' ', '')) = lower(replace(?, ' ', ''))"
    : "SELECT id FROM menus WHERE lower(replace(name, ' ', '')) = lower(replace(?, ' ', '')) AND id != ?";
  const args = excludeId == null ? [name] : [name, excludeId];
  const dup = await client.execute({ sql, args });
  return dup.rows.length > 0;
}

// menus에 식당을 실제로 추가한다. menus에 INSERT하는 유일한 경로.
// 라우트 핸들러(외부 호출)와 분리해, 승인 처리 같은 신뢰된 코드에서만 호출한다.
// 결과는 { ok, status, row?, error? } 형태로 돌려준다.
export async function createMenu(client, { name, description, category } = {}) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) {
    return { ok: false, status: 400, error: 'name is required' };
  }
  if (await isDuplicateName(client, trimmed)) {
    return { ok: false, status: 409, error: 'duplicate' };
  }
  const result = await client.execute({
    sql: 'INSERT INTO menus (name, description, category) VALUES (?, ?, ?) RETURNING *',
    args: [
      trimmed,
      (typeof description === 'string' && description.trim()) ? description.trim() : null,
      (typeof category === 'string' && category.trim()) ? category.trim() : null,
    ],
  });
  return { ok: true, status: 201, row: result.rows[0] };
}
