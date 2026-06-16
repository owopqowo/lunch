# 점심 메뉴 투표/추천 앱 — 설계 문서

- 작성일: 2026-06-16
- 목적: Turso(libSQL) + Render Blueprint 배포 파이프라인을 처음부터 직접 구축해보는 학습 과제
- 범위: 로그인 없는 단순 CRUD + 투표 + 랜덤 추천

## 1. 개요 & 아키텍처

로그인 없는 단일 Express 앱. 하나의 서버가 정적 프론트엔드(HTML/CSS/JS)와 JSON REST API를 함께 제공하고, 데이터는 Turso(libSQL)에 저장한다.

```
[브라우저] ──fetch──> [Express 서버] ──@libsql/client──> [Turso DB]
 public/*.html,js,css      server.js / API 라우트         menus 테이블
```

- DB: 새 Turso DB `lunch-owopqowo` 사용 (실습용 `notepad`는 사용하지 않음). 접속 정보는 `.env`의 `TURSO_URL`, `TURSO_TOKEN`.
- 배포: Render Blueprint(`render.yaml`)로 Node web service 1개 정의.

## 2. 데이터 모델

테이블 1개.

```sql
CREATE TABLE IF NOT EXISTS menus (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,            -- 메뉴/식당 이름
  description TEXT,                          -- 한줄 설명 (선택)
  votes       INTEGER NOT NULL DEFAULT 0,    -- 투표 수
  created_at  TEXT    DEFAULT (datetime('now'))
);
```

서버 시작 시 `CREATE TABLE IF NOT EXISTS`로 스키마를 자동 초기화한다.

## 3. API

| 메서드 | 경로 | 설명 | 성공 응답 |
|---|---|---|---|
| GET | `/api/menus` | 전체 목록 (votes 내림차순, 동률 시 최신순) | 200 + 배열 |
| POST | `/api/menus` | 메뉴 추가 `{name, description?}` | 201 + 생성된 항목 |
| PATCH | `/api/menus/:id` | 이름/설명 수정 | 200 + 수정된 항목 |
| DELETE | `/api/menus/:id` | 삭제 | 204 |
| POST | `/api/menus/:id/vote` | 투표 +1 | 200 + 갱신된 항목 |
| GET | `/api/menus/random` | 랜덤 메뉴 1개 추천 | 200 + 항목 (없으면 404) |

라우트 등록 순서 주의: `/api/menus/random`은 `/api/menus/:id`보다 먼저 등록해야 `random`이 `:id`로 잘못 매칭되지 않는다.

## 4. 프론트엔드 (단일 페이지)

`public/index.html` 구성:
- 메뉴 추가 폼 (이름 필수, 설명 선택)
- 메뉴 목록: 각 항목에 투표(👍 수 표시), 수정, 삭제 버튼
- "🎲 랜덤 추천" 버튼 → 결과 영역에 추천 메뉴 표시

바닐라 JS(`app.js`)로 `fetch` API를 호출하고, 응답에 따라 목록을 다시 렌더링한다.

## 5. 프로젝트 구조

```
lunch/
  package.json
  server.js          # Express 앱 + 라우트 + 정적 파일 서빙
  db.js              # libsql 클라이언트 생성 + 스키마 초기화
  public/
    index.html
    app.js
    style.css
  render.yaml        # Render Blueprint
  .env               # 로컬 전용 (TURSO_URL, TURSO_TOKEN) — 커밋 금지
  .env.example       # 키 이름만 담은 예시
  .gitignore
  docs/superpowers/specs/2026-06-16-lunch-menu-voting-design.md
```

## 6. 에러 처리 & 검증

- 입력 검증: `name`이 비어 있으면 400 반환.
- 존재하지 않는 `id`에 대한 PATCH/DELETE/vote는 404.
- DB 오류 등 예기치 못한 예외는 500 + 간단한 에러 메시지(JSON).
- 프론트엔드는 실패 응답 시 사용자에게 짧은 에러 메시지를 표시한다.

## 7. 테스트

학습 과제 수준에 맞게 가볍게 유지한다.
- 도구: `node:test` + `supertest`.
- 대상: 핵심 API 라우트 — 메뉴 추가(201), 목록 조회(200), 투표 +1(votes 증가), 잘못된 입력(400).
- DB 의존을 줄이기 위해 테스트는 별도 테스트용 DB 또는 인메모리 libSQL(`:memory:`) 사용을 고려한다.

## 8. 배포 (Render Blueprint)

`render.yaml`에 web service 1개 정의:
- environment: node
- buildCommand: `npm install`
- startCommand: `node server.js`
- 환경변수 `TURSO_URL`, `TURSO_TOKEN`은 `sync: false`로 두고 Render 대시보드에서 직접 입력(저장소에 커밋하지 않음).
- 서버는 `process.env.PORT`를 사용해 Render가 주입하는 포트에 바인딩한다.

## 9. 비범위 (YAGNI)

- 로그인/인증, 사용자별 데이터 분리 없음.
- 중복 투표 방지(쿠키/세션) 없음 — 단순히 +1.
- 카테고리/태그/검색 없음.

## 10. 저장소

- GitHub: https://github.com/owopqowo/lunch.git (origin)
- 커밋 식별자: ij.won@konai.com
