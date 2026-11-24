import { parseImportedFiles } from './ig-parser.js';
import { saveWorkspace, loadWorkspace, clearWorkspace } from './storage.js';
import { exportToCSV, exportToExcel, exportProgressBackup } from './exporter.js';
import { buildDemoWorkspace } from './demo-data.js';

const DECISION_META = {
  undecided: { label: '未決定', badge: 'badge-neutral' },
  keep: { label: '保留', badge: 'badge-keep' },
  mute: { label: '靜音', badge: 'badge-mute' },
  unfollow: { label: '考慮取消', badge: 'badge-unfollow' },
  later: { label: '稍後再看', badge: 'badge-later' }
};

const PAGE_SIZE = 50;

let state = null; // { accounts: [], meta: {}, settings: { protectMutual, autoOpenNext } }
let activeTab = 'import'; // import | funnel | focus | list
let focusQueue = [];
let focusIndex = 0;
let listPage = 1;
let selectedUsernames = new Set();
let undoStack = []; // [{ items: [{ username, prevDecision, prevNote }] }]
let igPreviewWindow = null;

// DOM refs
const $ = (id) => document.getElementById(id);

const els = {
  headerStats: $('headerStats'),
  progressLabel: $('progressLabel'),
  progressPercent: $('progressPercent'),
  progressFill: $('progressFill'),
  btnUndo: $('btnUndo'),
  btnOpenImport: $('btnOpenImport'),
  mainNav: $('mainNav'),
  toast: $('toast'),

  viewImport: $('viewImport'),
  viewFunnel: $('viewFunnel'),
  viewFocus: $('viewFocus'),
  viewList: $('viewList'),
  viewCleanup: $('viewCleanup'),

  dropZone: $('dropZone'),
  fileInput: $('fileInput'),
  btnPickFiles: $('btnPickFiles'),
  btnLoadDemo: $('btnLoadDemo'),
  backupInput: $('backupInput'),
  btnRestoreBackup: $('btnRestoreBackup'),
  btnBackToWorkspace: $('btnBackToWorkspace'),

  demoBanner: $('demoBanner'),
  statTotal: $('statTotal'),
  statMutual: $('statMutual'),
  statSingle: $('statSingle'),
  statUndecided: $('statUndecided'),
  cntKeep: $('cntKeep'),
  cntMute: $('cntMute'),
  cntUnfollow: $('cntUnfollow'),
  cntLater: $('cntLater'),
  btnBatchKeepMutual: $('btnBatchKeepMutual'),
  btnBatchKeepRecent: $('btnBatchKeepRecent'),
  btnStartSingleFocus: $('btnStartSingleFocus'),
  btnStartAllFocus: $('btnStartAllFocus'),
  btnFunnelExportExcel: $('btnFunnelExportExcel'),
  btnFunnelExportCsv: $('btnFunnelExportCsv'),
  btnFunnelBackup: $('btnFunnelBackup'),
  chkProtectMutual: $('chkProtectMutual'),
  chkAutoOpenNext: $('chkAutoOpenNext'),
  btnClearAll: $('btnClearAll'),

  focusQueueFilter: $('focusQueueFilter'),
  focusCounter: $('focusCounter'),
  focusEmpty: $('focusEmpty'),
  focusStage: $('focusStage'),
  btnFocusGoList: $('btnFocusGoList'),
  swipeCard: $('swipeCard'),
  swipeIndicator: $('swipeIndicator'),
  cardRelBadge: $('cardRelBadge'),
  cardCurrentDecision: $('cardCurrentDecision'),
  cardAvatar: $('cardAvatar'),
  cardUsername: $('cardUsername'),
  cardFollowedAt: $('cardFollowedAt'),
  cardHints: $('cardHints'),
  btnOpenIgProfile: $('btnOpenIgProfile'),
  cardNoteInput: $('cardNoteInput'),
  btnFocusPrev: $('btnFocusPrev'),
  btnFocusNext: $('btnFocusNext'),

  searchInput: $('searchInput'),
  filterDecision: $('filterDecision'),
  filterRelation: $('filterRelation'),
  filterSort: $('filterSort'),
  chkSelectAllPage: $('chkSelectAllPage'),
  btnSelectAllFiltered: $('btnSelectAllFiltered'),
  filteredCount: $('filteredCount'),
  selectedCountBadge: $('selectedCountBadge'),
  batchActions: $('batchActions'),
  btnListExportExcel: $('btnListExportExcel'),
  btnListExportCsv: $('btnListExportCsv'),
  listContainer: $('listContainer'),
  btnPagePrev: $('btnPagePrev'),
  btnPageNext: $('btnPageNext'),
  pageInfo: $('pageInfo'),

  cleanupProgressText: $('cleanupProgressText'),
  cleanupPackSelect: $('cleanupPackSelect'),
  chkHideDoneCleanup: $('chkHideDoneCleanup'),
  cleanupEmpty: $('cleanupEmpty'),
  cleanupList: $('cleanupList')
};

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

