# 위치 기반 실시간 점심 추첨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 국회의사당 고정·DB 등록 기반 추첨을, 사용자가 정한 기준점 주변 식당을 카카오에서 실시간으로 가져와 추첨하는 방식으로 전환한다.

**Architecture:** 서버는 정적 파일 서빙 + `GET /api/config`(카카오 키 전달)만 남긴다. DB(`db.js`)와 menus 라우트·정적 검색을 제거한다. 프론트는 `origin.js`(기준점 관리: localStorage/geolocation), `map.js`(카카오 SDK·주변 식당 검색·지역 검색·지도), `app.js`(UI·반경 선택·추첨)로 구성한다.

**Tech Stack:** Node.js (ESM, express), 카카오맵 JavaScript SDK + `services` 라이브러리, 브라우저 `localStorage`/`geolocation`, `node --test` + supertest.

설계 문서: [docs/superpowers/specs/2026-06-23-location-based-random-design.md](../specs/2026-06-23-location-based-random-design.md)

---

## 파일 구조

**생성:**
- `public/origin.js` — 기준점 관리. localStorage 직렬화/파싱, geolocation 래퍼, 폴백 결정. 카카오 비의존(순수 로직 단위 테스트 가능).
- `test/origin.test.js` — `origin.js`의 순수 로직 단위 테스트.

**수정:**
- `app.js` (서버) — menus 라우트 전부 제거, `GET /api/config`만 유지. `createApp()`이 client 인자 없이 동작.
- `server.js` — DB 클라이언트 생성·스키마 초기화 제거.
- `package.json` — `@libsql/client` 의존성 제거.
- `public/map.js` — `findNearbyRestaurants`, `searchRegion` 추가. `findPlace`·`ASSEMBLY` 제거.
- `public/app.js` — 추첨 흐름을 위치 기반으로 재작성. 등록·투표·정적 검색·메뉴 목록 렌더 제거. 기준점/반경 UI 추가.
- `public/index.html` — 등록 폼·검색창·메뉴 리스트 제거. 기준점·반경 컨트롤 추가.
- `test/api.test.js` — menus 테스트 제거, `/api/config` 테스트만 유지(DB 비의존으로 수정).
- `render.yaml` — `TURSO_URL`/`TURSO_TOKEN` 제거.
- `.env.example` — Turso 변수 제거, `KAKAO_JS_KEY`만 유지.

**삭제:**
- `db.js`, `test/db.test.js`
- `public/search.js`, `test/search.test.js`

---

## Task 1: 서버에서 DB·menus 라우트 제거

추첨 풀이 클라이언트(카카오)로 옮겨가므로 서버는 카카오 키 전달과 정적 서빙만 한다. 먼저 서버 테스트를 DB 비의존으로 줄이고, 그 테스트가 통과하도록 서버를 단순화한다.

**Files:**
- Modify: `test/api.test.js` (전체 교체)
- Modify: `app.js` (전체 교체)
- Modify: `server.js` (전체 교체)
- Delete: `db.js`, `test/db.test.js`

- [ ] **Step 1: `test/api.test.js`를 config 전용으로 교체 (실패 테스트)**

`test/api.test.js`의 전체 내용을 아래로 교체한다. `freshApp()`이 DB 없이 `createApp()`을 호출하도록 바꾼다.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';

function freshApp() {
  return createApp();
}

test('GET /api/config는 KAKAO_JS_KEY가 없으면 kakaoJsKey가 null이다', async () => {
  const prev = process.env.KAKAO_JS_KEY;
  delete process.env.KAKAO_JS_KEY;
  try {
    const app = freshApp();
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
    const app = freshApp();
    const res = await request(app).get('/api/config');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { kakaoJsKey: 'test-js-key' });
  } finally {
    if (prev !== undefined) process.env.KAKAO_JS_KEY = prev;
    else delete process.env.KAKAO_JS_KEY;
  }
});

test('제거된 /api/menus는 더 이상 존재하지 않는다 (404)', async () => {
  const app = freshApp();
  const res = await request(app).get('/api/menus');
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: DB 테스트 파일 삭제**

```bash
git rm db.js test/db.test.js
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `npm test`
Expected: FAIL — `app.js`가 아직 `client`를 받는 시그니처라 `/api/menus` 라우트가 살아있고, `createApp()`을 인자 없이 부르면 menus 핸들러에서 `client.execute`가 터지거나 라우트가 404가 아님. (또는 삭제된 `db.js`를 import하던 곳에서 에러.)

- [ ] **Step 4: `app.js`(서버)를 config 전용으로 교체**

`app.js` 전체를 아래로 교체한다. `client` 인자와 menus 라우트를 전부 제거한다.

```javascript
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/config', (req, res) => {
    res.json({ kakaoJsKey: process.env.KAKAO_JS_KEY || null });
  });

  return app;
}
```

- [ ] **Step 5: `server.js`를 DB 없이 교체**

`server.js` 전체를 아래로 교체한다.

```javascript
import { createApp } from './app.js';

