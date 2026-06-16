const list = document.getElementById('menu-list');
const form = document.getElementById('add-form');
const nameInput = document.getElementById('name');
const descInput = document.getElementById('description');
const randomBtn = document.getElementById('random-btn');
const randomResult = document.getElementById('random-result');
const recommendSection = document.querySelector('.recommend');
const toastContainer = document.getElementById('toast-container');
const themeToggle = document.getElementById('theme-toggle');

let maxVotes = 0;

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
}
applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
});

function showToast(message, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  toastContainer.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
  }, 2600);
}

function renderSkeleton(count = 6) {
  list.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const li = document.createElement('li');
    li.className = 'menu-item skeleton';
    li.innerHTML = `
      <div class="info">
        <div class="sk sk-line sk-name"></div>
        <div class="sk sk-line sk-desc"></div>
      </div>
      <div class="actions">
        <span class="sk sk-btn"></span>
        <span class="sk sk-btn"></span>
        <span class="sk sk-btn"></span>
      </div>
    `;
    list.appendChild(li);
  }
}

async function loadMenus({ skeleton = false } = {}) {
  if (skeleton) renderSkeleton();
  const startedAt = Date.now();
  try {
    const res = await fetch('/api/menus');
    if (!res.ok) { list.innerHTML = '<li class="menu-item">목록을 불러오지 못했습니다.</li>'; return; }
    const menus = await res.json();
    if (skeleton) {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 250) await sleep(250 - elapsed); // 스켈레톤이 깜빡 사라지지 않도록 최소 표시
    }
    render(menus);
  } catch (err) {
    list.innerHTML = '<li class="menu-item">목록을 불러오지 못했습니다.</li>';
  }
}

function render(menus) {
  list.innerHTML = '';
  recommendSection.hidden = menus.length === 0;
  if (menus.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.innerHTML = `
      <div class="empty-art" aria-hidden="true">🍽️</div>
      <p class="empty-title">아직 등록된 식당이 없어요</p>
      <p class="empty-desc">첫 식당을 추가하면 투표와 랜덤 추천을 시작할 수 있어요.</p>
      <button type="button" class="empty-cta">첫 식당 추가하기</button>
    `;
    li.querySelector('.empty-cta').onclick = () => nameInput.focus();
    list.appendChild(li);
    return;
  }
  maxVotes = menus.reduce((max, m) => Math.max(max, m.votes), 0);
  for (const m of menus) {
    const li = document.createElement('li');
    renderView(li, m);
    list.appendChild(li);
  }
}

function renderView(li, m) {
  const isLeader = maxVotes > 0 && m.votes === maxVotes;
  li.className = isLeader ? 'menu-item leader' : 'menu-item';
  li.innerHTML = `
    ${isLeader ? '<span class="crown" title="1위" aria-label="1위">👑</span>' : ''}
    <div class="info">
      <div class="name"></div>
      <div class="desc"></div>
    </div>
    <div class="actions">
      <button class="vote-btn">👍 <span class="vote-count"></span></button>
      <button class="edit-btn">수정</button>
      <button class="del-btn">삭제</button>
    </div>
  `;
  li.querySelector('.name').textContent = m.name;
  li.querySelector('.desc').textContent = m.description || '';
  const voteBtn = li.querySelector('.vote-btn');
  voteBtn.querySelector('.vote-count').textContent = m.votes;
  voteBtn.setAttribute('aria-label', `투표, 현재 ${m.votes}표`);
  voteBtn.onclick = (e) => vote(m.id, e.currentTarget);
  li.querySelector('.edit-btn').onclick = () => renderEdit(li, m);
  li.querySelector('.del-btn').onclick = () => renderDeleteConfirm(li, m);
}

function renderEdit(li, m) {
  li.className = 'menu-item editing';
  li.innerHTML = `
    <div class="info edit-fields">
      <input class="edit-name" type="text" placeholder="식당 이름" />
      <input class="edit-desc" type="text" placeholder="메뉴 (예: 갈비덮밥)" />
    </div>
    <div class="actions">
      <button class="save-btn">저장</button>
      <button class="cancel-btn">취소</button>
    </div>
  `;
  const nameEl = li.querySelector('.edit-name');
  const descEl = li.querySelector('.edit-desc');
  nameEl.value = m.name;
  descEl.value = m.description || '';
  const save = () => saveEdit(li, m, nameEl.value, descEl.value);
  const cancel = () => renderView(li, m);
  li.querySelector('.save-btn').onclick = save;
  li.querySelector('.cancel-btn').onclick = cancel;
  for (const el of [nameEl, descEl]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      else if (e.key === 'Escape') cancel();
    });
  }
  nameEl.focus();
  nameEl.select();
}

