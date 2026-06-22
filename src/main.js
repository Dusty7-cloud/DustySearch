const { app, BrowserWindow, ipcMain, shell, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const XLSX = require('xlsx');

const APP_NAME = 'DustySearch';
const DATA_DIR = path.join(app.getPath('documents'), 'DustySearchData');
const DB_PATH = path.join(DATA_DIR, 'memory.json');
const LOG_PATH = path.join(DATA_DIR, 'app.log');
const INDEX_CACHE_PATH = path.join(DATA_DIR, 'document-index.json');
const LOCAL_INDEX_PATH = path.join(DATA_DIR, 'local-index.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const FAILURE_PATH = path.join(DATA_DIR, 'failures.json');
const DEFAULT_IGNORES = new Set([
  'node_modules',
  '.git',
  'AppData',
  '$Recycle.Bin',
  'System Volume Information',
  'Windows',
  'Program Files',
  'Program Files (x86)'
]);
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.csv', '.log', '.xml', '.html', '.htm', '.css',
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.cs',
  '.ps1', '.bat', '.cmd', '.ini', '.yml', '.yaml'
]);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx', '.xls']);

let mainWindow;
const IS_SELF_CHECK = process.argv.includes('--self-check');
const cancelledSearches = new Set();

const gotLock = IS_SELF_CHECK || app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function defaultDb() {
  return {
    version: 2,
    createdAt: new Date().toISOString(),
    settings: {
      searchFolders: [app.getPath('desktop'), app.getPath('documents'), app.getPath('downloads')],
      maxResults: 80,
      includeContent: true,
      webEngine: 'bing'
    },
    history: [],
    memory: []
  };
}

function getAppInfo() {
  const appPath = app.getAppPath();
  return {
    name: APP_NAME,
    version: app.getVersion(),
    appPath,
    dataDir: DATA_DIR,
    dbPath: DB_PATH,
    logPath: LOG_PATH,
    isInstalled: appPath.toLowerCase().includes(path.join('appdata', 'local', 'dustysearchapp'))
  };
}

function readSearchRequest(payload) {
  if (payload && typeof payload === 'object') {
    return {
      query: String(payload.query || '').trim(),
      searchId: String(payload.searchId || '').trim()
    };
  }
  return {
    query: String(payload || '').trim(),
    searchId: ''
  };
}

function cancelSearch(searchId) {
  if (searchId) cancelledSearches.add(String(searchId));
}

function clearSearch(searchId) {
  if (searchId) cancelledSearches.delete(String(searchId));
}

function assertSearchActive(searchId) {
  if (searchId && cancelledSearches.has(String(searchId))) {
    const error = new Error('检索已停止');
    error.code = 'SEARCH_CANCELLED';
    throw error;
  }
}

function emptySearchResult() {
  return { local: [], memory: [], web: [], webUrl: '' };
}