const app = createApp();
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Lunch app listening on http://localhost:${port}`);
});
```

- [ ] **Step 6: 테스트 실행해 통과 확인**

Run: `npm test`
Expected: PASS — config 테스트 2개 통과, `/api/menus` 404 통과. (단, 이 시점엔 `test/search.test.js`가 아직 남아 통과 중. `origin.test.js`는 아직 없음.)

- [ ] **Step 7: 커밋**

```bash
git add app.js server.js test/api.test.js
git commit -m "refactor: 서버에서 DB·menus 라우트 제거하고 /api/config만 유지"
```

---

## Task 2: 정적 검색(search.js) 제거

추첨 풀이 동적(카카오)으로 바뀌어 정적 목록 필터가 불필요하다.

**Files:**
- Delete: `public/search.js`, `test/search.test.js`

- [ ] **Step 1: 파일 삭제**

```bash
git rm public/search.js test/search.test.js
```

- [ ] **Step 2: 테스트 실행해 통과 확인**

Run: `npm test`
Expected: PASS — config 테스트만 남아 통과. (이 시점에 `public/app.js`는 아직 `search.js`를 import하지만, 브라우저 코드라 `node --test`에는 영향 없음. 프론트는 Task 6에서 정리.)

- [ ] **Step 3: 커밋**

```bash
git commit -m "refactor: 정적 식당 검색(search.js) 제거"
```

---

## Task 3: 기준점 관리 모듈 origin.js (TDD)

기준점은 한 가지 책임만 진다: 저장값 읽기/쓰기, 현재 위치 받기, 폴백 결정. 카카오에 의존하지 않아 단위 테스트가 가능하도록 의존성(`storage`, `geolocation`)을 주입받는 함수로 설계한다.

**Files:**
- Create: `public/origin.js`
- Test: `test/origin.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`test/origin.test.js`를 아래 내용으로 생성한다.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ORIGIN,
  parseOrigin,
  serializeOrigin,
  resolveOrigin,
} from '../public/origin.js';

test('DEFAULT_ORIGIN은 국회의사당 좌표와 라벨을 가진다', () => {
  assert.equal(DEFAULT_ORIGIN.lat, 37.5318);
  assert.equal(DEFAULT_ORIGIN.lng, 126.9143);
  assert.equal(DEFAULT_ORIGIN.label, '국회의사당');
});

test('serializeOrigin → parseOrigin 왕복이 보존된다', () => {
  const o = { lat: 37.5, lng: 127.0, label: '강남역' };
  assert.deepEqual(parseOrigin(serializeOrigin(o)), o);
});

test('parseOrigin은 잘못된 JSON이면 null을 반환한다', () => {
  assert.equal(parseOrigin('not json'), null);
  assert.equal(parseOrigin(null), null);
  assert.equal(parseOrigin(''), null);
});

test('parseOrigin은 lat/lng가 숫자가 아니면 null을 반환한다', () => {
  assert.equal(parseOrigin(JSON.stringify({ lat: 'x', lng: 1, label: 'a' })), null);
  assert.equal(parseOrigin(JSON.stringify({ lng: 1, label: 'a' })), null);
});

test('parseOrigin은 label이 없으면 빈 문자열로 채운다', () => {
  const r = parseOrigin(JSON.stringify({ lat: 1, lng: 2 }));
  assert.deepEqual(r, { lat: 1, lng: 2, label: '' });
});

test('resolveOrigin은 저장값이 있으면 그것을 반환하고 위치를 묻지 않는다', async () => {
  let asked = false;
  const storage = { getItem: () => JSON.stringify({ lat: 1, lng: 2, label: '저장됨' }) };
  const getPosition = async () => { asked = true; throw new Error('should not be called'); };
  const r = await resolveOrigin({ storage, getPosition });
  assert.deepEqual(r, { lat: 1, lng: 2, label: '저장됨' });
  assert.equal(asked, false);
});

test('resolveOrigin은 저장값이 없으면 현재 위치를 묻고 저장한다', async () => {
  let saved = null;
  const storage = {
    getItem: () => null,
    setItem: (_k, v) => { saved = v; },
  };
  const getPosition = async () => ({ lat: 10, lng: 20 });
  const r = await resolveOrigin({ storage, getPosition });
  assert.deepEqual(r, { lat: 10, lng: 20, label: '현재 위치' });
  assert.deepEqual(parseOrigin(saved), { lat: 10, lng: 20, label: '현재 위치' });
});

