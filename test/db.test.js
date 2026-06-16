import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient, initSchema } from '../db.js';

test('initSchema는 menus 테이블을 만들고 초기엔 비어있다', async () => {
  const client = makeClient({ url: ':memory:' });
  await initSchema(client);
  const result = await client.execute('SELECT * FROM menus');
  assert.equal(result.rows.length, 0);
});
