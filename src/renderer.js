const state = {
  appInfo: {},
  settings: {},
  history: [],
  memory: [],
  memorySummary: { total: 0, categories: {}, tags: {}, typeCounts: {}, recentCount: 0 },
  localIndex: null,
  cloudSync: null,
  dataHealth: null,
  onboarding: { completed: false, shouldShow: false },
  failures: [],
  memoryFilter: { category: '', tag: '', text: '', type: '', sort: 'updated-desc', selectedId: '' },
  lastQuery: '',
  activeMode: 'all',
  activeSearchId: 0,
  progressTimer: null,
  progressValue: 0,
  renderedResults: new Map(),
  currentResults: [],
  resultGroupExpanded: new Set(),
  resultFilter: { bucket: '', sort: 'score-desc' },
  selectedResultId: '',
  lastImportSummary: null
};

const RESULT_REVEAL_OFFSET = 18;
const RESULT_GROUP_PREVIEW_LIMIT = 5;
const RESULT_GROUP_MIN_COUNT = 12;
const RESULT_GROUP_SUMMARY_MIN_COUNT = 12;
const RESULT_GROUP_SUMMARY_LIMIT = 4;

const MODE_LABELS = {
  all: '综合检索',
  local: '本地文件名',
  content: '正文检索',
  memory: '记忆库',
  web: '网页摘要',
  'open-web': '浏览器搜索'
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatSize(bytes) {
  const value = Number(bytes || 0);
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value > 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function setStatus(message) {
  $('#statusText').textContent = message;
}

function setProgress(percent, detail) {
  const progress = $('#searchProgress');
  const bar = $('#progressBar');
  const detailNode = $('#progressDetail');
  if (!progress || !bar || !detailNode) return;
  progress.hidden = false;
  bar.style.width = `${Math.max(5, Math.min(100, percent))}%`;
  detailNode.textContent = detail;
}

function startProgress(mode) {
  stopProgress(false);
  state.progressValue = 8;
  $('#progressTitle').textContent = `正在检索：${MODE_LABELS[mode] || '匹配'}`;
  setProgress(state.progressValue, '正在准备检索...');
  state.progressTimer = window.setInterval(() => {
    state.progressValue = Math.min(88, state.progressValue + 7);
    const detail = state.progressValue < 35
      ? '正在检查资料夹和索引...'
      : state.progressValue < 70
        ? '正在匹配文件、正文和记忆库...'
        : '正在整理结果...';
    setProgress(state.progressValue, detail);
  }, 450);
}

function stopProgress(showComplete = true) {
  if (state.progressTimer) {
    window.clearInterval(state.progressTimer);
    state.progressTimer = null;
  }
  const progress = $('#searchProgress');
  if (!progress) return;
  if (showComplete) {
    setProgress(100, '检索完成。');
    window.setTimeout(() => {
      if (!state.progressTimer) progress.hidden = true;
    }, 700);
  } else {
    progress.hidden = true;
  }
}

function switchTab(tab) {
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tab}`));
}

function focusSearchBox() {
  switchTab('search');
  const input = $('#queryInput');
  input?.focus();
  input?.select();
}

function updateQuickStartVisibility() {
  const panel = $('#quickStartPanel');
  if (!panel) return;
  const hasResults = state.currentResults.length > 0;
  panel.hidden = hasResults;
}

function revealSearchResults() {
  switchTab('search');
  const scrollIntoView = (behavior = 'smooth') => {
    const target = $('#resultsPanel') || $('.result-card[data-result-id]');
    const main = $('.main');
    if (!target) return;

    if (main && main.scrollHeight > main.clientHeight + 4 && main.clientHeight < window.innerHeight - 4) {
      const mainTop = main.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      main.scrollTo({
        top: Math.max(0, main.scrollTop + targetTop - mainTop - RESULT_REVEAL_OFFSET),
        behavior
      });
      return;
    }

    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - RESULT_REVEAL_OFFSET);
    window.scrollTo({ top, behavior });
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
  };

  window.setTimeout(() => scrollIntoView('smooth'), 80);
  window.setTimeout(() => scrollIntoView('auto'), 380);
  window.setTimeout(() => scrollIntoView('auto'), 900);
}

function revealImportFeedback() {
  switchTab('import');
  const panel = $('.import-feedback-panel');
  const main = $('.main');
  if (!panel) return;

  panel.classList.remove('attention');
  window.requestAnimationFrame(() => panel.classList.add('attention'));

  const scrollIntoView = (behavior = 'smooth') => {
    if (main && main.scrollHeight > main.clientHeight + 4) {
      const mainTop = main.getBoundingClientRect().top;
      const targetTop = panel.getBoundingClientRect().top;
      main.scrollTo({
        top: Math.max(0, main.scrollTop + targetTop - mainTop - RESULT_REVEAL_OFFSET),
        behavior
      });
      return;
    }

    const top = Math.max(0, panel.getBoundingClientRect().top + window.scrollY - RESULT_REVEAL_OFFSET);
    window.scrollTo({ top, behavior });
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
  };

  window.setTimeout(() => scrollIntoView('smooth'), 80);
  window.setTimeout(() => scrollIntoView('auto'), 360);
}

function revealSettingsPanel(target) {
  const main = $('.main');
  if (!target) return;

  const scrollIntoView = (behavior = 'smooth') => {
    if (main && main.scrollHeight > main.clientHeight + 4) {
      const mainTop = main.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      main.scrollTo({
        top: Math.max(0, main.scrollTop + targetTop - mainTop - RESULT_REVEAL_OFFSET),
        behavior
      });
    }

    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - RESULT_REVEAL_OFFSET);
    window.scrollTo({ top, behavior });
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
  };

  window.setTimeout(() => scrollIntoView('smooth'), 80);
  window.setTimeout(() => scrollIntoView('auto'), 380);
}

function showOnboarding() {
  const overlay = $('#onboardingOverlay');
  if (overlay) overlay.hidden = false;
}

function hideOnboarding() {
  const overlay = $('#onboardingOverlay');
  if (overlay) overlay.hidden = true;
}

function isOnboardingOpen() {
  const overlay = $('#onboardingOverlay');
  return Boolean(overlay && !overlay.hidden);
}

async function completeOnboarding() {
  state.onboarding = await window.dustySearch.completeOnboarding();
  hideOnboarding();
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

function highlight(value, query = state.lastQuery) {
  let html = escapeHtml(value);
  const terms = String(query || '').split(/\s+/).filter((term) => term.length > 0 && term.length < 80).slice(0, 6);
  for (const term of terms) {
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>');
  }
  return html;
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function queryTerms(query = state.lastQuery) {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter((term) => term && term.length < 80 && !/^(type|ext|tag|cat|category|标签|分类):/i.test(term))
    .slice(0, 8);
}

function renderHistory() {
  const list = $('#historyList');
  if (!state.history.length) {
    list.className = 'history-list empty';
    list.textContent = '还没有检索记录。';
    return;
  }

  list.className = 'history-list';
  list.innerHTML = state.history.slice(0, 14).map((item) => `
    <button class="history-item" data-query="${escapeAttr(item.query)}">
      <span>${escapeHtml(item.query)}</span>
      <small>${item.resultCount} 条 · ${formatDate(item.createdAt)}</small>
    </button>
  `).join('');
}

function getMemoryType(item) {
  if (item.type === 'website') return 'website';
  if (item.type === 'saved-result') return 'saved';
  if (item.type === 'ocr-image') return 'ocr';
  return 'file';
}

function memoryTypeLabel(type) {
  if (type === 'website') return '网站';
  if (type === 'saved') return '收藏';
  if (type === 'ocr') return '图片文字';
  return '文件';
}

function getMemoryPreview(item, length = 180) {
  return String(item.note || item.content || item.source || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length);
}

function getFilteredMemory() {
  const category = state.memoryFilter.category;
  const tag = state.memoryFilter.tag;
  const text = state.memoryFilter.text;
  const type = state.memoryFilter.type;
  const sort = state.memoryFilter.sort || 'updated-desc';
  const items = state.memory.filter((item) => {
    const typeKey = getMemoryType(item);
    const categoryOk = !category || item.category === category;
    const tagOk = !tag || (item.tags || []).some((value) => value.includes(tag));
    const typeOk = !type || typeKey === type;
    const haystack = `${item.title || ''} ${item.source || ''} ${(item.tags || []).join(' ')} ${item.note || ''} ${item.content || ''}`.toLowerCase();
    const textOk = !text || haystack.includes(text.toLowerCase());
    return categoryOk && tagOk && typeOk && textOk;
  });

  return items.sort((a, b) => {
    if (sort === 'title-asc') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
    if (sort === 'created-desc') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
  });
}

function renderMemoryOverview() {
  const node = $('#memoryOverview');
  if (!node) return;
  const summary = state.memorySummary || {};
  const typeCounts = summary.typeCounts || {};
  const cards = [
    ['总资料', summary.total || 0, '已导入和收藏'],
    ['文件', typeCounts.file || 0, '本地资料'],
    ['网站', typeCounts.website || 0, '网页内容'],
    ['收藏', typeCounts.saved || 0, '主动保存的结果'],
    ['本周更新', summary.recentCount || 0, '最近整理过']
  ];
  node.innerHTML = cards.map(([label, value, hint]) => `
    <div class="memory-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    </div>
  `).join('');
}

function renderMemory() {
  const list = $('#memoryList');
  const countNode = $('#memoryListCount');
  renderMemoryFilters();
  renderTagCloud();
  renderMemoryOverview();
  const items = getFilteredMemory();
  if (countNode) countNode.textContent = `${items.length} 条`;
  if (items.length && !items.some((item) => item.id === state.memoryFilter.selectedId)) {
    state.memoryFilter.selectedId = items[0].id;
  }

  if (!items.length) {
    list.className = 'memory-list empty';
    list.innerHTML = state.memory.length
      ? '<div><p>没有符合筛选的记忆库内容。</p><button class="small-button empty-action" data-action="clear-memory-filter">清空筛选</button></div>'
      : '<div><p>还没有导入内容。</p><button class="small-button empty-action" data-action="go-import">去导入资料</button></div>';
    renderMemoryDetail(null);
    return;
  }

  list.className = 'memory-list';
  list.innerHTML = items.map((item) => `
    <article class="memory-item ${state.memoryFilter.selectedId === item.id ? 'active' : ''}" data-memory-id="${escapeAttr(item.id)}">
      <div>
        <div class="memory-item-head">
          <h3>${escapeHtml(item.title)}</h3>
          <span>${memoryTypeLabel(getMemoryType(item))}</span>
        </div>
        <p>${escapeHtml(item.source)}</p>
        <div class="memory-meta-row">
          <span>${escapeHtml(item.category || '其他')}</span>
          <span>${(item.tags || []).map((tag) => `<b>${escapeHtml(tag)}</b>`).join(' ') || '无标签'}</span>
          <small>${formatDate(item.updatedAt || item.createdAt)}</small>
        </div>
        ${item.note ? `<p class="memory-note-preview">备注：${escapeHtml(item.note)}</p>` : ''}
        <p class="memory-preview">${escapeHtml(getMemoryPreview(item, 140) || '暂无正文预览')}</p>
      </div>
    </article>
  `).join('');
  renderMemoryDetail(items.find((item) => item.id === state.memoryFilter.selectedId) || items[0]);
}

function renderMemoryDetail(item) {
  const detail = $('#memoryDetail');
  if (!detail) return;
  if (!item) {
    detail.className = 'memory-detail empty';
    detail.textContent = state.memory.length ? '没有符合筛选的资料。' : '选择左边的一条资料查看详情。';
    return;
  }
  detail.className = 'memory-detail';
  const type = getMemoryType(item);
  detail.innerHTML = `
    <div class="memory-detail-top">
      <span>${memoryTypeLabel(type)}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p title="${escapeAttr(item.source)}">${escapeHtml(item.source)}</p>
    </div>
    <div class="memory-detail-actions">
      <button class="small-button open-source" data-source="${escapeAttr(item.source)}">打开来源</button>
      <button class="small-button copy-source" data-source="${escapeAttr(item.source)}">复制来源</button>
      <button class="small-button delete-memory danger-button" data-id="${escapeAttr(item.id)}">删除</button>
    </div>
    <div class="memory-edit memory-detail-edit">
      <input class="memory-category-input" data-id="${item.id}" value="${escapeAttr(item.category || '其他')}" placeholder="分类" />
      <input class="memory-tags-input" data-id="${item.id}" value="${escapeAttr((item.tags || []).join(', '))}" placeholder="标签，用逗号隔开" />
      <button class="small-button save-memory-meta" data-id="${item.id}">保存</button>
    </div>
    <label class="memory-note-editor">
      <span>我的备注</span>
      <textarea class="memory-note-input" data-id="${item.id}" placeholder="写一句你为什么收藏它、它适合什么时候用">${escapeHtml(item.note || '')}</textarea>
    </label>
    <div class="memory-detail-meta">
      <div><span>加入</span><strong>${formatDate(item.createdAt)}</strong></div>
      <div><span>更新</span><strong>${formatDate(item.updatedAt || item.createdAt)}</strong></div>
      <div><span>分类</span><strong>${escapeHtml(item.category || '其他')}</strong></div>
    </div>
    <div class="memory-detail-content">
      ${escapeHtml(getMemoryPreview(item, 1200) || '暂无可预览正文。')}
    </div>
  `;
}

function renderTagCloud() {
  const node = $('#memoryTagCloud');
  if (!node) return;
  const tags = Object.keys(state.memorySummary.tags || {}).sort();
  if (!tags.length) {
    node.innerHTML = '';
    return;
  }
  node.innerHTML = tags.map((tag) => `
    <button class="tag-button" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)} (${state.memorySummary.tags[tag]})</button>
  `).join('');
}

function renderMemoryFilters() {
  const select = $('#memoryCategoryFilter');
  if (!select) return;
  const current = select.value;
  const wanted = state.memoryFilter.category || current;
  const categories = Object.keys(state.memorySummary.categories || {}).sort();
  select.innerHTML = '<option value="">全部分类</option>' + categories.map((category) => {
    const count = state.memorySummary.categories[category];
    return `<option value="${escapeAttr(category)}">${escapeHtml(category)}（${count}）</option>`;
  }).join('');
  select.value = categories.includes(wanted) ? wanted : '';
  $('#memorySearchInput').value = state.memoryFilter.text || '';
  $('#memoryTypeFilter').value = state.memoryFilter.type || '';
  $('#memorySortFilter').value = state.memoryFilter.sort || 'updated-desc';
  $('#memoryTagFilter').value = state.memoryFilter.tag || '';
}

function renderFolders() {
  const list = $('#folderList');
  const folders = state.settings.searchFolders || [];
  const indexText = state.localIndex
    ? `${state.localIndex.itemCount || 0} 个文件 · ${formatDate(state.localIndex.builtAt)}`
    : '还没有刷新本地索引';
  const summary = `
    <div class="folder-summary">
      <div>
        <span>正在检索</span>
        <strong>${folders.length} 个资料夹</strong>
      </div>
      <div>
        <span>本地索引</span>
        <strong>${escapeHtml(indexText)}</strong>
      </div>
      <button class="small-button" data-action="rebuild-index">刷新本地索引</button>
    </div>
    <p class="folder-note">添加或移除资料夹后，建议刷新一次索引，后面搜文件名会更准更快。</p>
  `;
  if (!folders.length) {
    list.innerHTML = `${summary}<div class="folder-empty">还没有选择资料夹。<button class="small-button empty-action" data-action="add-folder">添加资料夹</button></div>`;
    return;
  }

  list.innerHTML = summary + folders.map((folder, index) => `
    <div class="folder-row">
      <div>
        <strong title="${escapeAttr(folder)}">${escapeHtml(friendlyRootName(folder))}</strong>
        <span title="${escapeAttr(folder)}">${escapeHtml(folder)}</span>
      </div>
      <button class="icon-button remove-folder" data-index="${index}" title="移除">×</button>
    </div>
  `).join('');
}

function renderSettings() {
  $('#maxResults').value = state.settings.maxResults || 80;
  $('#includeContent').checked = Boolean(state.settings.includeContent);
  $('#webEngine').value = state.settings.webEngine || 'bing';
  $('#saveHistory').checked = state.settings.saveHistory !== false;
  $('#allowWebSummary').checked = state.settings.allowWebSummary !== false;
  $('#cacheDocumentText').checked = state.settings.cacheDocumentText !== false;
  renderCloudSync();
  renderWorkspaces();
  renderAppInfo();
  renderFolders();
}

function renderCloudSync() {
  const node = $('#cloudSyncStatus');
  if (!node) return;
  const cloud = state.cloudSync || {};
  const rows = [
    ['同步文件夹', cloud.folder || '还没有选择'],
    ['云端同步文件', cloud.hasFile ? '已找到' : '还没有上传'],
    ['云端更新时间', formatDate(cloud.cloudUpdatedAt) || '暂无'],
    ['上次上传', formatDate(cloud.lastUploadAt) || '暂无'],
    ['上次合并', formatDate(cloud.lastImportAt) || '暂无']
  ];
  node.innerHTML = rows.map(([label, value]) => `
    <div class="cloud-row">
      <span>${escapeHtml(label)}</span>
      <strong title="${escapeAttr(value)}">${escapeHtml(value)}</strong>
    </div>
  `).join('');
}

function renderWorkspaces() {
  const select = $('#workspaceSelect');
  const nameInput = $('#workspaceName');
  const hint = $('#workspaceHint');
  if (!select) return;
  const workspaces = state.settings.workspaces || [];
  select.innerHTML = '<option value="">选择资料区</option>' + workspaces.map((workspace) => (
    `<option value="${escapeAttr(workspace.id)}">${escapeHtml(workspace.name)}（${(workspace.folders || []).length} 个资料夹）</option>`
  )).join('');
  select.value = state.settings.activeWorkspaceId || '';
  const active = workspaces.find((workspace) => workspace.id === select.value);
  if (nameInput && active) nameInput.value = active.name;
  if (hint) {
    hint.textContent = active
      ? `当前资料区：${active.name}。包含 ${(active.folders || []).length} 个资料夹。`
      : `当前资料夹组合可以保存成资料区。`;
  }
}

function renderAppInfo() {
  const node = $('#appInfoList');
  if (!node) return;
  const appInfo = state.appInfo || {};
  const rows = [
    ['版本', appInfo.version || '未知'],
    ['状态', appInfo.isInstalled ? '桌面安装版' : '开发预览版'],
    ['安装位置', appInfo.appPath || '未知'],
    ['数据位置', appInfo.dataDir || '未知'],
    ['一键自检', appInfo.hasSelfCheckTool ? '已准备好' : '重新安装后可用'],
    ['安装说明', appInfo.hasInstallNote ? '已准备好' : '重新安装后可用']
  ];
  node.innerHTML = rows.map(([label, value]) => `
    <div class="info-row">
      <span>${escapeHtml(label)}</span>
      <strong title="${escapeAttr(value)}">${escapeHtml(value)}</strong>
    </div>
  `).join('');
}

function renderIndexStatus() {
  const node = $('#indexStatus');
  if (!node) return;
  if (!state.localIndex) {
    node.textContent = '还没有本地索引。第一次检索会自动建立，也可以手动刷新。';
    return;
  }
  node.textContent = `当前索引：${state.localIndex.itemCount} 个文件 · ${formatDate(state.localIndex.builtAt)}`;
}

function renderHomePulse() {
  const node = $('#homePulse');
  if (!node) return;
  const health = state.dataHealth || {};
  const primaryHealth = getPrimaryHealthRecommendation(health);
  const cards = [
    {
      label: '本地索引',
      value: state.localIndex ? `${state.localIndex.itemCount || 0}` : '待刷新',
      hint: state.localIndex ? '已准备检索' : '首次检索会自动建立',
      tone: 'index',
      action: 'rebuild-index',
      actionText: state.localIndex ? '重新刷新' : '立即刷新'
    },
    {
      label: '记忆库',
      value: `${state.memorySummary.total || 0}`,
      hint: '导入和收藏的资料',
      tone: 'memory',
      action: state.memorySummary.total ? 'go-memory' : 'go-import',
      actionText: state.memorySummary.total ? '查看资料' : '去导入'
    },
    {
      label: '资料健康',
      value: health.score ? `${health.score}` : '待体检',
      hint: health.statusText || primaryHealth?.title || '打开设置可查看体检',
      tone: health.status || 'info',
      action: primaryHealth?.action === 'go-failures' ? 'go-failures' : 'go-health',
      actionText: health.score ? '查看体检' : '去体检'
    },
    {
      label: '当前版本',
      value: state.appInfo.isInstalled ? '桌面版' : '预览版',
      hint: state.appInfo.hasSelfCheckTool ? '一键自检已准备' : '重新安装后有自检工具',
      tone: 'app',
      action: 'go-settings',
      actionText: '查看信息'
    }
  ];
  node.innerHTML = cards.map((card) => `
    <button class="pulse-card ${escapeAttr(card.tone)}" data-action="${escapeAttr(card.action)}" type="button">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.hint)}</small>
      <b>${escapeHtml(card.actionText)}</b>
    </button>
  `).join('');
}

function healthLevelLabel(level) {
  if (level === 'danger') return '需处理';
  if (level === 'warning') return '建议优化';
  if (level === 'good') return '正常';
  return '提示';
}

function topExtensions(extensionCounts = {}) {
  return Object.entries(extensionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([ext, count]) => `${ext || '无后缀'} ${count}`)
    .join(' · ') || '暂无索引';
}

function getPrimaryHealthRecommendation(health) {
  const recommendations = health?.recommendations || [];
  return recommendations.find((item) => item.level === 'danger')
    || recommendations.find((item) => item.level === 'warning')
    || recommendations.find((item) => item.action)
    || recommendations[0]
    || null;
}

function getHealthPlainSummary(health, primary) {
  if (!health) return '还没有体检报告。';
  if (primary?.level === 'danger') return '先处理红色问题，再继续搜索会更稳。';
  if (primary?.level === 'warning') return '现在可以用，但建议先做下面这一步。';
  if ((health.failures?.total || 0) > 0) return '有少量文件读不了，不影响大部分搜索。';
  return '当前资料夹、索引和记忆库都可以正常使用。';
}

function renderDataHealth() {
  const root = $('#dataHealth');
  if (!root) return;
  const health = state.dataHealth;
  if (!health) {
    root.innerHTML = '<div class="health-empty">还没有体检报告，点“刷新体检”看一下。</div>';
    return;
  }

  const stats = [
    ['健康分', `${health.score || 0}`, health.statusText || '未知'],
    ['资料夹', `${health.folders?.existing || 0}/${health.folders?.total || 0}`, health.folders?.missing ? `${health.folders.missing} 个失效` : '都能访问'],
    ['本地索引', health.localIndex ? `${health.localIndex.itemCount || 0}` : '0', health.localIndex ? formatDate(health.localIndex.builtAt) : '还没建立'],
    ['记忆库', `${health.memory?.total || 0}`, `${health.memory?.categoryCount || 0} 类 · ${health.memory?.tagCount || 0} 个标签`],
    ['读取失败', `${health.failures?.total || 0}`, health.failures?.total ? '建议看看失败列表' : '暂无失败'],
    ['备份', `${health.backups?.total || 0}`, health.backups?.latest ? formatDate(health.backups.latest.createdAt) : '还没备份']
  ];

  const folderList = (health.folders?.items || []).slice(0, 6).map((item) => `
    <div class="health-path ${item.exists ? '' : 'is-missing'}">
      <span>${item.exists ? '可用' : '失效'}</span>
      <strong title="${escapeAttr(item.path)}">${escapeHtml(item.path)}</strong>
    </div>
  `).join('');

  const primaryRecommendation = getPrimaryHealthRecommendation(health);
  const plainSummary = getHealthPlainSummary(health, primaryRecommendation);
  const recommendations = (health.recommendations || []).map((item) => `
    <article class="health-tip ${escapeAttr(item.level || 'info')}">
      <div>
        <span>${healthLevelLabel(item.level)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.detail)}</p>
      </div>
      ${item.action ? `<button class="small-button health-action" data-action="${escapeAttr(item.action)}">${escapeHtml(item.actionLabel || '处理')}</button>` : ''}
    </article>
  `).join('');

  root.innerHTML = `
    <div class="health-hero ${escapeAttr(health.status || 'info')}">
      <div class="health-score">${health.score || 0}</div>
      <div>
        <h3>${escapeHtml(health.statusText || '体检完成')}</h3>
        <p>上次体检：${formatDate(health.checkedAt)}。${escapeHtml(health.readableTypes?.note || '')}</p>
      </div>
    </div>
    <div class="health-next-step ${escapeAttr(primaryRecommendation?.level || health.status || 'good')}">
      <div>
        <span>当前结论</span>
        <h3>${escapeHtml(plainSummary)}</h3>
        <p>${escapeHtml(primaryRecommendation?.detail || '可以直接回到检索页继续使用。')}</p>
      </div>
      ${primaryRecommendation?.action ? `<button class="small-button health-action" data-action="${escapeAttr(primaryRecommendation.action)}">${escapeHtml(primaryRecommendation.actionLabel || '处理')}</button>` : '<button class="small-button" data-action="focus-search">去搜索</button>'}
    </div>
    <div class="health-stat-grid">
      ${stats.map(([label, value, hint]) => `
        <div class="health-stat">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <small>${escapeHtml(hint)}</small>
        </div>
      `).join('')}
    </div>
    <div class="health-section">
      <h3>资料夹状态</h3>
      <div class="health-path-list">${folderList || '<div class="health-empty">还没有资料夹。</div>'}</div>
    </div>
    <div class="health-section">
      <h3>索引类型概览</h3>
      <p>${escapeHtml(topExtensions(health.localIndex?.extensionCounts))}</p>
    </div>
    <div class="health-section">
      <h3>建议</h3>
      <div class="health-tip-list">${recommendations}</div>
    </div>
  `;
}

function getFailureInfo(item) {
  const stage = String(item?.stage || '');
  const message = String(item?.message || '').toLowerCase();
  const canRetry = ['import', 'ocr', 'site-import', 'import-summary-check'].includes(stage);

  if (stage === 'ocr') {
    return {
      label: '图片识别',
      tone: 'warning',
      canRetry,
      explain: '图片文字没有识别成功。可以换一张更清晰的图，或点重试再跑一次。'
    };
  }
  if (stage === 'site-import') {
    return {
      label: '网站导入',
      tone: 'warning',
      canRetry,
      explain: '网站暂时读不到，可能是网页限制、地址失效或网络不稳。可以稍后重试。'
    };
  }
  if (stage === 'import' || stage === 'import-summary-check') {
    return {
      label: '导入失败',
      tone: 'danger',
      canRetry,
      explain: '这份资料没有放进记忆库。文件还在原位置，可以先定位确认文件是否还存在。'
    };
  }
  if (message.includes('encrypted') || message.includes('password') || message.includes('加密')) {
    return {
      label: '可能加密',
      tone: 'warning',
      canRetry,
      explain: '文件可能需要密码或被保护，软件暂时读不到正文，但文件名仍可搜索。'
    };
  }
  if (message.includes('permission') || message.includes('access') || message.includes('权限')) {
    return {
      label: '权限不足',
      tone: 'warning',
      canRetry,
      explain: '软件可能没有权限读取这个文件。可以打开所在位置检查权限或移动到常用资料夹。'
    };
  }
  if (stage === 'extract' || stage === 'preview') {
    return {
      label: '正文读取',
      tone: 'info',
      canRetry,
      explain: '这个文件的正文读不出来，但文件名、路径仍可搜索。通常可以先忽略。'
    };
  }
  return {
    label: '读取失败',
    tone: 'info',
    canRetry,
    explain: '软件暂时读不到这项内容。可以先定位文件，确认它是否还能正常打开。'
  };
}

function renderFailures() {
  const list = $('#failureList');
  if (!list) return;
  const title = $('#failureTitle');
  if (title) title.textContent = `读取失败列表（${state.failures.length}）`;
  if (!state.failures.length) {
    list.className = 'failure-list empty';
    list.textContent = '暂时没有读取失败记录。';
    return;
  }
  list.className = 'failure-list';
  list.innerHTML = `
    <div class="failure-summary">
      <div>
        <span>需要留意</span>
        <strong>${state.failures.length} 条</strong>
      </div>
      <p>多数失败来自加密、损坏、权限不足或格式不标准的文件。它们不会影响其他文件搜索。</p>
    </div>
    ${state.failures.slice(0, 80).map((item) => {
    const info = getFailureInfo(item);
    return `
    <article class="failure-item">
      <div>
        <div class="failure-item-head">
          <span class="${escapeAttr(info.tone)}">${escapeHtml(info.label)}</span>
          <h3>${escapeHtml(item.title || item.path)}</h3>
        </div>
        <p>${escapeHtml(info.explain)}</p>
        <small>${escapeHtml(item.message || '读取失败')} · ${formatDate(item.createdAt)}<br>${escapeHtml(item.path)}</small>
      </div>
      <div class="failure-actions">
        ${info.canRetry ? `<button class="small-button retry-failure" data-failure-id="${escapeAttr(item.id)}">重试</button>` : ''}
        <button class="small-button show-failure-file" data-path="${escapeAttr(item.path)}">位置</button>
      </div>
    </article>
  `;
  }).join('')}
  `;
}

function importFeedbackTitle(summary) {
  if (!summary) return '等待导入';
  if (summary.running) return '正在导入';
  if (summary.cancelled) return '已取消';
  if (summary.failed && summary.succeeded) return '部分完成';
  if (summary.failed) return '导入失败';
  if (summary.succeeded) return '导入完成';
  return '没有选择';
}

function normalizeImportSummary(summary, fallback = {}) {
  if (!summary) {
    return {
      cancelled: false,
      running: false,
      type: fallback.type || '资料',
      total: 0,
      succeeded: 0,
      failed: 0,
      imported: [],
      failures: []
    };
  }
  return {
    cancelled: Boolean(summary.cancelled),
    running: Boolean(summary.running),
    type: summary.type || fallback.type || '资料',
    total: Number(summary.total || 0),
    succeeded: Number(summary.succeeded || 0),
    failed: Number(summary.failed || 0),
    imported: Array.isArray(summary.imported) ? summary.imported : [],
    failures: Array.isArray(summary.failures) ? summary.failures : []
  };
}

function renderImportFeedback(summary = state.lastImportSummary) {
  const root = $('#importFeedback');
  const status = $('#importFeedbackStatus');
  if (!root) return;

  const data = normalizeImportSummary(summary);
  state.lastImportSummary = summary;
  if (status) status.textContent = importFeedbackTitle(data);

  if (!summary) {
    root.className = 'import-feedback empty';
    root.textContent = '导入文件、图片或网站后，这里会显示成功数量、失败数量和下一步入口。';
    return;
  }

    if (data.running) {
      root.className = 'import-feedback running';
      root.innerHTML = `
        <div class="import-feedback-hero">
          <strong>正在处理${escapeHtml(data.type)}</strong>
          <span>${escapeHtml(importRunningHint(data.type))}</span>
        </div>
      <div class="import-feedback-steps">
        <span class="active">选择完成</span>
        <span class="active">正在提取文字</span>
        <span>等待保存结果</span>
      </div>
    `;
    return;
  }

  if (data.cancelled) {
    root.className = 'import-feedback empty';
    root.textContent = '已取消导入，没有改动记忆库。';
    return;
  }

  const recent = data.imported.slice(0, 4);
  const failures = data.failures.slice(0, 4);
  root.className = `import-feedback ${data.failed ? 'has-failures' : 'success'}`;
  root.innerHTML = `
    <div class="import-feedback-stats">
      <div>
        <span>本次选择</span>
        <strong>${data.total}</strong>
      </div>
      <div>
        <span>已放入记忆库</span>
        <strong>${data.succeeded}</strong>
      </div>
      <div>
        <span>失败</span>
        <strong>${data.failed}</strong>
      </div>
    </div>
    ${recent.length ? `
      <div class="import-feedback-section">
        <h3>新加入</h3>
        ${recent.map((item) => `
          <p title="${escapeAttr(item.source || '')}">${escapeHtml(item.title || item.source || '未命名资料')}</p>
        `).join('')}
      </div>
    ` : ''}
    ${failures.length ? `
      <div class="import-feedback-section">
        <h3>需要处理</h3>
        ${failures.map((item) => `
          <p title="${escapeAttr(item.path || '')}">${escapeHtml(item.title || item.path || '导入失败')}：${escapeHtml(item.message || '导入失败')}</p>
        `).join('')}
      </div>
    ` : ''}
    <div class="import-feedback-actions">
      ${data.succeeded ? '<button class="small-button" data-action="go-memory">查看记忆库</button>' : ''}
      ${data.failed ? '<button class="small-button danger-button" data-action="go-failures">查看失败列表</button>' : ''}
      <button class="small-button" data-action="focus-import">继续导入</button>
    </div>
  `;
}

function importRunningHint(type) {
  if (String(type || '').includes('图片')) return '正在识别图片里的文字，图片越多越慢一点。完成后会放进记忆库。';
  if (String(type || '').includes('网站')) return '正在读取网页文字。网页限制较多，失败时会给出处理入口。';
  return '正在读取文件内容并保存到记忆库。文件多或 PDF 较大时会慢一点。';
}

function setImportRunning(type) {
  renderImportFeedback({
    running: true,
    type,
    total: 0,
    succeeded: 0,
    failed: 0,
    imported: [],
    failures: []
  });
  revealImportFeedback();
}

function importStatusText(summary, label) {
  const data = normalizeImportSummary(summary, { type: label });
  if (data.cancelled) return `已取消${label}导入。`;
  if (data.failed && data.succeeded) return `${label}导入完成：成功 ${data.succeeded} 个，失败 ${data.failed} 个。`;
  if (data.succeeded) return `${label}导入完成：成功 ${data.succeeded} 个。`;
  if (data.failed) return `${label}导入失败：${data.failed} 个需要处理。`;
  return `没有选择${label}。`;
}

function getMatchReason(item, mode) {
  if (item.bucket === '网页摘要') return '来自网页摘要匹配';
  if (item.bucket === '记忆库') return '来自已导入的记忆库';
  if (mode === 'content') return item.matchReason || '正文里包含关键词';
  if (mode === 'local') return item.matchReason || '文件名或路径包含关键词';
  return item.matchReason || (item.detail && item.detail !== item.path ? '内容或文件名包含关键词' : '文件名或路径包含关键词');
}

function setActiveMode(mode) {
  state.activeMode = mode;
  $$('.mode-button').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  $('#resultsTitle').textContent = `${MODE_LABELS[mode] || '匹配'}结果`;
}

function buildResultItems(payload, mode = state.activeMode) {
  const items = [
    ...(payload.web || []).map((item) => ({ ...item, bucket: '网页摘要' })),
    ...(payload.memory || []).map((item) => ({ ...item, bucket: '记忆库' })),
    ...(payload.local || []).map((item) => ({ ...item, bucket: mode === 'content' ? '正文结果' : '本地文件' }))
  ];
  return dedupeResults(items);
}

function getResultSource(item) {
  return item?.type === 'file' ? item.path : item?.source;
}

function getResultId(item, index = 0) {
  const source = getResultSource(item) || '';
  const key = item?.id || source || item?.title || index;
  return `${item?.bucket || 'result'}|${item?.type || 'item'}|${key}`.slice(0, 420);
}

function pathSegments(value) {
  return String(value || '').replaceAll('/', '\\').split('\\').filter(Boolean);
}

function folderName(value) {
  const parts = pathSegments(value);
  return parts[parts.length - 1] || value || '资料夹';
}

function friendlyRootName(root) {
  const leaf = folderName(root).toLowerCase();
  if (leaf === 'desktop') return '桌面';
  if (leaf === 'documents') return '文档';
  if (leaf === 'downloads') return '下载';
  return folderName(root);
}

function getFileRelativeInfo(item) {
  const source = getResultSource(item) || '';
  const normalizedSource = source.toLowerCase().replaceAll('/', '\\');
  const roots = (state.settings.searchFolders || [])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const root of roots) {
    const normalizedRoot = String(root).toLowerCase().replaceAll('/', '\\').replace(/\\+$/, '');
    const insideRoot = normalizedSource === normalizedRoot || normalizedSource.startsWith(`${normalizedRoot}\\`);
    if (!insideRoot) continue;
    return {
      rootName: friendlyRootName(root),
      parts: pathSegments(source.slice(String(root).length).replace(/^[/\\]+/, '')),
      source
    };
  }

  return {
    rootName: '',
    parts: pathSegments(source),
    source
  };
}

function getFileGroupInfo(item) {
  const info = getFileRelativeInfo(item);
  if (info.rootName) {
    if (info.parts.length <= 1) {
      return {
        key: `file-root|${info.rootName}`,
        label: `${info.rootName}根目录`,
        hint: '直接放在这个资料夹里'
      };
    }
    return {
      key: `file-folder|${info.rootName}|${info.parts[0]}`,
      label: info.parts[0],
      hint: `${info.rootName}里的资料夹`
    };
  }

  return {
    key: `file-other|${folderName(info.source)}`,
    label: '其他本机位置',
    hint: folderName(info.source)
  };
}

function getResultGroupInfo(item) {
  if (item.type === 'file') return getFileGroupInfo(item);
  if (item.bucket === '记忆库') {
    return { key: 'memory', label: '记忆库', hint: '已导入和收藏的资料' };
  }
  if (item.bucket === '网页摘要') {
    return { key: 'web', label: '网页摘要', hint: '联网线索和浏览器入口' };
  }
  return { key: item.bucket || 'other', label: item.bucket || '其他结果', hint: '其他来源' };
}

function isResultSaved(item) {
  const source = getResultSource(item);
  if (!source) return false;
  return state.memory.some((memoryItem) => memoryItem.source === source);
}

function getResultFullText(item) {
  return String(item?.detail || item?.content || getResultSource(item) || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTextAroundTerms(text, terms, length = 900) {
  const value = String(text || '').trim();
  if (!value) return value;

  const lowered = value.toLowerCase();
  const term = terms.find((entry) => lowered.includes(entry));
  if (!term) return value.length <= length ? value : value.slice(0, length).trim();

  const index = lowered.indexOf(term);
  if (value.length <= length && index < 240) return value;

  const side = Math.max(80, Math.floor((length - term.length) / 2));
  const start = Math.max(0, index - side);
  const end = Math.min(value.length, start + length);
  const snippet = value.slice(start, end).trim();
  const prefix = start > 0 ? '...' : '';
  const suffix = end < value.length ? '...' : '';
  return `${prefix}${snippet}${suffix}`;
}

function getResultPreviewText(item, length = 900) {
  return getTextAroundTerms(getResultFullText(item), queryTerms(), length);
}

function getResultLocationLabel(item) {
  if (item.type !== 'file') return item.bucket || '资料';
  const info = getFileRelativeInfo(item);
  if (!info.rootName) return '其他本机位置';
  if (info.parts.length <= 1) return `${info.rootName}根目录`;
  if (info.parts.length === 2) return `${info.rootName}里的 ${info.parts[0]}`;
  return `${info.rootName}里的 ${info.parts[0]} / ${info.parts[1]}`;
}

function getPreviewDecisionLines(item, mode) {
  const title = normalizeSearchText(item.title);
  const source = normalizeSearchText(getResultSource(item));
  const detail = normalizeSearchText(item.detail || item.content);
  const terms = queryTerms();
  const lines = [];

  if (terms.length) {
    const hitPlaces = [];
    if (terms.some((term) => title.includes(term))) hitPlaces.push('标题');
    if (terms.some((term) => detail.includes(term))) hitPlaces.push(item.bucket === '网页摘要' ? '网页摘要' : '正文');
    if (terms.some((term) => source.includes(term))) hitPlaces.push('路径');
    lines.push(hitPlaces.length ? `关键词出现在：${hitPlaces.join('、')}` : '没有明显关键词命中，可能是筛选条件带出的结果');
  } else {
    lines.push(`${describeQuerySyntax(state.lastQuery)}：按类型或来源筛出了这条结果`);
  }

  lines.push(`位置：${getResultLocationLabel(item)}`);
  lines.push(`建议：${item.type === 'file' ? '先看路径和修改时间，确认后再打开文件' : '先打开来源确认原文'}`);
  if (isResultSaved(item)) lines.push('状态：已经收藏到记忆库');
  if (mode === 'content') lines.push('本次是正文检索，优先看下面的命中内容');
  return Array.from(new Set(lines)).slice(0, 4);
}

function renderActionButtons(item, resultId, compact = false) {
  const isFile = item.type === 'file';
  const source = getResultSource(item);
  const saved = isResultSaved(item);
  const saveButton = `<button class="small-button save-result" data-result-id="${escapeAttr(resultId)}" ${saved ? 'disabled' : ''}>${saved ? '已收藏' : '收藏'}</button>`;
  if (isFile) {
    return `
      ${saveButton}
      <button class="small-button open-file" data-path="${escapeAttr(item.path)}">打开</button>
      <button class="small-button show-file" data-path="${escapeAttr(item.path)}">${compact ? '位置' : '所在位置'}</button>
      <button class="small-button copy-source" data-source="${escapeAttr(source)}">${compact ? '复制' : '复制路径'}</button>
    `;
  }
  return `
    ${saveButton}
    <button class="small-button open-source" data-source="${escapeAttr(source)}">打开来源</button>
    <button class="small-button copy-source" data-source="${escapeAttr(source)}">${compact ? '复制' : '复制来源'}</button>
  `;
}

function getResultTime(item) {
  return new Date(item.updatedAt || item.createdAt || 0).getTime() || 0;
}

function getResultScore(item) {
  const score = Number(item.score || 0);
  if (score > 0) return score;
  if (item.type === 'web-fallback') return 0;
  return 1;
}

function getResultRankScore(item) {
  const terms = queryTerms();
  const title = normalizeSearchText(item.title);
  const source = normalizeSearchText(getResultSource(item));
  const detail = normalizeSearchText(item.detail || item.content);
  const base = getResultScore(item);
  let score = base * 100;

  if (item.type === 'web-fallback') score -= 10000;
  if (item.bucket === '本地文件' || item.bucket === '正文结果') score += 140;
  if (item.bucket === '记忆库') score += 90;
  if (item.bucket === '网页摘要') score += 20;
  if (isResultSaved(item)) score += 70;

  for (const term of terms) {
    if (title === term) score += 900;
    if (title.includes(term)) score += 420;
    if (source.includes(term)) score += 120;
    if (detail.includes(term)) score += 70;
  }

  const time = getResultTime(item);
  if (time) score += Math.min(80, Math.max(0, (time / Date.now()) * 80));
  return score;
}

function getResultEvidence(item) {
  const terms = queryTerms();
  const title = normalizeSearchText(item.title);
  const source = normalizeSearchText(getResultSource(item));
  const detail = normalizeSearchText(item.detail || item.content);
  const evidence = [];

  if (item.type === 'web-fallback') return ['可打开网页'];
  if (terms.some((term) => title.includes(term))) evidence.push('标题命中');
  if (terms.some((term) => detail.includes(term))) evidence.push(item.bucket === '网页摘要' ? '网页摘要' : '正文命中');
  if (!evidence.length && terms.some((term) => source.includes(term))) evidence.push('路径命中');
  if (isResultSaved(item)) evidence.push('已收藏');
  if (item.bucket === '本地文件' || item.bucket === '正文结果') evidence.push('本机资料');
  if (item.bucket === '记忆库') evidence.push('记忆库');
  if (item.bucket === '网页摘要') evidence.push('网页线索');

  const time = getResultTime(item);
  if (time && Date.now() - time < 1000 * 60 * 60 * 24 * 30) evidence.push('最近修改');

  return Array.from(new Set(evidence)).slice(0, 3);
}

function getResultHitPlaces(item) {
  const terms = queryTerms();
  if (!terms.length) return [];
  const title = normalizeSearchText(item.title);
  const source = normalizeSearchText(getResultSource(item));
  const detail = normalizeSearchText(item.detail || item.content);
  const places = [];
  if (terms.some((term) => title.includes(term))) places.push('title');
  if (terms.some((term) => detail.includes(term))) places.push('detail');
  if (terms.some((term) => source.includes(term))) places.push('source');
  return places;
}

function hasMeaningfulTermHit(item) {
  return getResultHitPlaces(item).length > 0;
}

function renderResultEvidence(item) {
  const evidence = getResultEvidence(item);
  return `
    <div class="result-evidence" title="这条结果为什么靠前">
      ${evidence.map((label) => `<span>${escapeHtml(label)}</span>`).join('')}
    </div>
  `;
}

function shouldGroupResults(results) {
  return results.length >= RESULT_GROUP_MIN_COUNT;
}

function groupKeyedResults(keyedResults) {
  const groups = new Map();
  for (const entry of keyedResults) {
    const info = getResultGroupInfo(entry.item);
    if (!groups.has(info.key)) {
      groups.set(info.key, { ...info, items: [] });
    }
    groups.get(info.key).items.push(entry);
  }
  return Array.from(groups.values());
}

function getFileSubfolderLabel(item) {
  if (item.type !== 'file') return '';
  const info = getFileRelativeInfo(item);
  if (!info.rootName || info.parts.length <= 1) return '';
  if (info.parts.length === 2) return '本层文件';
  return info.parts[1];
}

function getResultGroupSummary(group) {
  if (group.items.length < RESULT_GROUP_SUMMARY_MIN_COUNT) {
    return { entries: [], hiddenCount: 0 };
  }

  const counts = new Map();
  for (const { item } of group.items) {
    const label = getFileSubfolderLabel(item);
    if (!label) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  const entries = Array.from(counts, ([label, count]) => ({ label, count }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));

  return {
    entries: entries.slice(0, RESULT_GROUP_SUMMARY_LIMIT),
    hiddenCount: Math.max(0, entries.length - RESULT_GROUP_SUMMARY_LIMIT)
  };
}

function renderResultGroupSummary(group) {
  const summary = getResultGroupSummary(group);
  if (!summary.entries.length) return '';

  return `
    <div class="result-group-summary">
      <span>里面主要有</span>
      ${summary.entries.map((entry) => `
        <span class="result-group-chip" title="${escapeAttr(entry.label)}">
          ${escapeHtml(entry.label)} <strong>${entry.count}</strong>
        </span>
      `).join('')}
      ${summary.hiddenCount ? `<span class="result-group-more">还有 ${summary.hiddenCount} 个位置</span>` : ''}
    </div>
  `;
}

function renderResultCard(item, resultId, mode) {
  const isFile = item.type === 'file';
  const source = getResultSource(item);
  const meta = isFile
    ? `${formatSize(item.size)} · ${formatDate(item.updatedAt)}`
    : `${item.bucket} · ${formatDate(item.updatedAt || item.createdAt)}`;
  const reason = getMatchReason(item, mode);

  return `
    <article class="result-card ${state.selectedResultId === resultId ? 'active' : ''} ${item.type === 'web-fallback' ? 'result-card-muted' : ''}" data-result-id="${escapeAttr(resultId)}" tabindex="0">
      <div class="result-card-head">
        <div>
          <div class="result-type">${item.bucket}</div>
          <h3>${highlight(item.title)}</h3>
        </div>
        ${renderResultEvidence(item)}
      </div>
      <div class="match-reason">${escapeHtml(reason)}</div>
      <p>${highlight(item.detail || item.content?.slice(0, 260) || source)}</p>
      <div class="result-meta">${escapeHtml(source)}<br>${meta}</div>
      <div class="actions">${renderActionButtons(item, resultId)}</div>
    </article>
  `;
}

function renderGroupedResults(keyedResults, mode) {
  return groupKeyedResults(keyedResults).map((group) => {
    const expanded = state.resultGroupExpanded.has(group.key);
    const hiddenCount = Math.max(0, group.items.length - RESULT_GROUP_PREVIEW_LIMIT);
    const visibleItems = expanded ? group.items : group.items.slice(0, RESULT_GROUP_PREVIEW_LIMIT);
    return `
      <section class="result-group">
        <div class="result-group-head">
          <div>
            <span class="result-group-eyebrow">${escapeHtml(group.hint)}</span>
            <h3>${escapeHtml(group.label)}</h3>
            ${renderResultGroupSummary(group)}
          </div>
          <div class="result-group-actions">
            <strong>${group.items.length} 条</strong>
            ${hiddenCount ? `<button class="small-button result-group-toggle" data-action="toggle-result-group" data-group-key="${escapeAttr(group.key)}">${expanded ? '收起' : `展开 ${hiddenCount} 条`}</button>` : ''}
          </div>
        </div>
        <div class="result-group-list">
          ${visibleItems.map(({ item, resultId }) => renderResultCard(item, resultId, mode)).join('')}
        </div>
      </section>
    `;
  }).join('');
}

function getNoResultTips() {
  const query = String(state.lastQuery || '').trim();
  const tips = [];
  if (query.includes('type:') || query.includes('ext:')) {
    tips.push('试试去掉类型筛选，只留关键词。');
  }
  if (!query.includes('tag:') && !query.includes('cat:') && !query.includes('标签:') && !query.includes('分类:')) {
    tips.push('如果记得标签或分类，可以直接加上。');
  }
  tips.push('也可以换成文件名里更具体的词。');
  return tips.slice(0, 3);
}

function getPlainQueryTerms(query = state.lastQuery) {
  return String(query || '')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term && !/^(type|ext|tag|cat|category|标签|分类):/i.test(term));
}

function stripQueryFilters(query = state.lastQuery) {
  return getPlainQueryTerms(query).join(' ').trim();
}

function getSimplifiedQuery(query = state.lastQuery) {
  const plain = stripQueryFilters(query);
  if (plain) return plain;
  return String(query || '')
    .replace(/^(type|ext|tag|cat|category|标签|分类):/i, '')
    .trim();
}

function getNoResultActions() {
  const query = String(state.lastQuery || '').trim();
  const actions = [];
  const plain = stripQueryFilters(query);
  const simplified = getSimplifiedQuery(query);

  if (plain && plain !== query) {
    actions.push({ label: `只搜“${plain}”`, query: plain, mode: 'all' });
  }
  if (simplified && simplified !== query && simplified !== plain) {
    actions.push({ label: `换成“${simplified}”`, query: simplified, mode: 'all' });
  }
  if (!query.includes('type:pdf')) {
    actions.push({ label: '只看 PDF', query: plain ? `${plain} type:pdf` : 'type:pdf', mode: 'all' });
  }
  if (!query.includes('ext:docx')) {
    actions.push({ label: '只看 Word', query: plain ? `${plain} ext:docx` : 'ext:docx', mode: 'all' });
  }
  actions.push({ label: '去浏览器搜', query, mode: 'web' });

  const seen = new Set();
  return actions
    .filter((action) => action.query || action.mode === 'web')
    .filter((action) => {
      const key = `${action.label}|${action.query}|${action.mode}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function renderNoResultActions() {
  const actions = getNoResultActions();
  if (!actions.length) return '';

  return `
    <div class="empty-suggestions">
      ${actions.map((action) => `
        <button class="small-button empty-suggestion" data-action="retry-search" data-query="${escapeAttr(action.query)}" data-mode="${escapeAttr(action.mode)}">
          ${escapeHtml(action.label)}
        </button>
      `).join('')}
    </div>
  `;
}