test('resolveOrigin은 위치 거부 시 DEFAULT_ORIGIN을 반환하고 저장하지 않는다', async () => {
  let saved = null;
  const storage = {
    getItem: () => null,
    setItem: (_k, v) => { saved = v; },
  };
  const getPosition = async () => { throw new Error('denied'); };
  const r = await resolveOrigin({ storage, getPosition });
  assert.deepEqual(r, DEFAULT_ORIGIN);
  assert.equal(saved, null);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `node --test test/origin.test.js`
Expected: FAIL — `Cannot find module '../public/origin.js'`.

- [ ] **Step 3: origin.js 구현**

`public/origin.js`를 아래 내용으로 생성한다.

```javascript
// 추첨 기준점(좌표 + 라벨) 관리. localStorage·geolocation 의존성은 주입받아
// 순수 로직을 테스트 가능하게 한다.

export const STORAGE_KEY = 'lunch.origin';
export const DEFAULT_ORIGIN = { lat: 37.5318, lng: 126.9143, label: '국회의사당' };

export function serializeOrigin(origin) {
  return JSON.stringify({ lat: origin.lat, lng: origin.lng, label: origin.label });
}

// 저장 문자열을 origin으로 파싱. 형식이 잘못되면 null.
export function parseOrigin(raw) {
  if (!raw) return null;
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj.lat !== 'number' || typeof obj.lng !== 'number') return null;
  return { lat: obj.lat, lng: obj.lng, label: typeof obj.label === 'string' ? obj.label : '' };
}

// 저장값 있으면 사용. 없으면 현재 위치 요청 → 성공 시 저장·반환, 실패 시 기본값.
export async function resolveOrigin({ storage, getPosition }) {
  const stored = parseOrigin(storage.getItem(STORAGE_KEY));
  if (stored) return stored;
  try {
    const pos = await getPosition();
    const origin = { lat: pos.lat, lng: pos.lng, label: '현재 위치' };
    storage.setItem(STORAGE_KEY, serializeOrigin(origin));
    return origin;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

// 브라우저 geolocation Promise 래퍼. 테스트에서는 주입 대체된다.
export function browserGetPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(err),
      { timeout: 8000 },
    );
  });
}

// 앱에서 쓰는 편의 함수: 실제 localStorage·geolocation을 주입해 호출.
export function initOrigin() {
  return resolveOrigin({ storage: window.localStorage, getPosition: browserGetPosition });
}

export function saveOrigin(origin) {
  window.localStorage.setItem(STORAGE_KEY, serializeOrigin(origin));
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `node --test test/origin.test.js`
Expected: PASS — 8개 테스트 모두 통과.

- [ ] **Step 5: 전체 테스트 확인**

Run: `npm test`
Expected: PASS — config 테스트 + origin 테스트 통과.

- [ ] **Step 6: 커밋**

```bash
git add public/origin.js test/origin.test.js
git commit -m "feat: 기준점 관리 모듈 origin.js 추가 (localStorage·geolocation·폴백)"
```

---

## Task 4: map.js에 주변 식당 검색·지역 검색 추가

카카오 카테고리 검색(`FD6` 음식점)으로 기준점 주변 식당 목록을, 키워드 검색으로 지역명 → 좌표를 얻는다. 등록 식당 이름을 재검색하던 `findPlace`와 `ASSEMBLY` 상수는 제거한다.

**Files:**
- Modify: `public/map.js`

> 참고: 카카오 SDK 의존 함수라 `node --test`로 자동 검증하지 않는다. 변경 후 `npm test`가 깨지지 않는지(이 파일은 테스트에서 import되지 않음)와 Task 7 수동 검증으로 확인한다.

- [ ] **Step 1: 모듈 주석과 import 정리, ASSEMBLY 제거**

`public/map.js` 상단의 주석/상수를 교체한다.

기존:
```javascript
// 카카오맵 SDK 로드 + 장소 검색 + 지도 렌더를 담당하는 모듈.
// 국회의사당(여의도) 기준으로 가장 가까운 장소를 선택한다.

const ASSEMBLY = { lat: 37.5318, lng: 126.9143 }; // 국회의사당
```

교체:
```javascript
// 카카오맵 SDK 로드 + 주변 식당 검색 + 지역 검색 + 지도 렌더 모듈.
// 추첨 풀은 기준점(origin) 주변 음식점을 카테고리 검색으로 수집한다.
```

- [ ] **Step 2: findPlace를 findNearbyRestaurants로 교체**

`public/map.js`에서 아래 `findPlace` 함수 전체를

```javascript
export function findPlace(name) {
  return new Promise((resolve) => {
    const places = new window.kakao.maps.services.Places();
    const options = {
      location: new window.kakao.maps.LatLng(ASSEMBLY.lat, ASSEMBLY.lng),
      sort: window.kakao.maps.services.SortBy.DISTANCE,
    };
    places.keywordSearch(
      name,
      (data, status) => {
        if (status === window.kakao.maps.services.Status.OK && data.length > 0) {
          resolve(data[0]); // 국회의사당에서 가장 가까운 결과
        } else {
          resolve(null);
        }
      },
      options,
    );
  });
}
```

아래 두 함수로 교체한다.

```javascript
// 기준점(origin) 주변 음식점 목록을 카테고리 검색(FD6)으로 수집한다.
// radius: 미터(최대 20000). 거리순 정렬. 최대 maxPages 페이지까지 모은다.
export function findNearbyRestaurants(origin, radius, maxPages = 3) {
  return new Promise((resolve) => {
    const places = new window.kakao.maps.services.Places();
    const results = [];
    const options = {
      location: new window.kakao.maps.LatLng(origin.lat, origin.lng),
      radius: Math.min(radius, 20000),
      sort: window.kakao.maps.services.SortBy.DISTANCE,
    };
    const onData = (data, status, pagination) => {
      if (status === window.kakao.maps.services.Status.OK) {
        results.push(...data);
        if (pagination.hasNextPage && pagination.current < maxPages) {
          pagination.nextPage();
          return;
        }
      }
      resolve(results);
    };
    places.categorySearch('FD6', onData, options);
  });
}

// 지역명으로 좌표를 찾는다(기준점 설정용). 첫 결과를 {lat, lng, label}로 반환.
export function searchRegion(query) {
  return new Promise((resolve) => {
    const places = new window.kakao.maps.services.Places();
    places.keywordSearch(query, (data, status) => {
      if (status === window.kakao.maps.services.Status.OK && data.length > 0) {
        const p = data[0];
        resolve({ lat: Number(p.y), lng: Number(p.x), label: p.place_name });
      } else {
        resolve(null);
      }
    });
  });
}
```

- [ ] **Step 3: 자동 테스트가 여전히 통과하는지 확인**

Run: `npm test`
Expected: PASS — `map.js`는 테스트에서 import되지 않으므로 영향 없음. config·origin 테스트 통과.

- [ ] **Step 4: 커밋**

```bash
git add public/map.js
git commit -m "feat: map.js에 주변 식당(categorySearch)·지역 검색 추가, findPlace 제거"
```

---

## Task 5: index.html을 위치 기반 UI로 교체

등록 폼·검색창·메뉴 리스트를 제거하고, 기준점 표시/변경 컨트롤과 반경 프리셋을 추가한다.

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: `<main>` 내부 교체**

`public/index.html`의 `<main>...</main>` 전체(현재 30~68행)를 아래로 교체한다. `<h1>`과 `random-btn`/`random-result`/`recommend` 구조·`random-btn` 내부 SVG는 유지하고, 기준점·반경 컨트롤을 추가하며 등록 폼·검색·리스트를 제거한다.

```html
        <main>
            <h1>오늘 뭐 먹지?</h1>

            <section class="origin-panel">
                <div class="origin-current">
                    <span class="origin-label-prefix">기준 위치</span>
                    <span id="origin-label" class="origin-label">불러오는 중…</span>
                </div>
                <div class="origin-actions">
                    <button id="use-location-btn" type="button">현재 위치 사용</button>
                    <form id="region-form" class="region-form">
                        <input id="region-input" type="search" placeholder="지역 검색 (예: 강남역)" autocomplete="off" aria-label="지역 검색" />
                        <button type="submit">검색</button>
                    </form>
                </div>
                <p id="origin-hint" class="origin-hint" role="status" aria-live="polite"></p>
            </section>

            <section class="radius-panel" aria-label="검색 반경">
                <div id="radius-options" class="radius-options" role="radiogroup" aria-label="검색 반경">
                    <button type="button" class="radius-btn" data-radius="300" role="radio" aria-checked="false">300m<small>도보 4분</small></button>
                    <button type="button" class="radius-btn" data-radius="500" role="radio" aria-checked="true">500m<small>도보 7분</small></button>
                    <button type="button" class="radius-btn" data-radius="1000" role="radio" aria-checked="false">1km<small>도보 13분</small></button>
                    <button type="button" class="radius-btn" data-radius="2000" role="radio" aria-checked="false">2km<small>도보 25분</small></button>
                </div>
            </section>

            <section class="recommend">
                <button id="random-btn">
                    <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                    >
                        <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
                        <path d="m18 2 4 4-4 4" />
                        <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
                        <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
                        <path d="m18 14 4 4-4 4" />
                    </svg>
                    <span>랜덤 추천</span>
                </button>
                <p id="random-result" aria-live="polite"></p>
            </section>
        </main>
```

- [ ] **Step 2: 브라우저에서 깨진 참조가 없는지 확인 (수동 점검 준비)**

`public/index.html`에 `id="name"`, `id="search"`, `id="menu-list"`, `id="add-form"`, `id="recommend-scope"`가 더 이상 없는지 확인한다. (Task 6에서 `app.js`가 이 ID들을 참조하지 않도록 재작성한다.)

Run: `grep -nE 'id="(name|description|search|menu-list|add-form|recommend-scope|search-wrap)"' public/index.html`
Expected: 출력 없음.

- [ ] **Step 3: 더 이상 매칭되지 않는 CSS 규칙 정리**

`public/style.css`에서 제거된 요소만 겨냥하던 규칙을 삭제한다(셀렉터가 안 맞아 무해하지만 죽은 코드를 남기지 않는다). 최소한 아래 두 줄을 제거한다.

```css
#search::placeholder { color: var(--muted); }
```
```css
.recommend-scope { margin: 8px 0 0; font-size: 0.85rem; color: var(--muted); }
.recommend-scope[hidden] { display: none; }
```

> 참고: `.menu-item`, `.empty-*`, `.crown`, `.vote-*`, `.edit-*`, `.del-*` 등 등록·투표 UI 전용 규칙도 죽은 코드다. 이번엔 추첨 흐름 동작을 막지 않으므로 필수 삭제는 아니지만, 한 번에 정리하고 싶으면 같은 커밋에서 제거해도 된다.

- [ ] **Step 4: 커밋**

```bash
git add public/index.html public/style.css
git commit -m "feat: index.html을 기준점·반경 컨트롤 기반 UI로 교체"
```

---

## Task 6: app.js를 위치 기반 추첨으로 재작성

`public/app.js`를 위치 기반 흐름으로 전면 재작성한다. 테마 토글·토스트·지도 모달·별 버스트 연출은 재활용하고, 등록/투표/수정/삭제/정적 검색/메뉴 목록 렌더는 제거한다.

**Files:**
- Modify: `public/app.js` (전체 교체)

> 참고: 브라우저 코드라 자동 테스트 대상이 아니다. Task 7 수동 검증으로 확인한다.

- [ ] **Step 1: app.js 전체 교체**

`public/app.js` 전체를 아래로 교체한다.

```javascript
import {
  initConfig,
  isLocationEnabled,
  loadKakao,
  findNearbyRestaurants,
  searchRegion,
  showMap,
} from './map.js';
import { initOrigin, saveOrigin } from './origin.js';

const themeToggle = document.getElementById('theme-toggle');
const originLabel = document.getElementById('origin-label');
const originHint = document.getElementById('origin-hint');
const useLocationBtn = document.getElementById('use-location-btn');
const regionForm = document.getElementById('region-form');
const regionInput = document.getElementById('region-input');
const radiusOptions = document.getElementById('radius-options');
const randomBtn = document.getElementById('random-btn');
const randomResult = document.getElementById('random-result');
const toastContainer = document.getElementById('toast-container');

let origin = null;        // { lat, lng, label }
let radius = 500;         // 선택된 반경(m)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function icon(paths, size = 20) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
const ICONS = {
    sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
    moon: icon('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
    close: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 18),
};

// ---- 테마 ----
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggle.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
    themeToggle.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
}
applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
});

