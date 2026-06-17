# 식당 위치 확인 기능 설계

작성일: 2026-06-17

## 배경

현재 앱은 식당(이름 + 메뉴)을 등록하고, 투표하거나 "랜덤 추천"으로
오늘 먹을 곳을 정한다. 식당이 정해진 뒤 그 위치를 바로 확인하고 싶다.

## 목표

- 정해진(또는 목록의 임의) 식당의 위치를 카카오맵으로 확인할 수 있다.
- 식당 위치는 회사 인근(여의도 국회의사당)을 기준으로 가장 가까운 곳으로 잡는다.
- 추가 비용 없이 무료 범위에서 동작한다.

## 비목표 (YAGNI)

- 식당별 주소/좌표를 DB에 저장하지 않는다 (조회 시점에 검색).
- 길찾기, 즐겨찾기, 다중 지점 선택 UI는 만들지 않는다.
- 지도 클러스터링·필터 등 고급 지도 기능은 다루지 않는다.

## 기술 선택

카카오맵 **JavaScript SDK + `services` 라이브러리**를 브라우저에서 직접 사용한다.
- 식당 이름으로 장소 검색(`keywordSearch`) → 좌표 획득 → 지도 + 마커 표시까지
  클라이언트에서 완결된다.
- REST API 키, 별도 검색용 서버 엔드포인트, DB 변경이 필요 없다.
- 카카오 JS 키는 도메인 제한이 걸리므로 클라이언트 노출이 허용된다.

무료성 비교 결과 한국 식당 POI 데이터 품질과 "카드 등록 불필요" 조건에서
카카오맵이 가장 적합하다고 판단함 (네이버=카드 필요, Google=카드 필요,
OSM=한국 POI 약함).

## 아키텍처

### 백엔드 (`app.js`)

- **DB 변경 없음.** `menus` 스키마는 그대로 둔다.
- **새 엔드포인트** `GET /api/config`
  - 응답: `{ "kakaoJsKey": <string|null> }` (`process.env.KAKAO_JS_KEY ?? null`)
  - 키를 코드에 박지 않고 기존 `.env` 패턴(TURSO_*)과 동일하게 환경변수로 관리.
- `.env.example`에 `KAKAO_JS_KEY=<your-kakao-javascript-key>` 추가.

### 프론트엔드: 새 모듈 `public/map.js`

지도 관련 책임을 `app.js`에서 분리한다. 공개 인터페이스:

- `loadKakao(): Promise<boolean>`
  - `/api/config`에서 JS 키를 받아 카카오 SDK를
    `//dapi.kakao.com/v2/maps/sdk.js?appkey=KEY&libraries=services&autoload=false`
    로 **한 번만** 동적 로드하고 `kakao.maps.load()`로 준비.
  - 결과를 메모이즈(Promise 캐시)하여 중복 로드 방지.
  - 키가 없거나 로드 실패 시 `false` 반환.
- `isLocationEnabled(): boolean`
  - 키 존재 여부. 초기화 시 한 번 조회해 위치 버튼 노출 여부 결정에 사용.
- `findPlace(name): Promise<Place|null>`
  - `Places().keywordSearch(name, cb, options)` 호출.
  - options: `location = new kakao.maps.LatLng(37.5318, 126.9143)` (국회의사당),
    `sort = kakao.maps.services.SortBy.DISTANCE`.
  - 결과 배열의 **첫 항목**(국회의사당에서 가장 가까운 곳)을 반환.
    결과 없으면 `null`.
- `showMap(container, place): void`
  - `container`에 지도를 렌더하고 `place` 좌표에 마커 표시.
  - "카카오맵에서 열기" 링크(`place.place_url` 또는
    `https://map.kakao.com/?q=<name>`) 포함.

좌표 상수: 국회의사당 ≈ 위도 37.5318, 경도 126.9143.

### UI 통합 (`public/app.js`, `public/index.html`, `public/style.css`)

위치 기능은 `isLocationEnabled()`가 참일 때만 버튼을 노출한다.
두 위치 모두 **버튼 클릭 시에만(lazy)** 지도를 표시한다 (자동 표시 안 함).

1. **랜덤 추천 결과**
   - 당첨 식당 확정 후 결과 영역에 `위치 보기` 버튼 노출.
   - 클릭 시 결과 아래 인라인 지도 컨테이너를 만들고 `findPlace` → `showMap`.
   - 다시 추첨하면 이전 지도/버튼 상태는 초기화(기존 결과 초기화 로직과 동일 위치).

2. **목록 각 항목**
   - `renderView`의 `.actions`에 위치 버튼 추가.
   - 클릭 시 해당 `<li>` 아래 인라인 지도 컨테이너 토글
     (열림 상태에서 다시 누르면 닫힘).

## 데이터 흐름

```
[위치 버튼 클릭]
   -> loadKakao() (최초 1회 SDK 로드)
   -> findPlace(식당이름)  // 국회의사당 중심, 거리순, 첫 결과
   -> showMap(container, place)  // 지도 + 마커 + 카카오맵 링크
```

## 에러 처리 / 우아한 실패

- **키 미설정**: `/api/config`가 `kakaoJsKey: null` → 위치 버튼 자체를 렌더하지 않음.
- **검색 결과 없음**(`findPlace`가 null): 토스트 "위치를 찾지 못했어요" +
  카카오맵 검색 링크(`https://map.kakao.com/?q=<name>`)로 폴백.
- **SDK 로드 실패**: 토스트로 안내, 버튼은 재시도 가능 상태로 둠.

## 테스트

- `GET /api/config`: 기존 supertest 방식으로 엔드포인트 동작 테스트
  (키 설정/미설정 시 응답 형태).
- `public/map.js`: 브라우저 카카오 SDK에 의존하므로 단위 테스트 대신
  수동 확인. (키 설정 후 랜덤 추천/목록에서 지도 표시·동명 식당 처리 확인)

## 영향 받는 파일

- `app.js` — `/api/config` 추가
- `.env.example` — `KAKAO_JS_KEY` 추가
- `public/map.js` — 신규
- `public/app.js` — 위치 버튼/지도 토글 통합
- `public/index.html` — `map.js` 로드
- `public/style.css` — 지도 컨테이너·위치 버튼 스타일
- `test/` — `/api/config` 테스트
