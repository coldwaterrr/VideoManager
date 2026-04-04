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
};
