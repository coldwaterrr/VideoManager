import { randomUUID } from 'node:crypto'
import {
  ensureDatabase, getDatabaseHandle, getLibrarySnapshot, getLibrarySetting, saveLibrarySetting,
  inspectMissingVideos, cleanupMissingRecords, removeVideoRecords, type VideoRecord, type RemovalRecord,
} from './database'

export type CleanupConditions = {
  minSizeMB?: number; maxSizeMB?: number; keyword?: string
  modifiedAfter?: string; modifiedBefore?: string; addedAfter?: string; addedBefore?: string
}
export function validateCleanupConditions(input: CleanupConditions): CleanupConditions {
  const conditions: CleanupConditions = {}
  for (const key of ['minSizeMB', 'maxSizeMB'] as const) {
    const value = input[key]
    if (value !== undefined) {
      if (!Number.isFinite(value) || value < 0) throw new Error('大小条件需要是非负数字')
      conditions[key] = value
    }
  }
  if (conditions.minSizeMB !== undefined && conditions.maxSizeMB !== undefined && conditions.minSizeMB > conditions.maxSizeMB) throw new Error('最大大小不能小于最小大小')
  for (const key of ['modifiedAfter', 'modifiedBefore', 'addedAfter', 'addedBefore'] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string' || !Number.isFinite(Date.parse(input[key]!))) throw new Error('时间条件无效')
      conditions[key] = new Date(input[key]!).toISOString()
    }
  }
  for (const [after, before] of [['modifiedAfter', 'modifiedBefore'], ['addedAfter', 'addedBefore']] as const) {
    if (conditions[after] && conditions[before] && conditions[after]! >= conditions[before]!) throw new Error('结束时间必须晚于开始时间')
  }
  if (input.keyword?.trim()) conditions.keyword = input.keyword.trim()
  if (!Object.keys(conditions).length) throw new Error('请至少设置一个筛选条件，再预览清理结果')
  return conditions
}
function matches(record: VideoRecord | (RemovalRecord & { name?: string }), conditions: CleanupConditions) {
  if (conditions.minSizeMB !== undefined && record.fileSize < conditions.minSizeMB * 1024 ** 2) return false
  if (conditions.maxSizeMB !== undefined && record.fileSize > conditions.maxSizeMB * 1024 ** 2) return false
  if (conditions.keyword && !`${record.name || ''} ${record.absolutePath}`.toLowerCase().includes(conditions.keyword.toLowerCase())) return false
  for (const [value, after, before] of [[record.modifiedAt, conditions.modifiedAfter, conditions.modifiedBefore], [record.addedAt, conditions.addedAfter, conditions.addedBefore]]) {
    if (!after && !before) continue
    const time = Date.parse(value!)
    if (!Number.isFinite(time) || (after && time < Date.parse(after)) || (before && time >= Date.parse(before))) return false
  }
  return true
}
type Preview = {
  database: ReturnType<typeof getDatabaseHandle>['database']; databasePath: string; createdAt: number
  conditions: CleanupConditions; records: Map<number, VideoRecord>
}
const previews = new Map<string, Preview>()
const PREVIEW_LIFETIME = 30 * 60 * 1000
export async function previewConditionalCleanup(input: CleanupConditions) {
  const conditions = validateCleanupConditions(input)
  const snapshot = await getLibrarySnapshot()
  const { database, databaseMeta } = getDatabaseHandle()
  if (snapshot.databaseMeta.databasePath !== databaseMeta.databasePath) throw new Error('数据库已切换，请重试')
  const videos = snapshot.videos.filter(video => matches(video, conditions))
  for (const [id, preview] of previews) if (Date.now() - preview.createdAt > PREVIEW_LIFETIME) previews.delete(id)
  while (previews.size >= 10) previews.delete(previews.keys().next().value!)
  const previewId = randomUUID()
  previews.set(previewId, { database, databasePath: databaseMeta.databasePath, createdAt: Date.now(), conditions, records: new Map(videos.map(video => [video.id, video])) })
  return { previewId, databasePath: databaseMeta.databasePath, conditions, videos, totalSize: videos.reduce((sum, video) => sum + video.fileSize, 0) }
}
export async function applyConditionalCleanup(previewId: string, ids: number[]) {
  const preview = previews.get(previewId)
  if (!preview || Date.now() - preview.createdAt > PREVIEW_LIFETIME) throw new Error('预览已过期，请重新筛选预览')
  if (!ids.length || ids.some(id => !preview.records.has(id))) throw new Error('请选择预览列表中的视频')
  const result = await removeVideoRecords(ids, true, {
    databasePath: preview.databasePath, database: preview.database, excludeFromImport: true,
    shouldRemove: record => {
      const old = preview.records.get(record.id)
      return !!old && old.absolutePath === record.absolutePath && old.fileSize === record.fileSize && old.modifiedAt === record.modifiedAt && old.addedAt === record.addedAt && matches({ ...record, name: old.name }, preview.conditions)
    },
  })
  previews.delete(previewId)
  return { ...result, skipped: new Set(ids).size - result.deletedCount }
}

