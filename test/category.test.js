import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCategory } from '../public/category.js';

test('parseCategory는 중분류(2번째 토큰)를 반환한다', () => {
  assert.equal(parseCategory({ category_name: '음식점 > 한식 > 육류,고기' }), '한식');
  assert.equal(parseCategory({ category_name: '음식점 > 아시아음식 > 베트남음식' }), '아시아음식');
  assert.equal(parseCategory({ category_name: '음식점 > 양식 > 멕시칸,브라질' }), '양식');
});

test('parseCategory는 토큰이 하나뿐이면 그 값을 반환한다', () => {
  assert.equal(parseCategory({ category_name: '음식점' }), '음식점');
});

test('parseCategory는 category_name이 없으면 null이다', () => {
  assert.equal(parseCategory({}), null);
  assert.equal(parseCategory({ category_name: '' }), null);
  assert.equal(parseCategory(null), null);
});
