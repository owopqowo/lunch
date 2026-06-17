# 식당 위치 확인 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 랜덤 추천으로 정해진 식당 및 목록의 각 식당을, 버튼 클릭 시 카카오맵으로 위치 확인할 수 있게 한다.

**Architecture:** 카카오맵 JavaScript SDK의 `services` 라이브러리를 브라우저에서 직접 사용해 식당 이름으로 장소를 검색(국회의사당 중심 거리순)하고 좌표를 얻어 인라인 지도+마커를 렌더한다. JS 키는 새 `GET /api/config` 엔드포인트로 환경변수에서 전달한다. DB 변경 없음.

**Tech Stack:** Node.js (ESM), Express, @libsql/client, 카카오맵 JS SDK(services), node:test + supertest

## Global Constraints

- ESM 모듈만 사용 (`import`/`export`, `"type": "module"`).
- 비밀값(키)은 코드에 박지 않고 `process.env`로 읽는다. `.env`는 커밋하지 않는다.
- DB 스키마(`menus`)는 변경하지 않는다.
- 국회의사당 좌표: 위도 `37.5318`, 경도 `126.9143`.
- 위치 기능은 JS 키가 있을 때만 노출한다 (키 없으면 버튼 미렌더).
- 지도는 항상 버튼 클릭 시에만(lazy) 표시한다. 자동 표시 금지.
- 기존 한국어 UI 문구·토스트 패턴(`showToast`)을 따른다.

---

## File Structure

- `app.js` — Express 라우트. `GET /api/config` 추가.
- `.env.example` — `KAKAO_JS_KEY` 항목 추가.
- `public/map.js` — 신규. 카카오 SDK 로드 + 장소 검색 + 지도 렌더 담당 (지도 책임 격리).
- `public/index.html` — `map.js` 로드, 카카오 지도 인라인 컨테이너 마크업 위치.
- `public/app.js` — 위치 버튼/지도 토글을 랜덤 결과 및 목록 항목에 통합.
- `public/style.css` — 위치 버튼·지도 컨테이너 스타일.
- `test/api.test.js` — `GET /api/config` 테스트 추가.

---

## Task 1: `GET /api/config` 엔드포인트

**Files:**
- Modify: `app.js` (라우트 추가)
- Test: `test/api.test.js` (테스트 추가)

**Interfaces:**
- Produces: `GET /api/config` → `200 { kakaoJsKey: string | null }`.
  값은 `process.env.KAKAO_JS_KEY`가 비어있으면 `null`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/api.test.js` 끝에 추가:

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: 위 두 테스트가 FAIL (`/api/config` → 404).

- [ ] **Step 3: 최소 구현**

`app.js`의 `app.use(express.static(...))` 바로 다음 줄에 추가:

```js
  app.get('/api/config', (req, res) => {
    res.json({ kakaoJsKey: process.env.KAKAO_JS_KEY || null });
  });
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add app.js test/api.test.js
git commit -m "feat: KAKAO_JS_KEY를 전달하는 GET /api/config 추가"
```

---

## Task 2: `.env.example`에 키 항목 추가

**Files:**
- Modify: `.env.example`

**Interfaces:**
- Produces: 문서화된 `KAKAO_JS_KEY` 환경변수 이름.

- [ ] **Step 1: `.env.example` 수정**

파일 끝에 추가:

```
# 카카오맵 JavaScript 키 — 식당 위치 표시에 사용. 카드 등록 불필요.
KAKAO_JS_KEY=<your-kakao-javascript-key>
```

- [ ] **Step 2: 커밋**

```bash
git add .env.example
git commit -m "docs: .env.example에 KAKAO_JS_KEY 추가"
```

---

## Task 3: 지도 모듈 `public/map.js`

**Files:**
- Create: `public/map.js`

**Interfaces:**
- Consumes: `GET /api/config`(Task 1), 카카오 SDK(동적 로드).
- Produces (ESM named exports):
  - `isLocationEnabled(): boolean` — 키 존재 여부 (init 후 유효).
  - `loadKakao(): Promise<boolean>` — SDK 로드/준비. 성공 시 `true`.
  - `findPlace(name: string): Promise<{name, x, y, place_url}|null>`
    — 국회의사당 중심, 거리순 첫 결과. 없으면 `null`.
  - `showMap(container: HTMLElement, place): void` — 지도+마커+카카오맵 링크 렌더.
  - `kakaoSearchUrl(name: string): string` — `https://map.kakao.com/?q=...` 폴백 링크.