function logLine(message, detail = '') {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${message}${detail ? ` ${detail}` : ''}\n`, 'utf8');
  } catch {
    // 日志不能影响软件启动。
  }
}

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2), 'utf8');
  }
}

function readDb() {
  ensureDataFile();
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const fresh = defaultDb();
    const merged = {
      ...fresh,
      ...db,
      settings: { ...fresh.settings, ...(db.settings || {}) },
      history: Array.isArray(db.history) ? db.history : [],
      memory: Array.isArray(db.memory) ? db.memory : []
    };
    merged.memory = normalizeMemoryItems(merged.memory);
    const cleanedHistory = merged.history.filter((item) => !looksMojibake(item.query));
    if (cleanedHistory.length !== merged.history.length) {
      merged.history = cleanedHistory;
      writeDb(merged);
    }
    return merged;
  } catch (error) {
    const backup = `${DB_PATH}.${Date.now()}.broken`;
    try {
      fs.copyFileSync(DB_PATH, backup);
    } catch {
      // ignore backup failure
    }
    logLine('database reset after read failure', error.message || String(error));
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2), 'utf8');
    return readDb();
  }
}

function normalizeMemoryItems(items) {
  return (items || []).map((item) => ({
    ...item,
    category: item.category || guessCategory(item),
    tags: Array.isArray(item.tags) ? item.tags : []
  }));
}

function guessCategory(item) {
  if (item.type === 'website') return '网站';
  const ext = path.extname(item.source || item.title || '').toLowerCase();
  if (['.pdf', '.docx', '.doc', '.txt', '.md'].includes(ext)) return '文档';
  if (['.xlsx', '.xls', '.csv'].includes(ext)) return '表格';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return '图片';
  if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) return '视频';
  return '其他';
}

function looksMojibake(value) {
  const text = String(value || '');
  return /[\uE000-\uF8FF]/.test(text) || text.includes('\u9286') || Array.from(text).some((char) => {
    const code = char.charCodeAt(0);
    return code >= 0x9500 && code <= 0x9fff;
  });
}

function writeDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function readFailures() {
  try {
    if (!fs.existsSync(FAILURE_PATH)) return [];
    const failures = JSON.parse(fs.readFileSync(FAILURE_PATH, 'utf8'));
    return Array.isArray(failures) ? failures : [];
  } catch (error) {
    logLine('failure list read failed', error.message || String(error));
    return [];
  }
}

function writeFailures(failures) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FAILURE_PATH, JSON.stringify(failures.slice(0, 500), null, 2), 'utf8');
}

function recordFailure(stage, filePath, error) {
  const message = error?.message || String(error || '未知错误');
  logLine(`${stage} failed`, `${filePath} ${message}`);
  const failures = readFailures();
  const existing = failures.find((item) => item.path === filePath && item.stage === stage);
  const entry = {
    id: cryptoId(),
    stage,
    path: filePath,
    title: path.basename(filePath || ''),
    message: simplifyErrorMessage(message),
    rawMessage: message,
    createdAt: new Date().toISOString()
  };
  if (existing) {
    Object.assign(existing, entry, { id: existing.id, firstSeenAt: existing.firstSeenAt || existing.createdAt });
  } else {
    failures.unshift(entry);
  }
  writeFailures(failures);
}

function simplifyErrorMessage(message) {
  if (/password/i.test(message)) return '文件可能有密码保护，暂时读不了。';
  if (/corrupt|central directory|zip/i.test(message)) return '文件可能损坏，或不是标准文档格式。';
  if (/ENOENT/i.test(message)) return '文件不存在或已经被移动。';
  if (/permission|access/i.test(message)) return '没有权限读取这个文件。';
  if (/pdfParse is not a function/i.test(message)) return 'PDF 读取组件异常。';
  return message.slice(0, 180);
}

function timestampName() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function copyIfExists(from, to) {
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, to);
  }
}

function createBackup(reason = 'manual') {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `backup-${timestampName()}-${reason}`);
  fs.mkdirSync(backupPath, { recursive: true });
  copyIfExists(DB_PATH, path.join(backupPath, 'memory.json'));
  copyIfExists(INDEX_CACHE_PATH, path.join(backupPath, 'document-index.json'));
  copyIfExists(LOCAL_INDEX_PATH, path.join(backupPath, 'local-index.json'));
  copyIfExists(LOG_PATH, path.join(backupPath, 'app.log'));
  fs.writeFileSync(path.join(backupPath, 'backup-info.json'), JSON.stringify({
    app: APP_NAME,
    createdAt: new Date().toISOString(),
    reason
  }, null, 2), 'utf8');
  return backupPath;
}

function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const backupPath = path.join(BACKUP_DIR, entry.name);
        let createdAt = fs.statSync(backupPath).mtime.toISOString();
        try {
          const infoPath = path.join(backupPath, 'backup-info.json');
          if (fs.existsSync(infoPath)) {
            const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
            createdAt = info.createdAt || createdAt;
          }
        } catch {
          // 旧备份缺信息时，用文件夹时间兜底。
        }
        return { name: entry.name, path: backupPath, createdAt };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    logLine('backup list failed', error.message || String(error));
    return [];
  }
}

function restoreBackup(backupPath) {
  const memoryPath = path.join(backupPath, 'memory.json');
  if (!fs.existsSync(memoryPath)) {
    throw new Error('这个备份里没有 memory.json，不能恢复。');
  }
  createBackup('before-restore');
  copyIfExists(memoryPath, DB_PATH);
  copyIfExists(path.join(backupPath, 'document-index.json'), INDEX_CACHE_PATH);
  copyIfExists(path.join(backupPath, 'local-index.json'), LOCAL_INDEX_PATH);
  return true;
}

function memoryToCsv(memory) {
  const headers = ['title', 'source', 'type', 'category', 'tags', 'createdAt', 'updatedAt'];
  const escapeCell = (value) => `"${String(value || '').replace(/"/g, '""')}"`;
  const rows = (memory || []).map((item) => [
    item.title,
    item.source,
    item.type,
    item.category,
    (item.tags || []).join('|'),
    item.createdAt,
    item.updatedAt
  ].map(escapeCell).join(','));
  return `${headers.join(',')}\n${rows.join('\n')}`;
}

function readIndexCache() {
  try {
    if (!fs.existsSync(INDEX_CACHE_PATH)) return {};
    return JSON.parse(fs.readFileSync(INDEX_CACHE_PATH, 'utf8'));
  } catch (error) {
    logLine('index cache read failed', error.message || String(error));
    return {};
  }
}

function writeIndexCache(cache) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(INDEX_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    logLine('index cache write failed', error.message || String(error));
  }
}

function readLocalIndex() {
  try {
    if (!fs.existsSync(LOCAL_INDEX_PATH)) return null;
    return JSON.parse(fs.readFileSync(LOCAL_INDEX_PATH, 'utf8'));
  } catch (error) {
    logLine('local index read failed', error.message || String(error));
    return null;
  }
}

function writeLocalIndex(index) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LOCAL_INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
  } catch (error) {
    logLine('local index write failed', error.message || String(error));
  }
}

function indexSignature(folders) {
  return JSON.stringify((folders || []).filter(Boolean).sort());
}

function isIndexUsable(index, folders) {
  return Boolean(index && Array.isArray(index.items) && index.signature === indexSignature(folders));
}

function cryptoId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1220,
    height: 800,
    minWidth: 940,
    minHeight: 640,
    title: APP_NAME,
    backgroundColor: '#f7f7f4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function scoreText(text, query) {
  const hay = normalizeText(text);
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  let score = 0;
  for (const term of terms) {
    if (hay.includes(term)) score += term.length;
  }
  return score;
}

function saveHistory(query, scope, resultCount) {
  const db = readDb();
  db.history.unshift({
    id: cryptoId(),
    query,
    scope,
    resultCount,
    createdAt: new Date().toISOString()
  });
  db.history = db.history.slice(0, 500);
  writeDb(db);
}

function readTextPreview(filePath, query) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) return '';
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024 * 2) return '文件较大，已先匹配文件名。';
    const text = fs.readFileSync(filePath, 'utf8');
    const lower = normalizeText(text);
    const term = normalizeText(query).split(/\s+/).find(Boolean);
    const index = term ? lower.indexOf(term) : -1;
    if (index >= 0) {
      const start = Math.max(0, index - 80);
      return text.slice(start, start + 240).replace(/\s+/g, ' ').trim();
    }
    return text.slice(0, 180).replace(/\s+/g, ' ').trim();
  } catch (error) {
    recordFailure('preview', filePath, error);
    return '';
  }
}

