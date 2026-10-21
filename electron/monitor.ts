import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { getLibrarySetting, saveLibrarySetting, getCurrentDatabasePath, scanVideosFromDirectory } from './database'
import { validateScanOptions, type ScanOptions } from './scanner'
import { checkAutomaticCleanup } from './cleanup'

export type MonitorDirectory = ScanOptions & { id: string; directory: string; enabled: boolean; intervalSeconds: number }
const checked = new Map<string, number>()
let running = false
let windowRef: (() => BrowserWindow | null) | null = null
export async function getMonitors(): Promise<MonitorDirectory[]> { return getLibrarySetting('monitor_directories', []) }
export async function saveMonitors(items: MonitorDirectory[]) {
  const seen = new Set<string>()
  const normalized = items.map(item => {
    if (!path.isAbsolute(item.directory)) throw new Error('请选择完整的目录路径')
    const directory = path.resolve(item.directory)
    const key = process.platform === 'win32' ? directory.toLowerCase() : directory
    if (seen.has(key)) throw new Error('监控目录不能重复')
    seen.add(key)
    if (!Number.isFinite(item.intervalSeconds) || item.intervalSeconds < 15 || item.intervalSeconds > 86400) throw new Error('检测间隔需要在 15 秒到 24 小时之间')
    return { ...validateScanOptions(item), id: item.id || randomUUID(), directory, enabled: !!item.enabled, intervalSeconds: item.intervalSeconds, settleSeconds: Math.max(10, item.settleSeconds || 10) }
  })
  await saveLibrarySetting('monitor_directories', normalized)
  checked.clear()
  return normalized
}
function notify(value: unknown) {
  const win = windowRef?.()
  if (win && !win.isDestroyed()) win.webContents.send('library:monitor-update', value)
}
export async function checkMonitors(force = false) {
  if (running) return { busy: true }
  running = true
  let added = 0, updated = 0
  const errors: string[] = []
  try {
    const databasePath = getCurrentDatabasePath()
    const monitors = await getMonitors()
    for (const item of monitors.filter(item => item.enabled)) {
      if (databasePath !== getCurrentDatabasePath()) break
      const key = `${databasePath}:${item.id}`
      if (!force && Date.now() - (checked.get(key) || 0) < item.intervalSeconds * 1000) continue
      checked.set(key, Date.now())
      try {
        const snapshot = await scanVideosFromDirectory(item.directory, undefined, item)
        added += snapshot.scanSummary.added
        updated += snapshot.scanSummary.updated
        if (snapshot.scanSummary.added || snapshot.scanSummary.updated) notify({ snapshot, message: `自动检测：新增 ${snapshot.scanSummary.added}，更新 ${snapshot.scanSummary.updated}`, directory: item.directory })
      } catch (error) {
        const message = `${item.directory}：${error instanceof Error ? error.message : String(error)}`
        errors.push(message)
        notify({ error: message })
      }
    }
    try {
      const cleanup = await checkAutomaticCleanup()
      if (cleanup.status) notify({ autoCleanupStatus: cleanup.status, snapshot: cleanup.snapshot, message: cleanup.deletedCount ? `自动清理：已备份并移除 ${cleanup.deletedCount} 条失效记录` : undefined })
    } catch (error) { const message = `自动清理失败：${String(error)}`; errors.push(message); notify({ error: message }) }
    return { added, updated, errors }
  } finally { running = false }
}
export function startMonitor(getWindow: () => BrowserWindow | null) {
  windowRef = getWindow
  const timer = setInterval(() => { void checkMonitors().catch(error => console.error('[monitor]', error)) }, 5000)
  timer.unref()
  app.once('before-quit', () => clearInterval(timer))
  void checkMonitors().catch(error => console.error('[monitor]', error))
}
