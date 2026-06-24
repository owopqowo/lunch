import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCategory,
  extractCategories,
  matchesCategory,
  mapCategory,
  eligibleCategories,
} from '../public/category.js';

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

test('mapCategory는 카카오 중분류를 점심 분류로 통합한다', () => {
  // 한식 계열
  assert.equal(mapCategory('한식'), '한식');
  assert.equal(mapCategory('구내식당'), '한식');
  // 중식
  assert.equal(mapCategory('중식'), '중식');
  // 일식 계열 (술집·퓨전요리는 확인 결과 일식)
  assert.equal(mapCategory('일식'), '일식');
  assert.equal(mapCategory('술집'), '일식');
  assert.equal(mapCategory('퓨전요리'), '일식');
  // 양식
  assert.equal(mapCategory('양식'), '양식');
  // 아시안
  assert.equal(mapCategory('아시아음식'), '아시안');
  // 분식 계열 (슈퍼마켓 포함)
  assert.equal(mapCategory('분식'), '분식');
  assert.equal(mapCategory('슈퍼마켓'), '분식');
  // 샐러드 계열 (패스트푸드·카페 포함)
  assert.equal(mapCategory('샐러드'), '샐러드');
  assert.equal(mapCategory('패스트푸드'), '샐러드');
  assert.equal(mapCategory('카페'), '샐러드');
});

test('mapCategory는 매핑에 없는 값은 원본 그대로 둔다', () => {
  // 카카오가 엉뚱한 장소를 집은 경우(교통시설 등)는 매핑하지 않고 보존 —
  // 개별 식당 보정은 데이터 레벨에서 처리한다.
  assert.equal(mapCategory('교통시설'), '교통시설');
  assert.equal(mapCategory('약국'), '약국');
});

test('mapCategory는 falsy 입력이면 null을 반환한다', () => {
  assert.equal(mapCategory(null), null);
  assert.equal(mapCategory(''), null);
  assert.equal(mapCategory(undefined), null);
});

test('eligibleCategories는 2곳 이상인 카테고리만 정렬해 반환한다', () => {
  const menus = [
    { category: '한식' },
    { category: '한식' },
    { category: '일식' }, // 1곳뿐 → 제외
    { category: '중식' },
    { category: '중식' },
    { category: null }, // 무시
  ];
  assert.deepEqual(eligibleCategories(menus), ['중식', '한식']);
});

test('eligibleCategories는 후보가 없으면 빈 배열', () => {
  assert.deepEqual(eligibleCategories([]), []);
  assert.deepEqual(eligibleCategories([{ category: '한식' }]), []); // 1곳뿐
  assert.deepEqual(eligibleCategories([{ category: null }, { category: null }]), []);
});
