const { ipcRenderer } = require('electron');

window.videosorter = {
  getDatabaseMeta: () => ipcRenderer.invoke('database:get-meta'),
  getLibrarySnapshot: () => ipcRenderer.invoke('library:get-snapshot'),
  createVirtualFolder: (name) => ipcRenderer.invoke('library:create-folder', name),
  toggleVideoFolder: (videoId, folderId) =>
    ipcRenderer.invoke('library:toggle-video-folder', videoId, folderId),
  scanDirectory: (filterOptions) => ipcRenderer.invoke('library:scan-directory', filterOptions),
  onScanProgress: (callback: (progress: any) => void) => {
    const listener = (_event: any, progress: any) => callback(progress);
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
  tmdbSetConfig: (apiKey: string) => ipcRenderer.invoke('tmdb:set-config', apiKey),
  tmdbScrapeVideo: (videoId: number) => ipcRenderer.invoke('tmdb:scrape-video', videoId),
  tmdbScrapeAll: () => ipcRenderer.invoke('tmdb:scrape-all'),
  onTMDBScrapeProgress: (callback: (progress: any) => void) => {
    const listener = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('tmdb:scrape:progress', listener);
    return () => ipcRenderer.removeListener('tmdb:scrape:progress', listener);
  },
  // Database selection
  dbScanForDatabases: () => ipcRenderer.invoke('db:scan-for-databases'),
  dbSelectDatabase: (databasePath: string) => ipcRenderer.invoke('db:select-database', databasePath),
  dbGetCurrentPath: () => ipcRenderer.invoke('db:get-current-path'),
};

window.winControls = {
  minimize: () => ipcRenderer.invoke('win:minimize'),
  close: () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
};