function makePreview(text, query, fallback = '') {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  const lower = normalizeText(clean);
  const term = normalizeText(query).split(/\s+/).find(Boolean);
  const index = term ? lower.indexOf(term) : -1;
  if (index >= 0) {
    const start = Math.max(0, index - 90);
    return clean.slice(start, start + 260);
  }
  return clean.slice(0, 220);
}

async function extractDocumentText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (TEXT_EXTENSIONS.has(ext)) {
      const stat = fs.statSync(filePath);
      if (stat.size > 1024 * 1024 * 8) return `${path.basename(filePath)} ${path.dirname(filePath)}`;
      return fs.readFileSync(filePath, 'utf8');
    }

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    }

    if (ext === '.pdf') {
      const parser = new PDFParse({ data: fs.readFileSync(filePath) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text || '';
    }

    if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX.readFile(filePath, { cellDates: true });
      return workbook.SheetNames.map((name) => {
        const rows = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
        return `【${name}】\n${rows}`;
      }).join('\n\n');
    }
  } catch (error) {
    recordFailure('extract', filePath, error);
  }

  return `${path.basename(filePath)} ${path.dirname(filePath)}`;
}

async function getCachedDocumentText(filePath) {
  const stat = fs.statSync(filePath);
  const key = filePath;
  const cache = readIndexCache();
  const cached = cache[key];
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
    return cached.text || '';
  }

  const text = await extractDocumentText(filePath);
  cache[key] = {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    indexedAt: new Date().toISOString(),
    text: String(text || '').slice(0, 160000)
  };
  writeIndexCache(cache);
  return cache[key].text;
}

async function collectIndexItems(root, settings, items, startedAt, searchId = '') {
  assertSearchActive(searchId);
  if (Date.now() - startedAt > 45000) return;

  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    assertSearchActive(searchId);
    if (DEFAULT_IGNORES.has(entry.name)) continue;
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      await collectIndexItems(fullPath, settings, items, startedAt, searchId);
      continue;
    }

    if (!entry.isFile()) continue;

    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    let content = '';
    if (settings.includeContent && TEXT_EXTENSIONS.has(ext)) {
      content = readTextPreview(fullPath, '');
    } else if (settings.includeContent && DOCUMENT_EXTENSIONS.has(ext)) {
      content = await getCachedDocumentText(fullPath);
    }

    items.push({
      title: entry.name,
      path: fullPath,
      dir: path.dirname(fullPath),
      ext,
      size: stat.size,
      updatedAt: stat.mtime,
      mtimeMs: stat.mtimeMs,
      content: String(content || '').slice(0, 160000)
    });
  }
}

async function rebuildLocalIndex(searchId = '') {
  const db = readDb();
  const settings = {
    ...db.settings,
    maxResults: Number(db.settings.maxResults || 80)
  };
  const roots = (settings.searchFolders || []).filter((folder) => folder && fs.existsSync(folder));
  const items = [];
  const startedAt = Date.now();

  for (const root of roots) {
    assertSearchActive(searchId);
    await collectIndexItems(root, settings, items, startedAt, searchId);
  }

  const index = {
    version: 1,
    builtAt: new Date().toISOString(),
    signature: indexSignature(roots),
    roots,
    itemCount: items.length,
    items
  };
  writeLocalIndex(index);
  return index;
}

async function getLocalIndexForSearch(searchId = '') {
  assertSearchActive(searchId);
  const db = readDb();
  const roots = (db.settings.searchFolders || []).filter((folder) => folder && fs.existsSync(folder));
  const index = readLocalIndex();
  if (isIndexUsable(index, roots)) return index;
  return rebuildLocalIndex(searchId);
}