export type AutoCleanupConfig = { enabled: boolean; intervalMinutes: number; confirmationChecks: number }
type Pending = Record<string, number>
export type AutoCleanupStatus = { lastCheckedAt: string | null; lastDeletedCount: number; totalDeletedCount: number; pendingCount: number; skipped: number; backupPath?: string }
type AutoCleanupHistory = AutoCleanupStatus & { pending: Pending }
const defaultConfig: AutoCleanupConfig = { enabled: false, intervalMinutes: 60, confirmationChecks: 2 }
const initialStatus: AutoCleanupHistory = { lastCheckedAt: null, lastDeletedCount: 0, totalDeletedCount: 0, pendingCount: 0, skipped: 0, pending: {} }
let configurationRevision = 0
function publicStatus(history: AutoCleanupHistory): AutoCleanupStatus { const { pending: _, ...status } = history; return status }
export async function getAutomaticCleanup() {
  const config = await getLibrarySetting('automatic_missing_cleanup', defaultConfig)
  const history = await getLibrarySetting('automatic_missing_history', initialStatus)
  return { config, status: publicStatus(history) }
}
export async function saveAutomaticCleanup(config: AutoCleanupConfig) {
  if (typeof config.enabled !== 'boolean' || !Number.isInteger(config.intervalMinutes) || config.intervalMinutes < 1 || config.intervalMinutes > 10080 || !Number.isInteger(config.confirmationChecks) || config.confirmationChecks < 1 || config.confirmationChecks > 5) throw new Error('检测间隔需要为 1–10080 分钟，连续确认次数为 1–5 次')
  configurationRevision++
  await ensureDatabase()
  const { databaseMeta } = getDatabaseHandle()
  const previous = await getLibrarySetting('automatic_missing_history', initialStatus)
  await saveLibrarySetting('automatic_missing_history', { ...previous, pending: {}, pendingCount: 0, lastCheckedAt: null }, databaseMeta.databasePath)
  await saveLibrarySetting('automatic_missing_cleanup', config, databaseMeta.databasePath)
  return getAutomaticCleanup()
}
let cleanupRunning = false
export async function checkAutomaticCleanup(force = false) {
  if (cleanupRunning) return { busy: true }
  cleanupRunning = true
  const revision = configurationRevision
  try {
    await ensureDatabase()
    const original = getDatabaseHandle()
    const config = await getLibrarySetting('automatic_missing_cleanup', defaultConfig)
    if (!config.enabled) return { disabled: true }
    const history = await getLibrarySetting('automatic_missing_history', initialStatus)
    if (!force && history.lastCheckedAt && Date.now() - Date.parse(history.lastCheckedAt) < config.intervalMinutes * 60000) return { due: false }
    const inspection = await inspectMissingVideos()
    if (original.database !== getDatabaseHandle().database || inspection.databasePath !== original.databaseMeta.databasePath) throw new Error('数据库已切换，已取消本轮自动清理')
    const pending: Pending = {}
    const ids: number[] = []
    for (const item of inspection.missing) {
      const key = `${item.id}:${item.absolutePath}`
      pending[key] = (history.pending[key] || 0) + 1
      if (pending[key] >= config.confirmationChecks) ids.push(item.id)
    }
    if (revision !== configurationRevision) return { cancelled: true }
    const result = ids.length ? await cleanupMissingRecords(ids, inspection.databasePath, () => revision === configurationRevision) : null
    const remainingIds = new Set(result?.snapshot.videos.map(video => video.id))
    // Drop history for removed entries. Skipped/offline/recovered paths are absent
    // from this pass and must start their confirmation count again next time.
    if (result) for (const item of inspection.missing) if (!remainingIds.has(item.id)) delete pending[`${item.id}:${item.absolutePath}`]
    const next: AutoCleanupHistory = {
      lastCheckedAt: new Date().toISOString(), pending, pendingCount: Object.keys(pending).length,
      lastDeletedCount: result?.deletedCount || 0, totalDeletedCount: history.totalDeletedCount + (result?.deletedCount || 0),
      skipped: inspection.skipped, backupPath: result?.backupPath || history.backupPath,
    }
    if (original.database !== getDatabaseHandle().database) throw new Error('数据库已切换，已取消本轮自动清理')
    if (revision !== configurationRevision) return { cancelled: true }
    await saveLibrarySetting('automatic_missing_history', next, inspection.databasePath)
    return { status: publicStatus(next), deletedCount: result?.deletedCount || 0, snapshot: result?.snapshot }
  } finally { cleanupRunning = false }
}