function getWeakResultMessage(visibleResults) {
  const terms = queryTerms();
  if (!terms.length || !visibleResults.length) return '';
  if (!/(^|\s)(type|ext|tag|cat|category|标签|分类):/i.test(state.lastQuery)) return '';

  const hitCount = visibleResults.filter(hasMeaningfulTermHit).length;
  if (hitCount > Math.max(1, Math.floor(visibleResults.length * 0.25))) return '';

  const plain = stripQueryFilters(state.lastQuery);
  return plain
    ? `这些结果可能主要来自筛选条件，只有 ${hitCount}/${visibleResults.length} 条明显命中“${plain}”。`
    : '这些结果可能主要来自筛选条件，关键词命中不明显。';
}

function renderWeakResultNotice(visibleResults) {
  const message = getWeakResultMessage(visibleResults);
  if (!message) return '';

  return `
    <div class="weak-result-notice">
      <span>${escapeHtml(message)}</span>
      ${renderNoResultActions()}
    </div>
  `;
}

function dedupeResults(items) {
  const bySource = new Map();
  for (const item of items) {
    const source = normalizeSearchText(getResultSource(item) || item.title);
    const key = source || `${item.bucket}-${item.title}`;
    const previous = bySource.get(key);
    if (!previous || getResultRankScore(item) > getResultRankScore(previous)) {
      bySource.set(key, item);
    }
  }
  return Array.from(bySource.values());
}

