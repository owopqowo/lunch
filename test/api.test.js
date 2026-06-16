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

test('POST /api/menus는 메뉴를 생성하고 201을 반환한다', async () => {
  const app = await freshApp();
  const res = await request(app)
    .post('/api/menus')
    .send({ name: '김치찌개', description: '든든한 한 끼' });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, '김치찌개');
  assert.equal(res.body.votes, 0);
});

test('POST /api/menus는 name이 없으면 400을 반환한다', async () => {
  const app = await freshApp();
  const res = await request(app).post('/api/menus').send({ description: '설명만' });
  assert.equal(res.status, 400);
});