function formatDate(ms) {
  if (!ms) return '未知';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeIgUrl(url, username) {
  if (username) {
    return `https://www.instagram.com/${encodeURIComponent(username)}/`;
  }
  return String(url || '').replace('instagram.com/_u/', 'instagram.com/');
}

function openIgProfile(url, username) {
  const cleanUrl = normalizeIgUrl(url, username);
  // Reuse a single named window/tab so desktop users never accumulate 50 tabs
  igPreviewWindow = window.open(cleanUrl, 'ig_preview');
  if (igPreviewWindow) {
    try { igPreviewWindow.focus(); } catch { /* ignore cross-origin focus error */ }
  }
}

async function persist() {
  if (!state) return;
  try {
    await saveWorkspace(state);
  } catch (err) {
    console.error('Failed to save workspace:', err);
  }
}

function setTab(tab) {
  activeTab = tab;
  const hasData = Boolean(state && state.accounts.length > 0);

  els.viewImport.classList.toggle('hidden', tab !== 'import');
  els.viewFunnel.classList.toggle('hidden', tab !== 'funnel');
  els.viewFocus.classList.toggle('hidden', tab !== 'focus');
  els.viewList.classList.toggle('hidden', tab !== 'list');
  els.viewCleanup.classList.toggle('hidden', tab !== 'cleanup');

  els.mainNav.classList.toggle('hidden', !hasData || tab === 'import');
  els.headerStats.classList.toggle('hidden', !hasData);
  els.btnBackToWorkspace.classList.toggle('hidden', !hasData);

  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  if (tab === 'funnel') renderFunnel();
  if (tab === 'focus') {
    rebuildFocusQueue(false);
    renderFocusCard();
  }
  if (tab === 'list') renderList();
  if (tab === 'cleanup') renderCleanup();
  renderHeaderProgress();
}

function renderHeaderProgress() {
  if (!state) return;
  const total = state.accounts.length;
  const decided = state.accounts.filter((a) => a.decision !== 'undecided').length;
  const pct = total ? Math.round((decided / total) * 100) : 0;
  els.progressLabel.textContent = `已整理 ${decided} / ${total}`;
  els.progressPercent.textContent = `${pct}%`;
  els.progressFill.style.width = `${pct}%`;
  els.btnUndo.classList.toggle('hidden', undoStack.length === 0);
}

function renderFunnel() {
  if (!state) return;
  const accs = state.accounts;
  const total = accs.length;
  const mutual = accs.filter((a) => a.isMutual).length;
  const single = total - mutual;
  const undecided = accs.filter((a) => a.decision === 'undecided').length;

  els.demoBanner.classList.toggle('hidden', !state.meta?.isDemo);
  els.statTotal.textContent = total;
  els.statMutual.textContent = mutual;
  els.statSingle.textContent = single;
  els.statUndecided.textContent = undecided;

  els.cntKeep.textContent = accs.filter((a) => a.decision === 'keep').length;
  els.cntMute.textContent = accs.filter((a) => a.decision === 'mute').length;
  els.cntUnfollow.textContent = accs.filter((a) => a.decision === 'unfollow').length;
  els.cntLater.textContent = accs.filter((a) => a.decision === 'later').length;

  els.chkProtectMutual.checked = Boolean(state.settings?.protectMutual ?? true);
  els.chkAutoOpenNext.checked = Boolean(state.settings?.autoOpenNext ?? false);
}

function rebuildFocusQueue(resetIndex = true) {
  if (!state) return;
  const mode = els.focusQueueFilter.value;
  let list = state.accounts;

  if (mode === 'undecided_single') {
    list = list.filter((a) => a.decision === 'undecided' && !a.isMutual);
  } else if (mode === 'undecided_all') {
    list = list.filter((a) => a.decision === 'undecided');
  } else if (mode === 'later') {
    list = list.filter((a) => a.decision === 'later');
  } else if (mode === 'unfollow') {
    list = list.filter((a) => a.decision === 'unfollow');
  }

  focusQueue = list;
  if (resetIndex || focusIndex >= focusQueue.length) {
    focusIndex = 0;
  }
}

function renderFocusCard() {
  const total = focusQueue.length;
  if (total === 0) {
    els.focusCounter.textContent = '0 / 0';
    els.focusEmpty.classList.remove('hidden');
    els.focusStage.classList.add('hidden');
    return;
  }

  els.focusEmpty.classList.add('hidden');
  els.focusStage.classList.remove('hidden');

  if (focusIndex < 0) focusIndex = 0;
  if (focusIndex >= total) focusIndex = total - 1;

  const acc = focusQueue[focusIndex];
  els.focusCounter.textContent = `${focusIndex + 1} / ${total}`;

  els.cardRelBadge.textContent = acc.isMutual ? '✓ 互追好友' : '單方面追蹤';
  els.cardRelBadge.className = `badge ${acc.isMutual ? 'badge-mutual' : 'badge-single'}`;

  const dMeta = DECISION_META[acc.decision] || DECISION_META.undecided;
  els.cardCurrentDecision.textContent = dMeta.label;
  els.cardCurrentDecision.className = `badge ${dMeta.badge}`;

  els.cardAvatar.textContent = acc.username.slice(0, 1);
  els.cardUsername.textContent = `@${acc.username}`;
  els.cardFollowedAt.textContent = `追蹤日期：${formatDate(acc.followedAt)}`;

  els.cardHints.innerHTML = '';
  (acc.hints || []).forEach((h) => {
    const span = document.createElement('span');
    span.className = 'hint-chip';
    span.textContent = h;
    els.cardHints.appendChild(span);
  });

  els.cardNoteInput.value = acc.note || '';
}

function applyDecision(accountsToUpdate, decision, source = 'focus') {
  if (!accountsToUpdate.length) return false;

  // Mutual protection check
  if (decision === 'unfollow' && state.settings?.protectMutual) {
    const mutualTargets = accountsToUpdate.filter((a) => a.isMutual);
    if (mutualTargets.length > 0) {
      const msg =
        mutualTargets.length === 1
          ? `「@${mutualTargets[0].username}」是你的互追好友，確定要標記為「考慮取消」嗎？`
          : `選取的帳號中包含 ${mutualTargets.length} 位「互追好友」，確定要標記為「考慮取消」嗎？`;
      if (!window.confirm(msg)) return false;
    }
  }

  const snapshot = accountsToUpdate.map((a) => ({
    username: a.username,
    prevDecision: a.decision,
    prevNote: a.note
  }));
  undoStack.push({ items: snapshot });
  if (undoStack.length > 30) undoStack.shift();

  const now = Date.now();
  accountsToUpdate.forEach((a) => {
    a.decision = decision;
    a.updatedAt = now;
  });

  persist();
  renderHeaderProgress();

  if (source === 'focus') {
    const mode = els.focusQueueFilter.value;
    if (mode === 'all') {
      focusIndex = Math.min(focusIndex + 1, Math.max(0, focusQueue.length - 1));
    } else {
      rebuildFocusQueue(false);
    }
    renderFocusCard();

    if (state.settings?.autoOpenNext && focusQueue[focusIndex]) {
      openIgProfile(focusQueue[focusIndex].href);
    }
  } else if (source === 'list') {
    renderList();
  } else if (source === 'funnel') {
    renderFunnel();
  }

  showToast(`已標記 ${accountsToUpdate.length} 筆為「${DECISION_META[decision].label}」`);
  return true;
}

function undoLastAction() {
  if (!undoStack.length || !state) return;
  const last = undoStack.pop();
  const map = new Map(state.accounts.map((a) => [a.username, a]));
  last.items.forEach((item) => {
    const acc = map.get(item.username);
    if (acc) {
      acc.decision = item.prevDecision;
      acc.note = item.prevNote;
    }
  });
  persist();
  renderHeaderProgress();
  if (activeTab === 'funnel') renderFunnel();
  if (activeTab === 'focus') {
    rebuildFocusQueue(false);
    renderFocusCard();
  }
  if (activeTab === 'list') renderList();
  showToast(`已復原 ${last.items.length} 筆變更`);
}

function getFilteredList() {
  if (!state) return [];
  const q = els.searchInput.value.trim().toLowerCase();
  const dec = els.filterDecision.value;
  const rel = els.filterRelation.value;
  const sort = els.filterSort.value;

  let list = state.accounts.filter((a) => {
    if (dec !== 'all' && a.decision !== dec) return false;
    if (rel === 'mutual' && !a.isMutual) return false;
    if (rel === 'single' && a.isMutual) return false;
    if (q) {
      const hay = `${a.username} ${a.note || ''} ${(a.hints || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (sort === 'oldest') {
    list.sort((a, b) => (a.followedAt || 0) - (b.followedAt || 0));
  } else if (sort === 'newest') {
    list.sort((a, b) => (b.followedAt || 0) - (a.followedAt || 0));
  } else if (sort === 'alpha') {
    list.sort((a, b) => a.username.localeCompare(b.username));
  }
  return list;
}

function renderList() {
  const filtered = getFilteredList();
  els.filteredCount.textContent = filtered.length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (listPage > totalPages) listPage = totalPages;
  if (listPage < 1) listPage = 1;

  const start = (listPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  els.pageInfo.textContent = `第 ${listPage} / ${totalPages} 頁（共 ${filtered.length} 筆）`;
  els.btnPagePrev.disabled = listPage <= 1;
  els.btnPageNext.disabled = listPage >= totalPages;

  els.listContainer.innerHTML = '';

  if (pageItems.length === 0) {
    els.listContainer.innerHTML = '<div class="empty-state"><p class="muted">沒有符合條件的帳號。</p></div>';
  } else {
    const frag = document.createDocumentFragment();
    pageItems.forEach((acc) => {
      const row = document.createElement('div');
      row.className = 'account-row';

      const checked = selectedUsernames.has(acc.username);
      const dMeta = DECISION_META[acc.decision] || DECISION_META.undecided;

      row.innerHTML = `
        <div class="account-row-left">
          <input type="checkbox" class="row-chk" data-user="${acc.username}" ${checked ? 'checked' : ''} />
          <div class="account-meta">
            <div class="account-name-line">
              <a class="account-link" href="${acc.href}" target="ig_preview">@${acc.username}</a>
              <span class="badge ${acc.isMutual ? 'badge-mutual' : 'badge-single'}">${acc.isMutual ? '互追' : '單追'}</span>
              <span class="badge ${dMeta.badge}">${dMeta.label}</span>
            </div>
            <div class="account-sub">
              追蹤日期：${formatDate(acc.followedAt)}
              ${acc.hints?.length ? '・' + acc.hints.slice(1).join(' / ') : ''}
              ${acc.note ? '・備註：' + acc.note : ''}
            </div>
          </div>
        </div>
        <div class="account-row-actions">
          <button class="btn btn-sm btn-secondary btn-open-row-ig" data-href="${acc.href}">↗ 看 IG</button>
          <select class="row-decision-select" data-user="${acc.username}">
            <option value="undecided" ${acc.decision === 'undecided' ? 'selected' : ''}>未決定</option>
            <option value="keep" ${acc.decision === 'keep' ? 'selected' : ''}>保留</option>
            <option value="mute" ${acc.decision === 'mute' ? 'selected' : ''}>靜音</option>
            <option value="unfollow" ${acc.decision === 'unfollow' ? 'selected' : ''}>考慮取消</option>
            <option value="later" ${acc.decision === 'later' ? 'selected' : ''}>稍後再看</option>
          </select>
        </div>
      `;
      frag.appendChild(row);
    });
    els.listContainer.appendChild(frag);
  }

  updateSelectionUI(pageItems);
}

function updateSelectionUI(pageItems = []) {
  const count = selectedUsernames.size;
  els.selectedCountBadge.textContent = `已選 ${count} 筆`;
  els.selectedCountBadge.classList.toggle('hidden', count === 0);
  els.batchActions.classList.toggle('hidden', count === 0);

  if (pageItems.length > 0) {
    els.chkSelectAllPage.checked = pageItems.every((a) => selectedUsernames.has(a.username));
  } else {
    els.chkSelectAllPage.checked = false;
  }
}

const CLEANUP_PACK_SIZE = 30;

function renderCleanup() {
  if (!state) return;
  const targets = state.accounts.filter((a) => a.decision === 'unfollow');
  const total = targets.length;
  const doneCount = targets.filter((a) => a.unfollowedDone).length;
  els.cleanupProgressText.textContent = `已退追打勾 ${doneCount} / ${total}`;

  if (total === 0) {
    els.cleanupEmpty.classList.remove('hidden');
    els.cleanupList.innerHTML = '';
    els.cleanupPackSelect.innerHTML = '<option value="0">尚無分包</option>';
    return;
  }

  els.cleanupEmpty.classList.add('hidden');
  const packCount = Math.ceil(total / CLEANUP_PACK_SIZE);
  const prevPack = Number(els.cleanupPackSelect.value) || 0;
  const currentPack = Math.min(prevPack, packCount - 1);

  els.cleanupPackSelect.innerHTML = '';
  for (let i = 0; i < packCount; i++) {
    const start = i * CLEANUP_PACK_SIZE;
    const slice = targets.slice(start, start + CLEANUP_PACK_SIZE);
    const sliceDone = slice.filter((a) => a.unfollowedDone).length;
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `第 ${i + 1} 包（${start + 1}–${start + slice.length}）— 已完成 ${sliceDone}/${slice.length}`;
    if (i === currentPack) opt.selected = true;
    els.cleanupPackSelect.appendChild(opt);
  }

  const startIdx = currentPack * CLEANUP_PACK_SIZE;
  let packItems = targets.slice(startIdx, startIdx + CLEANUP_PACK_SIZE);
  if (els.chkHideDoneCleanup.checked) {
    packItems = packItems.filter((a) => !a.unfollowedDone);
  }

  els.cleanupList.innerHTML = '';
  if (packItems.length === 0) {
    els.cleanupList.innerHTML = '<div class="empty-state"><p class="muted">這一包已經全部退追打勾完成！可以切到下一包 🎉</p></div>';
    return;
  }

  const frag = document.createDocumentFragment();
  packItems.forEach((acc) => {
    const row = document.createElement('div');
    row.className = `account-row ${acc.unfollowedDone ? 'is-done' : ''}`;
    row.innerHTML = `
      <div class="account-row-left">
        <input type="checkbox" class="cleanup-done-chk" data-user="${acc.username}" ${acc.unfollowedDone ? 'checked' : ''} />
        <div class="account-meta">
          <div class="account-name-line">
            <a class="account-link" href="${acc.href}" target="ig_preview">@${acc.username}</a>
            <span class="badge ${acc.isMutual ? 'badge-mutual' : 'badge-single'}">${acc.isMutual ? '互追' : '單追'}</span>
          </div>
          <div class="account-sub">追蹤日期：${formatDate(acc.followedAt)}${acc.note ? '・備註：' + acc.note : ''}</div>
        </div>
      </div>
      <div class="account-row-actions">
        <button class="btn btn-sm btn-primary btn-open-cleanup-ig" data-href="${acc.href}" data-user="${acc.username}">↗ 開 IG 退追</button>
      </div>
    `;
    frag.appendChild(row);
  });
  els.cleanupList.appendChild(frag);
}

async function handleImportFiles(fileList) {
  try {
    const result = await parseImportedFiles(fileList);
    state = {
      accounts: result.accounts,
      meta: result.meta,
      settings: { protectMutual: true, autoOpenNext: false }
    };
    undoStack = [];
    selectedUsernames.clear();
    await persist();
    showToast(`成功匯入 ${result.accounts.length} 個追蹤帳號（其中互追 ${result.meta.mutualCount} 位）`);
    setTab('funnel');
  } catch (err) {
    alert(err.message || '匯入失敗，請確認檔案格式是否為 Instagram 官方 JSON 或 ZIP。');
  }
}

// Swipe gestures for mobile Focus Mode
function setupSwipeGestures() {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dy = 0;
  let dragging = false;

  const card = els.swipeCard;
  const indicator = els.swipeIndicator;

  card.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, a')) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    dy = 0;
    card.style.transition = 'none';
  });

  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    card.style.transform = `translate(${dx * 0.6}px, ${dy * 0.35}px) rotate(${dx * 0.04}deg)`;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 45) {
      indicator.style.opacity = '1';
      if (dx > 0) {
        indicator.textContent = '✓ 保留';
        indicator.style.background = '#059669';
      } else {
        indicator.textContent = '✕ 考慮取消';
        indicator.style.background = '#dc2626';
      }
    } else if (Math.abs(dy) > 45) {
      indicator.style.opacity = '1';
      if (dy < 0) {
        indicator.textContent = '🔇 靜音';
        indicator.style.background = '#d97706';
      } else {
        indicator.textContent = '⏳ 稍後再看';
        indicator.style.background = '#7c3aed';
      }
    } else {
      indicator.style.opacity = '0';
    }
  });

  window.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    card.style.transition = 'transform 0.2s ease';
    card.style.transform = '';
    indicator.style.opacity = '0';

    const acc = focusQueue[focusIndex];
    if (!acc) return;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 90) {
      applyDecision([acc], dx > 0 ? 'keep' : 'unfollow', 'focus');
    } else if (Math.abs(dy) > 90) {
      applyDecision([acc], dy < 0 ? 'mute' : 'later', 'focus');
    }
  });
}

// Event bindings
function bindEvents() {
  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  els.btnOpenImport.addEventListener('click', () => setTab('import'));
  els.btnBackToWorkspace.addEventListener('click', () => setTab('funnel'));
  els.btnUndo.addEventListener('click', undoLastAction);

  // Import & Demo
  els.btnPickFiles.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', (e) => {
    if (e.target.files?.length) handleImportFiles(e.target.files);
    e.target.value = '';
  });

  els.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.dropZone.classList.add('drag-over');
  });
  els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('drag-over'));
  els.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files?.length) handleImportFiles(e.dataTransfer.files);
  });

  els.btnLoadDemo.addEventListener('click', async () => {
    state = buildDemoWorkspace();
    undoStack = [];
    selectedUsernames.clear();
    await persist();
    showToast('已載入 20 筆示範資料，可以開始體驗操作！');
    setTab('funnel');
  });

  els.btnRestoreBackup.addEventListener('click', () => els.backupInput.click());
  els.backupInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed?.state?.accounts) throw new Error('無效的備份檔格式');
      state = parsed.state;
      undoStack = [];
      selectedUsernames.clear();
      await persist();
      showToast(`已還原 ${state.accounts.length} 筆整理進度！`);
      setTab('funnel');
    } catch (err) {
      alert('還原失敗：' + err.message);
    }
    e.target.value = '';
  });

  // Funnel actions
  els.btnBatchKeepMutual.addEventListener('click', () => {
    const targets = state.accounts.filter((a) => a.isMutual && a.decision === 'undecided');
    if (targets.length === 0) {
      showToast('目前沒有尚未決定的互追帳號了！');
      return;
    }
    applyDecision(targets, 'keep', 'funnel');
  });

  els.btnBatchKeepRecent.addEventListener('click', () => {
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const targets = state.accounts.filter(
      (a) => a.decision === 'undecided' && a.followedAt && a.followedAt >= oneYearAgo
    );
    if (targets.length === 0) {
      showToast('目前沒有「近 1 年內追蹤且尚未決定」的帳號！');
      return;
    }
    applyDecision(targets, 'keep', 'funnel');
  });

  els.cleanupPackSelect.addEventListener('change', renderCleanup);
  els.chkHideDoneCleanup.addEventListener('change', renderCleanup);
  els.cleanupList.addEventListener('change', (e) => {
    if (e.target.classList.contains('cleanup-done-chk')) {
      const acc = state.accounts.find((a) => a.username === e.target.dataset.user);
      if (acc) {
        acc.unfollowedDone = e.target.checked;
        persist();
        renderCleanup();
      }
    }
  });
  els.cleanupList.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-open-cleanup-ig');
    if (btn) openIgProfile(btn.dataset.href, btn.dataset.user);
  });

  els.btnStartSingleFocus.addEventListener('click', () => {
    els.focusQueueFilter.value = 'undecided_single';
    setTab('focus');
  });

  els.btnStartAllFocus.addEventListener('click', () => {
    els.focusQueueFilter.value = 'undecided_all';
    setTab('focus');
  });

  els.btnFunnelExportExcel.addEventListener('click', () => exportToExcel(state.accounts, 'all'));
  els.btnFunnelExportCsv.addEventListener('click', () => exportToCSV(state.accounts, 'all'));
  els.btnFunnelBackup.addEventListener('click', () => exportProgressBackup(state));

  els.chkProtectMutual.addEventListener('change', (e) => {
    state.settings.protectMutual = e.target.checked;
    persist();
  });
  els.chkAutoOpenNext.addEventListener('change', (e) => {
    state.settings.autoOpenNext = e.target.checked;
    persist();
  });

  els.btnClearAll.addEventListener('click', async () => {
    if (!window.confirm('確定要清除本機瀏覽器中的所有追蹤整理進度嗎？（建議先下載進度備份）')) return;
    await clearWorkspace();
    state = null;
    undoStack = [];
    selectedUsernames.clear();
    setTab('import');
    showToast('已清除本機資料');
  });

  // Focus mode
  els.focusQueueFilter.addEventListener('change', () => {
    rebuildFocusQueue(true);
    renderFocusCard();
  });

  els.btnFocusGoList.addEventListener('click', () => setTab('list'));

  els.btnOpenIgProfile.addEventListener('click', () => {
    const acc = focusQueue[focusIndex];
    if (acc) openIgProfile(acc.href);
  });

  els.cardNoteInput.addEventListener('change', (e) => {
    const acc = focusQueue[focusIndex];
    if (acc) {
      acc.note = e.target.value.trim();
      persist();
    }
  });

  document.querySelectorAll('.btn-decision').forEach((btn) => {
    btn.addEventListener('click', () => {
      const acc = focusQueue[focusIndex];
      if (acc) applyDecision([acc], btn.dataset.decision, 'focus');
    });
  });

  els.btnFocusPrev.addEventListener('click', () => {
    if (focusIndex > 0) {
      focusIndex--;
      renderFocusCard();
    }
  });

  els.btnFocusNext.addEventListener('click', () => {
    if (focusIndex < focusQueue.length - 1) {
      focusIndex++;
      renderFocusCard();
    }
  });

  // Keyboard shortcuts in Focus Mode
  window.addEventListener('keydown', (e) => {
    if (activeTab !== 'focus') return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

    const acc = focusQueue[focusIndex];
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      undoLastAction();
      return;
    }
    if (!acc) return;

    if (e.key === '1') applyDecision([acc], 'keep', 'focus');
    else if (e.key === '2') applyDecision([acc], 'mute', 'focus');
    else if (e.key === '3') applyDecision([acc], 'unfollow', 'focus');
    else if (e.key === '4') applyDecision([acc], 'later', 'focus');
    else if (e.code === 'Space' || e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      openIgProfile(acc.href);
    } else if (e.key === 'ArrowLeft' && focusIndex > 0) {
      focusIndex--;
      renderFocusCard();
    } else if (e.key === 'ArrowRight' && focusIndex < focusQueue.length - 1) {
      focusIndex++;
      renderFocusCard();
    }
  });

  // List & Batch mode
  [els.searchInput, els.filterDecision, els.filterRelation, els.filterSort].forEach((el) => {
    el.addEventListener('input', () => {
      listPage = 1;
      renderList();
    });
  });

  els.listContainer.addEventListener('change', (e) => {
    if (e.target.classList.contains('row-chk')) {
      const u = e.target.dataset.user;
      if (e.target.checked) selectedUsernames.add(u);
      else selectedUsernames.delete(u);
      updateSelectionUI(getFilteredList().slice((listPage - 1) * PAGE_SIZE, listPage * PAGE_SIZE));
    } else if (e.target.classList.contains('row-decision-select')) {
      const u = e.target.dataset.user;
      const acc = state.accounts.find((a) => a.username === u);
      if (acc) {
        const ok = applyDecision([acc], e.target.value, 'list');
        if (!ok) e.target.value = acc.decision;
      }
    }
  });

  els.listContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-open-row-ig');
    if (btn) openIgProfile(btn.dataset.href);
  });

  els.chkSelectAllPage.addEventListener('change', (e) => {
    const pageItems = getFilteredList().slice((listPage - 1) * PAGE_SIZE, listPage * PAGE_SIZE);
    pageItems.forEach((a) => {
      if (e.target.checked) selectedUsernames.add(a.username);
      else selectedUsernames.delete(a.username);
    });
    renderList();
  });

  els.btnSelectAllFiltered.addEventListener('click', () => {
    const filtered = getFilteredList();
    filtered.forEach((a) => selectedUsernames.add(a.username));
    renderList();
  });

  document.querySelectorAll('[data-batch]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targets = state.accounts.filter((a) => selectedUsernames.has(a.username));
      if (applyDecision(targets, btn.dataset.batch, 'list')) {
        selectedUsernames.clear();
        renderList();
      }
    });
  });

  els.btnListExportExcel.addEventListener('click', () => exportToExcel(getFilteredList(), 'filtered'));
  els.btnListExportCsv.addEventListener('click', () => exportToCSV(getFilteredList(), 'filtered'));

  els.btnPagePrev.addEventListener('click', () => {
    if (listPage > 1) { listPage--; renderList(); }
  });
  els.btnPageNext.addEventListener('click', () => {
    listPage++;
    renderList();
  });

  setupSwipeGestures();
}

async function init() {
  bindEvents();
  try {
    const saved = await loadWorkspace();
    if (saved && Array.isArray(saved.accounts) && saved.accounts.length > 0) {
      let migrated = false;
      saved.accounts.forEach((a) => {
        if (a.href && a.href.includes('/_u/')) {
          a.href = normalizeIgUrl(a.href, a.username);
          migrated = true;
        }
      });
      state = saved;
      if (migrated) persist();
      setTab('funnel');
      return;
    }
  } catch (err) {
    console.warn('IndexedDB unavailable:', err);
  }
  setTab('import');
}

init();
