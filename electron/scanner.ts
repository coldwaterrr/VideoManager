import { promises as fs, type Stats } from 'node:fs'
import path from 'node:path'

export const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.flv', '.ts', '.mts', '.m2ts', '.mpeg', '.mpg']
export type ScanOptions = { minSizeMB?: number; maxSizeMB?: number; formats?: string[]; recursive?: boolean; settleSeconds?: number }
export type ScanProgressCallback = (progress: { type: 'scanning' | 'found' | 'processing' | 'complete'; message: string; current?: number; total?: number; filePath?: string }) => void
export type ScannedFile = { absolutePath: string; stats: Stats }

export function validateScanOptions(options: ScanOptions = {}): ScanOptions {
  for (const value of [options.minSizeMB, options.maxSizeMB, options.settleSeconds]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('文件大小和稳定时间必须是非负数字')
  }
  if (options.maxSizeMB && options.maxSizeMB < (options.minSizeMB || 0)) throw new Error('最大文件大小不能小于最小文件大小')
  const formats = options.formats ?? VIDEO_EXTENSIONS
  if (!formats.length || formats.some(format => !VIDEO_EXTENSIONS.includes(format.toLowerCase()))) throw new Error('请至少选择一种支持的视频格式')
  return { ...options, formats: [...new Set(formats.map(format => format.toLowerCase()))] }
}

// Read and stat before starting a SQLite transaction. A disappearing file must not
// roll back the entire import, and other IPC handlers must never share a transaction.
export async function collectVideoFiles(directory: string, options: ScanOptions = {}, onProgress?: ScanProgressCallback) {
  const filter = validateScanOptions(options)
  const root = path.resolve(directory)
  if (!(await fs.stat(root)).isDirectory()) throw new Error('扫描路径不是目录')
  const queue = [root]
  const files: ScannedFile[] = []
  const ignored = new Set(['$recycle.bin', 'system volume information', 'node_modules', '.git', 'windows', 'appdata', 'programdata'])
  let skipped = 0
  while (queue.length) {
    const dirs = queue.splice(0, 12)
    await Promise.all(dirs.map(async dir => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const absolutePath = path.join(dir, entry.name)
          if (entry.isDirectory() && filter.recursive !== false && !ignored.has(entry.name.toLowerCase())) queue.push(absolutePath)
          if (!entry.isFile() || !filter.formats!.includes(path.extname(entry.name).toLowerCase())) continue
          try {
            const stats = await fs.stat(absolutePath)
            if (!stats.isFile() || stats.size === 0) continue
            const mb = stats.size / 1024 ** 2
            if (mb < (filter.minSizeMB || 0) || (filter.maxSizeMB && mb > filter.maxSizeMB)) continue
            if (Date.now() - stats.mtimeMs < (filter.settleSeconds || 0) * 1000) continue
            files.push({ absolutePath, stats })
            if (files.length % 25 === 1) onProgress?.({ type: 'found', message: `已找到 ${files.length} 个符合条件的视频`, current: files.length, filePath: absolutePath })
          } catch { skipped++ }
        }
      } catch (error) { if (dir === root) throw error; skipped++ }
    }))
    onProgress?.({ type: 'scanning', message: `正在扫描，已找到 ${files.length} 个视频`, current: files.length })
  }
  return { files, skipped }
}
