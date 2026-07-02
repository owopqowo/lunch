# 한줄평 (One-line Reviews)

날짜: 2026-07-02
상태: 설계 확정

## 배경 / 목적

점심 메뉴 추천 앱. 여러 사람이 쓰기 시작하면서 "이 집 어때?"를
남길 수 있게 각 식당에 **한줄평**을 단다. "우리 팀이 실제로 먹어본
후기"가 쌓이면 추천/결정에 참고가 된다.

## 핵심 결정 (확정)

- **즉시 반영**: 추가/수정/삭제(requests)와 달리 검토 큐 없이 바로 보인다.
  한줄평은 남의 데이터를 바꾸는 게 아니라 의견을 *추가*하는 것이라
  어뷰징 표면이 작고, 즉시 보여야 재미·유용성이 산다.
- **텍스트만**: 별점 없음. (나중에 별점 얹기 쉬운 구조 유지)
- **익명**: 작성자 이름 없음.
- **펼쳐보기 UI**: 목록은 컴팩트하게 유지. 식당 카드에서 펼치면
  한줄평 목록 + 입력창이 나온다.
- **글자 수 상한 100자**.

## 범위

- IN: 식당별 한줄평 조회/작성 (즉시 반영, 익명, 텍스트 100자)
- OUT: 별점, 로그인 연동, 한줄평 수정/삭제(관리자 도구), 신고 기능.
  필요해지면 후속 스펙.

## 데이터 모델

신규 테이블 `reviews` (db.js `initSchema`에 추가):

```sql
CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id    INTEGER NOT NULL,           -- 대상 식당 (menus.id)
  body       TEXT    NOT NULL,           -- 한줄평 본문 (텍스트, ≤100자)
  device_id  TEXT,                       -- 익명 식별자 (도배 최소 방지용)
  created_at TEXT    DEFAULT (datetime('now'))
);
```

- menus 삭제 시 정리는 이번 범위 밖(삭제 자체가 requests 검토라 드묾).

## API (app.js)

### GET /api/menus/:id/reviews
- 해당 식당의 한줄평을 **최신순**(created_at DESC, id DESC)으로 반환.
- 대상 메뉴가 없어도 빈 배열 반환(별도 404 불필요) — 목록 조회는 관대하게.

### POST /api/menus/:id/reviews
- body: `{ body: string, device_id?: string }`
- 검증:
  - `body` trim 후 빈값이면 400 `{ error: 'body is required' }`
  - trim 후 길이 > 100 이면 400 `{ error: 'too long' }`
  - 대상 menu_id 존재 확인, 없으면 404 `{ error: 'menu not found' }`
- 통과 시 INSERT 후 201로 생성된 행 반환.
- device_id는 있으면 저장(없으면 null). 이번 스텝에서 device 기반
  도배 차단 로직은 넣지 않는다(YAGNI — 길이/빈값 검증으로 충분).
  device_id는 기록만 해두고 후속에서 필요 시 활용.

## 프론트엔드

### 순수 로직 분리: public/review.js
- `validateReviewBody(text)` → `{ ok, value?, error? }`. 서버와 동일 규칙
  (trim, 빈값, 100자). DOM 무관 → 단위 테스트.
- `getDeviceId(storage = localStorage)` → 없으면 crypto.randomUUID로
  생성·저장 후 반환. 재호출 시 같은 값.

### UI (app.js)
- 각 메뉴 카드 하단에 "한줄평 N" 토글 버튼(펼쳐보기).
- 펼치면 확장 영역:
  - 한줄평 목록(최신순). 없으면 "첫 한줄평을 남겨보세요" 안내.
  - 입력창(placeholder "한줄평 남기기", maxlength 100) + 등록 버튼.
- 등록: `validateReviewBody`로 프론트 선검증 → POST → 성공 시 목록
  맨 위에 즉시 추가하고 입력창 비움. 실패 시 toast.
- 펼침 상태에서만 해당 식당의 reviews를 GET(지연 로딩) — 초기 목록
  로드는 가볍게 유지.
- 기존 '더보기'(수정/삭제 요청) 드롭다운과는 별개 영역.

## 테스트

- `test/review.test.js` (신규): `validateReviewBody` 경계값
  (빈문자·공백만·정상·100자·101자), `getDeviceId` 멱등성(스텁 storage).
- `test/api.test.js` (기존 파일에 추가): POST 성공(201),
  빈 body(400), 100자 초과(400), 없는 메뉴(404), GET 최신순 정렬.
- 기존 스타일(node:test + assert/strict, supertest) 그대로.

## 에러 처리

- 서버 DB 오류는 기존 패턴대로 500 `{ error: 'DB error' }`.
- 프론트: GET 실패 시 확장 영역에 "한줄평을 불러오지 못했어요",
  POST 실패 시 toast. h1 등 다른 기능에 영향 없음.
