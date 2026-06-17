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

test('POST /api/menus/:id/vote는 votes를 1 증가시킨다', async () => {
  const app = await freshApp();
  const created = await request(app).post('/api/menus').send({ name: '파스타' });
  const id = created.body.id;
  const res = await request(app).post(`/api/menus/${id}/vote`);
  assert.equal(res.status, 200);
  assert.equal(res.body.votes, 1);
});

test('POST /api/menus/:id/vote는 없는 id면 404를 반환한다', async () => {
  const app = await freshApp();
  const res = await request(app).post('/api/menus/9999/vote');
  assert.equal(res.status, 404);
});

test('GET /api/menus/random은 메뉴가 있으면 하나를 반환한다', async () => {
  const app = await freshApp();
  await request(app).post('/api/menus').send({ name: '돈까스' });
  const res = await request(app).get('/api/menus/random');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, '돈까스');
});

test('GET /api/menus/random은 메뉴가 없으면 404를 반환한다', async () => {
  const app = await freshApp();
  const res = await request(app).get('/api/menus/random');
  assert.equal(res.status, 404);
});

test('PATCH /api/menus/:id는 이름을 수정한다', async () => {
  const app = await freshApp();
  const created = await request(app).post('/api/menus').send({ name: '라면' });
  const res = await request(app)
    .patch(`/api/menus/${created.body.id}`)
    .send({ name: '진라면' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, '진라면');
});

test('PATCH /api/menus/:id는 없는 id면 404를 반환한다', async () => {
  const app = await freshApp();
  const res = await request(app).patch('/api/menus/9999').send({ name: 'x' });
  assert.equal(res.status, 404);
});

test('DELETE /api/menus/:id는 메뉴를 삭제하고 204를 반환한다', async () => {
  const app = await freshApp();
  const created = await request(app).post('/api/menus').send({ name: '제육' });
  const res = await request(app).delete(`/api/menus/${created.body.id}`);
  assert.equal(res.status, 204);
  const list = await request(app).get('/api/menus');
  assert.equal(list.body.length, 0);
});

test('DELETE /api/menus/:id는 없는 id면 404를 반환한다', async () => {
  const app = await freshApp();
  const res = await request(app).delete('/api/menus/9999');
  assert.equal(res.status, 404);
});

test('PATCH /api/menus/:id는 name이 null이면 크래시 없이 이름을 유지한다', async () => {
  const app = await freshApp();
  const created = await request(app).post('/api/menus').send({ name: '국밥' });
  const res = await request(app)
    .patch(`/api/menus/${created.body.id}`)
    .send({ name: null, description: '뜨끈한' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, '국밥');
  assert.equal(res.body.description, '뜨끈한');
});

test('PATCH /api/menus/:id는 공백 이름이면 400을 반환한다', async () => {
  const app = await freshApp();
  const created = await request(app).post('/api/menus').send({ name: '국밥' });
  const res = await request(app)
    .patch(`/api/menus/${created.body.id}`)
    .send({ name: '   ' });
  assert.equal(res.status, 400);
});

test('GET /api/config는 KAKAO_JS_KEY가 없으면 kakaoJsKey가 null이다', async () => {
  const prev = process.env.KAKAO_JS_KEY;
  delete process.env.KAKAO_JS_KEY;
  try {
    const app = await freshApp();
    const res = await request(app).get('/api/config');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { kakaoJsKey: null });
  } finally {
    if (prev !== undefined) process.env.KAKAO_JS_KEY = prev;
  }
});

test('GET /api/config는 KAKAO_JS_KEY가 있으면 그 값을 반환한다', async () => {
  const prev = process.env.KAKAO_JS_KEY;
  process.env.KAKAO_JS_KEY = 'test-js-key';
  try {
    const app = await freshApp();
    const res = await request(app).get('/api/config');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { kakaoJsKey: 'test-js-key' });
  } finally {
    if (prev !== undefined) process.env.KAKAO_JS_KEY = prev;
    else delete process.env.KAKAO_JS_KEY;
  }
});
