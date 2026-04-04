import { app, shell } from 'electron'
import { promises as fs, type Stats } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

const execAsync = promisify(exec)

type DatabaseMeta = {
  databasePath: string
  tables: string[]
}

export type VirtualFolderRecord = {
  id: number
  name: string
  videoCount: number
}

export type VideoRecord = {
  id: number
  name: string
  absolutePath: string
  fileSize: number
  durationSeconds: number
  modifiedAt: string
  folderIds: number[]
}

export type LibrarySnapshot = {
  databaseMeta: DatabaseMeta
  folders: VirtualFolderRecord[]
  videos: VideoRecord[]
  lastScanDirectory: string | null
  lastScannedAt: string | null
}

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TABLES = ['videos', 'virtual_folders', 'virtual_folder_videos', 'app_meta']
const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.wmv',
])

let sqlite: SqlJsStatic | null = null
let database: Database | null = null
let databaseMeta: DatabaseMeta | null = null

function getWasmPath() {
  // 在开发环境中，WASM 文件位于项目根目录的 node_modules/sql.js/dist/
  // 在打包环境中，WASM 文件位于 dist-electron/ 目录
  // 从当前模块位置推断：electron/database.ts -> 向上两级到项目根 -> dist-electron/
  const projectRoot = path.join(__dirname, '..')
  const devWasm = path.join(projectRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const distWasm = path.join(projectRoot, 'dist-electron', 'sql-wasm.wasm')
  
  // 开发环境优先使用 node_modules 中的 WASM
  return devWasm
}

async function loadSqlite() {
  if (sqlite) {
    return sqlite
  }

  const wasmPath = getWasmPath()
  
  sqlite = await initSqlJs({
    locateFile: () => wasmPath,
  })

  return sqlite
}

export async function persistDatabase(db: Database, databasePath: string) {
  const exported = db.export()
  await fs.mkdir(path.dirname(databasePath), { recursive: true })
  await fs.writeFile(databasePath, Buffer.from(exported))
}

function now() {
  return new Date().toISOString()
}

export function getDatabaseHandle() {
  if (!database || !databaseMeta) {
    throw new Error('数据库尚未初始化')
  }

  return {
    database,
    databaseMeta,
  }
}

function mapRows<T>(results: ReturnType<Database['exec']>) {
  const [firstResult] = results

  if (!firstResult) {
    return [] as T[]
  }

  return firstResult.values.map((row) => {
    return firstResult.columns.reduce<Record<string, unknown>>((record, column, index) => {
      record[column] = row[index]
      return record
    }, {}) as T
  })
}

function getMetaValue(db: Database, key: string) {
  const [row] = mapRows<{ value: string }>(
    db.exec('SELECT value FROM app_meta WHERE key = ?', [key]),
  )

  return row?.value ?? null
}

function setMetaValue(db: Database, key: string, value: string) {
  db.run(
    `
      INSERT INTO app_meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at;
    `,
    [key, value, now()],
  )
}

export type ScanProgressCallback = (progress: {
  type: 'scanning' | 'found' | 'processing' | 'complete'
  message: string
  current?: number
  total?: number
  filePath?: string
}) => void

async function collectVideoFilesFast(
  startDirs: string[], 
  onProgress?: ScanProgressCallback,
  filterOptions?: ScanFilterOptions
): Promise<string[]> {
  const files: string[] = []
  const queue = [...startDirs]
  let activeCount = 0
  const MAX_CONCURRENT = 50 // 控制并发读取数量，防止 EMFILE
  
  // 要忽略的常见系统目录，极大提升扫描速度
  const ignoreDirs = new Set([
    '$RECYCLE.BIN',
    'System Volume Information',
    'Windows',
    'Program Files',
    'Program Files (x86)',
    'node_modules',
    '.git',
    'AppData',
    'ProgramData',
    'PerfLogs'
  ])

  // 根据筛选器确定支持的格式
  const supportedFormats = filterOptions?.formats 
    ? new Set(filterOptions.formats.map(f => f.toLowerCase()))
    : VIDEO_EXTENSIONS
  
  // 文件大小筛选（转换为字节）
  const minSizeBytes = (filterOptions?.minSizeMB || 0) * 1024 * 1024
  const maxSizeBytes = filterOptions?.maxSizeMB ? filterOptions.maxSizeMB * 1024 * 1024 : 0

  return new Promise((resolve) => {
    let scannedDirs = 0
    const processQueue = () => {
      if (queue.length === 0 && activeCount === 0) {
        if (onProgress) {
          onProgress({
            type: 'complete',
            message: `扫描完成，找到 ${files.length} 个视频文件`,
            total: files.length,
          })
        }
        resolve(files)
        return
      }

      while (queue.length > 0 && activeCount < MAX_CONCURRENT) {
        const dir = queue.shift()!
        activeCount++
        scannedDirs++

        if (onProgress && scannedDirs % 10 === 0) {
          onProgress({
            type: 'scanning',
            message: `正在扫描目录... 已扫描 ${scannedDirs} 个文件夹`,
            current: files.length,
          })
        }

        fs.readdir(dir, { withFileTypes: true })
          .then((entries) => {
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name)
              if (entry.isDirectory()) {
                if (!ignoreDirs.has(entry.name)) {
                  queue.push(fullPath)
                }
              } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase()
                if (supportedFormats.has(ext)) {
                  files.push(fullPath)
                  if (onProgress) {
                    onProgress({
                      type: 'found',
                      message: `找到视频文件`,
                      current: files.length,
                      filePath: fullPath,
                    })
                  }
                }
              }
            }
          })
          .catch(() => {
            // 忽略权限错误 (EPERM, EBUSY 等)
          })
          .finally(() => {
            activeCount--
            processQueue()
          })
      }
    }

    processQueue()
  })
}

