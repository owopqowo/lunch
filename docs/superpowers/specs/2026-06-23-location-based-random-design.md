# 위치 기반 실시간 점심 추첨 설계

작성일: 2026-06-23

## 배경

현재 앱은 사용자가 등록한 식당 목록(DB `menus`)에서 랜덤 추천하고,
식당 위치는 국회의사당(여의도)을 기준으로 카카오맵에서 가장 가까운 곳을
찾아 보여준다. 추첨 대상이 "수동 등록 목록"이고 기준점이 국회의사당으로
고정돼 있어, 다른 지역에서는 사실상 쓸 수 없다.

"어느 지역에서라도 식당을 추첨"하려면 추첨 대상이 그 지역의 실제 식당이어야
의미가 있다. 따라서 추첨 풀을 **사용자가 정한 기준점 주변의 실제 식당**으로
바꾸고, 그 식당들을 카카오에서 실시간으로 가져와 추첨한다.

## 목표

- 사용자가 기준점을 정할 수 있다: **현재 위치**(geolocation) 또는 **지역 검색**.
- 기준점 주변 식당을 카카오에서 실시간으로 가져와 그중 랜덤 1곳을 추첨한다.
- 검색 반경을 사용자가 프리셋(300m / 500m / 1km / 2km)에서 선택한다. 기본 500m.
- 추첨 결과의 위치를 카카오맵(지도 + 마커)으로 확인한다.
- 추가 비용 없이 카카오 무료 범위에서 동작한다.

## 비목표 (YAGNI)

- 로그인, 한줄평, 단골/블랙리스트 등 개인화 기능은 이번에 만들지 않는다(향후 단계).
- 식당 좌표/메타데이터를 DB에 저장하지 않는다(조회 시점에 검색).
- 길찾기, 즐겨찾기, 카테고리 필터(한식/중식 등) UI는 만들지 않는다.
- 기준점을 서버에 공유 저장하지 않는다(브라우저 localStorage만 사용).

## 제품 방향(맥락)

장기적으로 로그인 도입 후 한줄평, 내 단골/블랙리스트 같은 개인화 기능을
추가할 예정이다. 이번 전환은 그 로드맵을 막지 않는 선에서 진행한다. 구체적으로,
추첨 결과에 카카오 `place.id`를 보존해 향후 식당 식별자로 재사용할 수 있게 둔다.

## 기술 선택

카카오맵 **JavaScript SDK + `services` 라이브러리**를 브라우저에서 직접 사용한다.

- 주변 식당 조회: `categorySearch`(카테고리 코드 `FD6` = 음식점) — 좌표·반경
  기반으로 주변 음식점 목록을 반환한다. `radius`는 최대 20km, 정렬은 거리순.
- 지역 검색(기준점 설정): `keywordSearch`로 지역명 → 좌표.
- 지도 렌더: `Map` + `Marker` (기존 `showMap` 재활용).
- 카카오 JS 키는 도메인 제한이 걸리므로 클라이언트 노출이 허용된다.

## 아키텍처

```
[브라우저]
  ├─ origin.js : 기준점 관리 (localStorage, geolocation, 기본값 폴백)
  ├─ map.js    : 카카오 SDK 로드, 주변 식당 검색, 지역 검색, 지도 렌더
  ├─ app.js    : UI 조립 / 추첨 로직 / 이벤트
  └─ index.html + style.css

[서버]
  └─ GET /api/config → { kakaoJsKey }   ← 유일하게 남는 API. 정적 파일 서빙만.
```

### 백엔드 (`app.js`, `server.js`, `db.js`)

- **DB 완전 제거.** `db.js` 삭제. `menus` 관련 라우트
  (GET/POST/PATCH/DELETE `/api/menus`, `/api/menus/random`, vote) 전부 제거.
- **유지:** `GET /api/config` → `{ kakaoJsKey: process.env.KAKAO_JS_KEY ?? null }`,
  정적 파일 서빙.
- `server.js`에서 DB 클라이언트 생성/스키마 초기화 제거. `createApp()`은
  client 인자 없이 동작.
- `package.json`에서 `@libsql/client` 의존성 제거.

### 프론트엔드

**`public/origin.js`** (신규) — 기준점 한 가지 책임만 진다.