// ---- 토스트 ----
function showToast(message, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = message;
    toastContainer.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
        t.classList.remove('show');
        t.addEventListener('transitionend', () => t.remove(), { once: true });
    }, 2600);
}

// ---- 기준점 ----
function setOrigin(next, { persist = true } = {}) {
    origin = next;
    originLabel.textContent = next.label || `${next.lat.toFixed(4)}, ${next.lng.toFixed(4)}`;
    if (persist) saveOrigin(next);
}

useLocationBtn.addEventListener('click', async () => {
    useLocationBtn.disabled = true;
    originHint.textContent = '현재 위치를 가져오는 중…';
    try {
        const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
                reject,
                { timeout: 8000 },
            );
        });
        setOrigin({ lat: pos.lat, lng: pos.lng, label: '현재 위치' });
        originHint.textContent = '';
    } catch {
        originHint.textContent = '위치 권한이 필요해요. 지역을 직접 검색해보세요.';
    } finally {
        useLocationBtn.disabled = false;
    }
});

regionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = regionInput.value.trim();
    if (!q) return;
    if (!isLocationEnabled()) {
        showToast('지도 키가 설정되지 않았어요', 'error');
        return;
    }
    originHint.textContent = '지역을 검색하는 중…';
    const ok = await loadKakao();
    if (!ok) {
        originHint.textContent = '지도를 불러오지 못했어요.';
        return;
    }
    const region = await searchRegion(q);
    if (!region) {
        originHint.textContent = `'${q}' 위치를 찾지 못했어요.`;
        return;
    }
    setOrigin(region);
    originHint.textContent = '';
    regionInput.value = '';
});

