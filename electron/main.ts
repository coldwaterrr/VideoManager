import { app, BrowserWindow, dialog, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { autoUpdater } from 'electron-updater'

// userData 路径: 项目根目录下的 .videosorter
const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)

const isDev = !app.isPackaged

if (isDev) {
  process.env.APP_ROOT = path.join(path.dirname(__filename), '..')
  app.setPath('userData', path.join(process.env.APP_ROOT, '.videosorter'))
} else {
  // 在打包环境中，userData 使用 AppData 目录，避免安装更新时丢失
  // 格式: C:\Users\Username\AppData\Roaming\VideoManager
  const newUserDataPath = path.join(app.getPath('appData'), 'VideoManager')
  app.setPath('userData', newUserDataPath)
  process.env.APP_ROOT = path.dirname(process.execPath)

  // 迁移旧数据：如果 exeDir/.videosorter 存在，移动到 AppData
  const oldUserDataPath = path.join(process.env.APP_ROOT, '.videosorter')
  if (fs.existsSync(oldUserDataPath) && !fs.existsSync(newUserDataPath)) {
    try {
      fs.mkdirSync(newUserDataPath, { recursive: true })
      const items = fs.readdirSync(oldUserDataPath)
      for (const item of items) {
        const src = path.join(oldUserDataPath, item)
        const dest = path.join(newUserDataPath, item)
        fs.cpSync(src, dest, { recursive: true })
      }
      console.log(`[migration] User data migrated from ${oldUserDataPath} to ${newUserDataPath}`)
    } catch (err) {
      console.error('[migration] Failed to migrate user data:', err)
    }
  }
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
  deleteVirtualFolder,
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
import {
  loadAIConfig,
  saveAIConfig,
  testAIConnection,
  aiClassifyVideosStream,
} from './ai'
import { setupMpvIPC, setMpvWindowRef } from './mpv'
import { loadPlayerConfig, savePlayerConfig, type PlayerType } from './player-config'

let win: BrowserWindow | null

function createWindow() {
  try {
    console.log('--- CREATING BROWSER WINDOW ---')
    console.log('VITE_PUBLIC:', process.env.VITE_PUBLIC)

    win = new BrowserWindow({
      title: 'VideoSorter',
      width: 1540,
      height: 920,
      minWidth: 1280,
      minHeight: 760,
      frame: false,
      icon: path.join(process.env.VITE_PUBLIC || '', 'videomanager_icon.png'),
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

ipcMain.handle('library:delete-folder', async (_event, folderId: number) => {
  return deleteVirtualFolder(folderId)
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

// ========== App Config IPC 处理器 ==========
ipcMain.handle('app:get-version', () => {
  return { version: app.getVersion() }
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

ipcMain.handle('tmdb:manual-search', async (_event, query: string) => {
  await ensureDatabase()
  const config = await getTMDBConfig()
  if (!config.apiKey) {
    return []
  }

  const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=zh-CN&api_key=${config.apiKey}`
  const resp = await fetch(url)
  if (!resp.ok) {
    return []
  }
  const data = await resp.json()
  return (data.results || []).filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 10)
})

ipcMain.handle('tmdb:manual-scrape', async (_event, videoId: number, result: any) => {
  await ensureDatabase()
  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  const now = new Date().toISOString()

  db.run(
    `UPDATE videos SET
      tmdb_id = ?, media_type = ?, title = ?, original_title = ?,
      overview = ?, poster_path = ?, backdrop_path = ?, release_date = ?,
      vote_average = ?, vote_count = ?, genre_ids = ?, cast_names = ?,
      scraped_at = ?
     WHERE id = ?`,
    [
      result.id,
      result.media_type,
      result.title || result.name,
      result.original_title || result.original_name,
      result.overview,
      result.poster_path,
      result.backdrop_path,
      result.release_date || result.first_air_date,
      result.vote_average || 0,
      result.vote_count || 0,
      JSON.stringify(result.genre_ids || []),
      '[]',
      now,
      videoId,
    ],
  )

  await persistDatabase(db, meta.databasePath)
  return { success: true, message: `${result.title || result.name} 刮削成功` }
})

// ========== AI 分类 IPC 处理器 ==========
ipcMain.handle('ai:get-config', async () => {
  return loadAIConfig()
})

ipcMain.handle('ai:save-config', async (_event, config: { apiKey: string; baseUrl: string; model: string }) => {
  await saveAIConfig(config)
  return { success: true }
})

ipcMain.handle('ai:test-connection', async (_event, config: { apiKey: string; baseUrl: string; model: string }) => {
  return testAIConnection(config)
})

ipcMain.handle('ai:classify-stream', async (_event, rule: string, config: { apiKey: string; baseUrl: string; model: string }) => {
  await ensureDatabase()
  const { database: db } = getDatabaseHandle()

  const results = db.exec(`
    SELECT id, file_name, absolute_path, title, overview
    FROM videos
    WHERE id NOT IN (
      SELECT DISTINCT video_id FROM virtual_folder_videos
    )
    ORDER BY file_name
  `)

  if (!results.length || results[0].values.length === 0) {
    return { success: false, message: '没有未分类的视频', videos: [] }
  }

  const videos = results[0].values.map((row: any[]) => ({
    id: row[0] as number,
    name: row[1] as string,
    path: row[2] as string,
    title: row[3] as string | null,
    overview: row[4] as string | null,
  }))

  return aiClassifyVideosStream(videos, rule, config, (chunk) => {
    if (win) {
      win.webContents.send('ai:chunk', chunk)
    }
  })
})

ipcMain.handle('ai:apply', async (_event, folders: { name: string; videoIds: number[] }[]) => {
  await ensureDatabase()
  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  let created = 0

  for (const folder of folders) {
    const existing = db.exec(`SELECT id FROM virtual_folders WHERE name = ?`, [folder.name])
    let folderId: number

    if (existing.length && existing[0].values.length > 0) {
      folderId = existing[0].values[0][0] as number
    } else {
      const timestamp = new Date().toISOString()
      db.run(
        `INSERT INTO virtual_folders (name, created_at, updated_at) VALUES (?, ?, ?)`,
        [folder.name, timestamp, timestamp],
      )
      const newResult = db.exec(`SELECT id FROM virtual_folders WHERE name = ?`, [folder.name])
      folderId = newResult?.[0]?.values?.[0]?.[0] as number
      if (folderId > 0) created++
    }

    // 直接 INSERT 关联，不用 toggle（避免重复调用导致取消关联）
    for (const videoId of folder.videoIds) {
      db.run(
        `INSERT OR IGNORE INTO virtual_folder_videos (virtual_folder_id, video_id, created_at) VALUES (?, ?, ?)`,
        [folderId, videoId, new Date().toISOString()],
      )
    }
  }

  await persistDatabase(db, meta.databasePath)

  return { success: true, message: `创建 ${created} 个文件夹`, snapshot: await getLibrarySnapshot() }
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

// ========== 自动更新 ==========
function setupAutoUpdater() {
  // 仅在生产环境启用自动更新
  if (!app.isPackaged) {
    console.log('development: 跳过自动更新')
    return
  }

  autoUpdater.logger = console
  autoUpdater.disableWebInstaller = false
  autoUpdater.allowPrerelease = false
  autoUpdater.autoDownload = false

  // 配置 GitHub Releases 作为更新源
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'coldwaterrr',
    repo: 'VideoManager'
  })

  autoUpdater.on('checking-for-update', () => {
    win?.webContents.send('update:checking')
  })

  autoUpdater.on('update-available', (info) => {
    win?.webContents.send('update:available', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
    })
  })

  autoUpdater.on('update-not-available', () => {
    win?.webContents.send('update:not-available')
  })

  autoUpdater.on('error', (err) => {
    win?.webContents.send('update:error', err.message)
  })

  autoUpdater.on('download-progress', (progress) => {
    win?.webContents.send('update:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    win?.webContents.send('update:downloaded', {
      version: info.version,
    })
  })
}

ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) {
    return { available: false, message: '开发环境不支持自动更新' }
  }
  try {
    await autoUpdater.checkForUpdates()
    return { success: true }
  } catch (err: any) {
    return { success: false, message: err.message }
  }
})

ipcMain.handle('update:download', async () => {
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (err: any) {
    return { success: false, message: err.message }
  }
})

ipcMain.handle('update:install', async () => {
  autoUpdater.quitAndInstall()
  return { success: true }
})

// ========== Player 配置 ==========
ipcMain.handle('player:get-config', async () => loadPlayerConfig())

ipcMain.handle('player:save-config', async (_event, config: { defaultPlayer: PlayerType }) => {
  savePlayerConfig(config)
  return { success: true }
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
  const publicIcon = path.join(process.env.VITE_PUBLIC || '', 'videomanager_icon.png')
  const fs = require('fs')
  if (fs.existsSync(publicIcon)) {
    return publicIcon
  }
  const distIcon = path.join(process.env.APP_ROOT || '', 'dist', 'videomanager_icon.png')
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
    setMpvWindowRef(win)
    setupMpvIPC()
    setupWindowBehaviors()
    createTray()
    setupAutoUpdater()
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
