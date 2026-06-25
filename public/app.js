import {
  initConfig,
  isLocationEnabled,
  loadKakao,
  findPlace,
  showMap,
  kakaoSearchUrl,
  parseCategory,
} from './map.js';
import { filterMenus } from './search.js';
import { extractCategories, matchesCategory, mapCategory, eligibleCategories } from './category.js';

const list = document.getElementById('menu-list');
const form = document.getElementById('add-form');
const nameInput = document.getElementById('name');
const descInput = document.getElementById('description');
const randomBtn = document.getElementById('random-btn');
const randomResult = document.getElementById('random-result');
const recommendScope = document.getElementById('recommend-scope');
const recommendSection = document.querySelector('.recommend');
const searchWrap = document.getElementById('search-wrap');
const searchInput = document.getElementById('search');
const toastContainer = document.getElementById('toast-container');
const themeToggle = document.getElementById('theme-toggle');
const categoryFilterWrap = document.getElementById('category-filter-wrap');
const categoryFilter = document.getElementById('category-filter');
const categoryRandomBtn = document.getElementById('category-random-btn');

let maxVotes = 0;
let allMenus = []; // 마지막으로 불러온 전체 목록 (검색 필터의 원본)
let selectedCategory = ''; // '' = 전체

// 검색어 + 선택된 카테고리를 AND로 적용한 목록을 반환한다.
function currentPool(menus) {
  return filterMenus(menus, searchInput.value).filter((m) =>
    matchesCategory(m, selectedCategory),
  );
}

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
    search: icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    close: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 18),
    external: icon('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>', 14),
    more: icon('<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"/>', 20),
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

// 타이핑할 때마다 실시간으로 목록을 필터링한다.
searchInput.addEventListener('input', renderFiltered);