async function saveEdit(li, m, name, description) {
  name = name.trim();
  if (!name) { showToast('식당 이름을 입력하세요', 'error'); return; }
  const saveBtn = li.querySelector('.save-btn');
  saveBtn.disabled = true;
  try {
    const res = await fetch(`/api/menus/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description.trim() }),
    });
    if (!res.ok) { showToast('수정에 실패했어요', 'error'); saveBtn.disabled = false; return; }
    showToast('수정했어요', 'success');
    loadMenus();
  } catch (err) {
    showToast('수정에 실패했어요', 'error');
    saveBtn.disabled = false;
  }
}

function renderDeleteConfirm(li, m) {
  li.className = 'menu-item confirming';
  li.innerHTML = `
    <span class="confirm-text">삭제할까요?</span>
    <div class="actions">
      <button class="confirm-del-btn">삭제</button>
      <button class="cancel-btn">취소</button>
    </div>
  `;
  li.querySelector('.confirm-text').textContent = `'${m.name}' 삭제할까요?`;
  li.querySelector('.confirm-del-btn').onclick = (e) => removeMenu(li, m, e.currentTarget);
  li.querySelector('.cancel-btn').onclick = () => renderView(li, m);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  const res = await fetch('/api/menus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: descInput.value.trim() }),
  });
  if (!res.ok) { showToast('추가에 실패했어요', 'error'); return; }
  form.reset();
  showToast('추가했어요', 'success');
  loadMenus();
});

async function vote(id, btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    const res = await fetch(`/api/menus/${id}/vote`, { method: 'POST' });
    if (!res.ok) {
      showToast('투표에 실패했어요', 'error');
      btn.disabled = false;
      btn.classList.remove('loading');
      return;
    }
    loadMenus();
  } catch (err) {
    showToast('투표에 실패했어요', 'error');
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

async function removeMenu(li, m, btn) {
  btn.disabled = true;
  try {
    const res = await fetch(`/api/menus/${m.id}`, { method: 'DELETE' });
    if (!res.ok) { showToast('삭제에 실패했어요', 'error'); btn.disabled = false; return; }
    showToast('삭제했어요', 'success');
    loadMenus();
  } catch (err) {
    showToast('삭제에 실패했어요', 'error');
    btn.disabled = false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

randomBtn.addEventListener('click', async () => {
  if (randomBtn.disabled) return;
  randomBtn.disabled = true;
  randomResult.classList.remove('winner');

  const [winnerRes, listRes] = await Promise.all([
    fetch('/api/menus/random'),
    fetch('/api/menus'),
  ]);

  if (winnerRes.status === 404) {
    randomResult.textContent = '식당을 먼저 추가하세요!';
    randomBtn.disabled = false;
    return;
  }
  if (!winnerRes.ok || !listRes.ok) {
    randomResult.textContent = '오류가 발생했습니다.';
    randomBtn.disabled = false;
    return;
  }

  const winner = await winnerRes.json();
  const menus = await listRes.json();
  const names = menus.map((m) => m.name);

  // 모션 최소화 선호 시 슬롯머신 연출 생략, 바로 결과 표시
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    // 슬롯머신 연출: 빠르게 돌다가 점점 느려진 뒤 당첨 식당에서 멈춤
    randomResult.classList.add('rolling');
    let delay = 60;
    for (let i = 0; i < 18; i++) {
      randomResult.textContent = `🎰 ${names[Math.floor(Math.random() * names.length)]}`;
      await sleep(delay);
      delay += 18; // 점점 느려지게
    }
    randomResult.classList.remove('rolling');
  }

  randomResult.textContent = `오늘은 → ${winner.name} 🍽️`;
  randomResult.classList.add('winner');
  randomBtn.disabled = false;
});

loadMenus({ skeleton: true });
