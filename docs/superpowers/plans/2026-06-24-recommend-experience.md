# 추천 경험 정리 + 카테고리 추첨 연출 통일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 두 종류의 추천(카테고리 뽑기 / 식당 뽑기)을 동급 버튼으로 정리하고, 둘 다 동일한 슬롯머신+별 연출을 공유하게 하며, 카테고리 드롭다운을 필터 영역으로 옮긴다.

**Architecture:** 정적 HTML + 바닐라 ES 모듈 프런트엔드. 순수 로직(추첨 후보 산정)은 `public/category.js`에 추출해 `node --test`로 단위 테스트하고, DOM/연출 로직은 `public/app.js`에서 기존 슬롯머신 함수를 재사용하도록 리팩터한다. UI 동작은 브라우저에서 수동 검증한다.

**Tech Stack:** Vanilla JS (ES modules), `node:test` + `node:assert/strict`, Express(정적 서빙), 카카오 지도 SDK.

## Global Constraints

- 모듈 시스템: ESM (`"type": "module"`). import/export 사용.
- 테스트 러너: `npm test` → `node --test` (test/ 디렉터리의 `*.test.js`).
- 순수 함수만 단위 테스트한다. DOM/애니메이션은 단위 테스트하지 않고 수동 검증.
- 카테고리 추첨 후보 = 검색 적용 목록에서 식당이 **2곳 이상**인 카테고리.
- 식당 추첨 후보 = `currentPool`(검색 + 선택 카테고리 적용) 2곳 이상.
- 버튼 라벨: 카테고리 추첨 = `🎲 뭐 먹을까`, 식당 추첨 = `🍽 어디 갈까`.
- 결과 문구: 둘 다 `오늘은 → ○○○` 형식, 공유 자리 `#random-result`.
- `prefers-reduced-motion`이면 슬롯·별 생략하고 결과만 표시(현행 유지).
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

- `public/category.js` — 순수 카테고리 로직. **추가:** `eligibleCategories(menus)`.
- `test/category.test.js` — 위 함수 단위 테스트 추가.
- `public/index.html` — 추천 영역에 두 버튼 배치, 드롭다운을 검색창 아래로 이동.
- `public/app.js` — 슬롯 연출을 공유 함수로 추출, 카테고리 추첨 핸들러를
  토스트→슬롯+필터 동기화로 교체, `updateRecommendState`에 카테고리 버튼 상태 추가.
- `public/style.css` — 두 버튼 동급 스타일, 드롭다운 필터 영역 톤 정리.

---

### Task 1: `eligibleCategories` 순수 함수 (TDD)

