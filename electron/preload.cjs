const { ipcRenderer } = require('electron');

window.videosorter = {
  getDatabaseMeta: () => ipcRenderer.invoke('database:get-meta'),
  getLibrarySnapshot: () => ipcRenderer.invoke('library:get-snapshot'),
  createVirtualFolder: (name) => ipcRenderer.invoke('library:create-folder', name),
  deleteVirtualFolder: (folderId) => ipcRenderer.invoke('library:delete-folder', folderId),
  toggleVideoFolder: (videoId, folderId) =>
    ipcRenderer.invoke('library:toggle-video-folder', videoId, folderId),
  scanDirectory: (filterOptions) => ipcRenderer.invoke('library:scan-directory', filterOptions),
  onScanProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('scan:progress', listener);
    return () => ipcRenderer.removeListener('scan:progress', listener);
  },
  cleanupUnsupported: () => ipcRenderer.invoke('library:cleanup-unsupported'),
  openVideo: (filePath) => ipcRenderer.invoke('video:open', filePath),
  getVideoThumbnail: (filePath) => ipcRenderer.invoke('video:get-thumbnail', filePath),
  deleteVideos: (videoIds) => ipcRenderer.invoke('videos:delete', videoIds),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  // TMDB
  tmdbGetConfig: () => ipcRenderer.invoke('tmdb:get-config'),
  tmdbSetConfig: (apiKey) => ipcRenderer.invoke('tmdb:set-config', apiKey),
  tmdbScrapeVideo: (videoId) => ipcRenderer.invoke('tmdb:scrape-video', videoId),
  tmdbScrapeAll: () => ipcRenderer.invoke('tmdb:scrape-all'),
  onTMDBScrapeProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('tmdb:scrape:progress', listener);
    return () => ipcRenderer.removeListener('tmdb:scrape:progress', listener);
  },
  // Database selection
  dbScanForDatabases: () => ipcRenderer.invoke('db:scan-for-databases'),
  dbSelectDatabase: (databasePath) => ipcRenderer.invoke('db:select-database', databasePath),
  dbGetCurrentPath: () => ipcRenderer.invoke('db:get-current-path'),
  // AI Classification
  aiGetConfig: () => ipcRenderer.invoke('ai:get-config'),
  aiSaveConfig: (config) => ipcRenderer.invoke('ai:save-config', config),
  aiTestConnection: (config) => ipcRenderer.invoke('ai:test-connection', config),
  aiClassifyStream: (rule, config) => ipcRenderer.invoke('ai:classify-stream', rule, config),
  onAiChunk: (callback) => {
    const listener = (_event, chunk) => callback(chunk);
    ipcRenderer.on('ai:chunk', listener);
    return () => ipcRenderer.removeListener('ai:chunk', listener);
  },
  aiApply: (folders) => ipcRenderer.invoke('ai:apply', folders),
};

window.winControls = {
  minimize: () => ipcRenderer.invoke('win:minimize'),
  close: () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
};
