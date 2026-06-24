// 카카오 place의 category_name 중분류를 추출한다.
// "음식점 > 한식 > 육류,고기" → "한식"
export function parseCategory(place) {
  const raw = place && place.category_name;
  if (!raw) return null;
  const parts = String(raw).split(' > ');
  return parts[1] || parts[0] || null;
}

// 메뉴 목록에서 사용 가능한 카테고리(중복/ null 제외, 정렬)를 뽑는다.
export function extractCategories(menus) {
  const set = new Set();
  for (const m of menus) {
    if (m.category) set.add(m.category);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
}

// 메뉴가 선택된 카테고리에 속하는지. category가 비면 전체 통과.
export function matchesCategory(menu, category) {
  if (!category) return true;
  return menu.category === category;
}
