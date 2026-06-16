# 점심 메뉴 투표/추천 앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 없는 점심 메뉴 투표/추천 웹앱을 Node.js + Express + Turso(libSQL)로 만들고 Render Blueprint로 배포할 준비를 한다.

**Architecture:** 단일 Express 앱이 정적 프론트엔드(`public/`)와 JSON REST API를 함께 제공한다. DB 접근은 `@libsql/client`로 하며, `app.js`는 클라이언트를 주입받는 팩토리(`createApp(client)`)라서 테스트 시 인메모리 libSQL(`:memory:`)을 주입할 수 있다. `server.js`는 환경변수에서 실제 Turso 클라이언트를 만들어 앱을 구동한다.

**Tech Stack:** Node.js v24 (ESM, 내장 test runner, `--env-file`), Express, @libsql/client, supertest(dev), Render Blueprint.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `package.json` | ESM 설정, 의존성, npm 스크립트 |
| `db.js` | libSQL 클라이언트 생성 + 스키마 초기화 |
| `app.js` | `createApp(client)` — Express 앱 + API 라우트 + 정적 서빙 |
| `server.js` | 진입점 — env → 클라이언트 → 스키마 → 앱 → listen |
| `public/index.html` | 단일 페이지 UI |
| `public/style.css` | 스타일 |
| `public/app.js` | 프론트 로직 (fetch → 렌더) |
| `test/api.test.js` | API 라우트 테스트 (인메모리 DB) |
| `render.yaml` | Render Blueprint |

이미 존재: `.env`, `.env.example`, `.gitignore`, 설계 문서.

---

## Task 1: 프로젝트 스캐폴딩 (package.json + 의존성)

**Files:**
- Create: `package.json`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "lunch",
  "version": "1.0.0",
  "description": "점심 메뉴 투표/추천 앱",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --env-file=.env server.js",
    "test": "node --test"
  },
  "dependencies": {
    "@libsql/client": "^0.14.0",
    "express": "^4.21.2"
  },
  "devDependencies": {
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: 의존성 설치**

Run: `npm install`
Expected: `node_modules/` 생성, `package-lock.json` 생성, 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json
git commit -m "chore: 프로젝트 스캐폴딩 및 의존성 설정"
```

---

## Task 2: DB 모듈 (클라이언트 + 스키마)

**Files:**
- Create: `db.js`
- Test: `test/db.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/db.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient, initSchema } from '../db.js';