async function collectVideoFiles(
  directoryPath: string, 
  onProgress?: ScanProgressCallback,
  filterOptions?: ScanFilterOptions
) {
  return collectVideoFilesFast([directoryPath], onProgress, filterOptions)
}

function upsertVideo(db: Database, absolutePath: string, stats: Stats) {
  const timestamp = now()

  db.run(
    `
      INSERT INTO videos (
        absolute_path,
        file_name,
        file_size,
        duration_seconds,
        modified_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(absolute_path) DO UPDATE SET
        file_name = excluded.file_name,
        file_size = excluded.file_size,
        duration_seconds = excluded.duration_seconds,
        modified_at = excluded.modified_at,
        updated_at = excluded.updated_at;
    `,
    [
      absolutePath,
      path.basename(absolutePath),
      stats.size,
      0,
      stats.mtime.toISOString(),
      timestamp,
      timestamp,
    ],
  )
}

export async function ensureDatabase() {
  if (database && databaseMeta) {
    return databaseMeta
  }

  const SQL = await loadSqlite()
  const databasePath = path.join(app.getPath('userData'), 'videosorter.sqlite')

  try {
    const existingBuffer = await fs.readFile(databasePath)
    database = new SQL.Database(new Uint8Array(existingBuffer))
  } catch {
    database = new SQL.Database()
  }

  const createdAt = now()

  database.run(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      absolute_path TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      modified_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS virtual_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS virtual_folder_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      virtual_folder_id INTEGER NOT NULL,
      video_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (virtual_folder_id, video_id),
      FOREIGN KEY (virtual_folder_id) REFERENCES virtual_folders(id) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  database.run(
    `
      INSERT OR IGNORE INTO virtual_folders (id, name, created_at, updated_at)
      VALUES
        (1, '收藏夹', ?, ?),
        (2, '待整理', ?, ?);
    `,
    [createdAt, createdAt, createdAt, createdAt],
  )

  await persistDatabase(database, databasePath)

  databaseMeta = {
    databasePath,
    tables: TABLES,
  }

  return databaseMeta
}

export async function getDatabaseMeta() {
  return ensureDatabase()
}

export async function getLibrarySnapshot(): Promise<LibrarySnapshot> {
  await ensureDatabase()

  const { database: db, databaseMeta: meta } = getDatabaseHandle()

  const folders = mapRows<{ id: number; name: string; video_count: number }>(
    db.exec(`
      SELECT
        virtual_folders.id,
        virtual_folders.name,
        COUNT(virtual_folder_videos.video_id) AS video_count
      FROM virtual_folders
      LEFT JOIN virtual_folder_videos
        ON virtual_folders.id = virtual_folder_videos.virtual_folder_id
      GROUP BY virtual_folders.id, virtual_folders.name
      ORDER BY virtual_folders.created_at ASC, virtual_folders.id ASC;
    `),
  ).map((folder) => ({
    id: Number(folder.id),
    name: folder.name,
    videoCount: Number(folder.video_count),
  }))

  const videos = mapRows<{
    id: number
    file_name: string
    absolute_path: string
    file_size: number
    duration_seconds: number
    modified_at: string
    folder_ids: string
  }>(
    db.exec(`
      SELECT
        videos.id,
        videos.file_name,
        videos.absolute_path,
        videos.file_size,
        videos.duration_seconds,
        videos.modified_at,
        COALESCE(GROUP_CONCAT(virtual_folder_videos.virtual_folder_id), '') AS folder_ids
      FROM videos
      LEFT JOIN virtual_folder_videos
        ON videos.id = virtual_folder_videos.video_id
      GROUP BY videos.id
      ORDER BY videos.updated_at DESC, videos.id DESC;
    `),
  ).map((video) => ({
    id: Number(video.id),
    name: video.file_name,
    absolutePath: video.absolute_path,
    fileSize: Number(video.file_size),
    durationSeconds: Number(video.duration_seconds),
    modifiedAt: video.modified_at,
    folderIds: String(video.folder_ids || '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0),
  }))

  return {
    databaseMeta: meta,
    folders,
    videos,
    lastScanDirectory: getMetaValue(db, 'last_scan_directory'),
    lastScannedAt: getMetaValue(db, 'last_scan_at'),
  }
}

export async function createVirtualFolder(name: string) {
  await ensureDatabase()

  const normalizedName = name.trim()

  if (!normalizedName) {
    throw new Error('文件夹名称不能为空')
  }

  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  const timestamp = now()

  db.run(
    `
      INSERT INTO virtual_folders (name, created_at, updated_at)
      VALUES (?, ?, ?);
    `,
    [normalizedName, timestamp, timestamp],
  )

  await persistDatabase(db, meta.databasePath)

  return getLibrarySnapshot()
}

export async function toggleVideoFolder(videoId: number, folderId: number) {
  await ensureDatabase()

  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  const [existingRelation] = mapRows<{ id: number }>(
    db.exec(
      `
        SELECT id
        FROM virtual_folder_videos
        WHERE virtual_folder_id = ? AND video_id = ?;
      `,
      [folderId, videoId],
    ),
  )

  if (existingRelation) {
    db.run(
      `
        DELETE FROM virtual_folder_videos
        WHERE virtual_folder_id = ? AND video_id = ?;
      `,
      [folderId, videoId],
    )
  } else {
    db.run(
      `
        INSERT INTO virtual_folder_videos (virtual_folder_id, video_id, created_at)
        VALUES (?, ?, ?);
      `,
      [folderId, videoId, now()],
    )
  }

  await persistDatabase(db, meta.databasePath)

  return getLibrarySnapshot()
}

export async function scanVideosFromDirectory(
  directoryPath: string, 
  onProgress?: ScanProgressCallback,
  filterOptions?: ScanFilterOptions
) {
  await ensureDatabase()

  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  
  if (onProgress) {
    onProgress({
      type: 'scanning',
      message: '正在扫描目录...',
    })
  }
  
  const files = await collectVideoFiles(directoryPath, onProgress, filterOptions)

  if (onProgress) {
    onProgress({
      type: 'processing',
      message: `正在写入数据库，共 ${files.length} 个文件...`,
      total: files.length,
    })
  }

  db.run('BEGIN TRANSACTION')

  try {
    let processed = 0
    for (const absolutePath of files) {
      const stats = await fs.stat(absolutePath)
      
      // 应用文件大小筛选
      const fileSizeMB = stats.size / (1024 * 1024)
      if (filterOptions?.minSizeMB && fileSizeMB < filterOptions.minSizeMB) {
        continue
      }
      if (filterOptions?.maxSizeMB && filterOptions.maxSizeMB > 0 && fileSizeMB > filterOptions.maxSizeMB) {
        continue
      }
      
      upsertVideo(db, absolutePath, stats)
      processed++
      
      if (onProgress && processed % 5 === 0) {
        onProgress({
          type: 'processing',
          message: `正在写入数据库... (${processed}/${files.length})`,
          current: processed,
          total: files.length,
        })
      }
    }

    setMetaValue(db, 'last_scan_directory', directoryPath)
    setMetaValue(db, 'last_scan_at', now())
    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }

  await persistDatabase(db, meta.databasePath)

  return getLibrarySnapshot()
}
