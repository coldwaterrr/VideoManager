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
        // 格式：使用 ES 模块
        format: 'es',
        // 配置 Node 内置模块
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
};
`;
        fs.writeFileSync(path.resolve(__dirname, 'dist-electron/preload.cjs'), preloadContent);
      },
    },
  ],
})
