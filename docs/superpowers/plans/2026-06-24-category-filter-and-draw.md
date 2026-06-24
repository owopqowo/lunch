# 카테고리 필터 + 2단 추첨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 추첨에 음식 카테고리를 도입한다 — 사람은 식당명+메뉴만 입력하고, 카테고리는 카카오에서 자동으로 채운 뒤, 카테고리 직접선택/카테고리추첨 두 경로로 식당을 뽑는다.

**Architecture:** `menus`에 `category` 컬럼 1개를 추가한다. 카카오 SDK는 브라우저 전용이므로 클라이언트가 `category_name`을 파싱해 서버에 PATCH로 저장한다(신규 등록 시 + 앱 시작 시 백필). 추첨은 기존대로 클라이언트에서 일어나며, 카테고리 필터를 기존 텍스트 검색과 AND로 결합한다. 서버의 미사용 `/api/menus/random`은 건드리지 않는다.

**Tech Stack:** Node.js (ESM), Express, @libsql/client(SQLite), 바닐라 JS 프런트, `node:test` + supertest, 카카오맵 JS SDK(services).

## Global Constraints

- ESM 모듈 (`"type": "module"`). import/export 사용.
- 테스트는 `node:test` + `node:assert/strict`, 실행은 `npm test` (= `node --test`).
- 카테고리 값은 카카오 `category_name` 중분류를 **가공 없이 그대로** 저장. 우리만의 매핑/번역 금지.
- `category`가 `null`인 메뉴는 "미분류" — 드롭다운 옵션에 넣지 않고 "전체"에만 포함.
- 사람 입력은 **식당명 + 메뉴**만. 카테고리 입력 UI를 사용자에게 노출하지 않는다.
- 카카오 키 없음(`isLocationEnabled()` false) 시 카테고리 자동채움/백필 전부 스킵, 앱은 정상 동작.
- 가격대·혼밥/회식은 이번 범위 제외.

---

## File Structure

- `db.js` — `initSchema`에 `category` 컬럼 마이그레이션 추가 (Task 1)
- `app.js` — POST/PATCH가 `category` 필드를 저장/갱신하도록 확장 (Task 2)
- `public/category.js` (신규) — 순수 로직: `parseCategory`, `extractCategories`, `matchesCategory`. DOM/SDK 비의존이라 단위 테스트 대상 (Task 3, 4)
- `public/map.js` — `parseCategory`를 category.js에서 import해 재노출 (Task 3에서 처리)
- `public/search.js` — 변경 없음 (검색은 그대로, 결합은 app.js 호출부에서)
- `public/app.js` — 자동채움, 백필, 드롭다운, 카테고리추첨, 식당추첨 pool 결합 (Task 5~8, 주로 수동 검증)
- `public/index.html` / `public/style.css` — 카테고리 영역 UI 마크업/스타일 (Task 6)
- `test/db.test.js`, `test/api.test.js`, `test/category.test.js`(신규) — 테스트

각 클라이언트 순수 로직을 `category.js`로 분리하는 이유: DOM·카카오 SDK 없이 `node:test`로 검증 가능하게 하기 위함. app.js의 SDK/DOM 글루는 단위 테스트 대신 명시적 수동 검증 단계로 덮는다.

---

### Task 1: DB 마이그레이션 — category 컬럼 추가

**Files:**
- Modify: `db.js` (initSchema 함수)
- Test: `test/db.test.js`

**Interfaces:**
- Consumes: 기존 `makeClient`, `initSchema(client)`.
- Produces: `initSchema` 실행 후 `menus` 테이블에 `category TEXT` 컬럼이 존재한다(기본 NULL).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/db.test.js`에 추가:

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: 위 두 테스트 FAIL ("category 컬럼이 있어야 한다" assert 실패).

- [ ] **Step 3: 최소 구현**

`db.js`의 `initSchema`를 다음으로 수정 (CREATE TABLE 뒤에 마이그레이션 추가):

```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 새 테스트 2개 PASS, 기존 테스트 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add db.js test/db.test.js
git commit -m "feat: menus에 category 컬럼 마이그레이션 추가"
```

---

### Task 2: API — POST/PATCH가 category를 저장/갱신

**Files:**
- Modify: `app.js` (POST `/api/menus`, PATCH `/api/menus/:id`)
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: Task 1의 `category` 컬럼.
- Produces:
  - `POST /api/menus { name, description?, category? }` → 생성된 행 반환, `category` 미지정 시 `null`.
  - `PATCH /api/menus/:id { category? }` → `category`만 갱신 가능(COALESCE), 미지정 시 기존값 유지.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/api.test.js`에 추가:

```js
test('POST /api/menus는 category를 저장한다', async () => {
  const app = await freshApp();
  const res = await request(app)
    .post('/api/menus')
    .send({ name: '한식당', category: '한식' });
  assert.equal(res.status, 201);
  assert.equal(res.body.category, '한식');
});

test('POST /api/menus는 category 미지정 시 null이다', async () => {
  const app = await freshApp();
  const res = await request(app).post('/api/menus').send({ name: '미분류집' });
  assert.equal(res.status, 201);
  assert.equal(res.body.category, null);
});

test('PATCH /api/menus/:id는 category만 갱신한다', async () => {
  const app = await freshApp();
  const created = await request(app).post('/api/menus').send({ name: '국밥집' });
  const res = await request(app)
    .patch(`/api/menus/${created.body.id}`)
    .send({ category: '한식' });
  assert.equal(res.status, 200);
  assert.equal(res.body.category, '한식');
  assert.equal(res.body.name, '국밥집'); // 이름은 그대로
});

test('PATCH /api/menus/:id는 category 미지정 시 기존 category를 유지한다', async () => {
  const app = await freshApp();
  const created = await request(app)
    .post('/api/menus')
    .send({ name: '일식집', category: '일식' });
  const res = await request(app)
    .patch(`/api/menus/${created.body.id}`)
    .send({ description: '초밥' });
  assert.equal(res.status, 200);
  assert.equal(res.body.category, '일식'); // 유지
  assert.equal(res.body.description, '초밥');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: 새 테스트 4개 FAIL (`category`가 undefined).

- [ ] **Step 3: 최소 구현**

`app.js`의 POST `/api/menus` 핸들러에서 body 구조분해와 INSERT를 수정:

```js
app.post('/api/menus', async (req, res) => {
  const { name, description, category } = req.body ?? {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const dup = await client.execute({
      sql: "SELECT id FROM menus WHERE lower(replace(name, ' ', '')) = lower(replace(?, ' ', ''))",
      args: [name.trim()],
    });
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'duplicate' });
    }
    const result = await client.execute({
      sql: 'INSERT INTO menus (name, description, category) VALUES (?, ?, ?) RETURNING *',
      args: [
        name.trim(),
        (typeof description === 'string' && description.trim()) ? description.trim() : null,
        (typeof category === 'string' && category.trim()) ? category.trim() : null,
      ],
    });
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});
```

`app.js`의 PATCH `/api/menus/:id` 핸들러에서 body 구조분해와 UPDATE를 수정 (이름 중복검사 블록은 그대로 두고, category 추가):

```js
app.patch('/api/menus/:id', async (req, res) => {
  const { name, description, category } = req.body ?? {};
  if (typeof name === 'string' && !name.trim()) {
    return res.status(400).json({ error: 'name cannot be empty' });
  }
  try {
    if (typeof name === 'string' && name.trim()) {
      const dup = await client.execute({
        sql: "SELECT id FROM menus WHERE lower(replace(name, ' ', '')) = lower(replace(?, ' ', '')) AND id != ?",
        args: [name.trim(), req.params.id],
      });
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'duplicate' });
      }
    }
    const result = await client.execute({
      sql: `UPDATE menus
              SET name = COALESCE(?, name),
                  description = COALESCE(?, description),
                  category = COALESCE(?, category)
            WHERE id = ? RETURNING *`,
      args: [
        typeof name === 'string' ? name.trim() : null,
        description ?? null,
        (typeof category === 'string' && category.trim()) ? category.trim() : null,
        req.params.id,
      ],
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

Run: `npm test`
Expected: 새 테스트 4개 PASS, 기존 테스트 전부 PASS (description COALESCE 동작 변화 없음 확인).

- [ ] **Step 5: 커밋**

```bash
git add app.js test/api.test.js
git commit -m "feat: 메뉴 API에 category 저장/갱신 추가"
```

---

### Task 3: 카테고리 파싱 — parseCategory

**Files:**
- Create: `public/category.js`
- Create: `test/category.test.js`
- Modify: `public/map.js` (parseCategory를 category.js에서 import해 재노출)

**Interfaces:**
- Produces: `parseCategory(place)` — 카카오 place 객체에서 중분류 문자열 또는 `null`을 반환.
  - 입력 예: `{ category_name: '음식점 > 한식 > 육류,고기' }`
  - `category_name`을 `' > '`로 split, 2번째 토큰 우선, 없으면 1번째, 둘 다 없으면 `null`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/category.test.js` 생성:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCategory } from '../public/category.js';

test('parseCategory는 중분류(2번째 토큰)를 반환한다', () => {
  assert.equal(parseCategory({ category_name: '음식점 > 한식 > 육류,고기' }), '한식');
  assert.equal(parseCategory({ category_name: '음식점 > 아시아음식 > 베트남음식' }), '아시아음식');
  assert.equal(parseCategory({ category_name: '음식점 > 양식 > 멕시칸,브라질' }), '양식');
});

test('parseCategory는 토큰이 하나뿐이면 그 값을 반환한다', () => {
  assert.equal(parseCategory({ category_name: '음식점' }), '음식점');
});

test('parseCategory는 category_name이 없으면 null이다', () => {
  assert.equal(parseCategory({}), null);
  assert.equal(parseCategory({ category_name: '' }), null);
  assert.equal(parseCategory(null), null);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: import 실패/FAIL (`public/category.js` 없음).

- [ ] **Step 3: 최소 구현**

`public/category.js` 생성:

```js
// 카카오 place의 category_name 중분류를 추출한다.
// "음식점 > 한식 > 육류,고기" → "한식"
export function parseCategory(place) {
  const raw = place && place.category_name;
  if (!raw) return null;
  const parts = String(raw).split(' > ');
  return parts[1] || parts[0] || null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: category.test.js 3개 PASS.

- [ ] **Step 5: map.js에서 재노출**

`public/map.js` 상단에 import 추가하고 재노출 (app.js가 map.js에서 가져다 쓰던 패턴 유지):

```js
import { parseCategory } from './category.js';
export { parseCategory };
```

(map.js의 기존 `findPlace` 등은 그대로 둔다.)

- [ ] **Step 6: 커밋**

```bash
git add public/category.js public/map.js test/category.test.js
git commit -m "feat: 카카오 category_name 파싱(parseCategory) 추가"
```

---

### Task 4: 카테고리 추출 + 매칭 로직

**Files:**
- Modify: `public/category.js`
- Modify: `test/category.test.js`

**Interfaces:**
- Produces:
  - `extractCategories(menus)` — 메뉴 배열에서 `null`이 아닌 distinct category들을 정렬된 배열로 반환. 드롭다운 옵션용.
  - `matchesCategory(menu, category)` — `category`가 falsy(전체)면 true, 아니면 `menu.category === category`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/category.test.js`에 추가:

```js
import { extractCategories, matchesCategory } from '../public/category.js';

const MENUS = [
  { id: 1, category: '한식' },
  { id: 2, category: '일식' },
  { id: 3, category: '한식' },
  { id: 4, category: null },
];

test('extractCategories는 null 제외 distinct 정렬 목록을 반환한다', () => {
  assert.deepEqual(extractCategories(MENUS), ['일식', '한식']);
});

test('extractCategories는 빈 목록이면 빈 배열', () => {
  assert.deepEqual(extractCategories([]), []);
});

test('matchesCategory는 카테고리가 비면(전체) 항상 true', () => {
  assert.equal(matchesCategory({ category: '한식' }, ''), true);
  assert.equal(matchesCategory({ category: null }, ''), true);
});

test('matchesCategory는 정확히 일치할 때만 true', () => {
  assert.equal(matchesCategory({ category: '한식' }, '한식'), true);
  assert.equal(matchesCategory({ category: '일식' }, '한식'), false);
  assert.equal(matchesCategory({ category: null }, '한식'), false);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: 새 테스트 FAIL (`extractCategories`/`matchesCategory` 미정의).

- [ ] **Step 3: 최소 구현**

`public/category.js`에 추가:

```js
// 메뉴 목록에서 사용 가능한 카테고리(중복/ null 제외, 정렬)를 뽑는다.
export function extractCategories(menus) {
  const set = new Set();
  for (const m of menus) {
    if (m.category) set.add(m.category);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
}

// 메뉴가 선택된 카테고리에 속하는지. category가 비면 전체 통과.
export function matchesCategory(menu, category) {
  if (!category) return true;
  return menu.category === category;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 새 테스트 4개 PASS.

- [ ] **Step 5: 커밋**

```bash
git add public/category.js test/category.test.js
git commit -m "feat: 카테고리 추출/매칭 로직 추가"
```

---

### Task 5: 신규 등록 시 카테고리 자동 채움

**Files:**
- Modify: `public/app.js` (form submit 핸들러, import)

**Interfaces:**
- Consumes: `loadKakao`, `findPlace`(map.js), `parseCategory`(map.js), `isLocationEnabled`(map.js), POST/PATCH API.
- Produces: 식당 추가 후 카카오로 카테고리를 조회해 PATCH하는 부수효과. 실패 시 조용히 스킵.

> 이 Task와 이후(6~8)는 DOM·카카오 SDK 글루라 `node:test` 단위 테스트 대상이 아니다.
> 각 Task 끝에 **수동 검증** 단계를 둔다. 서버는 `npm run dev`로 띄운다(.env에 KAKAO_JS_KEY 필요).

- [ ] **Step 1: import 확장**

`public/app.js` 상단 map.js import에 `parseCategory` 추가:

```js
import {
  initConfig,
  isLocationEnabled,
  loadKakao,
  findPlace,
  showMap,
  kakaoSearchUrl,
  parseCategory,
} from './map.js';
```

- [ ] **Step 2: 자동 채움 헬퍼 추가**

`public/app.js`에 함수 추가 (form 핸들러 근처):

```js
// 식당명으로 카카오를 조회해 카테고리를 알아내고, 해당 메뉴에 PATCH한다.
// 키 없음/조회 실패 시 조용히 스킵(카테고리는 null로 남음).
async function fillCategory(menu) {
  if (!isLocationEnabled() || !menu || menu.category) return;
  const ok = await loadKakao();
  if (!ok) return;
  const place = await findPlace(menu.name);
  if (!place) return;
  const category = parseCategory(place);
  if (!category) return;
  try {
    await fetch(`/api/menus/${menu.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    });
  } catch {
    /* 자동 채움 실패는 무시 — 다음 백필에서 재시도됨 */
  }
}
```

- [ ] **Step 3: form submit에서 호출**

`public/app.js`의 form submit 핸들러에서, POST 성공 후 응답 메뉴로 `fillCategory`를 호출하고 목록을 갱신한다. 기존 `loadMenus()` 호출을 다음 흐름으로 교체:

```js
  const created = await res.json();
  form.reset();
  searchInput.value = '';
  showToast('추가했어요', 'success');
  loadMenus(); // 즉시 목록 반영(카테고리는 아직 null일 수 있음)
  // 백그라운드로 카테고리 채운 뒤 한 번 더 갱신
  fillCategory(created).then(() => loadMenus());
```

(주의: 기존 핸들러는 `res.json()`을 읽지 않으므로 `const created = await res.json();`를 `if (!res.ok)` 분기 뒤에 추가한다.)

- [ ] **Step 4: 수동 검증**

1. `npm run dev`로 서버 실행, 브라우저로 접속.
2. 실제 식당명(예: "스타벅스 여의도점", "김밥천국")으로 식당 추가.
3. 잠시 후(카카오 조회 완료) 브라우저 DevTools Network에서 해당 메뉴에 PATCH 요청이 가고 `category`가 채워졌는지 확인. 또는 `GET /api/menus` 응답에서 `category` 값 확인.
4. 카카오가 못 찾는 임의 문자열(예: "ㅁㄴㅇㄹ")로 추가 → `category`가 `null`로 남고 에러 없이 동작.

- [ ] **Step 5: 커밋**

```bash
git add public/app.js
git commit -m "feat: 식당 등록 시 카카오로 카테고리 자동 채움"
```

---

### Task 6: 카테고리 UI 마크업 + 드롭다운 렌더

**Files:**
- Modify: `public/index.html` (추천 영역에 카테고리 select + 카테고리추첨 버튼)
- Modify: `public/style.css` (카테고리 영역 스타일)
- Modify: `public/app.js` (드롭다운 동적 렌더, 상태 보관)

**Interfaces:**
- Consumes: `extractCategories`(category.js), `allMenus`(app.js 기존 전역).
- Produces:
  - `#category-filter` (select), `#category-random-btn` (button) DOM 요소.
  - `selectedCategory` 전역 상태 (기본 `''` = 전체).
  - `renderCategoryOptions()` — 현재 `allMenus`로 옵션 재생성.

- [ ] **Step 1: HTML 마크업 추가**

`public/index.html`의 추천(.recommend) 영역, 검색창 근처에 카테고리 컨트롤을 추가한다. 기존 추천 영역 구조를 확인한 뒤, 식당 추첨 버튼(`#random-btn`) 위에 다음을 넣는다:

```html
<div class="category-controls" id="category-controls" hidden>
  <select id="category-filter" aria-label="음식 카테고리 선택">
    <option value="">전체</option>
  </select>
  <button type="button" id="category-random-btn">🎲 카테고리 추첨</button>
</div>
```

- [ ] **Step 2: app.js에서 import 및 요소 참조**

`public/app.js`에 import 추가:

```js
import { extractCategories, matchesCategory } from './category.js';
```

요소 참조와 상태 추가 (다른 `getElementById` 근처):

```js
const categoryControls = document.getElementById('category-controls');
const categoryFilter = document.getElementById('category-filter');
const categoryRandomBtn = document.getElementById('category-random-btn');
let selectedCategory = ''; // '' = 전체
```

- [ ] **Step 3: 드롭다운 렌더 함수**

`public/app.js`에 추가:

```js
// allMenus 기준으로 카테고리 옵션을 다시 만든다.
// 사용 가능한 카테고리가 없으면 컨트롤 전체를 숨긴다.
function renderCategoryOptions() {
  const cats = extractCategories(allMenus);
  categoryControls.hidden = cats.length === 0;
  const prev = selectedCategory;
  categoryFilter.innerHTML = '<option value="">전체</option>';
  for (const c of cats) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    categoryFilter.appendChild(opt);
  }
  // 이전 선택이 여전히 유효하면 유지, 아니면 전체로 복귀
  if (prev && cats.includes(prev)) {
    categoryFilter.value = prev;
  } else {
    selectedCategory = '';
    categoryFilter.value = '';
  }
}
```

- [ ] **Step 4: render()에서 호출 + 변경 이벤트**

`public/app.js`의 `render(menus)` 함수 안, `allMenus = menus;` 다음 줄에 `renderCategoryOptions();`를 추가.

드롭다운 변경 시 선택 상태 갱신 + 목록 재필터 (이벤트 리스너를 초기화부에 추가):

```js
categoryFilter.addEventListener('change', () => {
  selectedCategory = categoryFilter.value;
  renderFiltered();
});
```

- [ ] **Step 5: CSS 추가**

`public/style.css`에 `.category-controls` 스타일을 추가한다. 기존 추천 영역 톤과 맞춘다(셀렉트/버튼 간격, 모바일에서 줄바꿈):

```css
.category-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.category-controls select {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border, #ddd);
  background: var(--surface, #fff);
  color: inherit;
  font: inherit;
}
.category-controls #category-random-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border, #ddd);
  background: var(--surface, #fff);
  color: inherit;
  cursor: pointer;
}
```

(실제 변수명은 style.css의 기존 토큰을 확인해 맞춘다.)

- [ ] **Step 6: 수동 검증**

1. `npm run dev` 후 카테고리가 채워진 식당을 2개 이상(서로 다른 카테고리) 등록.
2. 드롭다운에 해당 카테고리들이 정렬되어 뜨고 "전체"가 맨 위인지 확인.
3. 카테고리가 하나도 없으면(키 없음 등) `.category-controls`가 숨겨지는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add public/index.html public/style.css public/app.js
git commit -m "feat: 카테고리 드롭다운 UI 및 동적 옵션 렌더"
```

---

### Task 7: 식당 추첨에 카테고리 필터 결합

**Files:**
- Modify: `public/app.js` (renderFiltered, updateRecommendState, randomBtn 핸들러)

**Interfaces:**
- Consumes: `filterMenus`(search.js), `matchesCategory`(category.js), `selectedCategory`.
- Produces: 화면 목록과 추첨 pool이 모두 "검색어 AND 카테고리"로 필터된다.

- [ ] **Step 1: 결합 필터 헬퍼**

`public/app.js`에 추가 (filterMenus를 감싸 카테고리까지 적용):

```js
// 검색어 + 선택된 카테고리를 AND로 적용한 목록을 반환한다.
function currentPool(menus) {
  return filterMenus(menus, searchInput.value).filter((m) =>
    matchesCategory(m, selectedCategory),
  );
}
```

- [ ] **Step 2: 목록 렌더에 적용**

`public/app.js`의 `renderFiltered()`에서 `const filtered = filterMenus(allMenus, searchInput.value);`를 다음으로 교체:

```js
  const filtered = currentPool(allMenus);
```

- [ ] **Step 3: 추천 상태 카운트에 적용**

`public/app.js`의 `updateRecommendState()`에서 `const count = filterMenus(allMenus, searchInput.value).length;`를 다음으로 교체:

```js
  const count = currentPool(allMenus).length;
```

- [ ] **Step 4: 식당 추첨 pool에 적용**

`public/app.js`의 `randomBtn` 클릭 핸들러에서 `const pool = filterMenus(menus, searchInput.value);`를 다음으로 교체:

```js
  const pool = currentPool(menus);
```

- [ ] **Step 5: 수동 검증**

1. 서로 다른 카테고리 식당 여러 개 등록(각 카테고리 2곳 이상).
2. 드롭다운에서 "한식" 선택 → 목록이 한식만 표시, 식당 추첨이 한식 안에서만 당첨되는지 여러 번 눌러 확인.
3. 검색어 + 카테고리 동시 적용 시 둘 다 만족하는 식당만 남는지 확인.
4. 카테고리+검색 조합으로 0곳이면 기존 "검색 결과 없음" UI가 뜨는지 확인.
5. 선택 카테고리에 1곳뿐이면 식당 추첨 버튼이 비활성인지 확인.

- [ ] **Step 6: 커밋**

```bash
git add public/app.js
git commit -m "feat: 식당 추첨/목록에 카테고리 필터 결합"
```

---

### Task 8: 카테고리 추첨 + 앱 시작 시 백필

**Files:**
- Modify: `public/app.js` (categoryRandomBtn 핸들러, 백필 함수, 초기화)

**Interfaces:**
- Consumes: `extractCategories`, `fillCategory`(Task 5), `categoryRandomBtn`, `categoryFilter`.
- Produces:
  - 카테고리 추첨: 현재 검색 적용된 목록의 카테고리 중 하나를 무작위 선택 → 드롭다운/필터 반영.
  - 백필: 앱 시작 후 `category == null`인 메뉴를 순차로 채움.

- [ ] **Step 1: 카테고리 추첨 핸들러**

`public/app.js`에 추가:

```js
categoryRandomBtn.addEventListener('click', () => {
  // 현재 검색 적용된 목록에 존재하는 카테고리 중에서 뽑는다.
  const inSearch = filterMenus(allMenus, searchInput.value);
  const cats = extractCategories(inSearch);
  if (cats.length === 0) {
    showToast('추첨할 카테고리가 없어요', 'info');
    return;
  }
  const picked = cats[Math.floor(Math.random() * cats.length)];
  selectedCategory = picked;
  categoryFilter.value = picked;
  showToast(`오늘은 → ${picked}`, 'success');
  renderFiltered();
});
```

- [ ] **Step 2: 백필 함수**

`public/app.js`에 추가:

```js
// 앱 시작 시 category가 비어있는 메뉴들을 순차로(병렬 금지, rate limit) 채운다.
async function backfillCategories() {
  if (!isLocationEnabled()) return;
  const res = await fetch('/api/menus');
  if (!res.ok) return;
  const menus = await res.json();
  const pending = menus.filter((m) => !m.category);
  if (pending.length === 0) return;
  for (const m of pending) {
    await fillCategory(m); // 순차 — 카카오 호출 폭주 방지
  }
  loadMenus(); // 채운 결과 반영
}
```

- [ ] **Step 3: 초기화에서 백필 호출**

`public/app.js` 맨 아래 초기화를 수정. 기존:

```js
initConfig().then(() => loadMenus({ skeleton: true }));
```

다음으로 교체 (목록 먼저 그리고, 백필은 백그라운드로):

```js
initConfig().then(async () => {
  await loadMenus({ skeleton: true });
  backfillCategories(); // 비차단 백그라운드
});
```

- [ ] **Step 4: 수동 검증**

1. (백필 검증) DB에 `category`가 null인 기존 메뉴가 있는 상태에서 앱 로드.
   - DevTools Network에서 null인 메뉴마다 findPlace 후 PATCH가 순차로 나가는지 확인.
   - 잠시 후 드롭다운에 카테고리들이 채워지는지 확인.
2. (카테고리 추첨) [카테고리 추첨] 클릭 → 토스트로 카테고리 표시, 드롭다운이 그 값으로 바뀌고 목록이 필터되는지 확인. 여러 번 눌러 무작위인지 확인.
3. 검색어가 있는 상태에서 카테고리 추첨 시, 검색 결과에 존재하는 카테고리에서만 뽑히는지 확인.
4. 카카오 키 없는 환경에서 백필이 스킵되고 에러 없는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add public/app.js
git commit -m "feat: 카테고리 추첨 및 앱 시작 시 카테고리 백필"
```

---

## Self-Review

**Spec coverage:**
- `menus.category` 컬럼 + 마이그레이션 → Task 1 ✓
- POST/PATCH category 저장 → Task 2 ✓
- `parseCategory` 중분류 파싱(베트남=아시아음식, 타코=양식) → Task 3 ✓
- 동적 드롭다운(null 제외) → Task 4(extractCategories) + Task 6 ✓
- 신규 등록 자동 채움 → Task 5 ✓
- 카테고리 직접 선택 → Task 6 + Task 7 ✓
- 카테고리 추첨 → Task 8 ✓
- 식당 추첨(기존 확장) → Task 7 ✓
- 검색 AND 카테고리 → Task 7(currentPool) ✓
- 앱 시작 백필(순차) → Task 8 ✓
- 카카오 키 없음 처리 → Task 5(fillCategory 가드), Task 6(컨트롤 숨김), Task 8(백필 스킵) ✓
- 엣지: 카테고리+검색 0곳, 1곳 비활성 → Task 7 수동검증 ✓
- 서버 `/api/menus/random` 미변경 → 어떤 Task도 건드리지 않음 ✓
- 가격/혼밥·회식 제외 → 계획에 없음 ✓

**Placeholder scan:** 모든 코드 단계에 실제 코드 포함. SDK/DOM 글루 Task(5~8)는 단위 테스트 불가라 명시적 수동 검증 단계로 대체(의도된 것). "기존 토큰 확인"류는 실제 파일을 보고 맞추라는 구체 지시.

**Type consistency:**
- `parseCategory(place)` → Task 3 정의, Task 5 사용 ✓
- `extractCategories(menus)` → Task 4 정의, Task 6/8 사용 ✓
- `matchesCategory(menu, category)` → Task 4 정의, Task 7 사용 ✓
- `fillCategory(menu)` → Task 5 정의, Task 8 사용 ✓
- `currentPool(menus)` → Task 7 정의/사용 ✓
- `selectedCategory` 전역 → Task 6 선언, Task 7/8 사용 ✓
- `renderCategoryOptions()` → Task 6 정의, render()에서 호출 ✓
