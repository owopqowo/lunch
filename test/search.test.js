import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterMenus } from '../public/search.js';

const MENUS = [
  { id: 1, name: '김밥 천국', description: '라면, 김밥' },
  { id: 2, name: '돈까스집', description: '등심돈까스' },
  { id: 3, name: 'Subway', description: '샌드위치' },
  { id: 4, name: '냉면나라', description: null },
];

test('빈 검색어는 전체를 반환한다', () => {
  assert.deepEqual(filterMenus(MENUS, ''), MENUS);
  assert.deepEqual(filterMenus(MENUS, '   '), MENUS);
});

test('식당 이름으로 검색한다', () => {
  const res = filterMenus(MENUS, '돈까스');
  assert.deepEqual(res.map((m) => m.id), [2]);
});

test('메뉴(description)로도 검색한다', () => {
  const res = filterMenus(MENUS, '샌드위치');
  assert.deepEqual(res.map((m) => m.id), [3]);
});

test('공백을 무시하고 매칭한다', () => {
  const res = filterMenus(MENUS, '김밥천국');
  assert.deepEqual(res.map((m) => m.id), [1]);
});

test('대소문자를 무시하고 매칭한다', () => {
  const res = filterMenus(MENUS, 'subway');
  assert.deepEqual(res.map((m) => m.id), [3]);
});

test('부분 일치로 여러 개를 찾는다', () => {
  const res = filterMenus(MENUS, '면'); // 라면(설명) + 냉면(이름)
  assert.deepEqual(res.map((m) => m.id), [1, 4]);
});

test('description이 null이어도 크래시 없이 이름만으로 매칭한다', () => {
  const res = filterMenus(MENUS, '냉면');
  assert.deepEqual(res.map((m) => m.id), [4]);
});

test('일치하는 게 없으면 빈 배열을 반환한다', () => {
  assert.deepEqual(filterMenus(MENUS, '존재하지않는메뉴'), []);
});
