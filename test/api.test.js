import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeClient, initSchema } from '../db.js';
import { createApp } from '../app.js';

async function freshApp() {
  const client = makeClient({ url: ':memory:' });
  await initSchema(client);
  return createApp(client);
}

test('GET /api/menus는 처음엔 빈 배열을 반환한다', async () => {
  const app = await freshApp();
  const res = await request(app).get('/api/menus');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});