function describeQuerySyntax(query) {
  const filters = [];
  const text = String(query || '');
  if (/\btype:/i.test(text)) filters.push('类型筛选');
  if (/\bext:/i.test(text)) filters.push('后缀筛选');
  if (/(^|\s)(tag|标签):/i.test(text)) filters.push('标签筛选');
  if (/(^|\s)(cat|category|分类):/i.test(text)) filters.push('分类筛选');
  return filters.length ? filters.join(' · ') : '普通关键词';
}

function getVisibleResults() {
  const bucket = state.resultFilter.bucket;
  const sort = state.resultFilter.sort || 'score-desc';
  const items = state.currentResults.filter((item) => !bucket || item.bucket === bucket);

  return items.sort((a, b) => {
    if (sort === 'time-desc') return getResultTime(b) - getResultTime(a);
    if (sort === 'title-asc') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
    return getResultRankScore(b) - getResultRankScore(a);
  });
}

function renderResultTools(visibleResults) {
  const tools = $('#resultTools');
  const bucketFilter = $('#resultBucketFilter');
  const sortFilter = $('#resultSortFilter');
  const insights = $('#resultInsights');
  if (!tools || !bucketFilter || !sortFilter || !insights) return;

  const hasResults = state.currentResults.length > 0;
  tools.hidden = !hasResults;
  insights.hidden = !hasResults;
  if (!hasResults) return;

  const counts = {};
  for (const item of state.currentResults) {
    counts[item.bucket] = (counts[item.bucket] || 0) + 1;
  }
  const buckets = Object.keys(counts);
  const wantedBucket = buckets.includes(state.resultFilter.bucket) ? state.resultFilter.bucket : '';
  state.resultFilter.bucket = wantedBucket;
  bucketFilter.innerHTML = `<option value="">全部来源（${state.currentResults.length}）</option>` + buckets.map((bucket) => (
    `<option value="${escapeAttr(bucket)}">${escapeHtml(bucket)}（${counts[bucket]}）</option>`
  )).join('');
  bucketFilter.value = wantedBucket;
  sortFilter.value = state.resultFilter.sort || 'score-desc';

  const best = state.currentResults
    .slice()
    .sort((a, b) => getResultRankScore(b) - getResultRankScore(a))[0];
  const sourceText = buckets.map((bucket) => `${bucket} ${counts[bucket]}`).join(' · ');
  insights.innerHTML = `
    <div class="result-insight">
      <span>当前显示</span>
      <strong>${visibleResults.length}/${state.currentResults.length}</strong>
      <small>${escapeHtml(sourceText)}</small>
    </div>
    <div class="result-insight">
      <span>最佳线索</span>
      <strong>${escapeHtml(best?.bucket || '无')}</strong>
      <small>${escapeHtml(best?.title || '还没有结果')}</small>
    </div>
    <div class="result-insight">
      <span>排序方式</span>
      <strong>${sortFilter.options[sortFilter.selectedIndex]?.textContent || '匹配优先'}</strong>
      <small>可以按来源和时间重新整理</small>
    </div>
    <div class="result-insight">
      <span>搜索理解</span>
      <strong>${escapeHtml(describeQuerySyntax(state.lastQuery))}</strong>
      <small>支持 type:pdf、ext:docx、tag:课程、cat:证件</small>
    </div>
  `;
}