// ---- 반경 ----
radiusOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.radius-btn');
    if (!btn) return;
    radius = Number(btn.dataset.radius);
    for (const b of radiusOptions.querySelectorAll('.radius-btn')) {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', String(on));
    }
});
// 기본 선택(500m) 시각 표시
radiusOptions.querySelector('.radius-btn[data-radius="500"]').classList.add('active');

// ---- 지도 모달 (기존 구조 재활용) ----
let mapModalEls = null;
let mapModalOpener = null;

function ensureMapModal() {
    if (mapModalEls) return mapModalEls;
    const overlay = document.createElement('div');
    overlay.className = 'map-modal';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
    <div class="map-dialog">
      <div class="map-dialog-header">
        <span class="map-dialog-title"></span>
        <button type="button" class="map-close" aria-label="닫기">${ICONS.close}</button>
      </div>
      <div class="map-dialog-body"></div>
    </div>
  `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeMapModal();
    });
    overlay.querySelector('.map-close').addEventListener('click', closeMapModal);
    document.body.appendChild(overlay);
    mapModalEls = {
        overlay,
        title: overlay.querySelector('.map-dialog-title'),
        body: overlay.querySelector('.map-dialog-body'),
        closeBtn: overlay.querySelector('.map-close'),
    };
    return mapModalEls;
}

function onMapModalKeydown(e) {
    if (e.key === 'Escape') closeMapModal();
}

function openMapModal(name, opener) {
    const els = ensureMapModal();
    mapModalOpener = opener || document.activeElement;
    els.title.textContent = name;
    els.body.innerHTML = '';
    els.overlay.setAttribute('aria-label', `${name} 위치`);
    els.overlay.hidden = false;
    requestAnimationFrame(() => els.overlay.classList.add('show'));
    document.addEventListener('keydown', onMapModalKeydown);
    els.closeBtn.focus();
    return els.body;
}

function closeMapModal() {
    if (!mapModalEls || mapModalEls.overlay.hidden) return;
    const { overlay, body } = mapModalEls;
    overlay.classList.remove('show');
    document.removeEventListener('keydown', onMapModalKeydown);
    const finish = () => {
        overlay.hidden = true;
        body.innerHTML = '';
        overlay.removeEventListener('transitionend', finish);
    };
    overlay.addEventListener('transitionend', finish);
    if (mapModalOpener && typeof mapModalOpener.focus === 'function') {
        mapModalOpener.focus();
    }
    mapModalOpener = null;
}

// ---- 별 버스트 (기존 연출 재활용) ----
function burstStars(originEl) {
    const host = originEl.parentElement; // .recommend (position: relative)
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    const elRect = originEl.getBoundingClientRect();
    const cx = elRect.left - hostRect.left + elRect.width / 2;
    const cy = elRect.top - hostRect.top + elRect.height / 2;

    const glyphs = ['★', '✦', '✧', '⭐', '✨'];
    const colors = ['#f59e0b', '#fbbf24', '#fcd34d', '#fb7185', '#34d399', '#60a5fa'];
    const count = 18;

    for (let i = 0; i < count; i++) {
        const star = document.createElement('span');
        star.className = 'burst-star';
        star.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
        star.style.color = colors[Math.floor(Math.random() * colors.length)];
        star.style.fontSize = `${10 + Math.random() * 16}px`;
        star.style.left = `${cx}px`;
        star.style.top = `${cy}px`;
        host.appendChild(star);

        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const distance = 70 + Math.random() * 80;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance - 10;
        const rot = (Math.random() - 0.5) * 540;
        const duration = 700 + Math.random() * 500;

        const anim = star.animate(
            [
                { transform: 'translate(-50%, -50%) translate(0px, 0px) scale(0) rotate(0deg)', opacity: 1 },
                { transform: `translate(-50%, -50%) translate(${dx * 0.6}px, ${dy * 0.6}px) scale(1.2) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.55 },
                { transform: `translate(-50%, -50%) translate(${dx}px, ${dy + 24}px) scale(0.3) rotate(${rot}deg)`, opacity: 0 },
            ],
            { duration, easing: 'cubic-bezier(0.18, 0.7, 0.3, 1)' }
        );
        anim.onfinish = () => star.remove();
    }
}

