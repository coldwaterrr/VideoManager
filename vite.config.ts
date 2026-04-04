import path from 'node:path'
import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'

// @ts-ignore - electron plugin types don't match
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        // 主进程入口
        entry: 'electron/main.ts',
        // 输出目录
        outDir: 'dist-electron',
        // 格式：ES 模块，但需要 __dirname polyfill
        format: 'es',
        nodeIntegration: true,
        contextIsolation: false,
        vite: {
          build: {
            rollupOptions: {
              external: ['sql.js'], // 将 sql.js 排除在构建之外
            },
          },
        },
      },
    ]),
    {
      name: 'copy-preload',
      closeBundle() {
        const outDir = path.resolve(__dirname, 'dist-electron');
        fs.mkdirSync(outDir, { recursive: true });
        const preloadContent = `const { ipcRenderer } = require('electron');

window.videosorter = {
  getDatabaseMeta: () => ipcRenderer.invoke('database:get-meta'),
  getLibrarySnapshot: () => ipcRenderer.invoke('library:get-snapshot'),
  createVirtualFolder: (name) => ipcRenderer.invoke('library:create-folder', name),
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
};

window.winControls = {
  minimize: () => ipcRenderer.invoke('win:minimize'),
  close: () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
};
`;
        fs.writeFileSync(path.resolve(outDir, 'preload.cjs'), preloadContent);
      },
    },
  ],
})
