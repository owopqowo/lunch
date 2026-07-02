# 시간대별 인사 문구 (Time-based Greeting)

날짜: 2026-07-02
상태: 설계 확정

## 배경 / 목적

점심 메뉴 투표/추천 앱. 회사 점심시간이 11~12시라는 점을 살려,
앱을 열었을 때 `<h1>` 제목이 **시간대에 맞춰 바뀌도록** 한다.
"이 앱이 우리 회사(나)를 안다"는 느낌을 주고, 점심 결정 타임(11시)에
앱을 열게 만드는 재방문 동기를 만드는 것이 목적.

가장 작고(외부 API·DB 불필요, 프론트만) 매일 눈에 보이는 곳이라
전체 로드맵의 첫 스텝으로 선정.

## 범위

- IN: `<h1>` 텍스트를 시간대별 문구로 교체
- OUT (이번 스텝 아님): 날씨 추천, 따봉 중복방지, 한줄평, 로그인.
  이들은 후속 스텝으로 별도 스펙.

## 동작

로컬 시각(`new Date().getHours()`) 기준 3구간:

| 시간대 | 문구 |
|---|---|
| ~10:59 (hour < 11) | `오늘 점심 뭐 먹지?` |
| 11:00~11:59 (hour === 11) | `점심 정할 시간! 🍽️` |
| 12:00~ (hour >= 12) | `잘 먹었으면, 내일은 뭐 먹지?` |

- 문구는 이후 얼마든 자유롭게 수정 가능(상수 배열로 관리).
- `<title>`(브라우저 탭 제목 "오늘 뭐 먹지?")은 그대로 유지.

## 구현

### 파일

- **신규**: `public/greeting.js`
  - `export function greetingFor(hour)` — hour(0~23) 정수를 받아 문구 문자열 반환하는 **순수 함수**. DOM 의존 없음 → 단위 테스트 가능.
  - `export function applyGreeting(doc = document, now = new Date())` — h1 요소를 찾아 `greetingFor(now.getHours())` 결과로 textContent 설정. 로드 시 1회 호출.
- **수정**: `public/index.html`
  - `<h1>오늘 뭐 먹지?</h1>` 는 유지하되(초기값/폴백), `<script type="module" src="/greeting.js">` 로 로드 후 교체.
- **수정 최소화**: `public/app.js` 는 건드리지 않음(이미 커서 관심사 분리 유지).

### 로직 (의사코드)

```js
const GREETINGS = {
  beforeLunch: '오늘 점심 뭐 먹지?',
  lunchTime:   '점심 정할 시간! 🍽️',
  afterLunch:  '잘 먹었으면, 내일은 뭐 먹지?',
};

export function greetingFor(hour) {
  if (hour < 11) return GREETINGS.beforeLunch;
  if (hour === 11) return GREETINGS.lunchTime;
  return GREETINGS.afterLunch;
}
```

### 갱신 주기

- 로드 시 1회만 적용. (창을 오래 열어두면 시간대가 바뀌어도 갱신 안 됨 —
  YAGNI. 필요해지면 setInterval 1분 갱신을 후속으로.)

## 테스트

- **신규**: `test/greeting.test.js`
  - `greetingFor` 경계값 검증: hour 0, 10 → beforeLunch / 11 → lunchTime /
    12, 13, 23 → afterLunch.
  - 기존 테스트 스타일(`node:test` + `assert/strict`, 순수 함수 import) 그대로 따름.
- `applyGreeting` 은 DOM 조작이라 단위 테스트에서 제외(선택: jsdom 없이 최소한만).

## 에러 처리

- h1 요소가 없으면 조용히 무시(폴백: HTML의 기본 텍스트 유지).
- greetingFor는 항상 유효 문자열 반환(범위 밖 hour도 afterLunch로 귀결).