> 브라우저 카카오 SDK 의존이라 단위 테스트는 두지 않는다(수동 확인). 인터페이스를 좁고 명확하게 유지한다.

- [ ] **Step 1: `public/map.js` 작성**

```js
// 카카오맵 SDK 로드 + 장소 검색 + 지도 렌더를 담당하는 모듈.
// 국회의사당(여의도) 기준으로 가장 가까운 장소를 선택한다.

const ASSEMBLY = { lat: 37.5318, lng: 126.9143 }; // 국회의사당

let cachedKey = null;        // string | null (null = 미설정)
let configLoaded = false;
let sdkPromise = null;       // Promise<boolean> 캐시

export async function initConfig() {
  if (configLoaded) return cachedKey;
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    cachedKey = data.kakaoJsKey || null;
  } catch {
    cachedKey = null;
  }
  configLoaded = true;
  return cachedKey;
}

export function isLocationEnabled() {
  return !!cachedKey;
}

export function kakaoSearchUrl(name) {
  return `https://map.kakao.com/?q=${encodeURIComponent(name)}`;
}

export function loadKakao() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    if (!cachedKey) {
      resolve(false);
      return;
    }
    if (window.kakao && window.kakao.maps) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src =
      `//dapi.kakao.com/v2/maps/sdk.js?appkey=${cachedKey}` +
      `&libraries=services&autoload=false`;
    script.onload = () => window.kakao.maps.load(() => resolve(true));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return sdkPromise;
}

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

export function showMap(container, place) {
  const lat = Number(place.y);
  const lng = Number(place.x);
  const center = new window.kakao.maps.LatLng(lat, lng);

  container.innerHTML = '';
  const mapEl = document.createElement('div');
  mapEl.className = 'map-canvas';
  container.appendChild(mapEl);

  const map = new window.kakao.maps.Map(mapEl, { center, level: 3 });
  const marker = new window.kakao.maps.Marker({ position: center });
  marker.setMap(map);

  const link = document.createElement('a');
  link.className = 'map-link';
  link.href = place.place_url || kakaoSearchUrl(place.place_name || '');
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = '카카오맵에서 열기';
  container.appendChild(link);

  // 컨테이너가 늦게 보이면 지도 타일이 깨지므로 한 번 리레이아웃
  setTimeout(() => {
    map.relayout();
    map.setCenter(center);
  }, 0);
}
```

- [ ] **Step 2: 문법/로드 확인**

Run: `node --check public/map.js`
Expected: 출력 없음(성공).

- [ ] **Step 3: 커밋**

```bash
git add public/map.js
git commit -m "feat: 카카오맵 위치 검색/렌더 모듈 추가"
```

---

## Task 4: 위치 버튼·지도 컨테이너 스타일

**Files:**
- Modify: `public/style.css`

**Interfaces:**
- Consumes: Task 3의 `.map-canvas`, `.map-link` 클래스명.
- Produces: `.loc-btn`, `.map-box`, `.map-canvas`, `.map-link` 스타일.

- [ ] **Step 1: `public/style.css` 끝에 추가**

```css
/* 위치 보기 버튼 / 지도 */
.loc-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.map-box {
  margin-top: 12px;
}

.map-canvas {
  width: 100%;
  height: 220px;
  border-radius: 10px;
  overflow: hidden;
}

.map-link {
  display: inline-block;
  margin-top: 8px;
  font-size: 0.875rem;
}
```

- [ ] **Step 2: 커밋**

```bash
git add public/style.css
git commit -m "style: 위치 버튼·지도 컨테이너 스타일 추가"
```

---

## Task 5: `index.html`에서 `map.js` 로드

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `public/map.js`(Task 3), `public/app.js`.
- Produces: `app.js`가 ESM `import`로 `map.js`를 쓸 수 있도록 `type="module"` 로드.

- [ ] **Step 1: 스크립트 태그 수정**

`public/index.html`의 다음 줄을:

```html
  <script src="/app.js"></script>
