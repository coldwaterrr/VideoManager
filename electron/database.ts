import { app } from 'electron'
import { promises as fs, type Stats } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

import { collectVideoFiles, type ScanOptions, type ScanProgressCallback } from './scanner'
export type { ScanProgressCallback } from './scanner'

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
  addedAt: string
  folderIds: number[]
  // TMDB metadata
  tmdbId?: number | null
  mediaType?: string | null
  title?: string | null
  originalTitle?: string | null
  overview?: string | null
  posterPath?: string | null
  backdropPath?: string | null
  releaseDate?: string | null
  voteAverage?: number
  voteCount?: number
  genreIds?: number[]
  castNames?: string[]
  scrapedAt?: string | null
}

export type LibrarySnapshot = {
  databaseMeta: DatabaseMeta
  folders: VirtualFolderRecord[]
  videos: VideoRecord[]
  lastScanDirectory: string | null
  lastScannedAt: string | null
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TABLES = ['videos', 'virtual_folders', 'virtual_folder_videos', 'app_meta']
let sqlite: SqlJsStatic | null = null
let database: Database | null = null
let databaseMeta: DatabaseMeta | null = null

function getWasmPath() {
  const isDev = !app.isPackaged
  if (isDev) {
    const projectRoot = path.join(__dirname, '..')
    return path.join(projectRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  }
  // 打包后，node_modules/sql.js/dist/ 会被打包进 app.asar
  return path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
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

function exportBuffer(db: Database) {
  const buffer = Buffer.from(db.export())
  // sql.js export closes and reopens SQLite, resetting connection PRAGMAs.
  db.run('PRAGMA foreign_keys = ON')
  return buffer
}
let persistQueue: Promise<void> = Promise.resolve()
export async function persistDatabase(db: Database, databasePath: string) {
  const write = persistQueue.catch(() => {}).then(async () => {
    const exported = exportBuffer(db)
    await fs.mkdir(path.dirname(databasePath), { recursive: true })
    const tempPath = databasePath + '.tmp'
    await fs.writeFile(tempPath, exported)
    await fs.rename(tempPath, databasePath)
  })
  persistQueue = write
  return write
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

let initializing: Promise<DatabaseMeta> | null = null
export async function ensureDatabase(): Promise<DatabaseMeta> {
  if (database && databaseMeta) return databaseMeta
  if (!initializing) initializing = initializeDatabase().finally(() => { initializing = null })
  return initializing
}
async function initializeDatabase() {
  if (database && databaseMeta) {
    return databaseMeta
  }

  const SQL = await loadSqlite()
  const databasePath = path.join(app.getPath('userData'), 'videosorter.sqlite')

  try {
    const existingBuffer = await fs.readFile(databasePath)
    database = new SQL.Database(new Uint8Array(existingBuffer))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`数据库读取失败，原文件已保留：${String(error)}`)
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

  // TMDB schema migration: add columns if they don't exist
  function addColumnIfExists(table: string, column: string, definition: string) {
    const info = database!.exec(`PRAGMA table_info(${table})`)
    if (!info.length) {
      database!.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      return
    }
    const firstResult = info[0]
    const columns = firstResult.values.map((row) => row[1] as string)
    if (!columns.includes(column)) {
      database!.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  }

  addColumnIfExists('videos', 'tmdb_id', 'INTEGER DEFAULT NULL')
  addColumnIfExists('videos', 'media_type', 'TEXT DEFAULT NULL')
  addColumnIfExists('videos', 'title', 'TEXT DEFAULT NULL')
  addColumnIfExists('videos', 'original_title', 'TEXT DEFAULT NULL')
  addColumnIfExists('videos', 'overview', 'TEXT DEFAULT NULL')
  addColumnIfExists('videos', 'poster_path', 'TEXT DEFAULT NULL')
  addColumnIfExists('videos', 'backdrop_path', 'TEXT DEFAULT NULL')
  addColumnIfExists('videos', 'release_date', 'TEXT DEFAULT NULL')
  addColumnIfExists('videos', 'vote_average', 'REAL DEFAULT 0')
  addColumnIfExists('videos', 'vote_count', 'INTEGER DEFAULT 0')
  addColumnIfExists('videos', 'genre_ids', 'TEXT DEFAULT NULL')
  addColumnIfExists('videos', 'cast_names', 'TEXT DEFAULT NULL')
  addColumnIfExists('videos', 'scraped_at', 'TEXT DEFAULT NULL')

  database.run(
    `
      INSERT OR IGNORE INTO virtual_folders (id, name, created_at, updated_at)
      VALUES
        (1, '收藏夹', ?, ?),
        (2, '待整理', ?, ?);
    `,
    [createdAt, createdAt, createdAt, createdAt],
  )

  database.run('DELETE FROM virtual_folder_videos WHERE video_id NOT IN (SELECT id FROM videos) OR virtual_folder_id NOT IN (SELECT id FROM virtual_folders)')
  database.run('PRAGMA foreign_keys = ON')
  database.run('CREATE INDEX IF NOT EXISTS idx_folder_video ON virtual_folder_videos(video_id)')
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
    created_at: string
    folder_ids: string
    tmdb_id: number | null
    media_type: string | null
    title: string | null
    original_title: string | null
    overview: string | null
    poster_path: string | null
    backdrop_path: string | null
    release_date: string | null
    vote_average: number | null
    vote_count: number | null
    genre_ids: string | null
    cast_names: string | null
    scraped_at: string | null
  }>(
    db.exec(`
      SELECT
        videos.id,
        videos.file_name,
        videos.absolute_path,
        videos.file_size,
        videos.duration_seconds,
        videos.modified_at,
        videos.created_at,
        COALESCE(GROUP_CONCAT(virtual_folder_videos.virtual_folder_id), '') AS folder_ids,
        videos.tmdb_id,
        videos.media_type,
        videos.title,
        videos.original_title,
        videos.overview,
        videos.poster_path,
        videos.backdrop_path,
        videos.release_date,
        videos.vote_average,
        videos.vote_count,
        videos.genre_ids,
        videos.cast_names,
        videos.scraped_at
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
    addedAt: video.created_at,
    folderIds: String(video.folder_ids || '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0),
    tmdbId: video.tmdb_id ? Number(video.tmdb_id) : null,
    mediaType: video.media_type ?? null,
    title: video.title ?? null,
    originalTitle: video.original_title ?? null,
    overview: video.overview ?? null,
    posterPath: video.poster_path ?? null,
    backdropPath: video.backdrop_path ?? null,
    releaseDate: video.release_date ?? null,
    voteAverage: Number(video.vote_average || 0),
    voteCount: Number(video.vote_count || 0),
    genreIds: video.genre_ids ? JSON.parse(video.genre_ids) : [],
    castNames: video.cast_names ? JSON.parse(video.cast_names) : [],
    scrapedAt: video.scraped_at ?? null,
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

export async function deleteVirtualFolder(folderId: number) {
  await ensureDatabase()

  const { database: db, databaseMeta: meta } = getDatabaseHandle()

  // 先删除关联的视频记录
  db.run(
    `DELETE FROM virtual_folder_videos WHERE virtual_folder_id = ?;`,
    [folderId],
  )

  // 再删除文件夹
  db.run(
    `DELETE FROM virtual_folders WHERE id = ?;`,
    [folderId],
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

let activeScans = 0
export async function scanVideosFromDirectory(directoryPath: string, onProgress?: ScanProgressCallback, filterOptions?: ScanOptions) {
  await ensureDatabase()
  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  activeScans++
  try {
    const { files, skipped } = await collectVideoFiles(directoryPath, filterOptions, onProgress)
    if (db !== database) throw new Error('数据库已切换，请重新扫描')
    let added = 0, updated = 0
    const imported: number[] = []
    const exclusions: Record<string, { fileSize: number; modifiedAt: string }> = JSON.parse(getMetaValue(db, 'excluded_import_paths') || '{}')
    let exclusionsChanged = false
    db.run('BEGIN TRANSACTION')
    try {
      for (const { absolutePath, stats } of files) {
        const excluded = exclusions[absolutePath]
        if (excluded && excluded.fileSize === stats.size && excluded.modifiedAt === stats.mtime.toISOString()) continue
        if (excluded) { delete exclusions[absolutePath]; exclusionsChanged = true }
        const old = db.exec('SELECT id, file_size, modified_at FROM videos WHERE absolute_path = ?', [absolutePath])[0]?.values[0]
        if (old && Number(old[1]) === stats.size && old[2] === stats.mtime.toISOString()) continue
        upsertVideo(db, absolutePath, stats)
        if (old) updated++
        else {
          added++
          imported.push(Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]))
        }
      }
      const config = readClassificationConfig(db)
      if (exclusionsChanged) setMetaValue(db, 'excluded_import_paths', JSON.stringify(exclusions))
      if (config.autoOnImport && imported.length) applyGroupsInTransaction(db, previewRules(db, config.rules, imported))
      setMetaValue(db, 'last_scan_directory', path.resolve(directoryPath))
      setMetaValue(db, 'last_scan_at', now())
      db.run('COMMIT')
    } catch (error) { db.run('ROLLBACK'); throw error }
    await persistDatabase(db, meta.databasePath)
    const scanSummary = { added, updated, unchanged: files.length - added - updated, skipped }
    onProgress?.({ type: 'complete', message: `扫描完成：新增 ${added}，更新 ${updated}，未变化 ${scanSummary.unchanged}，跳过 ${skipped}`, total: files.length })
    return { ...(await getLibrarySnapshot()), scanSummary }
  } finally { activeScans-- }
}

/** Validate a candidate before replacing the active handle. Never replace an unreadable library with an empty one. */
export async function loadDatabaseAtPath(databasePath: string) {
  if (activeScans) throw new Error('正在扫描目录，请稍后再切换数据库')
  await persistQueue
  const SQL = await loadSqlite()
  const candidate = new SQL.Database(new Uint8Array(await fs.readFile(databasePath)))
  try {
    for (const table of TABLES) candidate.exec(`SELECT * FROM ${table} LIMIT 0`)
    const columns = candidate.exec('PRAGMA table_info(videos)')[0].values.map(row => row[1])
    if (!columns.includes('scraped_at')) throw new Error('此数据库结构过旧，请先使用原版本升级')
    candidate.run('PRAGMA foreign_keys = ON')
  } catch (error) { candidate.close(); throw new Error(`无法打开视频库：${String(error)}`) }
  await persistQueue
  if (activeScans) { candidate.close(); throw new Error('正在扫描目录，请稍后再切换数据库') }
  const previous = database
  database = candidate
  databaseMeta = { databasePath: path.resolve(databasePath), tables: TABLES }
  previous?.close()
  return getLibrarySnapshot()
}

export function getCurrentDatabasePath(): string | null { return databaseMeta?.databasePath ?? null }

export async function getLibrarySetting<T>(key: string, fallback: T): Promise<T> {
  await ensureDatabase()
  const value = getMetaValue(getDatabaseHandle().database, key)
  return value ? JSON.parse(value) as T : fallback
}
export async function saveLibrarySetting(key: string, value: unknown, expectedDatabasePath?: string) {
  await ensureDatabase()
  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  if (expectedDatabasePath && meta.databasePath !== expectedDatabasePath) throw new Error('数据库已切换，请重试')
  setMetaValue(db, key, JSON.stringify(value))
  await persistDatabase(db, meta.databasePath)
}

export async function inspectMissingVideos() {
  await ensureDatabase()
  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  const rows = db.exec('SELECT id, absolute_path, file_name FROM videos')[0]?.values || []
  const roots = (await getLibrarySetting<Array<{ directory: string }>>('monitor_directories', [])).map(item => item.directory)
  if (db !== database) throw new Error('数据库已切换，请重新检查失效路径')
  const lastRoot = getMetaValue(db, 'last_scan_directory')
  if (lastRoot) roots.push(lastRoot)
  roots.sort((a, b) => b.length - a.length)
  const rootAvailability = new Map<string, Promise<boolean>>()
  const accessible = (root: string) => {
    if (!rootAvailability.has(root)) rootAvailability.set(root, fs.stat(root).then(s => s.isDirectory(), () => false))
    return rootAvailability.get(root)!
  }
  const missing: Array<{ id: number; name: string; absolutePath: string }> = []
  let skipped = 0
  for (let offset = 0; offset < rows.length; offset += 32) {
    await Promise.all(rows.slice(offset, offset + 32).map(async row => {
      const file = String(row[1])
      const containingRoot = roots.find(root => { const relative = path.relative(root, file); return relative && !relative.startsWith('..') && !path.isAbsolute(relative) }) || path.parse(file).root
      if (!await accessible(containingRoot)) { skipped++; return }
      try { if ((await fs.stat(file)).isFile()) return }
      catch (error) { if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) { skipped++; return } }
      missing.push({ id: Number(row[0]), absolutePath: file, name: String(row[2]) })
    }))
  }
  return { missing, skipped, databasePath: meta.databasePath }
}

export type RemovalRecord = { id: number; absolutePath: string; fileSize: number; modifiedAt: string; addedAt: string }
type RemovalOptions = { databasePath?: string; database?: Database; excludeFromImport?: boolean; shouldRemove?: (record: RemovalRecord) => boolean }
function removalRecord(db: Database, id: number): RemovalRecord | null {
  const row = db.exec('SELECT absolute_path, file_size, modified_at, created_at FROM videos WHERE id = ?', [id])[0]?.values[0]
  return row ? { id, absolutePath: String(row[0]), fileSize: Number(row[1]), modifiedAt: String(row[2]), addedAt: String(row[3]) } : null
}
export async function removeVideoRecords(ids: number[], backup = false, options: RemovalOptions = {}) {
  await ensureDatabase()
  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  if ((options.databasePath && options.databasePath !== meta.databasePath) || (options.database && options.database !== db)) throw new Error('数据库已切换，请重新预览')
  const validIds = [...new Set(ids)].filter(id => {
    if (!Number.isSafeInteger(id) || id <= 0) return false
    const record = removalRecord(db, id)
    return record && (!options.shouldRemove || options.shouldRemove(record))
  })
  let backupPath: string | undefined
  if (backup && validIds.length) {
    backupPath = meta.databasePath + `.before-cleanup-${Date.now()}.backup`
    await fs.writeFile(backupPath, exportBuffer(db))
    if (db !== database) throw new Error('数据库已切换，请重新检查失效路径')
  }
  let deletedCount = 0
  const exclusions: Record<string, { fileSize: number; modifiedAt: string }> = JSON.parse(getMetaValue(db, 'excluded_import_paths') || '{}')
  db.run('BEGIN TRANSACTION')
  try {
    for (const id of validIds) {
      const record = removalRecord(db, id)
      if (!record || (options.shouldRemove && !options.shouldRemove(record))) continue
      if (options.excludeFromImport) exclusions[record.absolutePath] = { fileSize: record.fileSize, modifiedAt: record.modifiedAt }
      db.run('DELETE FROM virtual_folder_videos WHERE video_id = ?', [id])
      db.run('DELETE FROM videos WHERE id = ?', [id])
      deletedCount += db.getRowsModified()
    }
    if (options.excludeFromImport && deletedCount) setMetaValue(db, 'excluded_import_paths', JSON.stringify(exclusions))
    db.run('COMMIT')
  } catch (error) { db.run('ROLLBACK'); throw error }
  await persistDatabase(db, meta.databasePath)
  return { deletedCount, backupPath, snapshot: await getLibrarySnapshot() }
}

export async function cleanupMissingRecords(ids: number[], expectedDatabasePath: string, shouldContinue: () => boolean = () => true) {
  const { database: original } = getDatabaseHandle()
  const inspection = await inspectMissingVideos()
  if (inspection.databasePath !== expectedDatabasePath || original !== database) throw new Error('数据库已切换，请重新检查失效路径')
  const missing = new Map(inspection.missing.map(item => [item.id, item.absolutePath]))
  return removeVideoRecords(ids, true, { databasePath: expectedDatabasePath, database: original, shouldRemove: record => shouldContinue() && missing.get(record.id) === record.absolutePath })
}

export type ClassificationRule = { name: string; keywords: string[]; target: 'name' | 'path' }
export type ClassificationConfig = { autoOnImport: boolean; rules: ClassificationRule[] }
const emptyRules: ClassificationConfig = { autoOnImport: false, rules: [] }
function readClassificationConfig(db: Database): ClassificationConfig {
  const value = getMetaValue(db, 'classification_rules')
  return value ? JSON.parse(value) : emptyRules
}
export async function getClassificationConfig() { await ensureDatabase(); return readClassificationConfig(getDatabaseHandle().database) }
export async function saveClassificationConfig(config: ClassificationConfig) {
  const normalized = { autoOnImport: !!config.autoOnImport, rules: config.rules.map(rule => ({ name: rule.name.trim(), keywords: rule.keywords.map(word => word.trim()).filter(Boolean), target: rule.target })) }
  if (normalized.rules.some(rule => !rule.name || !rule.keywords.length || !['name', 'path'].includes(rule.target))) throw new Error('每条规则需要分类名称、匹配位置和至少一个关键词')
  await saveLibrarySetting('classification_rules', normalized)
  return normalized
}
function previewRules(db: Database, rules: ClassificationRule[], onlyIds?: number[]) {
  const rows = db.exec('SELECT id, file_name, absolute_path FROM videos WHERE id NOT IN (SELECT video_id FROM virtual_folder_videos)')[0]?.values || []
  const scope = onlyIds ? new Set(onlyIds) : null
  return rules.map(rule => ({ name: rule.name, videoIds: rows.filter(row => (!scope || scope.has(Number(row[0]))) && rule.keywords.some(word => String(row[rule.target === 'path' ? 2 : 1]).toLowerCase().includes(word.toLowerCase()))).map(row => Number(row[0])) })).filter(group => group.videoIds.length)
}
export async function previewClassificationRules() { await ensureDatabase(); const { database: db } = getDatabaseHandle(); return previewRules(db, readClassificationConfig(db).rules) }
function applyGroupsInTransaction(db: Database, groups: Array<{ name: string; videoIds: number[] }>) {
  let added = 0
  for (const group of groups) {
    const name = group.name.trim()
    if (!name || name.length > 100) throw new Error('分类名称长度需要在 1 到 100 字之间')
    const timestamp = now()
    db.run('INSERT OR IGNORE INTO virtual_folders(name, created_at, updated_at) VALUES (?, ?, ?)', [name, timestamp, timestamp])
    const folderId = db.exec('SELECT id FROM virtual_folders WHERE name = ?', [name])[0].values[0][0]
    for (const videoId of new Set(group.videoIds)) {
      if (!Number.isSafeInteger(videoId) || !db.exec('SELECT id FROM videos WHERE id = ?', [videoId]).length) throw new Error('分类结果包含不存在的视频，请刷新后重试')
      db.run('INSERT OR IGNORE INTO virtual_folder_videos(virtual_folder_id, video_id, created_at) VALUES (?, ?, ?)', [folderId, videoId, timestamp])
      added += db.getRowsModified()
    }
  }
  return added
}
export async function applyClassification(groups: Array<{ name: string; videoIds: number[] }>) {
  await ensureDatabase()
  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  db.run('BEGIN TRANSACTION')
  let added = 0
  try { added = applyGroupsInTransaction(db, groups); db.run('COMMIT') }
  catch (error) { db.run('ROLLBACK'); throw error }
  await persistDatabase(db, meta.databasePath)
  return { success: true, message: `已添加 ${added} 条分类关联`, snapshot: await getLibrarySnapshot() }
}
export async function renameVirtualFolder(folderId: number, name: string) {
  await ensureDatabase()
  const normalized = name.trim()
  if (!normalized || normalized.length > 100) throw new Error('分类名称长度需要在 1 到 100 字之间')
  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  db.run('UPDATE virtual_folders SET name = ?, updated_at = ? WHERE id = ?', [normalized, now(), folderId])
  await persistDatabase(db, meta.databasePath)
  return getLibrarySnapshot()
}
export async function batchClassify(videoIds: number[], folderId: number, mode: 'add' | 'remove') {
  await ensureDatabase()
  const { database: db, databaseMeta: meta } = getDatabaseHandle()
  const name = db.exec('SELECT name FROM virtual_folders WHERE id = ?', [folderId])[0]?.values[0]?.[0]
  if (!name || !['add', 'remove'].includes(mode)) throw new Error('请选择有效分类')
  db.run('BEGIN TRANSACTION')
  try {
    if (mode === 'add') applyGroupsInTransaction(db, [{ name: String(name), videoIds }])
    else for (const id of new Set(videoIds)) db.run('DELETE FROM virtual_folder_videos WHERE video_id = ? AND virtual_folder_id = ?', [id, folderId])
    db.run('COMMIT')
  } catch (error) { db.run('ROLLBACK'); throw error }
  await persistDatabase(db, meta.databasePath)
  return getLibrarySnapshot()
}