// ---- 추첨 ----
function clearPrevResult() {
    randomResult.classList.remove('winner');
    randomResult.textContent = '';
    const prevLoc = randomResult.nextElementSibling;
    if (prevLoc?.classList.contains('loc-wrap')) prevLoc.remove();
}

// 당첨 식당의 '위치 보기' 컨트롤을 만든다. place는 카카오 검색 결과.
function createLocationControl(place) {
    const wrap = document.createElement('div');
    wrap.className = 'loc-wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'loc-btn';
    btn.innerHTML = '<span>위치 보기</span>';
    btn.addEventListener('click', () => {
        const body = openMapModal(place.place_name, btn);
        showMap(body, place);
    });
    wrap.appendChild(btn);
    return wrap;
}

randomBtn.addEventListener('click', async () => {
    if (randomBtn.disabled) return;
    if (!isLocationEnabled()) {
        showToast('지도 키가 설정되지 않았어요', 'error');
        return;
    }
    randomBtn.disabled = true;
    clearPrevResult();
    randomResult.textContent = '주변 식당을 찾는 중…';

    const ok = await loadKakao();
    if (!ok) {
        randomResult.textContent = '지도를 불러오지 못했어요.';
        randomBtn.disabled = false;
        return;
    }

    let pool;
    try {
        pool = await findNearbyRestaurants(origin, radius);
    } catch {
        randomResult.textContent = '검색 중 오류가 발생했어요.';
        randomBtn.disabled = false;
        return;
    }

    if (!pool || pool.length === 0) {
        randomResult.textContent = '주변에 식당이 없어요. 반경을 넓혀보세요.';
        randomBtn.disabled = false;
        return;
    }

    const winner = pool[Math.floor(Math.random() * pool.length)];
    const names = pool.map((p) => p.place_name);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
        randomResult.classList.add('rolling');
        let delay = 60;
        for (let i = 0; i < 18; i++) {
            randomResult.textContent = names[Math.floor(Math.random() * names.length)];
            await sleep(delay);
            delay += 18;
        }
        randomResult.classList.remove('rolling');
    }

    randomResult.textContent = `오늘은 → ${winner.place_name}`;
    randomResult.classList.remove('winner');
    void randomResult.offsetWidth;
    randomResult.classList.add('winner');

    if (!reduceMotion) {
        burstStars(randomResult);
        randomBtn.classList.add('fired');
        randomBtn.addEventListener('animationend', () => randomBtn.classList.remove('fired'), { once: true });
    }

    const ctrl = createLocationControl(winner);
    randomResult.insertAdjacentElement('afterend', ctrl);
    randomBtn.disabled = false;
});

