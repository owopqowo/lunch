// 카카오 place의 category_name 중분류를 추출한다.
// "음식점 > 한식 > 육류,고기" → "한식"
export function parseCategory(place) {
  const raw = place && place.category_name;
  if (!raw) return null;
  const parts = String(raw).split(' > ');
  return parts[1] || parts[0] || null;
}
