// 검색용 정규화: 모든 공백 제거 + 소문자화 (중복 판정과 동일한 규칙).
// 비교에만 쓰며 원본 값은 건드리지 않는다.
export function normalize(s) {
  return String(s ?? '').toLowerCase().replace(/\s+/g, '');
}

// 검색어로 메뉴 목록을 필터링한다.
// - 이름(name)과 메뉴(description) 모두 대상
// - 공백/대소문자 무시, 부분 일치
// - 검색어가 비어 있으면 전체를 그대로 반환
export function filterMenus(menus, query) {
  const q = normalize(query);
  if (!q) return menus;
  return menus.filter(
    (m) => normalize(m.name).includes(q) || normalize(m.description).includes(q)
  );
}