// ---- 초기화 ----
async function init() {
    await initConfig();
    if (!isLocationEnabled()) {
        originHint.textContent = '지도 키가 설정되지 않아 추첨을 사용할 수 없어요.';
        randomBtn.disabled = true;
    }
    const resolved = await initOrigin();
    // initOrigin이 저장/폴백을 이미 처리하므로 여기서는 표시만(중복 저장 방지).
    setOrigin(resolved, { persist: false });
}

init();
```

- [ ] **Step 2: 깨진 참조가 없는지 확인**

`public/app.js`가 더 이상 `search.js`, `findPlace`, `kakaoSearchUrl`, 제거된 DOM ID를 import/참조하지 않는지 확인한다.

Run: `grep -nE "search\.js|findPlace|menu-list|add-form|'#search'|getElementById\('name'\)" public/app.js`
Expected: 출력 없음.

- [ ] **Step 3: 자동 테스트 확인**

Run: `npm test`
Expected: PASS — config·origin 테스트 통과(프론트 변경은 무관).

- [ ] **Step 4: 커밋**

```bash
git add public/app.js
git commit -m "feat: app.js를 위치 기반 실시간 추첨으로 재작성 (등록·투표·검색 제거)"
```

---

## Task 7: 스타일 추가 및 수동 검증

새 컨트롤(기준점 패널, 반경 버튼)의 최소 스타일을 추가하고, 실제 브라우저에서 흐름을 확인한다.

**Files:**
- Modify: `public/style.css`

- [ ] **Step 1: 새 컨트롤 스타일 추가**

`public/style.css` 끝에 아래를 추가한다. (기존 변수/토큰이 있으면 그 색을 써도 되지만, 여기서는 기존 클래스와 충돌하지 않는 신규 클래스만 정의한다.)

기존 CSS 변수(`--line`, `--muted`, `--brand`, `--brand-soft`)를 그대로 사용해 다크 모드에도 자동 대응한다.

```css
/* 기준점 패널 */
.origin-panel {
  margin: 0 0 16px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.origin-current {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}
.origin-label-prefix {
  font-size: 13px;
  color: var(--muted);
}
.origin-label {
  font-weight: 700;
}
.origin-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.region-form {
  display: flex;
  gap: 6px;
  flex: 1 1 200px;
}
.region-form input {
  flex: 1;
  min-width: 0;
}
.origin-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--muted);
  min-height: 1em;
}