```

다음으로 교체:

```html
  <script type="module" src="/app.js"></script>
```

> `app.js`는 Task 6에서 `import { ... } from './map.js'`를 사용하므로 module 타입 필요.

- [ ] **Step 2: 커밋**

```bash
git add public/index.html
git commit -m "chore: app.js를 ESM 모듈로 로드"
```

---

## Task 6: 랜덤 추천 결과에 위치 버튼 통합

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: `map.js`의 `initConfig`, `isLocationEnabled`, `loadKakao`, `findPlace`, `showMap`, `kakaoSearchUrl`.
- Produces: 랜덤 결과 영역에 `위치 보기` 버튼 + 인라인 지도(`.map-box`).

- [ ] **Step 1: `app.js` 상단에 import 추가**

`public/app.js` 첫 줄 위에 추가:

```js
import {
  initConfig,
  isLocationEnabled,
  loadKakao,
  findPlace,
  showMap,
  kakaoSearchUrl,
} from './map.js';
```

- [ ] **Step 2: 위치 버튼을 만드는 공용 헬퍼 추가**

`const sleep = ...` 줄 위(파일 하단 근처)에 추가:

```js
// 식당 이름으로 '위치 보기' 버튼 + 토글되는 인라인 지도 박스를 만든다.
// 키가 없으면 null을 반환(버튼 미생성).
function createLocationControl(name) {
  if (!isLocationEnabled()) return null;

  const wrap = document.createElement('div');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'loc-btn';
  btn.textContent = '위치 보기';

  const box = document.createElement('div');
  box.className = 'map-box';
  box.hidden = true;

  let loaded = false;
  btn.addEventListener('click', async () => {
    // 이미 그려졌으면 토글만
    if (loaded) {
      box.hidden = !box.hidden;
      return;
    }
    btn.disabled = true;
    const ok = await loadKakao();
    if (!ok) {
      showToast('지도를 불러오지 못했어요', 'error');
      btn.disabled = false;
      return;
    }
    const place = await findPlace(name);
    if (!place) {
      showToast('위치를 찾지 못했어요', 'error');
      const a = document.createElement('a');
      a.href = kakaoSearchUrl(name);
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'map-link';
      a.textContent = '카카오맵에서 검색';
      box.innerHTML = '';
      box.appendChild(a);
      box.hidden = false;
      loaded = true;
      btn.disabled = false;
      return;
    }
    showMap(box, place);
    box.hidden = false;
    loaded = true;
    btn.disabled = false;
  });

  wrap.appendChild(btn);
  wrap.appendChild(box);
  return wrap;
}
```

- [ ] **Step 3: 랜덤 결과 확정 후 위치 버튼 부착**

`randomBtn` 클릭 핸들러에서 다음 두 줄:

```js
    randomResult.textContent = `오늘은 → ${winner.name}`;
    randomResult.classList.add('winner');
```

다음으로 교체:

```js
    randomResult.textContent = `오늘은 → ${winner.name}`;
    randomResult.classList.add('winner');
    const ctrl = createLocationControl(winner.name);
    if (ctrl) randomResult.insertAdjacentElement('afterend', ctrl);
```

- [ ] **Step 4: 재추첨 시 이전 위치 컨트롤 제거**

같은 핸들러 상단의 다음 줄:

```js
    randomResult.textContent = ''; // 이전 추첨 결과 즉시 제거
```

다음으로 교체:

```js
    randomResult.textContent = ''; // 이전 추첨 결과 즉시 제거
    randomResult.nextElementSibling?.remove(); // 이전 위치 컨트롤 제거
