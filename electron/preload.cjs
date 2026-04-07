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
  // MPV Player
  mpvLaunch: (filePath, config) => ipcRenderer.invoke('mpv:launch', filePath, config),
  mpvLoadFile: (filePath, mode) => ipcRenderer.invoke('mpv:loadfile', filePath, mode),
  mpvCommand: (cmd) => ipcRenderer.invoke('mpv:command', cmd),
  mpvTerminate: () => ipcRenderer.invoke('mpv:terminate'),
  mpvGetConfig: () => ipcRenderer.invoke('mpv:get-config'),
  mpvSaveConfig: (config) => ipcRenderer.invoke('mpv:save-config', config),
  mpvCheckAvailable: () => ipcRenderer.invoke('mpv:check-available'),
  onMpvEnd: (callback) => {
    const l = () => callback()
    ipcRenderer.on('mpv:ended', l)
    return () => ipcRenderer.removeListener('mpv:ended', l)
  },
  // Player selection
  playerGetConfig: () => ipcRenderer.invoke('player:get-config'),
  playerSaveConfig: (config) => ipcRenderer.invoke('player:save-config', config),
  // Auto Update
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onUpdateChecking: (callback) => {
    const l = () => callback();
    ipcRenderer.on('update:checking', l);
    return () => ipcRenderer.removeListener('update:checking', l);
  },
  onUpdateAvailable: (callback) => {
    const l = (_e, info) => callback(info);
    ipcRenderer.on('update:available', l);
    return () => ipcRenderer.removeListener('update:available', l);
  },
  onUpdateNotAvailable: (callback) => {
    const l = () => callback();
    ipcRenderer.on('update:not-available', l);
    return () => ipcRenderer.removeListener('update:not-available', l);
  },
  onUpdateError: (callback) => {
    const l = (_e, msg) => callback(msg);
    ipcRenderer.on('update:error', l);
    return () => ipcRenderer.removeListener('update:error', l);
  },
  onUpdateProgress: (callback) => {
    const l = (_e, p) => callback(p);
    ipcRenderer.on('update:progress', l);
    return () => ipcRenderer.removeListener('update:progress', l);
  },
  onUpdateDownloaded: (callback) => {
    const l = (_e, info) => callback(info);
    ipcRenderer.on('update:downloaded', l);
    return () => ipcRenderer.removeListener('update:downloaded', l);
  },
};

window.winControls = {
  minimize: () => ipcRenderer.invoke('win:minimize'),
  close: () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
};