/* 반경 프리셋 */
.radius-panel {
  margin: 0 0 16px;
}
.radius-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.radius-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 6px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-weight: 600;
}
.radius-btn small {
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
}
.radius-btn.active {
  border-color: var(--brand);
  background: var(--brand-soft);
}
```

- [ ] **Step 2: 커밋**

```bash
git add public/style.css
git commit -m "style: 기준점 패널·반경 프리셋 버튼 스타일 추가"
```

- [ ] **Step 3: 카카오 키로 앱 실행 (수동 검증)**

`.env`에 `KAKAO_JS_KEY`가 있는지 확인하고 실행한다.

Run: `npm run dev`
Expected: `Lunch app listening on http://localhost:3000` 출력. (`.env` 없으면 `KAKAO_JS_KEY=... node server.js`로 키를 직접 전달.)

- [ ] **Step 4: 브라우저 수동 체크리스트**

`http://localhost:3000` 접속 후 확인:
- 첫 로드 시 위치 권한 요청이 뜨고, 허용하면 기준 위치가 "현재 위치"로 표시된다.
- 거부하면 기준 위치가 "국회의사당"으로 표시된다.
- "지역 검색"에 "강남역" 입력 → 검색 시 기준 위치 라벨이 바뀐다.
- 반경 버튼(300m/500m/1km/2km)을 누르면 선택 표시가 바뀐다.
- "랜덤 추천" → 슬롯 연출 후 한 곳이 뽑히고 별이 터진다.
- "위치 보기" → 지도 모달이 뜨고 마커·"카카오맵에서 열기" 링크가 보인다.
- 새로고침해도 마지막 기준 위치가 유지된다(localStorage).

- [ ] **Step 5: 검증 결과 기록**

수동 체크리스트 중 실패한 항목이 있으면 원인을 파악해 해당 Task로 돌아가 수정한다. 모두 통과하면 다음 Task로 진행.

---

## Task 8: 배포 설정·문서 정리

DB 환경변수를 제거하고 카카오 키만 남긴다.

**Files:**
- Modify: `render.yaml`, `.env.example`, `package.json`

- [ ] **Step 1: render.yaml에서 Turso 변수 제거**

`render.yaml`의 `envVars` 블록을 아래로 교체한다.

```yaml
    envVars:
      - key: KAKAO_JS_KEY
        sync: false
```

- [ ] **Step 2: .env.example 교체**

`.env.example` 전체를 아래로 교체한다.

```
# 카카오맵 JavaScript 키 — 주변 식당 검색·지도 표시에 사용. 카드 등록 불필요.
KAKAO_JS_KEY=<your-kakao-javascript-key>
```

- [ ] **Step 3: package.json에서 DB 의존성 제거**

`package.json`의 `dependencies`에서 `@libsql/client` 줄을 제거한다. 결과:

```json
  "dependencies": {
    "express": "^4.21.2"
  },
```

- [ ] **Step 4: 의존성 재설치로 lock 갱신 및 테스트**

Run: `npm install && npm test`
Expected: `package-lock.json` 갱신, 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add render.yaml .env.example package.json package-lock.json
git commit -m "chore: DB 환경변수·의존성 제거, 카카오 키만 유지"
```

---

## 완료 기준

- `npm test`가 config·origin 테스트로 통과한다.
- 브라우저에서 기준점(현재 위치/지역 검색) 설정 → 반경 선택 → 주변 식당 추첨 → 지도 보기 흐름이 동작한다.
- DB·등록·투표·정적 검색 관련 코드와 환경변수가 저장소에서 제거됐다.
