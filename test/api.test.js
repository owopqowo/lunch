import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeClient, initSchema, createMenu } from '../db.js';
import { createApp } from '../app.js';

async function freshApp() {
  const client = makeClient({ url: ':memory:' });
  await initSchema(client);
  return { app: createApp(client), client };
}

// 외부 추가 경로(POST /api/menus)는 막혀 있으므로, 테스트 시드는
// 승인 처리와 동일하게 db.createMenu를 직접 호출해 menus에 넣는다.
async function seed(client, name, extra = {}) {
  const r = await createMenu(client, { name, ...extra });
  if (!r.ok) throw new Error(`seed 실패(${r.status}): ${name}`);
  return r.row;
}

test('GET /api/menus는 처음엔 빈 배열을 반환한다', async () => {
  const { app } = await freshApp();
  const res = await request(app).get('/api/menus');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

// 추가도 외부 직접 호출은 막는다(어뷰징 방지). 일반 사용자는 요청만 보낸다.
test('POST /api/menus는 외부 직접 추가를 403으로 막는다', async () => {
  const { app } = await freshApp();
  const res = await request(app)
    .post('/api/menus')
    .send({ name: '김치찌개', description: '든든한 한 끼' });
  assert.equal(res.status, 403);
  const list = await request(app).get('/api/menus');
  assert.equal(list.body.length, 0); // 추가되지 않는다
});

test('POST /api/menus/:id/vote는 votes를 1 증가시킨다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '파스타');
  const res = await request(app).post(`/api/menus/${m.id}/vote`);
  assert.equal(res.status, 200);
  assert.equal(res.body.votes, 1);
});

test('POST /api/menus/:id/vote는 없는 id면 404를 반환한다', async () => {
  const { app } = await freshApp();
  const res = await request(app).post('/api/menus/9999/vote');
  assert.equal(res.status, 404);
});

test('GET /api/menus/random은 메뉴가 있으면 하나를 반환한다', async () => {
  const { app, client } = await freshApp();
  await seed(client, '돈까스');
  const res = await request(app).get('/api/menus/random');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, '돈까스');
});

test('GET /api/menus/random은 메뉴가 없으면 404를 반환한다', async () => {
  const { app } = await freshApp();
  const res = await request(app).get('/api/menus/random');
  assert.equal(res.status, 404);
});

// 로그인 도입 전까지 이름/설명 수정과 삭제는 막아둔다(누구나 접근 가능해 어뷰징 위험).
test('PATCH /api/menus/:id는 이름 수정을 403으로 막는다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '라면');
  const res = await request(app).patch(`/api/menus/${m.id}`).send({ name: '진라면' });
  assert.equal(res.status, 403);
  const list = await request(app).get('/api/menus');
  assert.equal(list.body[0].name, '라면'); // 이름은 그대로 유지
});

test('PATCH /api/menus/:id는 설명 수정을 403으로 막는다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '국밥');
  const res = await request(app).patch(`/api/menus/${m.id}`).send({ description: '뜨끈한' });
  assert.equal(res.status, 403);
});

test('DELETE /api/menus/:id는 삭제를 403으로 막는다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '제육');
  const res = await request(app).delete(`/api/menus/${m.id}`);
  assert.equal(res.status, 403);
  const list = await request(app).get('/api/menus');
  assert.equal(list.body.length, 1); // 삭제되지 않는다
});

// --- db.createMenu (menus에 실제로 넣는 유일한 경로) ---

test('createMenu는 메뉴를 생성한다', async () => {
  const { client } = await freshApp();
  const r = await createMenu(client, { name: '김치찌개', description: '든든한 한 끼' });
  assert.equal(r.ok, true);
  assert.equal(r.status, 201);
  assert.equal(r.row.name, '김치찌개');
  assert.equal(r.row.votes, 0);
});