function searchIndexItems(index, query, mode, maxResults, searchId = '') {
  const shouldSearchName = mode === 'all' || mode === 'name';
  const shouldSearchContent = mode === 'all' || mode === 'content';
  return (index.items || [])
    .map((item) => {
      assertSearchActive(searchId);
      const nameScore = shouldSearchName ? scoreText(item.title, query) * 10 : 0;
      const contentScore = shouldSearchContent ? scoreText(item.content, query) : 0;
      const score = nameScore + contentScore;
      return {
        id: cryptoId(),
        type: 'file',
        title: item.title,
        path: item.path,
        detail: contentScore > 0 ? makePreview(item.content, query, item.dir) : item.dir,
        matchReason: contentScore > 0 ? '正文里包含关键词' : '文件名或路径包含关键词',
        size: item.size,
        updatedAt: item.updatedAt,
        score
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

async function walkFiles(root, query, settings, results, startedAt, mode = 'all', searchId = '') {
  assertSearchActive(searchId);
  if (results.length >= settings.maxResults) return;
  if (Date.now() - startedAt > 12000) return;

  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    assertSearchActive(searchId);
    if (results.length >= settings.maxResults) break;
    if (DEFAULT_IGNORES.has(entry.name)) continue;
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      await walkFiles(fullPath, query, settings, results, startedAt, mode, searchId);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    const nameScore = scoreText(entry.name, query) * 10;
    let contentScore = 0;
    let preview = '';
    const shouldSearchName = mode === 'all' || mode === 'name';
    const shouldSearchContent = mode === 'all' || mode === 'content';

    if (settings.includeContent && shouldSearchContent && TEXT_EXTENSIONS.has(ext)) {
      preview = readTextPreview(fullPath, query);
      contentScore = scoreText(preview, query);
    } else if (settings.includeContent && shouldSearchContent && DOCUMENT_EXTENSIONS.has(ext)) {
      assertSearchActive(searchId);
      const text = await getCachedDocumentText(fullPath);
      assertSearchActive(searchId);
      contentScore = scoreText(text, query);
      if (contentScore > 0) {
        preview = makePreview(text, query, path.dirname(fullPath));
      }
    }

    const total = (shouldSearchName ? nameScore : 0) + contentScore;
    if (total > 0) {
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        stat = { size: 0, mtime: new Date() };
      }

      results.push({
        id: cryptoId(),
        type: 'file',
        title: entry.name,
        path: fullPath,
        detail: preview || path.dirname(fullPath),
        matchReason: contentScore > 0 ? '正文里包含关键词' : '文件名或路径包含关键词',
        size: stat.size,
        updatedAt: stat.mtime,
        score: total
      });
    }
  }
}

async function searchLocal(query, searchId = '') {
  return searchFiles(query, 'all', searchId);
}

async function searchFiles(query, mode, searchId = '') {
  assertSearchActive(searchId);
  const db = readDb();
  const settings = {
    ...db.settings,
    maxResults: Number(db.settings.maxResults || 80)
  };
  try {
    const index = await getLocalIndexForSearch(searchId);
    return searchIndexItems(index, query, mode, settings.maxResults, searchId);
  } catch (error) {
    if (error?.code === 'SEARCH_CANCELLED') throw error;
    logLine('indexed search failed, falling back', error.message || String(error));
  }

  const roots = (settings.searchFolders || []).filter((folder) => folder && fs.existsSync(folder));
  const results = [];
  const startedAt = Date.now();
  for (const root of roots) {
    assertSearchActive(searchId);
    await walkFiles(root, query, settings, results, startedAt, mode, searchId);
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, settings.maxResults);
}

function searchMemory(query, searchId = '') {
  assertSearchActive(searchId);
  const db = readDb();
  return (db.memory || [])
    .map((item) => {
      assertSearchActive(searchId);
      return {
        ...item,
        matchReason: '记忆库标题、来源或内容包含关键词',
        score: scoreText(`${item.title} ${item.source} ${item.content}`, query)
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, db.settings?.maxResults || 80);
}

function getMemorySummary(memory) {
  const categories = {};
  const tags = {};
  const typeCounts = {};
  let recentCount = 0;
  const recentCutoff = Date.now() - 1000 * 60 * 60 * 24 * 7;
  for (const item of memory || []) {
    const category = item.category || guessCategory(item);
    const typeKey = item.type === 'website' ? 'website' : item.type === 'saved-result' ? 'saved' : 'file';
    categories[category] = (categories[category] || 0) + 1;
    typeCounts[typeKey] = (typeCounts[typeKey] || 0) + 1;
    if (new Date(item.updatedAt || item.createdAt || 0).getTime() >= recentCutoff) recentCount += 1;
    for (const tag of item.tags || []) {
      tags[tag] = (tags[tag] || 0) + 1;
    }
  }
  return {
    total: (memory || []).length,
    categories,
    tags,
    typeCounts,
    recentCount
  };
}

function getDataHealth() {
  const db = readDb();
  const settings = db.settings || {};
  const folders = Array.from(new Set(settings.searchFolders || [])).filter(Boolean);
  const folderItems = folders.map((folder) => ({
    path: folder,
    exists: fs.existsSync(folder)
  }));
  const existingFolders = folderItems.filter((item) => item.exists).map((item) => item.path);
  const missingFolders = folderItems.filter((item) => !item.exists);
  const localIndex = readLocalIndex();
  const failures = readFailures();
  const backups = listBackups();
  const memorySummary = getMemorySummary(db.memory);
  const extensionCounts = {};

  for (const item of localIndex?.items || []) {
    const ext = item.ext || path.extname(item.path || '').toLowerCase() || '无后缀';
    extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
  }

  const failureReasons = {};
  for (const failure of failures) {
    const reason = failure.message || '读取失败';
    failureReasons[reason] = (failureReasons[reason] || 0) + 1;
  }

  const recommendations = [];
  const addRecommendation = (level, title, detail, action = '', actionLabel = '') => {
    recommendations.push({ level, title, detail, action, actionLabel });
  };

  if (!folders.length) {
    addRecommendation('danger', '还没有选择检索资料夹', '本地文件名和正文检索没有地方可搜，先添加一个常用资料夹。', 'add-folder', '添加资料夹');
  }
  if (missingFolders.length) {
    addRecommendation('danger', `${missingFolders.length} 个资料夹找不到了`, '可能是文件夹被移动、改名，或者外接硬盘没插上。', 'go-settings', '检查资料夹');
  }
  if (!localIndex) {
    addRecommendation('warning', '还没有本地索引', '第一次检索会自动建立；也可以现在手动刷新，让后面的搜索更快。', 'rebuild-index', '刷新索引');
  } else if (!isIndexUsable(localIndex, existingFolders)) {
    addRecommendation('warning', '本地索引需要更新', '资料夹列表有变化，建议刷新一次索引。', 'rebuild-index', '刷新索引');
  }
  if (!settings.includeContent) {
    addRecommendation('warning', '正文检索已关闭', '文件名还能搜，但 PDF、Word、Excel、文本正文不会参与匹配。', 'go-settings', '打开正文检索');
  }
  if (failures.length) {
    addRecommendation('warning', `${failures.length} 条读取失败`, '通常是加密、损坏、权限不够或格式不标准的文件，可以在下面查看。', 'clear-failures', '清空旧记录');
  }
  if (!memorySummary.total) {
    addRecommendation('info', '记忆库还是空的', '把常用文件、网站或重要结果收藏进来，后面可以单独检索。', 'go-import', '导入资料');
  }
  if (!backups.length) {
    addRecommendation('info', '还没有备份', '做一次备份，后面误删或改乱了可以恢复。', 'create-backup', '一键备份');
  }
  if (!recommendations.length) {
    addRecommendation('good', '状态不错', '资料夹、索引、记忆库和备份都处在可用状态。', '', '');
  }

  const dangerCount = recommendations.filter((item) => item.level === 'danger').length;
  const warningCount = recommendations.filter((item) => item.level === 'warning').length;
  const score = Math.max(45, 100 - dangerCount * 24 - warningCount * 12 - (recommendations.length > 1 ? 4 : 0));
  const status = dangerCount ? 'danger' : warningCount ? 'warning' : 'good';
  const statusText = dangerCount ? '需要处理' : warningCount ? '可以优化' : '状态良好';

  return {
    checkedAt: new Date().toISOString(),
    score,
    status,
    statusText,
    folders: {
      total: folders.length,
      existing: existingFolders.length,
      missing: missingFolders.length,
      items: folderItems
    },
    localIndex: localIndex ? {
      builtAt: localIndex.builtAt,
      itemCount: localIndex.itemCount || 0,
      roots: localIndex.roots || [],
      stale: !isIndexUsable(localIndex, existingFolders),
      extensionCounts
    } : null,
    readableTypes: {
      text: Array.from(TEXT_EXTENSIONS).sort(),
      documents: Array.from(DOCUMENT_EXTENSIONS).sort(),
      note: settings.includeContent ? '正文检索已开启' : '正文检索已关闭'
    },
    memory: {
      total: memorySummary.total,
      categoryCount: Object.keys(memorySummary.categories || {}).length,
      tagCount: Object.keys(memorySummary.tags || {}).length
    },
    failures: {
      total: failures.length,
      recent: failures.slice(0, 5),
      reasons: Object.entries(failureReasons).map(([message, count]) => ({ message, count })).slice(0, 6)
    },
    backups: {
      total: backups.length,
      latest: backups[0] || null
    },
    settings: {
      includeContent: Boolean(settings.includeContent),
      maxResults: settings.maxResults || 80,
      webEngine: settings.webEngine || 'bing'
    },
    recommendations
  };
}

function getWebUrl(query) {
  const db = readDb();
  const engine = db.settings?.webEngine || 'bing';
  const encoded = encodeURIComponent(query);
  if (engine === 'google') return `https://www.google.com/search?q=${encoded}`;
  if (engine === 'duckduckgo') return `https://duckduckgo.com/?q=${encoded}`;
  return `https://www.bing.com/search?q=${encoded}`;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseBingResults(html) {
  const results = [];
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/gi) || [];
  for (const block of blocks) {
    const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    if (!linkMatch) continue;
    const title = stripTags(linkMatch[2]);
    const url = decodeHtml(linkMatch[1]);
    const snippet = stripTags((block.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '');
    if (!title || !/^https?:\/\//i.test(url)) continue;
    results.push({
      id: cryptoId(),
      type: 'web',
      title,
      source: url,
      content: snippet || url,
      createdAt: new Date().toISOString(),
      score: 1
    });
    if (results.length >= 8) break;
  }
  return results;
}

async function searchWebResults(query, searchId = '') {
  assertSearchActive(searchId);
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  let cancelTimer = null;
  if (searchId) {
    cancelTimer = setInterval(() => {
      if (cancelledSearches.has(String(searchId))) {
        controller.abort();
        clearInterval(cancelTimer);
      }
    }, 100);
  }
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 DustySearch/1.0'
      },
      signal: controller.signal
    });
    assertSearchActive(searchId);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    assertSearchActive(searchId);
    const results = parseBingResults(html);
    if (results.length) return results;
  } catch (error) {
    if (error?.name === 'AbortError' || cancelledSearches.has(String(searchId))) {
      assertSearchActive(searchId);
    }
    logLine('web search failed', error.message || String(error));
  } finally {
    if (cancelTimer) clearInterval(cancelTimer);
  }

  return [{
    id: cryptoId(),
    type: 'web-fallback',
    title: `打开浏览器搜索：${query}`,
    source: getWebUrl(query),
    content: '没有成功读取到网页结果，点击这里仍可打开浏览器搜索。',
    createdAt: new Date().toISOString(),
    score: 0
  }];
}

async function fetchWebsite(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'DustySearch/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`网站读取失败：${response.status}`);
  }

  const html = await response.text();
  const title = (html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || url)
    .replace(/\s+/g, ' ')
    .trim();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120000);
  return { title, text };
}

