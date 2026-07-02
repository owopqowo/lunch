// 회사 점심시간(11~12시) 기준 시간대별 인사 문구.
// 문구는 자유롭게 수정 가능.
const GREETINGS = {
  beforeLunch: '오늘 점심 뭐 먹지?',
  lunchTime: '점심 정할 시간! 🍽️',
  afterLunch: '잘 먹었으면, 내일은 뭐 먹지?',
};

// hour(0~23) → 문구. 범위 밖 값도 afterLunch로 귀결한다.
export function greetingFor(hour) {
  if (hour < 11) return GREETINGS.beforeLunch;
  if (hour === 11) return GREETINGS.lunchTime;
  return GREETINGS.afterLunch;
}

// 로드 시 1회 h1을 시간대 문구로 교체. h1이 없으면 조용히 무시.
export function applyGreeting(doc = document, now = new Date()) {
  const h1 = doc.querySelector('h1');
  if (!h1) return;
  h1.textContent = greetingFor(now.getHours());
}

if (typeof document !== 'undefined') {
  applyGreeting();
}
