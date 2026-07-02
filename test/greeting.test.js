import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greetingFor } from '../public/greeting.js';

test('11시 전에는 오늘 점심 문구를 반환한다', () => {
  assert.equal(greetingFor(0), '오늘 점심 뭐 먹지?');
  assert.equal(greetingFor(10), '오늘 점심 뭐 먹지?');
});

test('11시대에는 점심 정할 시간 문구를 반환한다', () => {
  assert.equal(greetingFor(11), '점심 정할 시간! 🍽️');
});

test('12시 이후에는 내일 점심 문구를 반환한다', () => {
  assert.equal(greetingFor(12), '잘 먹었으면, 내일은 뭐 먹지?');
  assert.equal(greetingFor(13), '잘 먹었으면, 내일은 뭐 먹지?');
  assert.equal(greetingFor(23), '잘 먹었으면, 내일은 뭐 먹지?');
});
