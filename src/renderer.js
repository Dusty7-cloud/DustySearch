const state = {
  appInfo: {},
  settings: {},
  history: [],
  memory: [],
  memorySummary: { total: 0, categories: {}, tags: {} },
  localIndex: null,
  failures: [],
  memoryFilter: { category: '', tag: '' },
  lastQuery: '',
  activeMode: 'all'
};

const MODE_LABELS = {
  all: '综合检索',
  local: '本地文件名',
  content: '正文检索',
  memory: '记忆库',
  web: '联网结果'
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

function switchTab(tab) {
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tab}`));
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

function renderMemory() {
  const list = $('#memoryList');
  renderMemoryFilters();
  renderTagCloud();
  const category = state.memoryFilter.category;
  const tag = state.memoryFilter.tag;
  const items = state.memory.filter((item) => {
    const categoryOk = !category || item.category === category;
    const tagOk = !tag || (item.tags || []).some((value) => value.includes(tag));
    return categoryOk && tagOk;
  });

  if (!items.length) {
    list.className = 'memory-list empty';
    list.textContent = state.memory.length ? '没有符合筛选的记忆库内容。' : '还没有导入内容。';
    return;
  }

  list.className = 'memory-list';
  list.innerHTML = items.map((item) => `
    <article class="memory-item">
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.source)}</p>
        <div class="memory-meta-row">
          <span>${escapeHtml(item.category || '其他')}</span>
          <span>${(item.tags || []).map((tag) => `<b>${escapeHtml(tag)}</b>`).join(' ') || '无标签'}</span>
          <small>${item.type === 'website' ? '网站' : '文件'} · ${formatDate(item.createdAt)}</small>
        </div>
        <div class="memory-edit">
          <input class="memory-category-input" data-id="${item.id}" value="${escapeAttr(item.category || '其他')}" placeholder="分类" />
          <input class="memory-tags-input" data-id="${item.id}" value="${escapeAttr((item.tags || []).join(', '))}" placeholder="标签，用逗号隔开" />
          <button class="small-button save-memory-meta" data-id="${item.id}">保存</button>
        </div>
      </div>
      <button class="small-button delete-memory" data-id="${item.id}">删除</button>
    </article>
  `).join('');
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
}

function renderFolders() {
  const list = $('#folderList');
  const folders = state.settings.searchFolders || [];
  if (!folders.length) {
    list.innerHTML = '<div class="folder-empty">还没有选择资料夹。</div>';
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

function setActiveMode(mode) {
  state.activeMode = mode;
  $$('.mode-button').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  $('#resultsTitle').textContent = `${MODE_LABELS[mode] || '匹配'}结果`;
}

function renderResults(payload, mode = state.activeMode) {
  const local = payload.local || [];
  const memory = payload.memory || [];
  const web = payload.web || [];
  const all = [
    ...web.map((item) => ({ ...item, bucket: '联网结果' })),
    ...memory.map((item) => ({ ...item, bucket: '记忆库' })),
    ...local.map((item) => ({ ...item, bucket: mode === 'content' ? '正文结果' : '本地文件' }))
  ];

  $('#resultCount').textContent = `${all.length} 条`;
  const list = $('#resultsList');
  if (!all.length) {
    list.className = 'list empty';
    list.textContent = '没有找到匹配结果，可以换个关键词，或者换一个检索按钮。';
    return;
  }

  list.className = 'list';
  list.innerHTML = all.map((item) => {
    const isFile = item.type === 'file';
    const source = isFile ? item.path : item.source;
    const meta = isFile
      ? `${formatSize(item.size)} · ${formatDate(item.updatedAt)}`
      : `${item.bucket} · ${formatDate(item.createdAt)}`;

    return `
      <article class="result-card ${item.type === 'web-fallback' ? 'result-card-muted' : ''}">
        <div class="result-type">${item.bucket}</div>
        <h3>${highlight(item.title)}</h3>
        <p>${highlight(item.detail || item.content?.slice(0, 260) || source)}</p>
        <div class="result-meta">${escapeHtml(source)}<br>${meta}</div>
        ${isFile ? `
          <div class="actions">
            <button class="small-button open-file" data-path="${escapeAttr(item.path)}">打开</button>
            <button class="small-button show-file" data-path="${escapeAttr(item.path)}">所在位置</button>
            <button class="small-button copy-source" data-source="${escapeAttr(source)}">复制路径</button>
          </div>
        ` : `
          <div class="actions">
            <button class="small-button open-source" data-source="${escapeAttr(source)}">打开来源</button>
            <button class="small-button copy-source" data-source="${escapeAttr(source)}">复制来源</button>
          </div>
        `}
      </article>
    `;
  }).join('');
}

async function refreshState() {
  const fresh = await window.dustySearch.getState();
  state.appInfo = fresh.appInfo || {};
  state.settings = fresh.settings || {};
  state.history = fresh.history || [];
  state.memory = fresh.memory || [];
  state.memorySummary = fresh.memorySummary || { total: 0, categories: {}, tags: {} };
  state.localIndex = fresh.localIndex || null;
  state.failures = fresh.failures || [];
  $('#dataPath').textContent = fresh.dataDir;
  renderHistory();
  renderMemory();
  renderSettings();
  renderIndexStatus();
  renderFailures();
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
  setBusy(true);

  try {
    let result;
    if (mode === 'local') result = await window.dustySearch.searchLocalName(query);
    if (mode === 'content') result = await window.dustySearch.searchContent(query);
    if (mode === 'memory') result = await window.dustySearch.searchMemoryOnly(query);
    if (mode === 'web') result = await window.dustySearch.searchWebResults(query);
    if (mode === 'all') result = await window.dustySearch.searchAll(query);

    renderResults(result, mode);
    await refreshState();
    const count = (result.local || []).length + (result.memory || []).length + (result.web || []).length;
    setStatus(`${MODE_LABELS[mode]}完成：${count} 条。`);
  } catch (error) {
    setStatus(`检索失败：${error.message || error}`);
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy) {
  $('#searchAllButton').disabled = isBusy;
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

  const historyItem = event.target.closest('.history-item');
  if (historyItem) {
    $('#queryInput').value = historyItem.dataset.query;
    runSearch(state.activeMode || 'all');
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
  renderMemory();
});
$('#memoryTagFilter')?.addEventListener('input', (event) => {
  state.memoryFilter.tag = event.target.value.trim();
  renderMemory();
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

$('#clearFailures')?.addEventListener('click', async () => {
  if (state.failures.length && !window.confirm('确定清空读取失败列表吗？')) return;
  state.failures = await window.dustySearch.clearFailures();
  renderFailures();
  setStatus('读取失败列表已清空。');
});

$('#rebuildIndex').addEventListener('click', async () => {
  setStatus('正在刷新本地索引，文件多时会慢一点...');
  setBusy(true);
  try {
    const result = await window.dustySearch.rebuildIndex();
    state.localIndex = result;
    renderIndexStatus();
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
  state.settings = await window.dustySearch.saveSettings(state.settings);
  renderSettings();
  setStatus('设置已保存。');
});

$('#openDataDir').addEventListener('click', () => window.dustySearch.openDataDir());

$('#createBackup')?.addEventListener('click', async () => {
  setStatus('正在创建备份...');
  try {
    const result = await window.dustySearch.createBackup();
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
