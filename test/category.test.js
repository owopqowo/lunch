import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCategory, extractCategories, matchesCategory } from '../public/category.js';

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

const MENUS = [
  { id: 1, category: '한식' },
  { id: 2, category: '일식' },
  { id: 3, category: '한식' },
  { id: 4, category: null },
];

test('extractCategories는 null 제외 distinct 정렬 목록을 반환한다', () => {
  assert.deepEqual(extractCategories(MENUS), ['일식', '한식']);
});

test('extractCategories는 빈 목록이면 빈 배열', () => {
  assert.deepEqual(extractCategories([]), []);
});

test('matchesCategory는 카테고리가 비면(전체) 항상 true', () => {
  assert.equal(matchesCategory({ category: '한식' }, ''), true);
  assert.equal(matchesCategory({ category: null }, ''), true);
});

test('matchesCategory는 정확히 일치할 때만 true', () => {
  assert.equal(matchesCategory({ category: '한식' }, '한식'), true);
  assert.equal(matchesCategory({ category: '일식' }, '한식'), false);
  assert.equal(matchesCategory({ category: null }, '한식'), false);
});