- `DEFAULT_ORIGIN = { lat: 37.5318, lng: 126.9143, label: '국회의사당' }` (폴백)
- `getStoredOrigin()` / `saveOrigin({lat, lng, label})` — localStorage(`lunch.origin`) 직렬화/파싱.
  파싱 실패·형식 불량 시 null.
- `getCurrentPosition()` — `navigator.geolocation` Promise 래퍼.
- `initOrigin()` — 저장값 있으면 반환; 없으면 현재 위치 요청 →
  성공 시 `{lat, lng, label: '현재 위치'}` 저장·반환, 실패/거부 시 `DEFAULT_ORIGIN` 반환.
- 카카오에 의존하지 않음 → 순수 로직 단위 테스트 가능.

**`public/map.js`** (개편)

- 유지: `initConfig`, `isLocationEnabled`, `loadKakao`, `kakaoSearchUrl`, `showMap`.
- 신규 `findNearbyRestaurants(origin, radius)` — `categorySearch('FD6', …)`로
  주변 음식점 목록 반환. 거리순 정렬. MVP는 1~3페이지(최대 45개) 수집.
- 신규 `searchRegion(query)` — `keywordSearch`로 지역명 → 첫 결과의 `{lat, lng, label}`.
- 제거: `findPlace`(등록 식당 이름 재검색) — 더 이상 필요 없음.
- `ASSEMBLY` 상수 제거(폴백 좌표는 `origin.js`의 `DEFAULT_ORIGIN`으로 이전).

**`public/app.js`** (재작성·대폭 축소)

- 기준점 표시 + 변경 컨트롤("현재: ○○ · 변경"; 현재 위치 버튼 / 지역 검색 입력).
- 반경 프리셋 버튼 4개: `300m·도보4분 / 500m·도보7분 / 1km·도보13분 / 2km·도보25분`.
  기본 선택 500m. (도보 시간 = 거리 ÷ 약 75m/분, 표시는 반올림.)
- "추첨" 버튼 → 현재 기준점·반경으로 `findNearbyRestaurants` 호출 → 후보 풀에서
  랜덤 1곳 선택 → 결과 카드(이름·카테고리·거리) + 지도 모달.
- 기존 별 버스트 애니메이션·지도 모달 코드는 재활용.
- 제거: 메뉴 목록 렌더, 등록 폼, 투표 UI, 정적 검색 연동.

**제거 파일/코드**

- `public/search.js` 삭제(정적 풀이 동적으로 바뀌어 불필요).
- `db.js` 삭제.

## 데이터 흐름

1. 앱 시작 → `initConfig`(카카오 키) + `initOrigin`(기준점) 병렬.
2. `initOrigin`: 저장값 사용, 없으면 현재 위치 요청 → 거부 시 국회의사당 폴백.
3. 사용자가 반경 선택(기본 500m).
4. "추첨" → `findNearbyRestaurants(origin, radius)` → 후보 풀 → 랜덤 1곳.
5. 결과 카드 + 지도 모달 표시. 결과에 `place.id` 보존(향후 식별자).
6. 기준점 변경(현재 위치 / 지역 검색) → localStorage 갱신 → 다음 추첨에 반영.

## 에러 처리

- 카카오 키 미설정(`isLocationEnabled() === false`): 추첨 비활성 + 안내 문구.
- geolocation 거부/실패: 국회의사당 폴백 + "지역을 직접 검색하세요" 유도.
- 주변 식당 0건: "반경을 넓혀보세요" 안내 + 반경 프리셋 강조.
- 지역 검색 0건: 입력 옆 에러 메시지.

## 테스트

- `origin.js` 단위 테스트(`node --test`): localStorage 직렬화/파싱(정상·불량값),
  폴백 결정 로직. geolocation·localStorage는 가벼운 목으로 주입.
- 카카오 SDK·geolocation 의존 부분은 자동 테스트 대신 수동 검증.
- 기존 `test/`의 menus API 테스트는 제거(해당 기능 삭제).

## 마이그레이션/배포 영향

- DB가 사라지므로 `render.yaml`·`.env.example`에서 DB URL/토큰 환경변수 제거,
  `KAKAO_JS_KEY`만 남김.
- 기존 등록 데이터는 폐기(추첨 풀이 위치 기반으로 전환되어 의미 없음).