categoryFilter.addEventListener('change', () => {
  selectedCategory = categoryFilter.value;
  renderFiltered();
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

// allMenus 기준으로 카테고리 옵션을 다시 만든다.
// 사용 가능한 카테고리가 없으면 드롭다운 래퍼를 숨긴다.
function renderCategoryOptions() {
  const cats = extractCategories(allMenus);
  categoryFilterWrap.hidden = cats.length === 0;
  const prev = selectedCategory;
  categoryFilter.innerHTML = '<option value="">전체</option>';
  for (const c of cats) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    categoryFilter.appendChild(opt);
  }
  // 이전 선택이 여전히 유효하면 유지, 아니면 전체로 복귀
  if (prev && cats.includes(prev)) {
    categoryFilter.value = prev;
  } else {
    selectedCategory = '';
    categoryFilter.value = '';
  }
}

function render(menus) {
    allMenus = menus;
    renderCategoryOptions();
    // 추천/검색은 식당이 하나라도 있을 때만 의미가 있다.
    recommendSection.hidden = menus.length === 0;
    searchWrap.hidden = menus.length === 0;
    // 1위 왕관 기준은 전체 목록으로 계산해 필터된 화면에서도 순위가 정확하다.
    maxVotes = menus.reduce((max, m) => Math.max(max, m.votes), 0);
    renderFiltered();
}

// 현재 검색어를 적용해 목록 영역을 다시 그린다.
function renderFiltered() {
    list.innerHTML = '';
    updateRecommendState();
    if (allMenus.length === 0) {
        renderEmptyState();
        return;
    }
    const filtered = currentPool(allMenus);
    if (filtered.length === 0) {
        renderNoResults(searchInput.value);
        return;
    }
    for (const m of filtered) {
        const li = document.createElement('li');
        renderView(li, m);
        list.appendChild(li);
    }
}

// 등록된 식당이 하나도 없을 때
function renderEmptyState() {
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
}

// 검색 결과가 없을 때 — 검색어로 바로 추가할 수 있게 유도
function renderNoResults(query) {
    const q = query.trim();
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.innerHTML = `
      <div class="empty-art" aria-hidden="true">${ICONS.search}</div>
      <p class="empty-title"></p>
      <p class="empty-desc">찾으시는 식당이 없다면 새로 추가해보세요.</p>
      <button type="button" class="empty-cta"></button>
    `;
    li.querySelector('.empty-title').textContent = `'${q}' 검색 결과가 없어요`;
    const cta = li.querySelector('.empty-cta');
    cta.textContent = q ? `'${q}' 추가하기` : '식당 추가하기';
    cta.onclick = () => {
        nameInput.value = q;
        searchInput.value = '';
        renderFiltered();
        nameInput.focus();
    };
    list.appendChild(li);
}

// 추천 영역 상태 갱신.
// 식당 추첨은 풀이 2곳 이상, 카테고리 추첨은 2곳 이상인 카테고리가 있을 때만 의미가 있다.
// 미만이면 각 버튼을 비활성화하고 이유를 안내한다.
function updateRecommendState() {
    const q = searchInput.value.trim();
    const filtered = q || selectedCategory;
    const count = currentPool(allMenus).length;

    randomBtn.disabled = count < 2;

    // 카테고리 추첨: 검색 적용 목록에서 2곳 이상인 카테고리가 있어야 활성.
    const eligibleCount = eligibleCategories(filterMenus(allMenus, searchInput.value)).length;
    categoryRandomBtn.disabled = eligibleCount === 0;

    let hint = '';
    if (count >= 2) {
        hint = filtered ? `${count}곳에서 추천` : ''; // 전체 추첨이면 안내 불필요
    } else if (count === 1) {
        hint = filtered ? '1곳뿐이에요' : '식당이 1곳뿐이에요';
    } // count === 0 → 목록에 '검색 결과 없음'이 표시되므로 별도 안내 생략

    recommendScope.textContent = hint;
    recommendScope.hidden = hint === '';
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
      <div class="more-wrap">
        <button class="more-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="더보기">${ICONS.more}</button>
        <div class="more-menu" role="menu" hidden>
          <button class="edit-req-btn" type="button" role="menuitem">수정</button>
          <button class="del-req-btn" type="button" role="menuitem">삭제</button>
        </div>
      </div>
    </div>
  `;
    li.querySelector('.name').textContent = m.name;
    li.querySelector('.desc').textContent = m.description || '';
    const voteBtn = li.querySelector('.vote-btn');
    voteBtn.querySelector('.vote-count').textContent = m.votes;
    voteBtn.setAttribute('aria-label', `투표, 현재 ${m.votes}표`);
    voteBtn.onclick = (e) => vote(m.id, e.currentTarget);

    // 수정/삭제는 드문 액션이므로 '더보기' 드롭다운으로 접어 둔다(투표가 주 행동).
    const moreBtn = li.querySelector('.more-btn');
    const moreMenu = li.querySelector('.more-menu');
    const closeMenu = () => {
        if (moreMenu.hidden) return;
        moreMenu.hidden = true;
        moreBtn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', onOutside, true);
        document.removeEventListener('keydown', onEsc);
    };
    const onOutside = (e) => {
        if (!li.querySelector('.more-wrap').contains(e.target)) closeMenu();
    };
    const onEsc = (e) => {
        if (e.key === 'Escape') { closeMenu(); moreBtn.focus(); }
    };
    moreBtn.onclick = () => {
        if (moreMenu.hidden) {
            moreMenu.hidden = false;
            moreBtn.setAttribute('aria-expanded', 'true');
            // 캡처 단계로 등록해 이번 클릭이 바로 바깥 클릭으로 닫지 않게 한다.
            document.addEventListener('click', onOutside, true);
            document.addEventListener('keydown', onEsc);
        } else {
            closeMenu();
        }
    };
    li.querySelector('.edit-req-btn').onclick = () => { closeMenu(); renderEditRequest(li, m); };
    li.querySelector('.del-req-btn').onclick = () => { closeMenu(); renderDeleteRequest(li, m); };
    const ctrl = createLocationControl(m.name);
    if (ctrl) li.appendChild(ctrl);
}

// 수정 요청 폼: 바꿀 이름/메뉴를 입력받아 requests로 보낸다(실제 메뉴는 안 바뀜).
function renderEditRequest(li, m) {
    li.className = 'menu-item editing';
    li.innerHTML = `
    <div class="info edit-fields">
      <input class="req-name" type="text" placeholder="식당 이름" />
      <input class="req-desc" type="text" placeholder="메뉴 (예: 갈비덮밥)" />
    </div>
    <div class="actions">
      <button class="save-btn" type="button">요청 보내기</button>
      <button class="cancel-btn" type="button">취소</button>
    </div>
  `;
    const nameEl = li.querySelector('.req-name');
    const descEl = li.querySelector('.req-desc');
    nameEl.value = m.name;
    descEl.value = m.description || '';
    const cancel = () => renderView(li, m);
    const send = async () => {
        const name = nameEl.value.trim();
        const description = descEl.value.trim();
        if (!name && !description) {
            showToast('바꿀 내용을 입력하세요', 'error');
            return;
        }
        // 둘 다 그대로면 보낼 필요 없음
        if (name === m.name && description === (m.description || '')) {
            showToast('바뀐 내용이 없어요', 'error');
            return;
        }
        const saveBtn = li.querySelector('.save-btn');
        saveBtn.disabled = true;
        const ok = await submitRequest(
            { type: 'edit', menu_id: m.id, name, description },
            { successMsg: '수정 요청을 보냈어요. 검토 후 반영돼요.' }
        );
        if (ok) renderView(li, m);
        else saveBtn.disabled = false;
    };
    li.querySelector('.save-btn').onclick = send;
    li.querySelector('.cancel-btn').onclick = cancel;
    for (const el of [nameEl, descEl]) {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') send();
            else if (e.key === 'Escape') cancel();
        });
    }
    nameEl.focus();
    nameEl.select();
}

// 삭제 요청 확인: 사유(선택)를 받아 requests로 보낸다(실제 메뉴는 안 지워짐).
function renderDeleteRequest(li, m) {
    li.className = 'menu-item confirming';
    li.innerHTML = `
    <div class="info edit-fields">
      <span class="confirm-text"></span>
      <input class="req-reason" type="text" placeholder="삭제 사유 (선택)" />
    </div>
    <div class="actions">
      <button class="confirm-del-btn" type="button">요청 보내기</button>
      <button class="cancel-btn" type="button">취소</button>
    </div>
  `;
    li.querySelector('.confirm-text').textContent = `'${m.name}' 삭제를 요청할까요?`;
    const reasonEl = li.querySelector('.req-reason');
    const cancel = () => renderView(li, m);
    const send = async () => {
        const btn = li.querySelector('.confirm-del-btn');
        btn.disabled = true;
        const ok = await submitRequest(
            { type: 'delete', menu_id: m.id, reason: reasonEl.value.trim() },
            { successMsg: '삭제 요청을 보냈어요. 검토 후 반영돼요.' }
        );
        if (ok) renderView(li, m);
        else btn.disabled = false;
    };
    li.querySelector('.confirm-del-btn').onclick = send;
    li.querySelector('.cancel-btn').onclick = cancel;
    reasonEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') send();
        else if (e.key === 'Escape') cancel();
    });
    reasonEl.focus();
}

// 식당명으로 카카오를 조회해 카테고리를 알아내고, 해당 메뉴에 PATCH한다.
// 키 없음/조회 실패 시 조용히 스킵(카테고리는 null로 남음).
async function fillCategory(menu) {
  if (!isLocationEnabled() || !menu || menu.category) return;
  const ok = await loadKakao();
  if (!ok) return;
  const place = await findPlace(menu.name);
  if (!place) return;
  // 카카오 중분류를 우리 점심 분류(한식/중식/일식/양식/아시안/분식/샐러드)로 매핑한다.
  const category = mapCategory(parseCategory(place));
  if (!category) return;
  try {
    await fetch(`/api/menus/${menu.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    });
  } catch {
    /* 자동 채움 실패는 무시 — 다음 백필에서 재시도됨 */
  }
}

