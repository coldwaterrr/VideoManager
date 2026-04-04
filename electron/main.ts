import { app, BrowserWindow, dialog, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// userData 路径: 项目根目录下的 .videosorter
const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)

const isDev = !app.isPackaged

if (isDev) {
  process.env.APP_ROOT = path.join(path.dirname(__filename), '..')
  app.setPath('userData', path.join(process.env.APP_ROOT, '.videosorter'))
} else {
  // 在打包环境中，userData 放在可执行文件所在目录
  const exeDir = path.dirname(process.execPath)
  process.env.APP_ROOT = exeDir
  app.setPath('userData', path.join(exeDir, '.videosorter'))
}

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
// 渲染层文件路径：生产环境中在 app.asar 内部，需要通过 app.getAppPath() 获取
export const RENDERER_DIST = isDev
  ? path.join(process.env.APP_ROOT, 'dist')
  : path.join(app.getAppPath(), 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

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
  getCurrentDatabasePath,
  loadDatabaseAtPath,
} from './database'
import {
  getTMDBConfig,
  setTMDBConfig,
  scrapeVideoMetadata,
} from './tmdb'

let win: BrowserWindow | null

function createWindow() {
  try {
    console.log('--- CREATING BROWSER WINDOW ---')
    console.log('VITE_PUBLIC:', process.env.VITE_PUBLIC)

    win = new BrowserWindow({
      title: 'VideoSorter',
      width: 1440,
      height: 920,
      minWidth: 1180,
      minHeight: 760,
      frame: false,
      icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
      backgroundColor: '#09090b',
      resizable: true,
      webPreferences: {
        preload: path.join(path.dirname(__filename), 'preload.cjs'),
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
  const currentPath = getCurrentDatabasePath()
  const meta = getDatabaseMeta()
  if (currentPath) {
    return { ...meta, databasePath: currentPath }
  }
  return meta
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

  const beforeCount = db.exec('SELECT COUNT(*) FROM videos')[0]?.values?.[0]?.[0] ?? 0

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
  return { deletedCount: Number(beforeCount) - Number(db.exec('SELECT COUNT(*) FROM videos')[0]?.values?.[0]?.[0] ?? 0), snapshot: await getLibrarySnapshot() }
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
  const placeholders = ids.map(() => '?').join(',')
  db.run('BEGIN TRANSACTION')
  try {
    db.run(`DELETE FROM virtual_folder_videos WHERE video_id IN (${placeholders})`, ids)
    db.run(`DELETE FROM videos WHERE id IN (${placeholders})`, ids)
    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
  await persistDatabase(db, meta.databasePath)
  return { deletedCount: ids.length, snapshot: await getLibrarySnapshot() }
})

// ========== TMDB IPC 处理器 ==========
ipcMain.handle('tmdb:get-config', async () => {
  return getTMDBConfig()
})

ipcMain.handle('tmdb:set-config', async (_event, apiKey: string) => {
  await setTMDBConfig(apiKey)
  return { success: true }
})

ipcMain.handle('tmdb:scrape-video', async (_event, videoId: number) => {
  const { database: db } = getDatabaseHandle()
  const rows = db.exec(`SELECT file_name FROM videos WHERE id = ?`, [videoId])
  if (!rows.length || !rows[0].values.length) {
    return { success: false, message: '视频不存在' }
  }
  const fileName = rows[0].values[0][0] as string
  return scrapeVideoMetadata(videoId, fileName)
})

ipcMain.handle('tmdb:scrape-all', async () => {
  await ensureDatabase()
  const { database: db } = getDatabaseHandle()
  const config = await getTMDBConfig()
  if (!config.apiKey) {
    return { success: false, message: '请先配置 TMDB API Key', total: 0, scraped: 0 }
  }

  const results = db.exec(`
    SELECT id, file_name, title, scraped_at
    FROM videos
    WHERE tmdb_id IS NULL OR title IS NULL
    ORDER BY updated_at DESC
  `)

  if (!results.length || results[0].values.length === 0) {
    return { success: true, message: '所有视频都已刮削', total: 0, scraped: 0 }
  }

  const videoIds = results[0].values as [number, string, string | null, string | null][]
  const total = videoIds.length
  let scraped = 0

  for (const [id, fileName] of videoIds) {
    const result = await scrapeVideoMetadata(id, fileName)
    scraped++
    if (win) {
      win.webContents.send('tmdb:scrape-progress', { scraped, total, success: result.success, message: result.message })
    }
  }

  return { success: true, message: `刮削完成: ${scraped}/${total}`, total, scraped }
})

// ========== 数据库选择 IPC 处理器 ==========
async function scanDirForDB(dir: string, depth = 0, maxDepth = 3): Promise<Array<{ path: string; size: number }>> {
  const results: Array<{ path: string; size: number }> = []
  if (depth > maxDepth) return results
  const fs = require('fs')

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        results.push(...await scanDirForDB(fullPath, depth + 1, maxDepth))
      } else if (entry.isFile() && /\.(sqlite|sqlite3|db)$/.test(entry.name.toLowerCase())) {
        const stats = fs.statSync(fullPath)
        results.push({ path: fullPath, size: stats.size })
      }
    }
  } catch {
    // 忽略权限错误等
  }
  return results
}

ipcMain.handle('db:scan-for-databases', async () => {
  const scanDirs: string[] = []
  const baseDir = path.join(process.env.APP_ROOT, '..', '..')
  scanDirs.push(baseDir)
  scanDirs.push(app.getPath('userData'))
  const releaseDir = path.join(baseDir, 'release-v5')
  if (require('fs').existsSync(releaseDir)) {
    scanDirs.push(releaseDir)
  }

  const seen = new Set<string>()
  const allDatabases: Array<{ path: string; size: number }> = []

  for (const dir of scanDirs) {
    const found = await scanDirForDB(dir)
    for (const db of found) {
      if (!seen.has(db.path)) {
        seen.add(db.path)
        allDatabases.push(db)
      }
    }
  }

  allDatabases.sort((a, b) => b.size - a.size)
  return allDatabases
})

ipcMain.handle('db:select-database', async (_event, databasePath: string) => {
  return loadDatabaseAtPath(databasePath)
})

ipcMain.handle('db:get-current-path', async () => {
  return getCurrentDatabasePath()
})

// ========== 窗口控制 ==========
ipcMain.handle('win:minimize', () => {
  win?.hide()
})

ipcMain.handle('win:close', () => {
  win?.destroy()
  app.quit()
})

ipcMain.handle('win:isMaximized', () => win?.isMaximized())

ipcMain.handle('win:maximize', () => {
  win?.isMaximized() ? win?.unmaximize() : win?.maximize()
})

// ========== 系统托盘 ==========
function getTrayIconPath() {
  const publicIcon = path.join(process.env.VITE_PUBLIC || '', 'electron-vite.ico')
  const fs = require('fs')
  if (fs.existsSync(publicIcon)) {
    return publicIcon
  }
  const distIcon = path.join(process.env.APP_ROOT || '', 'dist', 'electron-vite.ico')
  if (fs.existsSync(distIcon)) {
    return distIcon
  }
  return ''
}

let tray: Tray | null = null

function createTray() {
  try {
    let icon: Electron.NativeImage
    const iconPath = getTrayIconPath()
    const fs = require('fs')
    if (iconPath && fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath)
    } else {
      icon = nativeImage.createEmpty()
    }

    tray = new Tray(icon)
    tray.setToolTip('VideoSorter - 本地视频管理')

    tray.on('click', () => {
      win?.show()
      win?.focus()
    })

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '打开',
        click: () => {
          win?.show()
          win?.focus()
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          win?.destroy()
          app.quit()
        },
      },
    ])
    tray.setContextMenu(contextMenu)
  } catch (e) {
    console.error('Failed to create tray:', e)
  }
}

function setupWindowBehaviors() {
  if (!win) return
  win.on('minimize', (e: Electron.Event) => {
    e.preventDefault()
    win?.hide()
  })
}

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
    await ensureDatabase()
    createWindow()
    setupWindowBehaviors()
    createTray()
  } catch (error) {
    if (!win) {
      win = new BrowserWindow({
        width: 700,
        height: 400,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
      })
    }
    win.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <body style="background:#1a1a2e;color:#eee;font-family:monospace;padding:40px">
        <h2 style="color:#ff6b6b">启动失败</h2>
        <pre style="background:#222;padding:16px;border-radius:8px;overflow:auto;max-height:240px">${String((error as Error)?.stack || error)}</pre>
        <p style="color:#888">请检查此错误并重新启动应用。</p>
      </body>
    `))
  }
})