```

- [ ] **Step 5: 앱 시작 시 설정 로드**

`public/app.js` 마지막 줄:

```js
loadMenus({ skeleton: true });
```

다음으로 교체:

```js
initConfig().then(() => loadMenus({ skeleton: true }));
```

> `initConfig()`가 끝나야 `isLocationEnabled()`가 정확해져 목록 렌더 시 버튼 노출 여부가 맞는다.

- [ ] **Step 6: 문법 확인**

Run: `node --check public/app.js`
Expected: 출력 없음(성공).

- [ ] **Step 7: 기존 테스트 회귀 확인**

Run: `npm test`
Expected: 모든 테스트 PASS (프론트 변경은 API 테스트에 영향 없음).

- [ ] **Step 8: 커밋**

```bash
git add public/app.js
git commit -m "feat: 랜덤 추천 결과에 위치 보기 버튼 추가"
```

---

## Task 7: 목록 각 항목에 위치 버튼 통합

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: Task 6의 `createLocationControl(name)`.
- Produces: 각 메뉴 `<li>` 아래 토글되는 인라인 지도.

- [ ] **Step 1: `renderView`에 위치 컨트롤 부착**

`renderView` 함수의 마지막 줄:

```js
    li.querySelector('.del-btn').onclick = () => renderDeleteConfirm(li, m);
```

다음으로 교체:

```js
    li.querySelector('.del-btn').onclick = () => renderDeleteConfirm(li, m);
    const ctrl = createLocationControl(m.name);
    if (ctrl) li.appendChild(ctrl);
```

> `createLocationControl`이 만든 버튼/지도 박스는 `<li>` 맨 아래에 붙어,
> `.actions`와 별개의 줄에서 토글된다. `renderEdit`/`renderDeleteConfirm`로
> 전환 시 `li.innerHTML`이 갈아끼워지므로 컨트롤도 함께 제거되어 잔존하지 않는다.

- [ ] **Step 2: 문법 확인**

Run: `node --check public/app.js`
Expected: 출력 없음(성공).

- [ ] **Step 3: 기존 테스트 회귀 확인**

Run: `npm test`
Expected: 모든 테스트 PASS.

- [ ] **Step 4: 커밋**

```bash
git add public/app.js
git commit -m "feat: 메뉴 목록 각 항목에 위치 보기 버튼 추가"
```

---

## Task 8: 수동 통합 확인

**Files:** 없음 (수동 검증)

- [ ] **Step 1: 서버 실행**

Run: `npm run dev`
Expected: `Lunch app listening on http://localhost:3000`

- [ ] **Step 2: 브라우저 확인 (http://localhost:3000)**

확인 항목:
1. 식당 몇 개 추가 후 "랜덤 추천" → 당첨 결과 아래 "위치 보기" 버튼 표시.
2. "위치 보기" 클릭 → 인라인 지도 + 마커 + "카카오맵에서 열기" 링크 표시.
3. 다시 추첨 → 이전 지도 사라지고 새 결과로 갱신.
4. 목록 각 항목의 "위치 보기" 클릭 → 해당 항목 아래 지도 토글(다시 누르면 닫힘).
5. 동명 가능성이 있는 식당명으로 검색 시 국회의사당(여의도) 인근 결과가 잡히는지.
6. (선택) `.env`에서 `KAKAO_JS_KEY`를 비우고 재시작 → 위치 버튼이 아예 안 보이는지.

- [ ] **Step 3: 서버 종료**

`Ctrl+C`로 종료.

---

## Self-Review 결과

- **스펙 커버리지:** `/api/config`(T1), `.env.example`(T2), `map.js` 전 인터페이스(T3),
  국회의사당 거리순(T3 `findPlace`), lazy 버튼·랜덤 결과(T6)·목록(T7) 양쪽,
  키 미설정 시 버튼 숨김(T6 `createLocationControl`), 결과 없음/SDK 실패 폴백(T6),
  테스트(T1)·수동 확인(T8) — 모두 태스크에 매핑됨.
- **플레이스홀더:** 없음 (모든 코드 블록 실제 내용 포함).
- **타입 일관성:** `findPlace`는 카카오 place 객체(`x`,`y`,`place_url`,`place_name`)를
  반환하고 `showMap`이 동일 필드를 사용. `createLocationControl(name)` 시그니처가
  T6 정의·T7 사용에서 일치. `isLocationEnabled`/`loadKakao`/`initConfig` 명칭 T3↔T6 일치.