// 추가·수정·삭제는 직접 반영하지 않고 요청으로 보낸다(관리자 검토 후 반영).
// body는 { type, menu_id?, name?, description?, reason? }.
// 성공하면 true, 실패하면 false를 반환한다.
async function submitRequest(body, { successMsg } = {}) {
    try {
        const res = await fetch('/api/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            // 409면 이미 등록된 식당(추가 요청 중복) — 다른 실패와 구분해 안내한다.
            showToast(res.status === 409 ? '이미 등록된 식당이에요' : '요청에 실패했어요', 'error');
            return false;
        }
        showToast(successMsg || '요청을 보냈어요', 'success');
        return true;
    } catch (err) {
        showToast('요청에 실패했어요', 'error');
        return false;
    }
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const ok = await submitRequest(
        { type: 'add', name, description: descInput.value.trim() },
        { successMsg: '추가 요청을 보냈어요. 검토 후 반영돼요.' }
    );
    if (ok) {
        form.reset();
    }
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
    if (e.key === 'Escape') {
        closeMapModal();
        return;
    }
    if (e.key !== 'Tab' || !mapModalEls) return;
    // 포커스 트랩: Tab 이동이 모달 밖으로 새지 않도록 가둔다.
    const focusable = mapModalEls.overlay.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
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

// 당첨 순간 별이 사방으로 "팡" 터지는 연출
function burstStars(originEl) {
    const host = originEl.parentElement; // .recommend (position: relative)
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    const elRect = originEl.getBoundingClientRect();
    // 결과 텍스트 중심을 호스트 기준 좌표로 환산
    const cx = elRect.left - hostRect.left + elRect.width / 2;
    const cy = elRect.top - hostRect.top + elRect.height / 2;

    const glyphs = ['★', '✦', '✧', '⭐', '✨'];
    const colors = ['#f59e0b', '#fbbf24', '#fcd34d', '#fb7185', '#34d399', '#60a5fa'];
    const count = 18;

    for (let i = 0; i < count; i++) {
        const star = document.createElement('span');
        star.className = 'burst-star';
        star.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
        star.style.color = colors[Math.floor(Math.random() * colors.length)];
        star.style.fontSize = `${10 + Math.random() * 16}px`;
        star.style.left = `${cx}px`;
        star.style.top = `${cy}px`;
        host.appendChild(star);

        // 균등 분포 + 약간의 흔들림으로 자연스러운 방사형
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const distance = 70 + Math.random() * 80;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance - 10; // 살짝 위로 떠오르게
        const rot = (Math.random() - 0.5) * 540;
        const duration = 700 + Math.random() * 500;

        // 모든 키프레임의 transform 함수 구조를 동일하게 유지해야 모바일에서도 위치가 보간됨
        const anim = star.animate(
            [
                { transform: 'translate(-50%, -50%) translate(0px, 0px) scale(0) rotate(0deg)', opacity: 1 },
                { transform: `translate(-50%, -50%) translate(${dx * 0.6}px, ${dy * 0.6}px) scale(1.2) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.55 },
                { transform: `translate(-50%, -50%) translate(${dx}px, ${dy + 24}px) scale(0.3) rotate(${rot}deg)`, opacity: 0 },
            ],
            { duration, easing: 'cubic-bezier(0.18, 0.7, 0.3, 1)' }
        );
        anim.onfinish = () => star.remove();
    }
}

// 슬롯머신 + 별 터짐 공유 연출. labels를 흘리다 winnerLabel에서 멈춘다.
async function playSlot(labels, winnerLabel) {
  randomResult.classList.remove('winner');
  randomResult.textContent = ''; // 이전 결과 즉시 제거

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion && labels.length > 0) {
    randomResult.classList.add('rolling');
    let delay = 60;
    for (let i = 0; i < 18; i++) {
      randomResult.textContent = labels[Math.floor(Math.random() * labels.length)];
      await sleep(delay);
      delay += 18; // 점점 느려지게
    }
    randomResult.classList.remove('rolling');
  }

  randomResult.textContent = `오늘은 → ${winnerLabel}`;
  // winner 애니메이션 재시작(연속 추첨 시에도 매번 재생되도록 reflow 트리거)
  randomResult.classList.remove('winner');
  void randomResult.offsetWidth;
  randomResult.classList.add('winner');

  if (!reduceMotion) {
    burstStars(randomResult);
    randomBtn.classList.add('fired');
    randomBtn.addEventListener('animationend', () => randomBtn.classList.remove('fired'), { once: true });
  }
}

randomBtn.addEventListener('click', async () => {
    if (randomBtn.disabled) return;
    randomBtn.disabled = true;
    categoryRandomBtn.disabled = true; // 연출 중에는 카테고리 추첨도 막아 결과 자리 충돌 방지
    const prevLoc = randomResult.nextElementSibling; // 이전 위치 컨트롤 제거
    if (prevLoc?.classList.contains('loc-wrap')) prevLoc.remove();

    // 최신 목록을 받아 현재 필터(검색+카테고리) 안에서만 추첨한다.
    let menus;
    try {
        const listRes = await fetch('/api/menus');
        if (!listRes.ok) throw new Error('list error');
        menus = await listRes.json();
    } catch (err) {
        randomResult.textContent = '오류가 발생했습니다.';
        updateRecommendState(); // 두 버튼 상태 복구
        return;
    }

    const pool = currentPool(menus);
    if (pool.length === 0) {
        randomResult.textContent = searchInput.value.trim()
            ? '검색 결과가 없어요'
            : '식당을 먼저 추가하세요!';
        updateRecommendState(); // 두 버튼 상태 복구
        return;
    }

    const winner = pool[Math.floor(Math.random() * pool.length)];
    await playSlot(pool.map((m) => m.name), winner.name);

    const ctrl = createLocationControl(winner.name);
    if (ctrl) randomResult.insertAdjacentElement('afterend', ctrl);
    updateRecommendState(); // 두 버튼 상태 복구
});

categoryRandomBtn.addEventListener('click', async () => {
  if (categoryRandomBtn.disabled) return;
  categoryRandomBtn.disabled = true;
  randomBtn.disabled = true; // 연출 중에는 식당 추첨도 막아 결과 자리 충돌 방지
  const prevLoc = randomResult.nextElementSibling; // 이전 위치 컨트롤 제거
  if (prevLoc?.classList.contains('loc-wrap')) prevLoc.remove();

  // 검색이 적용된 목록에서 2곳 이상인 카테고리만 후보.
  const inSearch = filterMenus(allMenus, searchInput.value);
  const eligible = eligibleCategories(inSearch);
  if (eligible.length === 0) {
    randomResult.textContent = '추첨할 메뉴 종류가 부족해요';
    categoryRandomBtn.disabled = false;
    randomBtn.disabled = currentPool(allMenus).length < 2;
    return;
  }

  const picked = eligible[Math.floor(Math.random() * eligible.length)];
  await playSlot(eligible, picked);

  // 당첨 카테고리로 필터 동기화 → 목록이 그 카테고리만 남는다.
  selectedCategory = picked;
  categoryFilter.value = picked;
  renderFiltered();
});

// 앱 시작 시 category가 비어있는 메뉴들을 순차로(병렬 금지, rate limit) 채운다.
async function backfillCategories() {
  if (!isLocationEnabled()) return;
  const res = await fetch('/api/menus');
  if (!res.ok) return;
  const menus = await res.json();
  const pending = menus.filter((m) => !m.category);
  if (pending.length === 0) return;
  for (const m of pending) {
    await fillCategory(m); // 순차 — 카카오 호출 폭주 방지
  }
  loadMenus(); // 채운 결과 반영
}

initConfig().then(async () => {
  await loadMenus({ skeleton: true });
  backfillCategories(); // 비차단 백그라운드
});
