const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dustySearch', {
  getState: () => ipcRenderer.invoke('app:getState'),
  searchAll: (query) => ipcRenderer.invoke('search:all', query),
  searchLocalName: (query) => ipcRenderer.invoke('search:localName', query),
  searchContent: (query) => ipcRenderer.invoke('search:content', query),
  searchMemoryOnly: (query) => ipcRenderer.invoke('search:memory', query),
  searchWebResults: (query) => ipcRenderer.invoke('search:webResults', query),
  cancelSearch: (searchId) => ipcRenderer.invoke('search:cancel', searchId),
  searchWeb: (query) => ipcRenderer.invoke('search:web', query),
  rebuildIndex: () => ipcRenderer.invoke('index:rebuild'),
  openItem: (targetPath) => ipcRenderer.invoke('item:open', targetPath),
  showItem: (targetPath) => ipcRenderer.invoke('item:show', targetPath),
  copyText: (text) => ipcRenderer.invoke('text:copy', text),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  pickImportFiles: () => ipcRenderer.invoke('file:pickImport'),
  pickOcrImages: () => ipcRenderer.invoke('file:pickOcrImport'),
  importSite: (url) => ipcRenderer.invoke('site:import', url),
  retryFailure: (failureId) => ipcRenderer.invoke('failure:retry', failureId),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  saveWorkspace: (payload) => ipcRenderer.invoke('workspace:save', payload),
  applyWorkspace: (workspaceId) => ipcRenderer.invoke('workspace:apply', workspaceId),
  deleteWorkspace: (workspaceId) => ipcRenderer.invoke('workspace:delete', workspaceId),
  pickCloudSyncFolder: () => ipcRenderer.invoke('cloud:pickFolder'),
  clearCloudSyncFolder: () => ipcRenderer.invoke('cloud:clearFolder'),
  uploadCloudSync: () => ipcRenderer.invoke('cloud:upload'),
  importCloudSync: () => ipcRenderer.invoke('cloud:import'),
  completeOnboarding: () => ipcRenderer.invoke('onboarding:complete'),
  resetOnboarding: () => ipcRenderer.invoke('onboarding:reset'),
  deleteMemory: (id) => ipcRenderer.invoke('memory:delete', id),
  updateMemoryMeta: (payload) => ipcRenderer.invoke('memory:updateMeta', payload),
  saveResultToMemory: (result) => ipcRenderer.invoke('memory:saveResult', result),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  clearFailures: () => ipcRenderer.invoke('failures:clear'),
  clearDocumentCache: () => ipcRenderer.invoke('privacy:clearDocumentCache'),
  openDataDir: () => ipcRenderer.invoke('data:openDir'),
  openInstallDir: () => ipcRenderer.invoke('app:openInstallDir'),
  openInstallNote: () => ipcRenderer.invoke('app:openInstallNote'),
  runSelfCheckTool: () => ipcRenderer.invoke('app:runSelfCheckTool'),
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),
  exportMemory: (format) => ipcRenderer.invoke('backup:exportMemory', format),
  exportSyncPackage: () => ipcRenderer.invoke('sync:exportPackage'),
  importSyncPackage: () => ipcRenderer.invoke('sync:importPackage'),
  onImportProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('import:progress', handler);
    ipcRenderer.send('import:subscribe');
    return () => {
      ipcRenderer.removeListener('import:progress', handler);
      ipcRenderer.send('import:unsubscribe');
    };
  }
});
