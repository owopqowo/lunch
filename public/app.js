const list = document.getElementById('menu-list');
const form = document.getElementById('add-form');
const nameInput = document.getElementById('name');
const descInput = document.getElementById('description');
const randomBtn = document.getElementById('random-btn');
const randomResult = document.getElementById('random-result');

async function loadMenus() {
  const res = await fetch('/api/menus');
  const menus = await res.json();
  render(menus);
}

function render(menus) {
  list.innerHTML = '';
  for (const m of menus) {
    const li = document.createElement('li');
    li.className = 'menu-item';
    li.innerHTML = `
      <span class="votes">${m.votes}</span>
      <div class="info">
        <div class="name"></div>
        <div class="desc"></div>
      </div>
      <button class="vote-btn">👍</button>
      <button class="edit-btn">수정</button>
      <button class="del-btn">삭제</button>
    `;
    li.querySelector('.name').textContent = m.name;
    li.querySelector('.desc').textContent = m.description || '';
    li.querySelector('.vote-btn').onclick = () => vote(m.id);
    li.querySelector('.edit-btn').onclick = () => editMenu(m);
    li.querySelector('.del-btn').onclick = () => removeMenu(m.id);
    list.appendChild(li);
  }
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
  if (!res.ok) { alert('추가 실패'); return; }
  form.reset();
  loadMenus();
});

async function vote(id) {
  const res = await fetch(`/api/menus/${id}/vote`, { method: 'POST' });
  if (!res.ok) { alert('투표 실패'); return; }
  loadMenus();
}

async function editMenu(m) {
  const name = prompt('메뉴 이름', m.name);
  if (name === null) return;
  const res = await fetch(`/api/menus/${m.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
  if (!res.ok) { alert('수정 실패'); return; }
  loadMenus();
}

async function removeMenu(id) {
  if (!confirm('삭제할까요?')) return;
  const res = await fetch(`/api/menus/${id}`, { method: 'DELETE' });
  if (!res.ok) { alert('삭제 실패'); return; }
  loadMenus();
}

randomBtn.addEventListener('click', async () => {
  const res = await fetch('/api/menus/random');
  if (res.status === 404) { randomResult.textContent = '메뉴를 먼저 추가하세요!'; return; }
  const m = await res.json();
  randomResult.textContent = `오늘은 → ${m.name} 🍽️`;
});

loadMenus();