async function importFile(filePath) {
  const content = await extractDocumentText(filePath);
  const db = readDb();
  const existingIndex = db.memory.findIndex((item) => item.source === filePath);
  const item = {
    ...(existingIndex >= 0 ? db.memory[existingIndex] : {}),
    id: cryptoId(),
    type: 'file-import',
    title: path.basename(filePath),
    source: filePath,
    category: guessCategory({ type: 'file-import', source: filePath, title: path.basename(filePath) }),
    tags: existingIndex >= 0 ? (db.memory[existingIndex].tags || []) : [],
    content: content.slice(0, 120000),
    createdAt: existingIndex >= 0 ? db.memory[existingIndex].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) {
    db.memory.splice(existingIndex, 1);
  }
  db.memory.unshift(item);
  writeDb(db);
  return item;
}

async function saveResultToMemory(result) {
  const source = String(result?.path || result?.source || '').trim();
  if (!source) throw new Error('没有可收藏的来源。');
  if (fs.existsSync(source)) {
    return importFile(source);
  }

  const db = readDb();
  const existingIndex = db.memory.findIndex((item) => item.source === source);
  const title = String(result?.title || source).trim() || source;
  const content = String(result?.content || result?.detail || source).slice(0, 120000);
  const item = {
    ...(existingIndex >= 0 ? db.memory[existingIndex] : {}),
    id: cryptoId(),
    type: /^https?:\/\//i.test(source) ? 'website' : 'saved-result',
    title,
    source,
    category: /^https?:\/\//i.test(source) ? '网站' : '收藏',
    tags: existingIndex >= 0 ? (db.memory[existingIndex].tags || []) : ['收藏'],
    content,
    createdAt: existingIndex >= 0 ? db.memory[existingIndex].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) {
    db.memory.splice(existingIndex, 1);
  }
  db.memory.unshift(item);
  writeDb(db);
  return item;
}

