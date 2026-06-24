// 카카오 place의 category_name 중분류를 추출한다.
// "음식점 > 한식 > 육류,고기" → "한식"
export function parseCategory(place) {
  const raw = place && place.category_name;
  if (!raw) return null;
  const parts = String(raw).split(' > ');
  return parts[1] || parts[0] || null;
}

// 카카오 중분류를 점심 추첨용 분류로 통합한다.
// 매핑에 없는 값(카카오가 엉뚱한 장소를 집은 경우 등)은 원본을 그대로 둔다 —
// 개별 식당 보정은 데이터 레벨에서 처리한다. falsy 입력은 null.
const CATEGORY_MAP = {
  한식: '한식',
  구내식당: '한식',
  중식: '중식',
  일식: '일식',
  술집: '일식',
  퓨전요리: '일식',
  양식: '양식',
  아시아음식: '아시안',
  분식: '분식',
  슈퍼마켓: '분식',
  샐러드: '샐러드',
  패스트푸드: '샐러드',
  카페: '샐러드',
};

export function mapCategory(raw) {
  if (!raw) return null;
  return CATEGORY_MAP[raw] || raw;
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

// 식당이 2곳 이상인 카테고리만 (추첨 후보). null/단독 카테고리는 제외, 정렬.
export function eligibleCategories(menus) {
  const counts = {};
  for (const m of menus) {
    if (m.category) counts[m.category] = (counts[m.category] || 0) + 1;
  }
  return Object.keys(counts)
    .filter((c) => counts[c] >= 2)
    .sort((a, b) => a.localeCompare(b, 'ko'));
}