test('initSchema는 menus 테이블을 만들고 초기엔 비어있다', async () => {
  const client = makeClient({ url: ':memory:' });
  await initSchema(client);
  const result = await client.execute('SELECT * FROM menus');
  assert.equal(result.rows.length, 0);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/db.test.js`
Expected: FAIL — `Cannot find module '../db.js'` 또는 `makeClient is not a function`.

- [ ] **Step 3: db.js 구현**

`db.js`:
```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/db.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: 커밋**

```bash
git add db.js test/db.test.js
git commit -m "feat: libSQL 클라이언트 및 menus 스키마 초기화"
```

---

## Task 3: 앱 팩토리 + 목록 조회 (GET /api/menus)

**Files:**
- Create: `app.js`
- Test: `test/api.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/api.test.js`:
```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/api.test.js`
Expected: FAIL — `Cannot find module '../app.js'`.

- [ ] **Step 3: app.js 구현 (목록 라우트만)**

`app.js`:
```js
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(client) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/menus', async (req, res) => {
    try {
      const result = await client.execute(
        'SELECT * FROM menus ORDER BY votes DESC, created_at DESC'
      );
      res.json(result.rows);
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });

  return app;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/api.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add app.js test/api.test.js
git commit -m "feat: 앱 팩토리 및 메뉴 목록 조회 API"
```

---

## Task 4: 메뉴 추가 (POST /api/menus)

**Files:**
- Modify: `app.js` (라우트 추가)
- Test: `test/api.test.js` (테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`test/api.test.js` 끝에 추가:
```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/api.test.js`
Expected: FAIL — POST 라우트가 없어 404 반환(201/400 기대와 불일치).

- [ ] **Step 3: app.js에 POST 라우트 추가**

`app.js`의 `return app;` 바로 위에 추가:
```js
  app.post('/api/menus', async (req, res) => {
    const { name, description } = req.body ?? {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    try {
      const result = await client.execute({
        sql: 'INSERT INTO menus (name, description) VALUES (?, ?) RETURNING *',
        args: [name.trim(), description ?? null],
      });
      res.status(201).json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/api.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add app.js test/api.test.js
git commit -m "feat: 메뉴 추가 API 및 입력 검증"
```

---

## Task 5: 투표 (POST /api/menus/:id/vote)

**Files:**
- Modify: `app.js`
- Test: `test/api.test.js`

- [ ] **Step 1: 실패하는 테스트 추가**

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/api.test.js`
Expected: FAIL — vote 라우트 없음(404가 기대지만 200 테스트는 실패).

- [ ] **Step 3: app.js에 vote 라우트 추가** (`return app;` 위에)

```js
  app.post('/api/menus/:id/vote', async (req, res) => {
    try {
      const result = await client.execute({
        sql: 'UPDATE menus SET votes = votes + 1 WHERE id = ? RETURNING *',
        args: [req.params.id],
      });
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'not found' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/api.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add app.js test/api.test.js
git commit -m "feat: 메뉴 투표 API"
```

---

## Task 6: 랜덤 추천 (GET /api/menus/random)

**Files:**
- Modify: `app.js`
- Test: `test/api.test.js`

> **중요:** `/api/menus/random` 라우트는 `/api/menus/:id`보다 **먼저** 등록해야 한다. 본 계획에서는 `:id` 라우트가 아직 없으므로(PATCH/DELETE는 Task 7·8에서 추가), random 라우트를 GET `/api/menus` 바로 다음에 배치한다.

- [ ] **Step 1: 실패하는 테스트 추가**

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/api.test.js`
Expected: FAIL — random 라우트 없음.

- [ ] **Step 3: app.js에 random 라우트 추가** (GET `/api/menus` 라우트 바로 아래)

```js
  app.get('/api/menus/random', async (req, res) => {
    try {
      const result = await client.execute(
        'SELECT * FROM menus ORDER BY RANDOM() LIMIT 1'
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'no menus' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/api.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: 커밋**

```bash
git add app.js test/api.test.js
git commit -m "feat: 랜덤 메뉴 추천 API"
```

---

## Task 7: 메뉴 수정 (PATCH /api/menus/:id)

**Files:**
- Modify: `app.js`
- Test: `test/api.test.js`

- [ ] **Step 1: 실패하는 테스트 추가**

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/api.test.js`
Expected: FAIL — PATCH 라우트 없음.

- [ ] **Step 3: app.js에 PATCH 라우트 추가** (`return app;` 위에)

```js
  app.patch('/api/menus/:id', async (req, res) => {
    const { name, description } = req.body ?? {};
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'name cannot be empty' });
    }
    try {
      const result = await client.execute({
        sql: `UPDATE menus
                SET name = COALESCE(?, name),
                    description = COALESCE(?, description)
              WHERE id = ? RETURNING *`,
        args: [name ?? null, description ?? null, req.params.id],
      });
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'not found' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/api.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: 커밋**

```bash
git add app.js test/api.test.js
git commit -m "feat: 메뉴 수정 API"
```

---

## Task 8: 메뉴 삭제 (DELETE /api/menus/:id)

**Files:**
- Modify: `app.js`
- Test: `test/api.test.js`

- [ ] **Step 1: 실패하는 테스트 추가**

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/api.test.js`
Expected: FAIL — DELETE 라우트 없음.

- [ ] **Step 3: app.js에 DELETE 라우트 추가** (`return app;` 위에)

```js
  app.delete('/api/menus/:id', async (req, res) => {
    try {
      const result = await client.execute({
        sql: 'DELETE FROM menus WHERE id = ?',
        args: [req.params.id],
      });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ error: 'not found' });
      }
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/api.test.js`
Expected: PASS (11 tests).

- [ ] **Step 5: 커밋**

```bash
git add app.js test/api.test.js
git commit -m "feat: 메뉴 삭제 API"
```

---

## Task 9: 서버 진입점 (server.js)

**Files:**
- Create: `server.js`

> 이 태스크는 실제 Turso 연결이 필요하므로 자동 테스트 대신 수동 실행으로 검증한다.

- [ ] **Step 1: server.js 작성**

`server.js`:
```js
import { makeClient, initSchema } from './db.js';
import { createApp } from './app.js';

const client = makeClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

await initSchema(client);

const app = createApp(client);
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Lunch app listening on http://localhost:${port}`);
});
```

- [ ] **Step 2: 로컬 실행으로 검증**

Run: `node --env-file=.env server.js`
Expected: 콘솔에 `Lunch app listening on http://localhost:3000` 출력, 에러 없음.

별도 터미널에서 확인:
Run: `curl http://localhost:3000/api/menus`
Expected: `[]` (또는 기존 데이터 배열). 확인 후 서버 종료(Ctrl+C).

- [ ] **Step 3: 커밋**

```bash
git add server.js
git commit -m "feat: 서버 진입점 (Turso 연결 + listen)"
```

---

## Task 10: 프론트엔드 (단일 페이지)

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`
- Create: `public/app.js`

- [ ] **Step 1: index.html 작성**

`public/index.html`:
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>오늘 뭐 먹지? 🍱</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <main>
    <h1>오늘 뭐 먹지? 🍱</h1>

    <section class="recommend">
      <button id="random-btn">🎲 랜덤 추천</button>
      <p id="random-result"></p>
    </section>

    <form id="add-form">
      <input id="name" type="text" placeholder="메뉴 이름" required />
      <input id="description" type="text" placeholder="한줄 설명 (선택)" />
      <button type="submit">추가</button>
    </form>

    <ul id="menu-list"></ul>
  </main>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: style.css 작성**

`public/style.css`:
```css
* { box-sizing: border-box; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: #f6f7f9;
  margin: 0;
  color: #1f2937;
}
main { max-width: 560px; margin: 0 auto; padding: 24px 16px; }
h1 { text-align: center; }
.recommend { text-align: center; margin: 16px 0 24px; }
#random-btn {
  font-size: 1.1rem; padding: 10px 20px; border: none; border-radius: 8px;
  background: #f59e0b; color: #fff; cursor: pointer;
}
#random-result { font-size: 1.2rem; font-weight: 600; min-height: 1.5em; }
#add-form { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
#add-form input { flex: 1; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; }
#add-form button {
  padding: 8px 16px; border: none; border-radius: 6px;
  background: #2563eb; color: #fff; cursor: pointer;
}
#menu-list { list-style: none; padding: 0; }
.menu-item {
  display: flex; align-items: center; gap: 8px;
  background: #fff; padding: 12px; border-radius: 8px; margin-bottom: 8px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
.menu-item .info { flex: 1; }
.menu-item .name { font-weight: 600; }
.menu-item .desc { font-size: 0.85rem; color: #6b7280; }
.menu-item button {
  border: none; border-radius: 6px; padding: 6px 10px; cursor: pointer;
}
.vote-btn { background: #dcfce7; }
.edit-btn { background: #e0e7ff; }
.del-btn { background: #fee2e2; }
.votes { font-weight: 700; color: #16a34a; min-width: 2em; text-align: center; }
```

- [ ] **Step 3: app.js 작성**

`public/app.js`:
```js
const list = document.getElementById('menu-list');
const form = document.getElementById('add-form');
const nameInput = document.getElementById('name');
const descInput = document.getElementById('description');
const randomBtn = document.getElementById('random-btn');
const randomResult = document.getElementById('random-result');

async function loadMenus() {
  const res = await fetch('/api/menus');
  const menus = await res.json();
  render(menus);
}

function render(menus) {
  list.innerHTML = '';
  for (const m of menus) {
    const li = document.createElement('li');
    li.className = 'menu-item';
    li.innerHTML = `
      <span class="votes">${m.votes}</span>
      <div class="info">
        <div class="name"></div>
        <div class="desc"></div>
      </div>
      <button class="vote-btn">👍</button>
      <button class="edit-btn">수정</button>
      <button class="del-btn">삭제</button>
    `;
    li.querySelector('.name').textContent = m.name;
    li.querySelector('.desc').textContent = m.description || '';
    li.querySelector('.vote-btn').onclick = () => vote(m.id);
    li.querySelector('.edit-btn').onclick = () => editMenu(m);
    li.querySelector('.del-btn').onclick = () => removeMenu(m.id);
    list.appendChild(li);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  const res = await fetch('/api/menus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: descInput.value.trim() }),
  });
  if (!res.ok) { alert('추가 실패'); return; }
  form.reset();
  loadMenus();
});

async function vote(id) {
  const res = await fetch(`/api/menus/${id}/vote`, { method: 'POST' });
  if (!res.ok) { alert('투표 실패'); return; }
  loadMenus();
}

async function editMenu(m) {
  const name = prompt('메뉴 이름', m.name);
  if (name === null) return;
  const res = await fetch(`/api/menus/${m.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
  if (!res.ok) { alert('수정 실패'); return; }
  loadMenus();
}

async function removeMenu(id) {
  if (!confirm('삭제할까요?')) return;
  const res = await fetch(`/api/menus/${id}`, { method: 'DELETE' });
  if (!res.ok) { alert('삭제 실패'); return; }
  loadMenus();
}

randomBtn.addEventListener('click', async () => {
  const res = await fetch('/api/menus/random');
  if (res.status === 404) { randomResult.textContent = '메뉴를 먼저 추가하세요!'; return; }
  const m = await res.json();
  randomResult.textContent = `오늘은 → ${m.name} 🍽️`;
});

loadMenus();
```

- [ ] **Step 4: 로컬 실행으로 수동 검증**

Run: `node --env-file=.env server.js`
브라우저에서 `http://localhost:3000` 접속 → 메뉴 추가/투표/수정/삭제/랜덤추천 동작 확인 후 서버 종료.

- [ ] **Step 5: 커밋**

```bash
git add public/
git commit -m "feat: 프론트엔드 UI (목록/추가/투표/수정/삭제/랜덤추천)"
```

---

## Task 11: Render Blueprint (render.yaml)

**Files:**
- Create: `render.yaml`

- [ ] **Step 1: render.yaml 작성**

`render.yaml`:
```yaml
services:
  - type: web
    name: lunch
    runtime: node
    plan: free
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: TURSO_URL
        sync: false
      - key: TURSO_TOKEN
        sync: false
```

> `sync: false`는 값을 저장소에 커밋하지 않고 Render 대시보드에서 직접 입력하겠다는 의미다. 배포 시 Blueprint를 연결하면 Render가 두 변수의 값을 묻는다.

- [ ] **Step 2: 커밋**

```bash
git add render.yaml
git commit -m "chore: Render Blueprint 추가"
```

---

## Task 12: 전체 검증 + 푸시

**Files:** 없음 (검증 및 배포 준비)

- [ ] **Step 1: 전체 테스트 실행**

Run: `npm test`
Expected: 모든 테스트 PASS (db 1개 + api 11개 = 12개).

- [ ] **Step 2: .env가 추적되지 않는지 최종 확인**

Run: `git status --short && git ls-files | grep -x ".env" || echo "OK: .env not tracked"`
Expected: `OK: .env not tracked` 출력. (`.env`가 목록에 나오면 절대 푸시하지 말 것.)

- [ ] **Step 3: GitHub에 푸시**

```bash
git push -u origin HEAD:main
```
Expected: `https://github.com/owopqowo/lunch.git`에 업로드 성공.

- [ ] **Step 4: 배포 안내 (수동)**

Render 대시보드 → New → Blueprint → 이 저장소 연결 → `render.yaml` 감지 → `TURSO_URL`/`TURSO_TOKEN` 값 입력 → 배포. (실제 배포는 사용자가 Render 계정에서 진행)

---

## 자기 검토 (작성자 체크리스트)

- **스펙 커버리지:** 데이터모델(Task 2), 6개 API(Task 3~8), 프론트(Task 10), 에러처리(각 라우트 400/404/500), 테스트(Task 2~8,12), 배포(Task 11~12), 라우트 순서 주의(Task 6) — 모두 포함됨. ✅
- **플레이스홀더:** "TBD/적절히 처리" 등 없음. 모든 코드 블록 완성. ✅
- **타입/이름 일관성:** `makeClient`, `initSchema`, `createApp(client)`, `menus` 테이블 컬럼(id/name/description/votes/created_at)이 전 태스크에서 일관됨. `result.rows` / `result.rowsAffected` 사용 일관. ✅
