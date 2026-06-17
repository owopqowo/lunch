import {
  initConfig,
  isLocationEnabled,
  loadKakao,
  findPlace,
  showMap,
  kakaoSearchUrl,
} from './map.js';

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

// 미니멀 라인 아이콘 (Lucide 스타일, stroke = currentColor)
function icon(paths, size = 20) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
const ICONS = {
    thumb: icon(
        '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
        16,
    ),
    crown: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 7 L7 10.5 L12 4 L17 10.5 L21.5 7 L19.5 17 L4.5 17 Z"/></svg>',
    sun: icon(
        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    ),
    moon: icon('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
    utensils: icon(
        '<path d="M3 2v7c0 1.1.9 2 2 2a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
        30,
    ),
    pin: icon('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', 16),
    close: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 18),
    external: icon('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>', 14),
};

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggle.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
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
        // 위치 보기 버튼은 카카오 키가 있을 때만 렌더되므로 스켈레톤도 동일 조건으로 자리를 잡는다.
        const locSk = isLocationEnabled()
            ? '\n      <div class="loc-wrap"><span class="sk sk-loc"></span></div>'
            : '';
        li.innerHTML = `
      <div class="info">
        <div class="sk sk-line sk-name"></div>
        <div class="sk sk-line sk-desc"></div>
      </div>
      <div class="actions">
        <span class="sk sk-btn"></span>
        <span class="sk sk-btn"></span>
        <span class="sk sk-btn"></span>
      </div>${locSk}
    `;
        list.appendChild(li);
    }
}