app.whenReady().then(() => {
  ensureDataFile();
  if (IS_SELF_CHECK) {
    runSelfCheck()
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
        fs.writeFileSync(path.join(DATA_DIR, 'self-check-result.json'), JSON.stringify(result, null, 2), 'utf8');
        app.quit();
      })
      .catch((error) => {
        console.error(error);
        app.exit(1);
      });
    return;
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

async function runSelfCheck() {
  const web = await searchWebResults('DustySearch test');
  const db = readDb();
  const selfCheckDir = path.join(DATA_DIR, 'self-check');
  fs.mkdirSync(selfCheckDir, { recursive: true });
  const workbookPath = path.join(selfCheckDir, 'self-check.xlsx');
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['key', 'value'], ['marker', 'DustySearchUniqueExcelText']]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  XLSX.writeFile(workbook, workbookPath);
  const workbookText = await getCachedDocumentText(workbookPath);
  const originalFolders = db.settings.searchFolders;
  let localName = [];
  let contentOnly = [];
  let memoryOnly = [];
  let memoryMetaWorks = false;
  let memoryDedupeWorks = false;
  let backupWorks = false;
  let csvExportWorks = false;
  let failureListWorks = false;
  let saveResultWorks = false;
  let cancelSearchWorks = false;
  let dataHealthWorks = false;
  let memoryCenterWorks = false;
  let professionalResultsWork = false;
  try {
    db.settings.searchFolders = Array.from(new Set([...originalFolders, selfCheckDir]));
    writeDb(db);
    localName = await searchFiles('self-check.xlsx', 'name');
    contentOnly = await searchFiles('DustySearchUniqueExcelText', 'content');
    memoryOnly = searchMemory('DustySearchUniqueExcelText');
    const beforeMemoryCount = readDb().memory.length;
    await importFile(workbookPath);
    await importFile(workbookPath);
    const withImport = readDb();
    const imported = withImport.memory.filter((item) => item.source === workbookPath);
    memoryDedupeWorks = imported.length === 1 && withImport.memory.length === beforeMemoryCount + 1;
    await saveResultToMemory({
      title: 'DustySearch Saved Result Check',
      source: 'https://example.com/dustysearch-saved-result-check',
      content: 'DustySearchSavedResultMarker'
    });
    saveResultWorks = readDb().memory.some((item) => item.source === 'https://example.com/dustysearch-saved-result-check');
    const importedItem = imported[0];
    importedItem.category = '自检';
    importedItem.tags = ['测试', '索引'];
    writeDb(withImport);
    const updated = readDb().memory.find((item) => item.source === workbookPath);
    memoryMetaWorks = updated?.category === '自检' && updated.tags?.includes('测试');
    const backupPath = createBackup('self-check');
    backupWorks = fs.existsSync(path.join(backupPath, 'memory.json'))
      && fs.existsSync(path.join(backupPath, 'backup-info.json'));
    csvExportWorks = memoryToCsv(readDb().memory).startsWith('title,source,type,category,tags,createdAt,updatedAt');
    const brokenDocxPath = path.join(selfCheckDir, 'broken-self-check.docx');
    fs.writeFileSync(brokenDocxPath, 'not a real docx', 'utf8');
    await extractDocumentText(brokenDocxPath);
    failureListWorks = readFailures().some((item) => item.path === brokenDocxPath);
    const cancelCheckId = `self-check-cancel-${Date.now()}`;
    cancelSearch(cancelCheckId);
    try {
      await searchFiles('DustySearchUniqueExcelText', 'content', cancelCheckId);
    } catch (error) {
      cancelSearchWorks = error?.code === 'SEARCH_CANCELLED';
    } finally {
      clearSearch(cancelCheckId);
    }
    const dataHealth = getDataHealth();
    dataHealthWorks = dataHealth.folders.total > 0
      && dataHealth.readableTypes.documents.includes('.pdf')
      && Array.isArray(dataHealth.recommendations);
    const memorySummary = getMemorySummary(readDb().memory);
    memoryCenterWorks = memorySummary.typeCounts.file >= 1
      && memorySummary.typeCounts.website >= 1
      && memorySummary.recentCount >= 1;
    const resultBuckets = [
      ...contentOnly.map((item) => ({ ...item, bucket: '正文结果' })),
      ...memoryOnly.map((item) => ({ ...item, bucket: '记忆库' })),
      ...web.map((item) => ({ ...item, bucket: '网页摘要' }))
    ];
    professionalResultsWork = resultBuckets.some((item) => item.bucket === '正文结果' && item.score > 0)
      && resultBuckets.some((item) => item.bucket === '网页摘要')
      && resultBuckets.every((item) => typeof item.title === 'string');
  } finally {
    const restored = readDb();
    restored.settings.searchFolders = originalFolders;
    restored.history = (restored.history || []).filter((item) => !looksMojibake(item.query));
    restored.memory = (restored.memory || []).filter((item) => item.source !== workbookPath);
    restored.memory = (restored.memory || []).filter((item) => item.source !== 'https://example.com/dustysearch-saved-result-check');
    writeDb(restored);
    writeFailures(readFailures().filter((item) => !String(item.path || '').includes('broken-self-check.docx')));
  }
  await rebuildLocalIndex();
  const restoredDb = readDb();
  const localIndex = readLocalIndex();
  return {
    ok: true,
    webCount: web.length,
    hasWebSource: web.some((item) => /^https?:\/\//.test(item.source)),
    documentTextMatch: workbookText.includes('DustySearchUniqueExcelText'),
    localNameModeWorks: Array.isArray(localName),
    contentModeWorks: contentOnly.some((item) => item.path === workbookPath),
    memoryModeWorks: Array.isArray(memoryOnly),
    memoryDedupeWorks,
    memoryMetaWorks,
    backupWorks,
    csvExportWorks,
    failureListWorks,
    saveResultWorks,
    cancelSearchWorks,
    dataHealthWorks,
    memoryCenterWorks,
    professionalResultsWork,
    localIndexWorks: Boolean(localIndex && localIndex.itemCount > 0),
    searchFolders: restoredDb.settings.searchFolders.length,
    appInfoWorks: getAppInfo().name === APP_NAME && fs.existsSync(getAppInfo().appPath),
    indexCachePath: INDEX_CACHE_PATH
  };
}

app.on('second-instance', () => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  logLine('uncaught exception', error.stack || error.message || String(error));
});

