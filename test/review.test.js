import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReviewBody, MAX_REVIEW_LENGTH, getDeviceId } from '../public/review.js';

test('validateReviewBody는 정상 텍스트를 trim해서 통과시킨다', () => {
  const r = validateReviewBody('  맛있어요  ');
  assert.equal(r.ok, true);
  assert.equal(r.value, '맛있어요');
});

test('validateReviewBody는 빈 문자열을 거부한다', () => {
  const r = validateReviewBody('');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'body is required');
});

test('validateReviewBody는 공백만 있으면 거부한다', () => {
  const r = validateReviewBody('   ');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'body is required');
});

test('validateReviewBody는 null/undefined를 거부한다', () => {
  assert.equal(validateReviewBody(null).ok, false);
  assert.equal(validateReviewBody(undefined).ok, false);
});

test('validateReviewBody는 100자까지 허용한다', () => {
  const r = validateReviewBody('가'.repeat(MAX_REVIEW_LENGTH));
  assert.equal(r.ok, true);
  assert.equal(r.value.length, MAX_REVIEW_LENGTH);
});

test('validateReviewBody는 100자 초과를 거부한다', () => {
  const r = validateReviewBody('가'.repeat(MAX_REVIEW_LENGTH + 1));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'too long');
});

test('validateReviewBody는 길이를 trim 후 기준으로 판단한다', () => {
  // 앞뒤 공백 포함 102자지만 trim 후 100자 → 통과
  const r = validateReviewBody(' ' + '가'.repeat(MAX_REVIEW_LENGTH) + ' ');
  assert.equal(r.ok, true);
});

function stubStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

test('getDeviceId는 처음 호출 시 값을 생성해 저장한다', () => {
  const s = stubStorage();
  const id = getDeviceId(s);
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 0);
});

test('getDeviceId는 재호출 시 같은 값을 반환한다(멱등)', () => {
  const s = stubStorage();
  const first = getDeviceId(s);
  const second = getDeviceId(s);
  assert.equal(first, second);
});