async function loadMenus({ skeleton = false } = {}) {
    if (skeleton) renderSkeleton();
    const startedAt = Date.now();
    try {
        const res = await fetch('/api/menus');
        if (!res.ok) {
            list.innerHTML = '<li class="menu-item">목록을 불러오지 못했습니다.</li>';
            return;
        }
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
      <div class="empty-art" aria-hidden="true">${ICONS.utensils}</div>
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
    ${isLeader ? `<span class="crown" role="img" aria-label="1위">${ICONS.crown}</span>` : ''}
    <div class="info">
      <div class="name"></div>
      <div class="desc"></div>
    </div>
    <div class="actions">
      <button class="vote-btn">${ICONS.thumb}<span class="vote-count"></span></button>
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
    const ctrl = createLocationControl(m.name);
    if (ctrl) li.appendChild(ctrl);
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
    if (!name) {
        showToast('식당 이름을 입력하세요', 'error');
        return;
    }
    const saveBtn = li.querySelector('.save-btn');
    saveBtn.disabled = true;
    try {
        const res = await fetch(`/api/menus/${m.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description: description.trim() }),
        });
        if (!res.ok) {
            showToast('수정에 실패했어요', 'error');
            saveBtn.disabled = false;
            return;
        }
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
    if (!res.ok) {
        showToast('추가에 실패했어요', 'error');
        return;
    }
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
        if (!res.ok) {
            showToast('삭제에 실패했어요', 'error');
            btn.disabled = false;
            return;
        }
        showToast('삭제했어요', 'success');
        loadMenus();
    } catch (err) {
        showToast('삭제에 실패했어요', 'error');
        btn.disabled = false;
    }
}

// 모든 위치 컨트롤이 공유하는 단일 모달. 최초 사용 시 한 번만 생성한다.
let mapModalEls = null;
let mapModalOpener = null;

function ensureMapModal() {
    if (mapModalEls) return mapModalEls;
    const overlay = document.createElement('div');
    overlay.className = 'map-modal';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
    <div class="map-dialog">
      <div class="map-dialog-header">
        <span class="map-dialog-title"></span>
        <button type="button" class="map-close" aria-label="닫기">${ICONS.close}</button>
      </div>
      <div class="map-dialog-body"></div>
    </div>
  `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeMapModal(); // 배경 클릭으로 닫기
    });
    overlay.querySelector('.map-close').addEventListener('click', closeMapModal);
    document.body.appendChild(overlay);
    mapModalEls = {
        overlay,
        title: overlay.querySelector('.map-dialog-title'),
        body: overlay.querySelector('.map-dialog-body'),
        closeBtn: overlay.querySelector('.map-close'),
    };
    return mapModalEls;
}

function onMapModalKeydown(e) {
    if (e.key === 'Escape') closeMapModal();
}

// 모달을 열고 콘텐츠를 채울 본문 요소를 반환한다.
function openMapModal(name, opener) {
    const els = ensureMapModal();
    mapModalOpener = opener || document.activeElement;
    els.title.textContent = name;
    els.body.innerHTML = '';
    els.overlay.setAttribute('aria-label', `${name} 위치`);
    els.overlay.hidden = false;
    requestAnimationFrame(() => els.overlay.classList.add('show'));
    document.addEventListener('keydown', onMapModalKeydown);
    els.closeBtn.focus();
    return els.body;
}

function closeMapModal() {
    if (!mapModalEls || mapModalEls.overlay.hidden) return;
    const { overlay, body } = mapModalEls;
    overlay.classList.remove('show');
    document.removeEventListener('keydown', onMapModalKeydown);
    const finish = () => {
        overlay.hidden = true;
        body.innerHTML = ''; // 지도 인스턴스 정리
        overlay.removeEventListener('transitionend', finish);
    };
    overlay.addEventListener('transitionend', finish);
    if (mapModalOpener && typeof mapModalOpener.focus === 'function') {
        mapModalOpener.focus(); // 포커스 복귀(접근성)
    }
    mapModalOpener = null;
}

// 식당 이름으로 '위치 보기' 버튼을 만든다. 클릭 시 지도를 모달로 띄운다.
// 키가 없으면 null을 반환(버튼 미생성).
function createLocationControl(name) {
    if (!isLocationEnabled()) return null;

    const wrap = document.createElement('div');
    wrap.className = 'loc-wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'loc-btn';
    btn.innerHTML = `${ICONS.pin}<span>위치 보기</span>`;

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        const ok = await loadKakao();
        if (!ok) {
            showToast('지도를 불러오지 못했어요', 'error');
            btn.disabled = false;
            return;
        }
        const place = await findPlace(name);
        const body = openMapModal(name, btn);
        if (!place) {
            const msg = document.createElement('p');
            msg.className = 'map-empty';
            msg.textContent = '위치를 찾지 못했어요.';
            const a = document.createElement('a');
            a.href = kakaoSearchUrl(name);
            a.target = '_blank';
            a.rel = 'noopener';
            a.className = 'map-link';
            a.setAttribute('aria-label', '카카오맵에서 검색 (새 탭)');
            a.innerHTML = `<span>카카오맵에서 검색</span>${ICONS.external}`;
            body.appendChild(msg);
            body.appendChild(a);
        } else {
            showMap(body, place);
        }
        btn.disabled = false;
    });

    wrap.appendChild(btn);
    return wrap;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

randomBtn.addEventListener('click', async () => {
    if (randomBtn.disabled) return;
    randomBtn.disabled = true;
    randomResult.classList.remove('winner');
    randomResult.textContent = ''; // 이전 추첨 결과 즉시 제거
    const prevLoc = randomResult.nextElementSibling; // 이전 위치 컨트롤 제거
    if (prevLoc?.classList.contains('loc-wrap')) prevLoc.remove();

    const [winnerRes, listRes] = await Promise.all([fetch('/api/menus/random'), fetch('/api/menus')]);

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
            randomResult.textContent = names[Math.floor(Math.random() * names.length)];
            await sleep(delay);
            delay += 18; // 점점 느려지게
        }
        randomResult.classList.remove('rolling');
    }

    randomResult.textContent = `오늘은 → ${winner.name}`;
    randomResult.classList.add('winner');
    const ctrl = createLocationControl(winner.name);
    if (ctrl) randomResult.insertAdjacentElement('afterend', ctrl);
    randomBtn.disabled = false;
});

initConfig().then(() => loadMenus({ skeleton: true }));
