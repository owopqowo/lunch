import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient, initSchema } from '../db.js';

test('initSchema는 menus 테이블을 만들고 초기엔 비어있다', async () => {
  const client = makeClient({ url: ':memory:' });
  await initSchema(client);
  const result = await client.execute('SELECT * FROM menus');
  assert.equal(result.rows.length, 0);
});

test('initSchema는 menus에 category 컬럼을 추가한다', async () => {
  const client = makeClient({ url: ':memory:' });
  await initSchema(client);
  const cols = await client.execute('PRAGMA table_info(menus)');
  const names = cols.rows.map((r) => r.name);
  assert.ok(names.includes('category'), 'category 컬럼이 있어야 한다');
});

test('initSchema는 category 컬럼이 이미 있어도 재실행 시 깨지지 않는다', async () => {
  const client = makeClient({ url: ':memory:' });
  await initSchema(client);
  await initSchema(client); // 두 번째 호출이 throw하지 않아야 함
  const cols = await client.execute('PRAGMA table_info(menus)');
  const names = cols.rows.map((r) => r.name);
  assert.equal(names.filter((n) => n === 'category').length, 1);
});
