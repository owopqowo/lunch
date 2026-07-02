// 한줄평 관련 순수 로직. DOM/네트워크에 의존하지 않아 단위 테스트 가능.
export const MAX_REVIEW_LENGTH = 100;

const DEVICE_ID_KEY = 'device_id';

// 한줄평 본문 검증. 서버와 동일 규칙(trim, 빈값, 100자).
// { ok: true, value } 또는 { ok: false, error }.
export function validateReviewBody(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return { ok: false, error: 'body is required' };
  if (trimmed.length > MAX_REVIEW_LENGTH) return { ok: false, error: 'too long' };
  return { ok: true, value: trimmed };
}

// 익명 device 식별자. 없으면 생성해 저장하고, 이후엔 같은 값을 돌려준다.
export function getDeviceId(storage = localStorage) {
  let id = storage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    storage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