검색이 적용된 메뉴 목록에서 "식당이 2곳 이상인 카테고리"만 정렬해 반환하는 순수
함수. 현재 `app.js`의 `categoryRandomBtn` 핸들러에 인라인으로 박혀 있는 후보 산정
로직([app.js:655-666](public/app.js#L655-L666))을 테스트 가능한 단위로 빼낸다.

**Files:**
- Modify: `public/category.js` (함수 추가)
- Test: `test/category.test.js` (테스트 추가)

**Interfaces:**
- Consumes: 없음(순수 함수).
- Produces: `eligibleCategories(menus: Array<{category?: string|null}>): string[]`
  — `category`가 같은 값으로 2개 이상인 카테고리명만, `localeCompare('ko')` 정렬,
  중복 없음. `category`가 falsy인 메뉴는 무시.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/category.test.js` 맨 위 import에 `eligibleCategories`를 추가한다:

```js
import {
  parseCategory,
  extractCategories,
  matchesCategory,
  mapCategory,
  eligibleCategories,
} from '../public/category.js';
```

파일 끝에 테스트를 추가한다:

```js
test('eligibleCategories는 2곳 이상인 카테고리만 정렬해 반환한다', () => {
  const menus = [
    { category: '한식' },
    { category: '한식' },
    { category: '일식' }, // 1곳뿐 → 제외
    { category: '중식' },
    { category: '중식' },
    { category: null }, // 무시
  ];
  assert.deepEqual(eligibleCategories(menus), ['중식', '한식']);
});

test('eligibleCategories는 후보가 없으면 빈 배열', () => {
  assert.deepEqual(eligibleCategories([]), []);
  assert.deepEqual(eligibleCategories([{ category: '한식' }]), []); // 1곳뿐
  assert.deepEqual(eligibleCategories([{ category: null }, { category: null }]), []);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `eligibleCategories is not a function` (또는 import 관련 에러).

- [ ] **Step 3: 최소 구현 작성**

`public/category.js` 끝에 추가한다:

```js
// 식당이 2곳 이상인 카테고리만 (추첨 후보). null/단독 카테고리는 제외, 정렬.
export function eligibleCategories(menus) {
  const counts = {};
  for (const m of menus) {
    if (m.category) counts[m.category] = (counts[m.category] || 0) + 1;
  }
  return Object.keys(counts)
    .filter((c) => counts[c] >= 2)
    .sort((a, b) => a.localeCompare(b, 'ko'));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (기존 테스트 포함 전부 통과).

- [ ] **Step 5: 커밋**

```bash
git add public/category.js test/category.test.js
git commit -m "feat: eligibleCategories 순수 함수 추출 (2곳 이상 카테고리)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: HTML 재배치 — 두 추천 버튼 + 드롭다운 이동

추천 영역에 두 버튼(`뭐 먹을까`/`어디 갈까`)을 나란히 두고, 카테고리 드롭다운을
추천 영역 밖, 검색창 아래로 옮긴다.

**Files:**
- Modify: `public/index.html:32-71`

**Interfaces:**
- Consumes: 없음.
- Produces: DOM 요소 id 계약 — `#random-btn`(식당 추첨), `#category-random-btn`
  (카테고리 추첨), `#random-result`, `#recommend-scope`, `#category-filter`(필터,
  검색창 아래로 이동), `#category-filter-wrap`(드롭다운 래퍼, 카테고리 없을 때
  숨김용). app.js가 이 id들을 참조한다.

- [ ] **Step 1: 추천 영역 교체**

[public/index.html:32-61](public/index.html#L32-L61)의 `<section class="recommend">`
블록 전체를 아래로 교체한다. (기존 `category-controls` div와 단일 `random-btn`을
제거하고, 두 버튼을 `recommend-actions`로 묶는다.)

```html
<section class="recommend">
  <div class="recommend-actions">
    <button id="category-random-btn" type="button" class="recommend-btn">
      <span aria-hidden="true">🎲</span>
      <span>뭐 먹을까</span>
    </button>
    <button id="random-btn" type="button" class="recommend-btn">
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
      <span>어디 갈까</span>
    </button>
  </div>
  <p id="recommend-scope" class="recommend-scope" hidden></p>
  <p id="random-result" aria-live="polite"></p>
</section>
```

- [ ] **Step 2: 검색 영역 아래에 드롭다운 추가**

[public/index.html:69-71](public/index.html#L69-L71)의 `#search-wrap` div 바로 뒤,
`<ul id="menu-list">` 앞에 드롭다운 래퍼를 추가한다:

```html
<div id="search-wrap" hidden>
    <input id="search" type="search" placeholder="식당·메뉴 검색" autocomplete="off" aria-label="식당·메뉴 검색" />
</div>

<div id="category-filter-wrap" hidden>
  <select id="category-filter" aria-label="음식 카테고리 선택">
    <option value="">전체</option>
  </select>
</div>
```

(기존 `category-controls`는 Step 1에서 이미 제거됨. `category-filter` select는
여기 한 곳에만 존재한다.)

- [ ] **Step 3: 페이지 로드 수동 확인**

Run: `npm start` 후 브라우저에서 `http://localhost:3000` 열기 (포트는 server.js
기준; 다르면 콘솔 출력 포트 사용).
Expected: 콘솔 에러 없음. 식당이 있으면 추천 영역에 `🎲 뭐 먹을까` `🍽 어디 갈까`
두 버튼이 나란히 보이고, 검색창 아래에 카테고리 드롭다운이 보인다(카테고리가
백필된 경우). 버튼/드롭다운 클릭 시 아직 동작이 깨질 수 있음 — 다음 태스크에서
배선하므로 여기서는 렌더링과 콘솔 무에러만 확인.

- [ ] **Step 4: 커밋**

```bash
git add public/index.html
git commit -m "feat: 추천 영역 두 버튼 배치 + 카테고리 드롭다운 필터 영역으로 이동

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 슬롯 연출 공유 함수 추출

현재 `randomBtn` 핸들러 안에 인라인으로 있는 슬롯머신 + 별 터짐 로직
([app.js:592-653](public/app.js#L592-L653))을, "표시할 라벨 배열 + 당첨 라벨"을
받아 연출을 재생하는 공유 함수로 빼낸다. 식당 추첨 핸들러는 이 함수를 쓰도록
바꾼다. (이 태스크에서는 식당 추첨 동작이 기존과 동일하게 유지되는지 검증.)

**Files:**
- Modify: `public/app.js:592-653`

**Interfaces:**
- Consumes: `burstStars`(기존 [app.js:548](public/app.js#L548)), `sleep`(기존),
  `randomResult`, `randomBtn`(전역 참조).
- Produces: `async function playSlot(labels: string[], winnerLabel: string): Promise<void>`
  — `#random-result`에 `labels`를 슬롯으로 흘리다 `오늘은 → ${winnerLabel}`에서
  멈추고 `winner` 클래스/별 터짐을 재생한다. reduce-motion이면 슬롯·별 생략.
  위치 컨트롤 부착이나 풀 산정은 하지 않는다(호출부 책임).

- [ ] **Step 1: 공유 함수 추가**

[app.js:545](public/app.js#L545)의 `const sleep = ...` 다음(즉 `burstStars` 정의
부근)에 `playSlot`을 추가한다:

```js
// 슬롯머신 + 별 터짐 공유 연출. labels를 흘리다 winnerLabel에서 멈춘다.
async function playSlot(labels, winnerLabel) {
  randomResult.classList.remove('winner');
  randomResult.textContent = ''; // 이전 결과 즉시 제거

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion && labels.length > 0) {
    randomResult.classList.add('rolling');
    let delay = 60;
    for (let i = 0; i < 18; i++) {
      randomResult.textContent = labels[Math.floor(Math.random() * labels.length)];
      await sleep(delay);
      delay += 18; // 점점 느려지게
    }
    randomResult.classList.remove('rolling');
  }

  randomResult.textContent = `오늘은 → ${winnerLabel}`;
  // winner 애니메이션 재시작(연속 추첨 시에도 매번 재생되도록 reflow 트리거)
  randomResult.classList.remove('winner');
  void randomResult.offsetWidth;
  randomResult.classList.add('winner');

  if (!reduceMotion) {
    burstStars(randomResult);
    randomBtn.classList.add('fired');
    randomBtn.addEventListener('animationend', () => randomBtn.classList.remove('fired'), { once: true });
  }
}
```

- [ ] **Step 2: 식당 추첨 핸들러를 공유 함수로 교체**

[app.js:592-653](public/app.js#L592-L653)의 `randomBtn` 클릭 핸들러에서, 풀을
구한 뒤의 연출 부분(현재 슬롯머신 인라인 루프 + winner 표시 + burstStars + fired,
대략 [app.js:621-648])을 `playSlot` 호출로 대체한다. 핸들러는 아래 형태가 된다:

```js
randomBtn.addEventListener('click', async () => {
    if (randomBtn.disabled) return;
    randomBtn.disabled = true;
    const prevLoc = randomResult.nextElementSibling; // 이전 위치 컨트롤 제거
    if (prevLoc?.classList.contains('loc-wrap')) prevLoc.remove();

    // 최신 목록을 받아 현재 필터(검색+카테고리) 안에서만 추첨한다.
    let menus;
    try {
        const listRes = await fetch('/api/menus');
        if (!listRes.ok) throw new Error('list error');
        menus = await listRes.json();
    } catch (err) {
        randomResult.textContent = '오류가 발생했습니다.';
        randomBtn.disabled = false;
        return;
    }

    const pool = currentPool(menus);
    if (pool.length === 0) {
        randomResult.textContent = searchInput.value.trim()
            ? '검색 결과가 없어요'
            : '식당을 먼저 추가하세요!';
        randomBtn.disabled = false;
        return;
    }

    const winner = pool[Math.floor(Math.random() * pool.length)];
    await playSlot(pool.map((m) => m.name), winner.name);

    const ctrl = createLocationControl(winner.name);
    if (ctrl) randomResult.insertAdjacentElement('afterend', ctrl);
    randomBtn.disabled = false;
});
```

- [ ] **Step 3: 단위 테스트 회귀 확인**

Run: `npm test`
Expected: PASS (이 변경은 순수 로직을 안 건드리므로 기존 테스트 전부 통과).

- [ ] **Step 4: 식당 추첨 수동 확인**

Run: `npm start` 후 브라우저에서 식당 2곳 이상인 상태로 `🍽 어디 갈까` 클릭.
Expected: 식당 이름들이 슬롯으로 돌다 `오늘은 → ○○○`에서 멈추고 별이 터진다(기존과
동일). 당첨 식당 아래 "위치 보기"가 뜬다(카카오 키 있을 때). 콘솔 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add public/app.js
git commit -m "refactor: 슬롯머신+별 연출을 playSlot 공유 함수로 추출

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 카테고리 추첨을 슬롯 연출 + 필터 동기화로 교체

토스트 방식([app.js:655-672](public/app.js#L655-L672))을 버리고, `eligibleCategories`
로 후보를 구해 `playSlot`으로 카테고리를 뽑은 뒤 드롭다운(필터)을 그 카테고리로
동기화한다.

**Files:**
- Modify: `public/app.js:11`(import), `public/app.js:655-672`(핸들러)

**Interfaces:**
- Consumes: `eligibleCategories`(Task 1), `playSlot`(Task 3), `filterMenus`,
  `categoryFilter`, `searchInput`, `selectedCategory`, `renderFiltered`.
- Produces: 없음(이벤트 핸들러).

- [ ] **Step 1: import에 eligibleCategories 추가**

[app.js:11](public/app.js#L11)을 수정한다:

```js
import { extractCategories, matchesCategory, mapCategory, eligibleCategories } from './category.js';
```

- [ ] **Step 2: 카테고리 추첨 핸들러 교체**

[app.js:655-672](public/app.js#L655-L672)의 `categoryRandomBtn` 클릭 핸들러를
교체한다:

```js
categoryRandomBtn.addEventListener('click', async () => {
  if (categoryRandomBtn.disabled) return;
  categoryRandomBtn.disabled = true;
  randomBtn.disabled = true; // 연출 중에는 식당 추첨도 막아 결과 자리 충돌 방지
  const prevLoc = randomResult.nextElementSibling; // 이전 위치 컨트롤 제거
  if (prevLoc?.classList.contains('loc-wrap')) prevLoc.remove();

  // 검색이 적용된 목록에서 2곳 이상인 카테고리만 후보.
  const inSearch = filterMenus(allMenus, searchInput.value);
  const eligible = eligibleCategories(inSearch);
  if (eligible.length === 0) {
    randomResult.textContent = '추첨할 메뉴 종류가 부족해요';
    categoryRandomBtn.disabled = false;
    randomBtn.disabled = currentPool(allMenus).length < 2;
    return;
  }

  const picked = eligible[Math.floor(Math.random() * eligible.length)];
  await playSlot(eligible, picked);

  // 당첨 카테고리로 필터 동기화 → 목록이 그 카테고리만 남는다.
  selectedCategory = picked;
  categoryFilter.value = picked;
  renderFiltered();
});
```

참고: `renderFiltered`는 내부에서 `updateRecommendState`를 호출해 두 버튼의
disabled를 재계산하므로(Task 5), 위에서 수동으로 다시 켜지 않는다. 후보가
없는 조기 반환 경로에서만 명시적으로 복구한다.

- [ ] **Step 3: 단위 테스트 회귀 확인**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: 카테고리 추첨 수동 확인**

Run: `npm start` 후, 같은 카테고리 식당이 2곳 이상이 되도록 등록(예: 한식 2곳,
중식 2곳; 카카오 키가 있어야 백필됨). `🎲 뭐 먹을까` 클릭.
Expected: 카테고리명들이 슬롯으로 돌다 `오늘은 → 한식`에서 멈추고 별이 터진다.
동시에 검색창 아래 드롭다운이 "한식"으로 바뀌고 목록이 한식만 남는다. 토스트는
더 이상 안 뜬다.

- [ ] **Step 5: 커밋**

```bash
git add public/app.js
git commit -m "feat: 카테고리 추첨을 슬롯 연출+필터 동기화로 교체 (토스트 제거)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 버튼 상태/안내 + 드롭다운 표시 로직 정리

두 버튼의 활성/비활성과 안내문을 한곳(`updateRecommendState`)에서 계산하고,
드롭다운 래퍼(`#category-filter-wrap`)의 표시 여부를 카테고리 유무로 제어한다.
(기존 `renderCategoryOptions`는 `category-controls`를 숨겼으나 그 요소가 사라졌다.)

**Files:**
- Modify: `public/app.js:25-27`(요소 참조), `public/app.js:142-160`
  (`renderCategoryOptions`), `public/app.js:232-248`(`updateRecommendState`)

**Interfaces:**
- Consumes: `eligibleCategories`, `filterMenus`, `currentPool`, `categoryRandomBtn`,
  `randomBtn`, `allMenus`, `searchInput`, `selectedCategory`.
- Produces: 없음.

- [ ] **Step 1: 요소 참조 갱신**

[app.js:25-27](public/app.js#L25-L27)에서 `categoryControls` 참조를 드롭다운 래퍼
참조로 교체한다(`category-controls`는 더 이상 없음):

```js
const categoryFilterWrap = document.getElementById('category-filter-wrap');
const categoryFilter = document.getElementById('category-filter');
const categoryRandomBtn = document.getElementById('category-random-btn');
```

(기존 `const categoryControls = document.getElementById('category-controls');`
줄을 제거.)

- [ ] **Step 2: renderCategoryOptions의 숨김 대상 변경**

[app.js:142-144](public/app.js#L142-L144)에서 `categoryControls.hidden = ...`을
드롭다운 래퍼 대상으로 바꾼다:

```js
function renderCategoryOptions() {
  const cats = extractCategories(allMenus);
  categoryFilterWrap.hidden = cats.length === 0;
  const prev = selectedCategory;
  // ...이하 기존과 동일...
```

(함수의 나머지(option 채우기, 이전 선택 복원)는 그대로 둔다.)

- [ ] **Step 3: updateRecommendState에 카테고리 버튼 상태 추가**

[app.js:232-248](public/app.js#L232-L248)의 `updateRecommendState`를 교체한다:

```js
function updateRecommendState() {
    const q = searchInput.value.trim();
    const filtered = q || selectedCategory;
    const count = currentPool(allMenus).length;

    randomBtn.disabled = count < 2;

    // 카테고리 추첨: 검색 적용 목록에서 2곳 이상인 카테고리가 있어야 활성.
    const eligibleCount = eligibleCategories(filterMenus(allMenus, searchInput.value)).length;
    categoryRandomBtn.disabled = eligibleCount === 0;

    let hint = '';
    if (count >= 2) {
        hint = filtered ? `${count}곳에서 추천` : ''; // 전체 추첨이면 안내 불필요
    } else if (count === 1) {
        hint = filtered ? '1곳뿐이에요' : '식당이 1곳뿐이에요';
    } // count === 0 → 목록에 '검색 결과 없음'이 표시되므로 별도 안내 생략

    recommendScope.textContent = hint;
    recommendScope.hidden = hint === '';
}
```

- [ ] **Step 4: 단위 테스트 회귀 확인**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: 상태 전이 수동 확인**

Run: `npm start` 후 다음을 확인:
- 식당 0~1곳: `🍽 어디 갈까` 비활성. 2곳 이상이면 활성.
- 같은 카테고리 2곳 이상이 없으면 `🎲 뭐 먹을까` 비활성, 생기면 활성.
- 카테고리가 하나도 백필 안 된 상태: 검색창 아래 드롭다운(`category-filter-wrap`)이
  숨겨지고, `🎲 뭐 먹을까`는 비활성.
- 검색으로 풀을 좁혔을 때 두 버튼 상태와 `recommend-scope` 안내가 맞게 갱신.
Expected: 위 전이가 모두 맞고 콘솔 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add public/app.js
git commit -m "feat: 두 추천 버튼 상태 일원화 + 드롭다운 표시 로직 정리

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 스타일 정리 — 두 버튼 동급 + 드롭다운 필터 톤

두 추천 버튼을 동급으로 보이게 `.recommend-btn` 공유 스타일을 만들고, 검색창 아래
드롭다운을 검색 입력과 어울리는 톤으로 정리한다. 더 이상 안 쓰는
`.category-controls` 관련 규칙은 정돈한다.

**Files:**
- Modify: `public/style.css:84-98`(추천 버튼), `public/style.css:415-437`
  (카테고리 컨트롤), `public/style.css:146-157`(검색 — 인접 톤 참고)

**Interfaces:**
- Consumes: 기존 CSS 변수(`--brand`, `--card`, `--line-strong` 등).
- Produces: 없음.

- [ ] **Step 1: 추천 버튼 동급 스타일**

[public/style.css:84-98](public/style.css#L84-L98)의 `.recommend`/`#random-btn`
블록을 아래로 교체한다(두 버튼을 `.recommend-btn`로 공유, 가로 배치 컨테이너 추가):

```css
.recommend { text-align: center; margin: 16px 0 24px; position: relative; }
.recommend-actions {
  display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
  margin-bottom: 8px;
}
.recommend-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-size: 1.05rem; font-weight: 600; padding: 12px 22px; border: none; border-radius: 999px;
  background: var(--brand); color: #fff; cursor: pointer;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
  transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
}
.recommend-btn:hover:not(:disabled) {
  background: var(--brand-hover);
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);
}
.recommend-btn:active:not(:disabled) { transform: translateY(1px); }
.recommend-btn:disabled { opacity: 0.6; cursor: not-allowed; }
```

- [ ] **Step 2: `#random-btn.fired` 셀렉터 확인**

[public/style.css:126](public/style.css#L126)의 `#random-btn.fired`는 id 셀렉터라
그대로 유효하다(식당 추첨 버튼 id 유지). 변경 불필요 — 확인만.

- [ ] **Step 3: 드롭다운 필터 톤 정리**

[public/style.css:415-437](public/style.css#L415-L437)의 `.category-controls` 관련
규칙(추천 영역 기준의 옛 레이아웃)을 제거하고, 드롭다운 래퍼/셀렉트 스타일로
교체한다(검색창 톤과 맞춤):

```css
#category-filter-wrap { margin-bottom: 14px; }
#category-filter-wrap[hidden] { display: none; }
#category-filter {
  width: 100%; padding: 10px 12px;
  border: 1px solid var(--line-strong); border-radius: 8px;
  background: var(--card); color: var(--ink);
  font: inherit; font-size: 0.95rem;
  transition: border-color 0.15s;
}
#category-filter:focus { border-color: var(--brand); outline: none; }
```

- [ ] **Step 4: 모바일 확대 방지 보강**

[public/style.css:313-332](public/style.css#L313-L332)의 `@media (max-width: 480px)`
블록 안, `#search { font-size: 16px; }` 줄 근처에 드롭다운도 추가한다(iOS 확대 방지):

```css
  #category-filter { font-size: 16px; } /* iOS 확대 방지 */
```

- [ ] **Step 5: 전체 시각 수동 확인**

Run: `npm start` 후 데스크톱·모바일 폭(개발자도구 반응형)에서 확인.
Expected: 두 버튼이 같은 크기/톤으로 나란히, 결과 슬롯·별이 정상. 검색창과
드롭다운이 같은 폭·톤으로 목록 위에 쌓인다. 다크모드 토글해도 색이 깨지지 않음.
좁은 폭에서 버튼이 줄바꿈되며 입력이 16px라 포커스 시 확대 안 됨.

- [ ] **Step 6: 커밋**

```bash
git add public/style.css
git commit -m "style: 두 추천 버튼 동급 스타일 + 드롭다운 필터 톤 정리

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- 두 동급 버튼(뭐 먹을까/어디 갈까) → Task 2(HTML), Task 6(스타일). ✓
- 동일 슬롯+별 연출 공유, 같은 결과 자리 → Task 3(playSlot 추출), Task 4(카테고리도 사용). ✓
- 드롭다운을 필터 영역(검색창 아래)으로 이동 → Task 2(HTML), Task 5(표시 로직), Task 6(톤). ✓
- 카테고리 추첨은 뽑고 멈춤 + 필터 동기화 → Task 4. ✓
- 후보 = 2곳 이상 카테고리 → Task 1(eligibleCategories) + Task 4 사용. ✓
- 비활성/안내(어디 갈까 2곳 미만, 뭐 먹을까 후보 없음, 카테고리 없을 때 드롭다운 숨김) → Task 5. ✓
- reduce-motion 유지 → Task 3 playSlot 내부. ✓
- 토스트 제거 → Task 4. ✓
- 범위 밖(2단계 연쇄, 추가 폼 이동, 위치 기반 전환) → 어느 태스크에도 없음(의도대로). ✓

**Placeholder scan:** 모든 코드 단계에 실제 코드/명령/기대 출력 포함. 플레이스홀더 없음. ✓

**Type consistency:**
- `eligibleCategories(menus): string[]` — Task 1 정의, Task 4/5에서 동일 시그니처 사용. ✓
- `playSlot(labels, winnerLabel)` — Task 3 정의, Task 3(식당)·Task 4(카테고리)에서 동일 인자로 호출. ✓
- DOM id: `#random-btn`, `#category-random-btn`, `#random-result`, `#recommend-scope`,
  `#category-filter`, `#category-filter-wrap` — Task 2(HTML)와 Task 4/5(app.js 참조)에서 일치. ✓
- `categoryFilterWrap` 변수 — Task 5에서 정의·사용, 기존 `categoryControls` 참조는 Task 5 Step 1에서 제거. ✓