function renderResultPreview(item) {
  const preview = $('#resultPreview');
  const hint = $('#resultPreviewHint');
  if (!preview) return;

  if (!item) {
    preview.className = 'result-preview empty';
    preview.textContent = state.currentResults.length
      ? '当前筛选下没有可预览的结果。'
      : '点一下左边的结果，这里会显示详情和收藏入口。';
    if (hint) hint.textContent = '未选择';
    return;
  }

  const resultId = state.selectedResultId || getResultId(item);
  const isFile = item.type === 'file';
  const source = getResultSource(item) || '';
  const previewText = getResultPreviewText(item);
  const decisionLines = getPreviewDecisionLines(item, state.activeMode);
  const metaRows = isFile
    ? [
      ['类型', item.bucket || '本地文件'],
      ['大小', formatSize(item.size)],
      ['修改时间', formatDate(item.updatedAt) || '未知'],
      ['来源', source]
    ]
    : [
      ['类型', item.bucket || '资料'],
      ['时间', formatDate(item.updatedAt || item.createdAt) || '未知'],
      ['来源', source]
    ];

  preview.className = 'result-preview';
  if (hint) hint.textContent = item.bucket || '已选择';
  preview.innerHTML = `
    <div class="result-preview-top">
      <div>
        <div class="result-type">${escapeHtml(item.bucket || '结果')}</div>
        <h3>${highlight(item.title || source)}</h3>
      </div>
      ${renderResultEvidence(item)}
    </div>
    <div class="match-reason">${escapeHtml(getMatchReason(item, state.activeMode))}</div>
    <div class="result-preview-clues">
      ${decisionLines.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}
    </div>
    <div class="result-preview-actions">
      ${renderActionButtons(item, resultId, true)}
    </div>
    <div class="result-preview-meta">
      ${metaRows.map(([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong title="${escapeAttr(value)}">${escapeHtml(value || '未知')}</strong>
        </div>
      `).join('')}
    </div>
    <section class="result-preview-section">
      <h3>命中内容</h3>
      <p>${previewText ? highlight(previewText) : '暂无可预览内容。'}</p>
    </section>
  `;
}

function selectResult(resultId) {
  const item = state.renderedResults.get(resultId);
  if (!item) return;
  state.selectedResultId = resultId;
  $$('.result-card[data-result-id]').forEach((card) => {
    card.classList.toggle('active', card.dataset.resultId === resultId);
  });
  renderResultPreview(item);
}

function renderCurrentResults(mode = state.activeMode) {
  const list = $('#resultsList');
  const all = state.currentResults;
  const visibleResults = getVisibleResults();
  updateQuickStartVisibility();
  $('#resultCount').textContent = visibleResults.length === all.length
    ? `${all.length} 条`
    : `${visibleResults.length}/${all.length} 条`;
  renderResultTools(visibleResults);

  if (!all.length) {
    state.renderedResults = new Map();
    state.selectedResultId = '';
    renderResultPreview(null);
    list.className = 'list empty';
    list.innerHTML = `
      <div>
        <p>没有找到匹配结果。</p>
        <div class="empty-hint">
          ${getNoResultTips().map((tip) => `<span>${escapeHtml(tip)}</span>`).join('')}
        </div>
        ${renderNoResultActions()}
        <div class="empty-actions">
          <button class="small-button empty-action" data-action="focus-search">换个关键词</button>
          <button class="small-button empty-action" data-action="go-settings">检查资料夹</button>
          <button class="small-button empty-action" data-action="go-import">导入资料</button>
        </div>
      </div>
    `;
    return;
  }

  if (!visibleResults.length) {
    state.renderedResults = new Map();
    state.selectedResultId = '';
    renderResultPreview(null);
    list.className = 'list empty';
    list.innerHTML = `
      <div>
        <p>当前筛选下没有结果。</p>
        <div class="empty-hint">
          <span>可以先清空来源筛选。</span>
          <span>或者换个排序方式再看一次。</span>
        </div>
        <button class="small-button empty-action" data-action="clear-result-filter">清空结果筛选</button>
      </div>
    `;
    return;
  }

  const keyedResults = visibleResults.map((item, index) => ({ item, resultId: getResultId(item, index) }));
  state.renderedResults = new Map(keyedResults.map(({ item, resultId }) => [resultId, item]));
  if (!state.renderedResults.has(state.selectedResultId)) {
    state.selectedResultId = keyedResults[0]?.resultId || '';
  }

  const grouped = shouldGroupResults(visibleResults);
  list.className = grouped ? 'list result-list grouped-result-list' : 'list result-list';
  const weakNotice = renderWeakResultNotice(visibleResults);
  const resultHtml = grouped
    ? renderGroupedResults(keyedResults, mode)
    : keyedResults.map(({ item, resultId }) => renderResultCard(item, resultId, mode)).join('');
  list.innerHTML = `${weakNotice}${resultHtml}`;
  renderResultPreview(state.renderedResults.get(state.selectedResultId));
}

function renderResults(payload, mode = state.activeMode) {
  state.currentResults = buildResultItems(payload, mode);
  state.resultFilter = { bucket: '', sort: 'score-desc' };
  state.resultGroupExpanded = new Set();
  state.selectedResultId = '';
  renderCurrentResults(mode);
  if (state.currentResults.length) {
    revealSearchResults();
  }
}

async function refreshState() {
  const fresh = await window.dustySearch.getState();
  state.appInfo = fresh.appInfo || {};
  state.settings = fresh.settings || {};
  state.history = fresh.history || [];
  state.memory = fresh.memory || [];
  state.memorySummary = fresh.memorySummary || { total: 0, categories: {}, tags: {}, typeCounts: {}, recentCount: 0 };
  state.localIndex = fresh.localIndex || null;
  state.cloudSync = fresh.cloudSync || null;
  state.dataHealth = fresh.dataHealth || null;
  state.onboarding = fresh.onboarding || { completed: false, shouldShow: false };
  state.failures = fresh.failures || [];
  $('#dataPath').textContent = fresh.dataDir;
  renderHistory();
  renderMemory();
  renderSettings();
  renderIndexStatus();
  renderHomePulse();
  renderDataHealth();
  renderFailures();
  if (state.onboarding.shouldShow) showOnboarding();
}

async function runSearch(mode) {
  const query = ($('#queryInput').value || '').trim();
  if (!query) {
    setStatus('先输入一个关键词。');
    return;
  }

  state.lastQuery = query;
  setActiveMode(mode);
  setStatus(`正在检索：${MODE_LABELS[mode]}...`);
  const searchId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.activeSearchId = searchId;
  startProgress(mode);
  setBusy(true);

  try {
    let result;
    const request = { query, searchId };
    if (mode === 'local') result = await window.dustySearch.searchLocalName(request);
    if (mode === 'content') result = await window.dustySearch.searchContent(request);
    if (mode === 'memory') result = await window.dustySearch.searchMemoryOnly(request);
    if (mode === 'web') result = await window.dustySearch.searchWebResults(request);
    if (mode === 'all') result = await window.dustySearch.searchAll(request);

    if (state.activeSearchId !== searchId) return;
    if (result?.cancelled) {
      setStatus('已停止本次检索。');
      return;
    }
    await refreshState();
    renderResults(result, mode);
    const count = (result.local || []).length + (result.memory || []).length + (result.web || []).length;
    setStatus(`${MODE_LABELS[mode]}完成：${count} 条。`);
  } catch (error) {
    if (state.activeSearchId !== searchId) return;
    setStatus(`检索失败：${error.message || error}`);
  } finally {
    if (state.activeSearchId === searchId) {
      stopProgress(true);
      setBusy(false);
      state.activeSearchId = 0;
    }
  }
}

async function openBrowserSearch() {
  const query = ($('#queryInput').value || '').trim();
  if (!query) {
    setStatus('先输入一个关键词。');
    focusSearchBox();
    return;
  }
  setActiveMode('open-web');
  const url = await window.dustySearch.searchWeb(query);
  await refreshState();
  setStatus(`已打开浏览器搜索：${url}`);
}

function appendQueryChip(chip) {
  const input = $('#queryInput');
  if (!input) return;
  const current = input.value.trim();
  const next = current ? `${current} ${chip}` : chip;
  input.value = next;
  input.focus();
  if (chip.endsWith(':')) {
    input.setSelectionRange(next.length, next.length);
  }
  setStatus('已加入搜索筛选条件。');
}

function setBusy(isBusy) {
  $('#searchAllButton').disabled = isBusy;
  $('#stopSearch').disabled = !isBusy;
  $$('.mode-button').forEach((button) => {
    button.disabled = isBusy;
  });
}

document.addEventListener('click', async (event) => {
  const nav = event.target.closest('.nav-item');
  if (nav) switchTab(nav.dataset.tab);

  const modeButton = event.target.closest('.mode-button');
  if (modeButton) {
    const mode = modeButton.dataset.mode;
    if (mode === 'open-web') {
      await openBrowserSearch();
      return;
    }
    runSearch(mode);
  }

  const queryChip = event.target.closest('.query-chip');
  if (queryChip) {
    appendQueryChip(queryChip.dataset.queryChip || '');
    return;
  }

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) {
    if (action === 'focus-search') {
      focusSearchBox();
      setStatus('输入关键词后，选择一个检索按钮。');
    }
    if (action === 'go-settings') switchTab('settings');
    if (action === 'go-health') {
      switchTab('settings');
      const healthSection = $('.data-health-panel');
      if (healthSection) healthSection.open = true;
      setStatus('已切到资料体检。');
      revealSettingsPanel(healthSection || $('#dataHealth'));
    }
    if (action === 'go-import') switchTab('import');
    if (action === 'go-memory') {
      switchTab('memory');
      setStatus('已切到记忆库。');
    }
    if (action === 'go-failures') {
      switchTab('settings');
      const failureSection = $('#failureSection');
      if (failureSection) failureSection.open = true;
      setStatus('已切到读取失败列表。');
      window.setTimeout(() => (failureSection || $('#failureList'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
    if (action === 'focus-import') {
      switchTab('import');
      $('#siteUrl')?.focus();
      setStatus('可以继续导入文件、图片或网站。');
    }
    if (action === 'rebuild-index') $('#rebuildIndex')?.click();
    if (action === 'create-backup') $('#createBackup')?.click();
    if (action === 'clear-failures') $('#clearFailures')?.click();
    if (action === 'clear-memory-filter') {
      state.memoryFilter = { category: '', tag: '', text: '', type: '', sort: 'updated-desc', selectedId: '' };
      renderMemory();
    }
    if (action === 'clear-result-filter') {
      state.resultFilter = { bucket: '', sort: 'score-desc' };
      renderCurrentResults();
    }
    if (action === 'retry-search') {
      const button = event.target.closest('[data-query]');
      const query = button?.dataset.query || state.lastQuery || '';
      const mode = button?.dataset.mode || 'all';
      if (query) $('#queryInput').value = query;
      if (mode === 'web') {
        await openBrowserSearch();
      } else {
        runSearch(mode);
      }
    }
    if (action === 'toggle-result-group') {
      const groupKey = event.target.closest('[data-group-key]')?.dataset.groupKey || '';
      if (groupKey) {
        if (state.resultGroupExpanded.has(groupKey)) {
          state.resultGroupExpanded.delete(groupKey);
        } else {
          state.resultGroupExpanded.add(groupKey);
        }
        renderCurrentResults();
      }
    }
    if (action === 'add-folder') $('#addFolder')?.click();
    if (isOnboardingOpen()) {
      hideOnboarding();
    }
    return;
  }

  if (event.target.closest('#stopSearch')) {
    const searchId = state.activeSearchId;
    state.activeSearchId = 0;
    if (searchId) await window.dustySearch.cancelSearch(searchId);
    stopProgress(false);
    setBusy(false);
    setStatus('已停止本次检索。');
    return;
  }

  const historyItem = event.target.closest('.history-item');
  if (historyItem) {
    $('#queryInput').value = historyItem.dataset.query;
    runSearch(state.activeMode || 'all');
  }

  const resultCard = event.target.closest('.result-card[data-result-id]');
  if (resultCard && !event.target.closest('button')) {
    selectResult(resultCard.dataset.resultId);
  }

  const memoryItem = event.target.closest('.memory-item[data-memory-id]');
  if (memoryItem) {
    state.memoryFilter.selectedId = memoryItem.dataset.memoryId;
    renderMemory();
  }

  const openFile = event.target.closest('.open-file');
  if (openFile) window.dustySearch.openItem(openFile.dataset.path);

  const showFile = event.target.closest('.show-file');
  if (showFile) window.dustySearch.showItem(showFile.dataset.path);

  const openSource = event.target.closest('.open-source');
  if (openSource) window.dustySearch.openItem(openSource.dataset.source);

  const copySource = event.target.closest('.copy-source');
  if (copySource) {
    await window.dustySearch.copyText(copySource.dataset.source);
    setStatus('已复制。');
  }

  const saveResult = event.target.closest('.save-result');
  if (saveResult) {
    const item = state.renderedResults.get(saveResult.dataset.resultId);
    if (!item) return setStatus('没有找到这条结果，重新检索后再试。');
    saveResult.disabled = true;
    try {
      const saved = await window.dustySearch.saveResultToMemory(item);
      await refreshState();
      renderCurrentResults();
      setStatus(`已收藏到记忆库：${saved.title}`);
    } catch (error) {
      setStatus(`收藏失败：${error.message || error}`);
      saveResult.disabled = false;
    }
    return;
  }

  const removeFolder = event.target.closest('.remove-folder');
  if (removeFolder) {
    const index = Number(removeFolder.dataset.index);
    state.settings.searchFolders.splice(index, 1);
    renderFolders();
    setStatus('资料夹已移除。记得保存设置并刷新本地索引。');
  }

  const deleteMemory = event.target.closest('.delete-memory');
  if (deleteMemory) {
    state.memory = await window.dustySearch.deleteMemory(deleteMemory.dataset.id);
    await refreshState();
  }

  const saveMemoryMeta = event.target.closest('.save-memory-meta');
  if (saveMemoryMeta) {
    const id = saveMemoryMeta.dataset.id;
    const category = (document.querySelector(`.memory-category-input[data-id="${CSS.escape(id)}"]`)?.value || '其他').trim() || '其他';
    const tags = (document.querySelector(`.memory-tags-input[data-id="${CSS.escape(id)}"]`)?.value || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .join(', ');
    const note = document.querySelector(`.memory-note-input[data-id="${CSS.escape(id)}"]`)?.value || '';
    state.memory = await window.dustySearch.updateMemoryMeta({ id, category, tags, note });
    await refreshState();
    setStatus('记忆库分类、标签和备注已保存。');
  }

  const tagButton = event.target.closest('.tag-button');
  if (tagButton) {
    state.memoryFilter.tag = tagButton.dataset.tag;
    $('#memoryTagFilter').value = state.memoryFilter.tag;
    renderMemory();
  }

  const showFailure = event.target.closest('.show-failure-file');
  if (showFailure) {
    window.dustySearch.showItem(showFailure.dataset.path);
  }

  const retryFailure = event.target.closest('.retry-failure');
  if (retryFailure) {
    const failureId = retryFailure.dataset.failureId;
    retryFailure.disabled = true;
    setStatus('正在重试这条失败记录...');
    try {
      const summary = await window.dustySearch.retryFailure(failureId);
      await refreshState();
      renderImportFeedback(summary);
      revealImportFeedback();
      setStatus(importStatusText(summary, summary?.type || '资料'));
    } catch (error) {
      await refreshState();
      setStatus(`重试失败：${error.message || error}`);
    }
  }
});

$('#memoryCategoryFilter')?.addEventListener('change', (event) => {
  state.memoryFilter.category = event.target.value;
  state.memoryFilter.selectedId = '';
  renderMemory();
});
$('#memoryTagFilter')?.addEventListener('input', (event) => {
  state.memoryFilter.tag = event.target.value.trim();
  state.memoryFilter.selectedId = '';
  renderMemory();
});
$('#memorySearchInput')?.addEventListener('input', (event) => {
  state.memoryFilter.text = event.target.value.trim();
  state.memoryFilter.selectedId = '';
  renderMemory();
});
$('#memoryTypeFilter')?.addEventListener('change', (event) => {
  state.memoryFilter.type = event.target.value;
  state.memoryFilter.selectedId = '';
  renderMemory();
});
$('#memorySortFilter')?.addEventListener('change', (event) => {
  state.memoryFilter.sort = event.target.value;
  state.memoryFilter.selectedId = '';
  renderMemory();
});
$('#resultBucketFilter')?.addEventListener('change', (event) => {
  state.resultFilter.bucket = event.target.value;
  renderCurrentResults();
});
$('#resultSortFilter')?.addEventListener('change', (event) => {
  state.resultFilter.sort = event.target.value;
  renderCurrentResults();
});

$('#searchAllButton').addEventListener('click', () => runSearch('all'));
$('#queryInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runSearch(state.activeMode || 'all');
});

$('#clearHistory').addEventListener('click', async () => {
  state.history = await window.dustySearch.clearHistory();
  renderHistory();
  setStatus('检索历史已清空。');
});

$('#clearPrivacyHistory')?.addEventListener('click', async () => {
  state.history = await window.dustySearch.clearHistory();
  renderHistory();
  setStatus('检索历史已清空。');
});

$('#clearPrivacyFailures')?.addEventListener('click', async () => {
  state.failures = await window.dustySearch.clearFailures();
  await refreshState();
  setStatus('读取失败记录已清空。');
});

$('#clearFailures')?.addEventListener('click', async () => {
  if (state.failures.length && !window.confirm('确定清空读取失败列表吗？')) return;
  state.failures = await window.dustySearch.clearFailures();
  await refreshState();
  setStatus('读取失败列表已清空。');
});

$('#rebuildIndex').addEventListener('click', async () => {
  setStatus('正在刷新本地索引，文件多时会慢一点...');
  setBusy(true);
  try {
    const result = await window.dustySearch.rebuildIndex();
    state.localIndex = result;
    renderIndexStatus();
    await refreshState();
    setStatus(`本地索引已刷新：${result.itemCount} 个文件。`);
  } catch (error) {
    setStatus(`刷新索引失败：${error.message || error}`);
  } finally {
    setBusy(false);
  }
});

$('#importFiles').addEventListener('click', async () => {
  setStatus('正在导入文件...');
  setImportRunning('文件');
  try {
    const summary = normalizeImportSummary(await window.dustySearch.pickImportFiles(), { type: '文件' });
    await refreshState();
    renderImportFeedback(summary);
    revealImportFeedback();
    setStatus(importStatusText(summary, '文件'));
  } catch (error) {
    renderImportFeedback({
      type: '文件',
      total: 1,
      succeeded: 0,
      failed: 1,
      imported: [],
      failures: [{ title: '文件导入失败', path: '', message: error.message || String(error) }]
    });
    revealImportFeedback();
    setStatus(`导入失败：${error.message || error}`);
  }
});

$('#importOcrImages')?.addEventListener('click', async () => {
  setStatus('正在识别图片文字，第一次会慢一点...');
  setImportRunning('图片 OCR');
  try {
    const summary = normalizeImportSummary(await window.dustySearch.pickOcrImages(), { type: '图片 OCR' });
    await refreshState();
    renderImportFeedback(summary);
    revealImportFeedback();
    setStatus(importStatusText(summary, '图片 OCR'));
  } catch (error) {
    renderImportFeedback({
      type: '图片 OCR',
      total: 1,
      succeeded: 0,
      failed: 1,
      imported: [],
      failures: [{ title: '图片 OCR 失败', path: '', message: error.message || String(error) }]
    });
    revealImportFeedback();
    setStatus(`OCR 识别失败：${error.message || error}`);
  }
});

$('#importSite').addEventListener('click', async () => {
  const url = ($('#siteUrl').value || '').trim();
  if (!url) return setStatus('先粘贴一个网址。');
  setStatus('正在读取网站...');
  setImportRunning('网站');
  try {
    const item = await window.dustySearch.importSite(url);
    $('#siteUrl').value = '';
    await refreshState();
    const summary = {
      type: '网站',
      total: 1,
      succeeded: 1,
      failed: 0,
      imported: [item],
      failures: []
    };
    renderImportFeedback(summary);
    revealImportFeedback();
    setStatus(importStatusText(summary, '网站'));
  } catch (error) {
    await refreshState();
    renderImportFeedback({
      type: '网站',
      total: 1,
      succeeded: 0,
      failed: 1,
      imported: [],
      failures: [{ title: url, path: url, message: error.message || String(error) }]
    });
    revealImportFeedback();
    setStatus(`网站导入失败：${error.message || error}`);
  }
});

$('#addFolder').addEventListener('click', async () => {
  const folder = await window.dustySearch.pickFolder();
  if (!folder) return;
  state.settings.searchFolders = Array.from(new Set([...(state.settings.searchFolders || []), folder]));
  renderFolders();
  setStatus('资料夹已添加。记得保存设置并刷新本地索引。');
});

$('#workspaceSelect')?.addEventListener('change', (event) => {
  const workspace = (state.settings.workspaces || []).find((item) => item.id === event.target.value);
  $('#workspaceName').value = workspace?.name || '';
  const hint = $('#workspaceHint');
  if (hint) {
    hint.textContent = workspace
      ? `这个资料区包含 ${(workspace.folders || []).length} 个资料夹。`
      : '当前资料夹组合可以保存成资料区。';
  }
});

$('#saveWorkspace')?.addEventListener('click', async () => {
  const name = ($('#workspaceName').value || '').trim();
  if (!name) return setStatus('先给资料区起个名字。');
  if (!(state.settings.searchFolders || []).length) return setStatus('当前还没有资料夹，先添加资料夹再保存资料区。');
  const selectedId = $('#workspaceSelect').value;
  state.settings = await window.dustySearch.saveWorkspace({
    id: selectedId || '',
    name,
    folders: state.settings.searchFolders || []
  });
  await refreshState();
  setStatus(`资料区已保存：${name}`);
});

$('#applyWorkspace')?.addEventListener('click', async () => {
  const workspaceId = $('#workspaceSelect').value;
  if (!workspaceId) return setStatus('先选择一个资料区。');
  state.settings = await window.dustySearch.applyWorkspace(workspaceId);
  state.localIndex = null;
  await refreshState();
  setStatus('已切换资料区，建议刷新本地索引。');
});

$('#deleteWorkspace')?.addEventListener('click', async () => {
  const workspaceId = $('#workspaceSelect').value;
  if (!workspaceId) return setStatus('先选择一个资料区。');
  state.settings = await window.dustySearch.deleteWorkspace(workspaceId);
  await refreshState();
  setStatus('资料区已删除。');
});

$('#saveSettings').addEventListener('click', async () => {
  state.settings.maxResults = Number($('#maxResults').value || 80);
  state.settings.includeContent = $('#includeContent').checked;
  state.settings.webEngine = $('#webEngine').value;
  state.settings.saveHistory = $('#saveHistory').checked;
  state.settings.allowWebSummary = $('#allowWebSummary').checked;
  state.settings.cacheDocumentText = $('#cacheDocumentText').checked;
  state.settings = await window.dustySearch.saveSettings(state.settings);
  await refreshState();
  const hint = $('#settingsSaveHint');
  if (hint) hint.textContent = `已保存：${formatDate(new Date().toISOString())}`;
  setStatus('设置已保存。');
});

$('#refreshDataHealth')?.addEventListener('click', async () => {
  setStatus('正在刷新资料体检...');
  await refreshState();
  setStatus('资料体检已刷新。');
});

$('#clearDocumentCache')?.addEventListener('click', async () => {
  const ok = window.confirm('确定清理正文缓存吗？下次正文检索会重新读取文件，可能会慢一点。');
  if (!ok) return;
  setStatus('正在清理正文缓存...');
  try {
    await window.dustySearch.clearDocumentCache();
    state.localIndex = null;
    await refreshState();
    setStatus('正文缓存已清理。');
  } catch (error) {
    setStatus(`清理失败：${error.message || error}`);
  }
});

$('#finishOnboarding')?.addEventListener('click', async () => {
  await completeOnboarding();
  setStatus('上手引导已完成。');
});

$('#startFromOnboarding')?.addEventListener('click', async () => {
  focusSearchBox();
  await completeOnboarding();
  setStatus('输入关键词后，选择一个检索按钮。');
});

$('#showOnboarding')?.addEventListener('click', () => {
  showOnboarding();
  setStatus('已打开上手引导。');
});

$$('#openDataDir').forEach((button) => button.addEventListener('click', () => window.dustySearch.openDataDir()));

$('#createBackup')?.addEventListener('click', async () => {
  setStatus('正在创建备份...');
  try {
    const result = await window.dustySearch.createBackup();
    await refreshState();
    setStatus(`备份完成：${result.backupPath}`);
  } catch (error) {
    setStatus(`备份失败：${error.message || error}`);
  }
});

$('#restoreBackup')?.addEventListener('click', async () => {
  const ok = window.confirm('恢复备份会覆盖当前记忆库和索引。软件会先自动备份当前数据。确定继续吗？');
  if (!ok) return;
  setStatus('正在恢复备份...');
  try {
    const result = await window.dustySearch.restoreBackup();
    if (!result.restored) {
      setStatus('没有选择备份。');
      return;
    }
    await refreshState();
    setStatus(`恢复完成：${result.backupPath}`);
  } catch (error) {
    setStatus(`恢复失败：${error.message || error}`);
  }
});

$('#exportMemoryJson')?.addEventListener('click', async () => {
  try {
    const result = await window.dustySearch.exportMemory('json');
    setStatus(result.exported ? `JSON 已导出：${result.filePath}` : '已取消导出。');
  } catch (error) {
    setStatus(`导出失败：${error.message || error}`);
  }
});

$('#exportMemoryCsv')?.addEventListener('click', async () => {
  try {
    const result = await window.dustySearch.exportMemory('csv');
    setStatus(result.exported ? `CSV 已导出：${result.filePath}` : '已取消导出。');
  } catch (error) {
    setStatus(`导出失败：${error.message || error}`);
  }
});

$('#exportSyncPackage')?.addEventListener('click', async () => {
  try {
    const result = await window.dustySearch.exportSyncPackage();
    setStatus(result.exported ? `同步包已导出：${result.filePath}` : '已取消导出。');
  } catch (error) {
    setStatus(`同步包导出失败：${error.message || error}`);
  }
});

$('#importSyncPackage')?.addEventListener('click', async () => {
  try {
    const result = await window.dustySearch.importSyncPackage();
    if (!result.imported) {
      setStatus('已取消导入同步包。');
      return;
    }
    await refreshState();
    setStatus(`同步包已导入：记忆库 ${result.memoryCount} 条，资料区 ${result.workspaceCount} 个。`);
  } catch (error) {
    setStatus(`同步包导入失败：${error.message || error}`);
  }
});

$('#pickCloudSyncFolder')?.addEventListener('click', async () => {
  try {
    const result = await window.dustySearch.pickCloudSyncFolder();
    await refreshState();
    setStatus(result.selected ? '云同步文件夹已设置。' : '没有选择云同步文件夹。');
  } catch (error) {
    setStatus(`选择云同步文件夹失败：${error.message || error}`);
  }
});

$('#openCloudSyncFolder')?.addEventListener('click', async () => {
  const folder = state.cloudSync?.folder;
  if (!folder) return setStatus('先选择一个云同步文件夹。');
  try {
    await window.dustySearch.openItem(folder);
    setStatus(`已打开云同步文件夹：${folder}`);
  } catch (error) {
    setStatus(`打开云同步文件夹失败：${error.message || error}`);
  }
});

$('#uploadCloudSync')?.addEventListener('click', async () => {
  try {
    const result = await window.dustySearch.uploadCloudSync();
    await refreshState();
    setStatus(`已上传云同步：记忆库 ${result.memoryCount} 条，资料区 ${result.workspaceCount} 个。`);
  } catch (error) {
    setStatus(`云同步上传失败：${error.message || error}`);
  }
});

$('#importCloudSync')?.addEventListener('click', async () => {
  try {
    const result = await window.dustySearch.importCloudSync();
    await refreshState();
    setStatus(`云同步已合并：记忆库 ${result.memoryCount} 条，资料区 ${result.workspaceCount} 个。`);
  } catch (error) {
    setStatus(`云同步合并失败：${error.message || error}`);
  }
});

$('#clearCloudSyncFolder')?.addEventListener('click', async () => {
  try {
    await window.dustySearch.clearCloudSyncFolder();
    await refreshState();
    setStatus('已取消云同步文件夹。');
  } catch (error) {
    setStatus(`取消云同步文件夹失败：${error.message || error}`);
  }
});

$('#openInstallDir')?.addEventListener('click', async () => {
  try {
    const opened = await window.dustySearch.openInstallDir();
    setStatus(`已打开安装位置：${opened}`);
  } catch (error) {
    setStatus(`打开安装位置失败：${error.message || error}`);
  }
});

$('#openInstallNote')?.addEventListener('click', async () => {
  try {
    const opened = await window.dustySearch.openInstallNote();
    setStatus(`已打开安装说明：${opened}`);
  } catch (error) {
    setStatus(`打开安装说明失败：${error.message || error}`);
  }
});

$('#runSelfCheckTool')?.addEventListener('click', async () => {
  try {
    const opened = await window.dustySearch.runSelfCheckTool();
    setStatus(`已打开一键自检：${opened}`);
  } catch (error) {
    setStatus(`一键自检打开失败：${error.message || error}`);
  }
});

document.addEventListener('keydown', async (event) => {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'k') {
    event.preventDefault();
    focusSearchBox();
    setStatus('已回到搜索框。');
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === 'b') {
    event.preventDefault();
    await openBrowserSearch();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && ['1', '2', '3', '4'].includes(event.key)) {
    event.preventDefault();
    const tabs = ['search', 'memory', 'import', 'settings'];
    switchTab(tabs[Number(event.key) - 1]);
    return;
  }
  if (event.key === 'Escape') {
    if (isOnboardingOpen()) {
      hideOnboarding();
      return;
    }
    if (state.activeSearchId) {
      $('#stopSearch')?.click();
    }
  }
});

document.addEventListener('keydown', (event) => {
  const resultCard = event.target.closest?.('.result-card[data-result-id]');
  if (!resultCard) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  selectResult(resultCard.dataset.resultId);
});

setActiveMode('all');
refreshState();