test('createMenu는 name이 없으면 400을 반환한다', async () => {
  const { client } = await freshApp();
  const r = await createMenu(client, { description: '설명만' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('createMenu는 같은 이름이면 409를 반환한다', async () => {
  const { client } = await freshApp();
  await seed(client, '김밥천국');
  const r = await createMenu(client, { name: '김밥천국' });
  assert.equal(r.status, 409);
});

test('createMenu는 공백/대소문자만 다른 이름도 중복으로 막는다', async () => {
  const { client } = await freshApp();
  await seed(client, '김밥천국');
  const r = await createMenu(client, { name: '  김밥 천국 ' });
  assert.equal(r.status, 409);
});

test('createMenu 중복 시 기존 값은 원본 공백을 유지한다', async () => {
  const { app, client } = await freshApp();
  await seed(client, '김밥 천국');
  const r = await createMenu(client, { name: '김밥천국' });
  assert.equal(r.status, 409);
  const list = await request(app).get('/api/menus');
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].name, '김밥 천국'); // 저장/표시는 원본 그대로
});

test('createMenu는 category를 저장한다', async () => {
  const { client } = await freshApp();
  const r = await createMenu(client, { name: '한식당', category: '한식' });
  assert.equal(r.status, 201);
  assert.equal(r.row.category, '한식');
});

test('createMenu는 category 미지정 시 null이다', async () => {
  const { client } = await freshApp();
  const r = await createMenu(client, { name: '미분류집' });
  assert.equal(r.status, 201);
  assert.equal(r.row.category, null);
});

test('GET /api/config는 KAKAO_JS_KEY가 없으면 kakaoJsKey가 null이다', async () => {
  const prev = process.env.KAKAO_JS_KEY;
  delete process.env.KAKAO_JS_KEY;
  try {
    const { app } = await freshApp();
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
    const { app } = await freshApp();
    const res = await request(app).get('/api/config');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { kakaoJsKey: 'test-js-key' });
  } finally {
    if (prev !== undefined) process.env.KAKAO_JS_KEY = prev;
    else delete process.env.KAKAO_JS_KEY;
  }
});

test('PATCH /api/menus/:id는 category만 갱신한다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '국밥집');
  const res = await request(app).patch(`/api/menus/${m.id}`).send({ category: '한식' });
  assert.equal(res.status, 200);
  assert.equal(res.body.category, '한식');
  assert.equal(res.body.name, '국밥집'); // 이름은 그대로
});

test('PATCH /api/menus/:id는 category 갱신 시 다른 필드는 그대로 둔다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '일식집', { category: '일식' });
  const res = await request(app).patch(`/api/menus/${m.id}`).send({ category: '한식' });
  assert.equal(res.status, 200);
  assert.equal(res.body.category, '한식');
  assert.equal(res.body.name, '일식집'); // 이름은 그대로
});

// --- 요청(requests) 기능 ---

test('POST /api/requests(add)는 추가 요청을 pending으로 저장한다', async () => {
  const { app } = await freshApp();
  const res = await request(app)
    .post('/api/requests')
    .send({ type: 'add', name: '신상카페', description: '디저트' });
  assert.equal(res.status, 201);
  assert.equal(res.body.type, 'add');
  assert.equal(res.body.name, '신상카페');
  assert.equal(res.body.status, 'pending');
  // 요청은 menus에 바로 반영되지 않는다
  const list = await request(app).get('/api/menus');
  assert.equal(list.body.length, 0);
});

test('POST /api/requests(add)는 이미 등록된 식당이면 409를 반환한다', async () => {
  const { app, client } = await freshApp();
  await seed(client, '김밥천국');
  const res = await request(app)
    .post('/api/requests')
    .send({ type: 'add', name: '김밥천국' });
  assert.equal(res.status, 409);
});

test('POST /api/requests(add)는 공백/대소문자만 다른 이름도 중복으로 막는다', async () => {
  const { app, client } = await freshApp();
  await seed(client, '김밥천국');
  const res = await request(app)
    .post('/api/requests')
    .send({ type: 'add', name: '  김밥 천국 ' });
  assert.equal(res.status, 409);
});

test('POST /api/requests(add)는 name이 없으면 400을 반환한다', async () => {
  const { app } = await freshApp();
  const res = await request(app)
    .post('/api/requests')
    .send({ type: 'add', description: '설명만' });
  assert.equal(res.status, 400);
});

test('POST /api/requests(edit)는 수정 요청을 저장한다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '라면집');
  const res = await request(app)
    .post('/api/requests')
    .send({ type: 'edit', menu_id: m.id, name: '진라면집' });
  assert.equal(res.status, 201);
  assert.equal(res.body.type, 'edit');
  assert.equal(res.body.menu_id, m.id);
  assert.equal(res.body.status, 'pending');
  // 실제 메뉴 이름은 그대로
  const list = await request(app).get('/api/menus');
  assert.equal(list.body[0].name, '라면집');
});

test('POST /api/requests(edit)는 menu_id가 없으면 400을 반환한다', async () => {
  const { app } = await freshApp();
  const res = await request(app)
    .post('/api/requests')
    .send({ type: 'edit', name: '새이름' });
  assert.equal(res.status, 400);
});

test('POST /api/requests(edit)는 바꿀 내용이 없으면 400을 반환한다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '국밥집');
  const res = await request(app)
    .post('/api/requests')
    .send({ type: 'edit', menu_id: m.id });
  assert.equal(res.status, 400);
});