process.on('unhandledRejection', (error) => {
  logLine('unhandled rejection', error?.stack || error?.message || String(error));
});

ipcMain.handle('app:getState', () => {
  const db = readDb();
  const localIndex = readLocalIndex();
  const failures = readFailures();
  return {
    appInfo: getAppInfo(),
    dataDir: DATA_DIR,
    dbPath: DB_PATH,
    logPath: LOG_PATH,
    dataHealth: getDataHealth(),
    localIndex: localIndex ? {
      builtAt: localIndex.builtAt,
      itemCount: localIndex.itemCount || 0
    } : null,
    settings: db.settings,
    history: db.history,
    memory: db.memory,
    memorySummary: getMemorySummary(db.memory),
    failures
  };
});

ipcMain.handle('search:all', async (_event, query) => {
  const { query: cleanQuery, searchId } = readSearchRequest(query);
  if (!cleanQuery) return emptySearchResult();
  clearSearch(searchId);
  try {
    const [local, memory, web] = await Promise.all([
      searchLocal(cleanQuery, searchId),
      Promise.resolve(searchMemory(cleanQuery, searchId)),
      searchWebResults(cleanQuery, searchId)
    ]);
    assertSearchActive(searchId);
    saveHistory(cleanQuery, 'all', local.length + memory.length + web.length);
    return { local, memory, web, webUrl: getWebUrl(cleanQuery) };
  } catch (error) {
    if (error?.code === 'SEARCH_CANCELLED') return { ...emptySearchResult(), cancelled: true };
    throw error;
  } finally {
    clearSearch(searchId);
  }
});

ipcMain.handle('search:localName', async (_event, query) => {
  const { query: cleanQuery, searchId } = readSearchRequest(query);
  if (!cleanQuery) return emptySearchResult();
  clearSearch(searchId);
  try {
    const local = await searchFiles(cleanQuery, 'name', searchId);
    assertSearchActive(searchId);
    saveHistory(cleanQuery, 'localName', local.length);
    return { local, memory: [], web: [], webUrl: '' };
  } catch (error) {
    if (error?.code === 'SEARCH_CANCELLED') return { ...emptySearchResult(), cancelled: true };
    throw error;
  } finally {
    clearSearch(searchId);
  }
});

ipcMain.handle('search:content', async (_event, query) => {
  const { query: cleanQuery, searchId } = readSearchRequest(query);
  if (!cleanQuery) return emptySearchResult();
  clearSearch(searchId);
  try {
    const local = await searchFiles(cleanQuery, 'content', searchId);
    assertSearchActive(searchId);
    saveHistory(cleanQuery, 'content', local.length);
    return { local, memory: [], web: [], webUrl: '' };
  } catch (error) {
    if (error?.code === 'SEARCH_CANCELLED') return { ...emptySearchResult(), cancelled: true };
    throw error;
  } finally {
    clearSearch(searchId);
  }
});

ipcMain.handle('search:memory', async (_event, query) => {
  const { query: cleanQuery, searchId } = readSearchRequest(query);
  if (!cleanQuery) return emptySearchResult();
  clearSearch(searchId);
  try {
    const memory = searchMemory(cleanQuery, searchId);
    assertSearchActive(searchId);
    saveHistory(cleanQuery, 'memory', memory.length);
    return { local: [], memory, web: [], webUrl: '' };
  } catch (error) {
    if (error?.code === 'SEARCH_CANCELLED') return { ...emptySearchResult(), cancelled: true };
    throw error;
  } finally {
    clearSearch(searchId);
  }
});

ipcMain.handle('search:webResults', async (_event, query) => {
  const { query: cleanQuery, searchId } = readSearchRequest(query);
  if (!cleanQuery) return emptySearchResult();
  clearSearch(searchId);
  try {
    const web = await searchWebResults(cleanQuery, searchId);
    assertSearchActive(searchId);
    saveHistory(cleanQuery, 'webResults', web.length);
    return { local: [], memory: [], web, webUrl: getWebUrl(cleanQuery) };
  } catch (error) {
    if (error?.code === 'SEARCH_CANCELLED') return { ...emptySearchResult(), cancelled: true };
    throw error;
  } finally {
    clearSearch(searchId);
  }
});

