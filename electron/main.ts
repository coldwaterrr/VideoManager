import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

console.log('--- ELECTRON MAIN PROCESS STARTING ---')

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error)
})

process.on('unhandledRejection', (error) => {
  console.error('UNHANDLED REJECTION:', error)
})

import {
  createVirtualFolder,
  ensureDatabase,
  getDatabaseHandle,
  getDatabaseMeta,
  getLibrarySnapshot,
  persistDatabase,
  scanVideosFromDirectory,
  toggleVideoFolder,
  type ScanProgressCallback,
} from './database'

const require = createRequire(import.meta.url)

// 获取当前文件所在目录（ES 模块兼容）
const __filename = fileURLToPath(import.meta.url)
const APP_DIR = path.dirname(__filename)

process.env.APP_ROOT = path.join(APP_DIR, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST
app.setPath('userData', path.join(process.env.APP_ROOT, '.videosorter'))

let win: BrowserWindow | null

function createWindow() {
  try {
    console.log('--- CREATING BROWSER WINDOW ---')
    console.log('VITE_PUBLIC:', process.env.VITE_PUBLIC)
    console.log('APP_DIR:', APP_DIR)
    
    win = new BrowserWindow({
      title: 'VideoSorter',
      width: 1440,
      height: 920,
      minWidth: 1180,
      minHeight: 760,
      icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
      backgroundColor: '#09090b',
      webPreferences: {
        preload: path.join(APP_DIR, 'preload.cjs'),
        contextIsolation: false,
        nodeIntegration: true,
      },
    })

    console.log('--- WINDOW CREATED, LOADING URL ---')
    if (VITE_DEV_SERVER_URL) {
      console.log('Loading VITE_DEV_SERVER_URL:', VITE_DEV_SERVER_URL)
      win.loadURL(VITE_DEV_SERVER_URL)
    } else {
      console.log('Loading index.html from:', RENDERER_DIST)
      win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }
  } catch (error) {
    console.error('--- ERROR CREATING WINDOW ---', error)
  }
}

ipcMain.handle('database:get-meta', async () => {
  return getDatabaseMeta()
})

ipcMain.handle('library:get-snapshot', async () => {
  return getLibrarySnapshot()
})

ipcMain.handle('library:create-folder', async (_event, name: string) => {
  return createVirtualFolder(name)
})

ipcMain.handle('library:toggle-video-folder', async (_event, videoId: number, folderId: number) => {
  return toggleVideoFolder(videoId, folderId)
})

ipcMain.handle('library:scan-directory', async (_event, filterOptions?: ScanFilterOptions) => {
  const result = win
    ? await dialog.showOpenDialog(win, {
        title: '选择要扫描的视频目录',
        properties: ['openDirectory'],
      })
    : await dialog.showOpenDialog({
        title: '选择要扫描的视频目录',
        properties: ['openDirectory'],
      })

  if (result.canceled || result.filePaths.length === 0) {
    return {
      cancelled: true,
      snapshot: await getLibrarySnapshot(),
    }
  }

  const onProgress: ScanProgressCallback = (progress) => {
    if (win) {
      win.webContents.send('scan:progress', progress)
    }
  }

  return {
    cancelled: false,
    snapshot: await scanVideosFromDirectory(result.filePaths[0], onProgress, filterOptions),
  }
})

// 清理不支持的视频格式记录
ipcMain.handle('library:cleanup-unsupported', async () => {
  await ensureDatabase()
  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  const unsupportedExtensions = ['.webm', '.m4v', '.flv', '.ts', '.mts', '.m2ts', '.mpeg', '.mpg']
  db.run('BEGIN TRANSACTION')
  try {
    for (const ext of unsupportedExtensions) {
      db.run('DELETE FROM videos WHERE absolute_path LIKE ?', [`%${ext}`])
    }
    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
  await persistDatabase(db, meta.databasePath)
  return { deletedCount: 0, snapshot: await getLibrarySnapshot() }
})

// 用默认播放器打开视频
ipcMain.handle('video:open', async (_event, filePath: string) => {
  const { shell } = require('electron')
  await shell.openPath(filePath)
  return { success: true }
})

// 获取视频缩略图
ipcMain.handle('video:get-thumbnail', async (_event, filePath: string) => {
  try {
    const icon = await app.getFileIcon(filePath, { size: 'large' })
    return { thumbnail: icon.toDataURL() }
  } catch (error) {
    return { thumbnail: null }
  }
})

// 批量删除视频
ipcMain.handle('videos:delete', async (_event, videoIds: number[]) => {
  await ensureDatabase()
  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  const ids = Array.isArray(videoIds) ? videoIds : [videoIds]
  db.run('BEGIN TRANSACTION')
  try {
    db.run('DELETE FROM virtual_folder_videos WHERE video_id IN (' + ids.join(',') + ')')
    db.run('DELETE FROM videos WHERE id IN (' + ids.join(',') + ')')
    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
  await persistDatabase(db, meta.databasePath)
  return { deletedCount: ids.length, snapshot: await getLibrarySnapshot() }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  try {
    console.log('--- APP READY, ENSURING DATABASE ---')
    await ensureDatabase()
    console.log('--- DATABASE READY, CREATING WINDOW ---')
    createWindow()
  } catch (error) {
    console.error('--- ERROR DURING STARTUP ---', error)
  }
})
