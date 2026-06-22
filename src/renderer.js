const state = {
  appInfo: {},
  settings: {},
  history: [],
  memory: [],
  memorySummary: { total: 0, categories: {}, tags: {}, typeCounts: {}, recentCount: 0 },
  localIndex: null,
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
  resultFilter: { bucket: '', sort: 'score-desc' }
};

const MODE_LABELS = {
  all: '综合检索',
  local: '本地文件名',
  content: '正文检索',
  memory: '记忆库',
  web: '网页摘要'
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
  return 'file';
}

function memoryTypeLabel(type) {
  if (type === 'website') return '网站';
  if (type === 'saved') return '收藏';
  return '文件';
}

function getMemoryPreview(item, length = 180) {
  return String(item.content || item.source || '')
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
    const haystack = `${item.title || ''} ${item.source || ''} ${(item.tags || []).join(' ')} ${item.content || ''}`.toLowerCase();
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
  if (!folders.length) {
    list.innerHTML = '<div class="folder-empty">还没有选择资料夹。<button class="small-button empty-action" data-action="add-folder">添加资料夹</button></div>';
    return;
  }

  list.innerHTML = folders.map((folder, index) => `
    <div class="folder-row">
      <span title="${escapeAttr(folder)}">${escapeHtml(folder)}</span>
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
  renderAppInfo();
  renderFolders();
}

function renderAppInfo() {
  const node = $('#appInfoList');
  if (!node) return;
  const appInfo = state.appInfo || {};
  const rows = [
    ['版本', appInfo.version || '未知'],
    ['状态', appInfo.isInstalled ? '桌面安装版' : '开发预览版'],
    ['安装位置', appInfo.appPath || '未知'],
    ['数据位置', appInfo.dataDir || '未知']
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
  list.innerHTML = state.failures.slice(0, 80).map((item) => `
    <article class="failure-item">
      <div>
        <h3>${escapeHtml(item.title || item.path)}</h3>
        <p>${escapeHtml(item.message || '读取失败')}</p>
        <small>${escapeHtml(item.stage)} · ${formatDate(item.createdAt)}<br>${escapeHtml(item.path)}</small>
      </div>
      <button class="small-button show-failure-file" data-path="${escapeAttr(item.path)}">所在位置</button>
    </article>
  `).join('');
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
  return [
    ...(payload.web || []).map((item) => ({ ...item, bucket: '网页摘要' })),
    ...(payload.memory || []).map((item) => ({ ...item, bucket: '记忆库' })),
    ...(payload.local || []).map((item) => ({ ...item, bucket: mode === 'content' ? '正文结果' : '本地文件' }))
  ];
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

function getResultScorePercent(item) {
  const scores = state.currentResults.map(getResultScore);
  const maxScore = Math.max(1, ...scores);
  return Math.max(8, Math.min(100, Math.round((getResultScore(item) / maxScore) * 100)));
}

function getResultScoreLabel(percent, item) {
  if (item.type === 'web-fallback') return '可跳转';
  if (percent >= 72) return '高匹配';
  if (percent >= 38) return '中匹配';
  return '低匹配';
}

function getVisibleResults() {
  const bucket = state.resultFilter.bucket;
  const sort = state.resultFilter.sort || 'score-desc';
  const items = state.currentResults.filter((item) => !bucket || item.bucket === bucket);

  return items.sort((a, b) => {
    if (sort === 'time-desc') return getResultTime(b) - getResultTime(a);
    if (sort === 'title-asc') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
    return getResultScore(b) - getResultScore(a);
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
    .sort((a, b) => getResultScore(b) - getResultScore(a))[0];
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
  `;
}

function renderCurrentResults(mode = state.activeMode) {
  const list = $('#resultsList');
  const all = state.currentResults;
  const visibleResults = getVisibleResults();
  $('#resultCount').textContent = visibleResults.length === all.length
    ? `${all.length} 条`
    : `${visibleResults.length}/${all.length} 条`;
  renderResultTools(visibleResults);

  if (!all.length) {
    list.className = 'list empty';
    list.innerHTML = `
      <div>
        <p>没有找到匹配结果，可以换个关键词，或者换一个检索按钮。</p>
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
    list.className = 'list empty';
    list.innerHTML = '<div><p>当前筛选下没有结果。</p><button class="small-button empty-action" data-action="clear-result-filter">清空结果筛选</button></div>';
    return;
  }

  list.className = 'list';
  state.renderedResults = new Map();
  list.innerHTML = visibleResults.map((item, index) => {
    const resultId = item.id || `${item.type}-${index}`;
    state.renderedResults.set(resultId, item);
    const isFile = item.type === 'file';
    const source = isFile ? item.path : item.source;
    const meta = isFile
      ? `${formatSize(item.size)} · ${formatDate(item.updatedAt)}`
      : `${item.bucket} · ${formatDate(item.updatedAt || item.createdAt)}`;
    const reason = getMatchReason(item, mode);
    const percent = getResultScorePercent(item);
    const scoreClass = percent >= 72 ? 'strong' : percent >= 38 ? 'medium' : 'low';

    return `
      <article class="result-card ${item.type === 'web-fallback' ? 'result-card-muted' : ''}">
        <div class="result-card-head">
          <div>
            <div class="result-type">${item.bucket}</div>
            <h3>${highlight(item.title)}</h3>
          </div>
          <div class="result-score ${scoreClass}">
            <strong>${percent}</strong>
            <span>${getResultScoreLabel(percent, item)}</span>
          </div>
        </div>
        <div class="match-reason">${escapeHtml(reason)}</div>
        <p>${highlight(item.detail || item.content?.slice(0, 260) || source)}</p>
        <div class="result-meta">${escapeHtml(source)}<br>${meta}</div>
        ${isFile ? `
          <div class="actions">
            <button class="small-button save-result" data-result-id="${escapeAttr(resultId)}">收藏</button>
            <button class="small-button open-file" data-path="${escapeAttr(item.path)}">打开</button>
            <button class="small-button show-file" data-path="${escapeAttr(item.path)}">所在位置</button>
            <button class="small-button copy-source" data-source="${escapeAttr(source)}">复制路径</button>
          </div>
        ` : `
          <div class="actions">
            <button class="small-button save-result" data-result-id="${escapeAttr(resultId)}">收藏</button>
            <button class="small-button open-source" data-source="${escapeAttr(source)}">打开来源</button>
            <button class="small-button copy-source" data-source="${escapeAttr(source)}">复制来源</button>
          </div>
        `}
      </article>
    `;
  }).join('');
}

function renderResults(payload, mode = state.activeMode) {
  state.currentResults = buildResultItems(payload, mode);
  state.resultFilter = { bucket: '', sort: 'score-desc' };
  renderCurrentResults(mode);
}

async function refreshState() {
  const fresh = await window.dustySearch.getState();
  state.appInfo = fresh.appInfo || {};
  state.settings = fresh.settings || {};
  state.history = fresh.history || [];
  state.memory = fresh.memory || [];
  state.memorySummary = fresh.memorySummary || { total: 0, categories: {}, tags: {}, typeCounts: {}, recentCount: 0 };
  state.localIndex = fresh.localIndex || null;
  state.dataHealth = fresh.dataHealth || null;
  state.onboarding = fresh.onboarding || { completed: false, shouldShow: false };
  state.failures = fresh.failures || [];
  $('#dataPath').textContent = fresh.dataDir;
  renderHistory();
  renderMemory();
  renderSettings();
  renderIndexStatus();
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
    renderResults(result, mode);
    await refreshState();
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
      const query = ($('#queryInput').value || '').trim();
      if (!query) return setStatus('先输入一个关键词。');
      const url = await window.dustySearch.searchWeb(query);
      await refreshState();
      setStatus(`已打开浏览器搜索：${url}`);
      return;
    }
    runSearch(mode);
  }

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) {
    if (action === 'focus-search') {
      focusSearchBox();
      setStatus('输入关键词后，选择一个检索按钮。');
    }
    if (action === 'go-settings') switchTab('settings');
    if (action === 'go-import') switchTab('import');
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
      saveResult.textContent = '已收藏';
      await refreshState();
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
    state.memory = await window.dustySearch.updateMemoryMeta({ id, category, tags });
    await refreshState();
    setStatus('记忆库分类和标签已保存。');
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
  try {
    const imported = await window.dustySearch.pickImportFiles();
    await refreshState();
    setStatus(imported.length ? `已导入 ${imported.length} 个文件。` : '没有选择文件。');
  } catch (error) {
    setStatus(`导入失败：${error.message || error}`);
  }
});

$('#importSite').addEventListener('click', async () => {
  const url = ($('#siteUrl').value || '').trim();
  if (!url) return setStatus('先粘贴一个网址。');
  setStatus('正在读取网站...');
  try {
    await window.dustySearch.importSite(url);
    $('#siteUrl').value = '';
    await refreshState();
    setStatus('网站已导入记忆库。');
  } catch (error) {
    setStatus(`网站导入失败：${error.message || error}`);
  }
});

$('#addFolder').addEventListener('click', async () => {
  const folder = await window.dustySearch.pickFolder();
  if (!folder) return;
  state.settings.searchFolders = Array.from(new Set([...(state.settings.searchFolders || []), folder]));
  renderFolders();
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

$('#openInstallDir')?.addEventListener('click', async () => {
  try {
    const opened = await window.dustySearch.openInstallDir();
    setStatus(`已打开安装位置：${opened}`);
  } catch (error) {
    setStatus(`打开安装位置失败：${error.message || error}`);
  }
});

setActiveMode('all');
refreshState();