ipcMain.handle('search:cancel', (_event, searchId) => {
  cancelSearch(searchId);
  return { cancelled: true };
});

ipcMain.handle('search:web', (_event, query) => {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return '';
  saveHistory(cleanQuery, 'web', 1);
  const url = getWebUrl(cleanQuery);
  shell.openExternal(url);
  return url;
});

ipcMain.handle('index:rebuild', async () => {
  const index = await rebuildLocalIndex();
  return {
    builtAt: index.builtAt,
    itemCount: index.itemCount,
    roots: index.roots
  };
});

ipcMain.handle('item:open', (_event, targetPath) => {
  if (/^https?:\/\//i.test(String(targetPath || ''))) {
    shell.openExternal(targetPath);
    return true;
  }
  return shell.openPath(targetPath);
});

ipcMain.handle('item:show', (_event, targetPath) => {
  shell.showItemInFolder(targetPath);
  return true;
});

ipcMain.handle('text:copy', (_event, text) => {
  clipboard.writeText(String(text || ''));
  return true;
});

ipcMain.handle('folder:pick', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? '' : result.filePaths[0];
});

ipcMain.handle('file:pickImport', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '常用文件', extensions: ['txt', 'md', 'pdf', 'docx', 'xlsx', 'xls', 'csv', 'html', 'json'] },
      { name: '全部文件', extensions: ['*'] }
    ]
  });
  if (result.canceled) return [];
  const imported = [];
  for (const filePath of result.filePaths) {
    imported.push(await importFile(filePath));
  }
  return imported;
});

ipcMain.handle('site:import', async (_event, rawUrl) => {
  const url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('请输入 http 或 https 开头的网址');
  const page = await fetchWebsite(url);
  const db = readDb();
  const existingIndex = db.memory.findIndex((item) => item.source === url);
  const item = {
    ...(existingIndex >= 0 ? db.memory[existingIndex] : {}),
    id: cryptoId(),
    type: 'website',
    title: page.title,
    source: url,
    category: '网站',
    tags: existingIndex >= 0 ? (db.memory[existingIndex].tags || []) : [],
    content: page.text,
    createdAt: existingIndex >= 0 ? db.memory[existingIndex].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) {
    db.memory.splice(existingIndex, 1);
  }
  db.memory.unshift(item);
  writeDb(db);
  return item;
});

ipcMain.handle('settings:save', (_event, settings) => {
  const db = readDb();
  db.settings = {
    ...db.settings,
    ...settings,
    searchFolders: Array.isArray(settings.searchFolders) ? settings.searchFolders : db.settings.searchFolders,
    includeContent: Boolean(settings.includeContent),
    webEngine: ['bing', 'google', 'duckduckgo'].includes(settings.webEngine) ? settings.webEngine : 'bing',
    maxResults: Math.max(10, Math.min(300, Number(settings.maxResults || db.settings.maxResults || 80)))
  };
  writeDb(db);
  return db.settings;
});

ipcMain.handle('memory:delete', (_event, id) => {
  const db = readDb();
  db.memory = (db.memory || []).filter((item) => item.id !== id);
  writeDb(db);
  return db.memory;
});

ipcMain.handle('memory:updateMeta', (_event, payload) => {
  const db = readDb();
  const item = db.memory.find((entry) => entry.id === payload.id);
  if (!item) return db.memory;
  item.category = String(payload.category || item.category || '其他').trim() || '其他';
  item.tags = String(payload.tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
  item.updatedAt = new Date().toISOString();
  writeDb(db);
  return db.memory;
});

ipcMain.handle('memory:saveResult', async (_event, result) => {
  return saveResultToMemory(result);
});

ipcMain.handle('history:clear', () => {
  const db = readDb();
  db.history = [];
  writeDb(db);
  return [];
});

ipcMain.handle('data:openDir', () => {
  shell.openPath(DATA_DIR);
  return DATA_DIR;
});

ipcMain.handle('app:openInstallDir', () => {
  const appPath = app.getAppPath();
  shell.openPath(appPath);
  return appPath;
});

ipcMain.handle('failures:clear', () => {
  writeFailures([]);
  return [];
});

ipcMain.handle('backup:create', () => {
  const backupPath = createBackup('manual');
  return { backupPath };
});

ipcMain.handle('backup:restore', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 DustySearch 备份文件夹',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return { restored: false };
  restoreBackup(result.filePaths[0]);
  return { restored: true, backupPath: result.filePaths[0] };
});

ipcMain.handle('backup:exportMemory', async (_event, format) => {
  const db = readDb();
  const safeFormat = format === 'csv' ? 'csv' : 'json';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出记忆库',
    defaultPath: path.join(app.getPath('desktop'), `DustySearch-memory-${timestampName()}.${safeFormat}`),
    filters: safeFormat === 'csv'
      ? [{ name: 'CSV 表格', extensions: ['csv'] }]
      : [{ name: 'JSON 文件', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { exported: false };
  const content = safeFormat === 'csv'
    ? memoryToCsv(db.memory)
    : JSON.stringify({ exportedAt: new Date().toISOString(), memory: db.memory }, null, 2);
  fs.writeFileSync(result.filePath, content, 'utf8');
  return { exported: true, filePath: result.filePath };
});

ipcMain.handle('dev:selfCheck', async () => {
  if (!process.env.DUSTYSEARCH_SELF_CHECK) return { ok: false, reason: 'self check disabled' };
  const web = await searchWebResults('DustySearch test');
  return {
    ok: true,
    webCount: web.length,
    firstWebTitle: web[0]?.title || '',
    cachePath: INDEX_CACHE_PATH
  };
});