test('POST /api/requests(delete)는 삭제 요청을 저장한다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '폐업집');
  const res = await request(app)
    .post('/api/requests')
    .send({ type: 'delete', menu_id: m.id, reason: '폐업했어요' });
  assert.equal(res.status, 201);
  assert.equal(res.body.type, 'delete');
  assert.equal(res.body.reason, '폐업했어요');
  assert.equal(res.body.status, 'pending');
  // 실제 메뉴는 그대로 남아있다
  const list = await request(app).get('/api/menus');
  assert.equal(list.body.length, 1);
});

test('POST /api/requests(delete)는 menu_id가 없으면 400을 반환한다', async () => {
  const { app } = await freshApp();
  const res = await request(app)
    .post('/api/requests')
    .send({ type: 'delete' });
  assert.equal(res.status, 400);
});

test('POST /api/requests는 알 수 없는 type이면 400을 반환한다', async () => {
  const { app } = await freshApp();
  const res = await request(app)
    .post('/api/requests')
    .send({ type: 'destroy', menu_id: 1 });
  assert.equal(res.status, 400);
});

test('POST /api/requests(edit)는 없는 menu_id면 404를 반환한다', async () => {
  const { app } = await freshApp();
  const res = await request(app)
    .post('/api/requests')
    .send({ type: 'edit', menu_id: 9999, name: '새이름' });
  assert.equal(res.status, 404);
});

test('POST /api/requests(delete)는 없는 menu_id면 404를 반환한다', async () => {
  const { app } = await freshApp();
  const res = await request(app)
    .post('/api/requests')
    .send({ type: 'delete', menu_id: 9999 });
  assert.equal(res.status, 404);
});

// --- 한줄평(reviews) 기능 ---

test('GET /api/menus/:id/reviews는 처음엔 빈 배열을 반환한다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '리뷰집');
  const res = await request(app).get(`/api/menus/${m.id}/reviews`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('GET /api/menus/:id/reviews는 없는 메뉴여도 빈 배열을 반환한다', async () => {
  const { app } = await freshApp();
  const res = await request(app).get('/api/menus/9999/reviews');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('POST /api/menus/:id/reviews는 한줄평을 즉시 저장한다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '맛집');
  const res = await request(app)
    .post(`/api/menus/${m.id}/reviews`)
    .send({ body: '진짜 맛있어요', device_id: 'dev-1' });
  assert.equal(res.status, 201);
  assert.equal(res.body.body, '진짜 맛있어요');
  assert.equal(res.body.menu_id, m.id);
  // 바로 조회된다
  const list = await request(app).get(`/api/menus/${m.id}/reviews`);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].body, '진짜 맛있어요');
});

test('POST /api/menus/:id/reviews는 body를 trim해서 저장한다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '공백집');
  const res = await request(app)
    .post(`/api/menus/${m.id}/reviews`)
    .send({ body: '  띄어쓰기  ' });
  assert.equal(res.status, 201);
  assert.equal(res.body.body, '띄어쓰기');
});

test('POST /api/menus/:id/reviews는 빈 body면 400을 반환한다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '빈집');
  const res = await request(app).post(`/api/menus/${m.id}/reviews`).send({ body: '   ' });
  assert.equal(res.status, 400);
});

test('POST /api/menus/:id/reviews는 100자 초과면 400을 반환한다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '장문집');
  const res = await request(app)
    .post(`/api/menus/${m.id}/reviews`)
    .send({ body: '가'.repeat(101) });
  assert.equal(res.status, 400);
});

test('POST /api/menus/:id/reviews는 없는 메뉴면 404를 반환한다', async () => {
  const { app } = await freshApp();
  const res = await request(app).post('/api/menus/9999/reviews').send({ body: '한줄평' });
  assert.equal(res.status, 404);
});

test('GET /api/menus/:id/reviews는 최신순으로 반환한다', async () => {
  const { app, client } = await freshApp();
  const m = await seed(client, '순서집');
  await request(app).post(`/api/menus/${m.id}/reviews`).send({ body: '첫번째' });
  await request(app).post(`/api/menus/${m.id}/reviews`).send({ body: '두번째' });
  const list = await request(app).get(`/api/menus/${m.id}/reviews`);
  assert.equal(list.body.length, 2);
  assert.equal(list.body[0].body, '두번째'); // 최신이 맨 위
  assert.equal(list.body[1].body, '첫번째');
});

test('GET /api/menus/:id/reviews는 다른 식당의 한줄평은 섞지 않는다', async () => {
  const { app, client } = await freshApp();
  const a = await seed(client, 'A집');
  const b = await seed(client, 'B집');
  await request(app).post(`/api/menus/${a.id}/reviews`).send({ body: 'A리뷰' });
  const listB = await request(app).get(`/api/menus/${b.id}/reviews`);
  assert.deepEqual(listB.body, []);
});
