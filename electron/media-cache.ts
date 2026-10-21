import { app } from 'electron'
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import type { VideoRecord } from './database'

export type MediaAssets = {
  thumbnail: string | null
  preview: string | null
  durationSeconds: number
  cached: boolean
  elapsedMs: number
  previewSlot?: number
  previewStartSeconds?: number
  previewDurationSeconds?: number
  error?: string
}
type Metadata = { durationSeconds: number; lastUsed: number; startSeconds?: number; clipSeconds?: number }
export const PREVIEW_SLOTS = 6
type Job = {
  key: string
  video: VideoRecord
  preview: boolean
  slot: number
  resolve: (value: MediaAssets) => void
  priority: number
}
const jobs: Job[] = []
const pending = new Map<string, Promise<MediaAssets>>()
const failures = new Map<string, number>()
const children = new Set<ChildProcess>()
let active = 0
let viewport = new Set<number>()
let warmRevision = 0
let stopping = false
let generated = 0
const CACHE_LIMIT = 1024 ** 3

export function mediaKey(video: Pick<VideoRecord, 'absolutePath' | 'fileSize' | 'modifiedAt'>) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        process.platform === 'win32' ? video.absolutePath.toLowerCase() : video.absolutePath,
        video.fileSize,
        video.modifiedAt,
        'v2',
      ])
    )
    .digest('hex')
}
export function mediaCacheRoot() {
  return path.join(app.getPath('userData'), 'media-cache', 'v2')
}
function locations(video: VideoRecord, slot = 0) {
  const base = path.join(mediaCacheRoot(), mediaKey(video))
  return {
    thumbnail: `${base}.jpg`,
    preview: `${base}.preview-r2-${slot}.mp4`,
    metadata: `${base}.json`,
    previewMetadata: `${base}.preview-r2-${slot}.json`,
  }
}
function ffmpegPath() {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  return [
    process.env.VIDEOMANAGER_FFMPEG_PATH,
    path.join(path.dirname(process.execPath), 'media-tools', name),
    path.join(process.env.APP_ROOT || process.cwd(), 'media-tools', name),
    ...(process.env.PATH || '').split(path.delimiter).map((dir) => path.join(dir, name)),
  ].find((file) => file && existsSync(file))
}
async function cachedAssets(video: VideoRecord, slot = 0): Promise<MediaAssets> {
  const files = locations(video, slot)
  const [thumbnail, preview, metadata, clipMetadata] = await Promise.all([
    fs
      .stat(files.thumbnail)
      .then((stat) => (stat.size > 0 ? files.thumbnail : null))
      .catch(() => null),
    fs
      .stat(files.preview)
      .then((stat) => (stat.size > 0 ? files.preview : null))
      .catch(() => null),
    fs
      .readFile(files.metadata, 'utf8')
      .then((value) => JSON.parse(value) as Metadata)
      .catch(() => null),
    fs
      .readFile(files.previewMetadata, 'utf8')
      .then((value) => JSON.parse(value) as Metadata)
      .catch(() => null),
  ])
  return {
    thumbnail,
    preview,
    durationSeconds: metadata?.durationSeconds || clipMetadata?.durationSeconds || video.durationSeconds,
    previewSlot: slot,
    previewStartSeconds: clipMetadata?.startSeconds,
    previewDurationSeconds: clipMetadata?.clipSeconds,
    cached: true,
    elapsedMs: 0,
  }
}
function runTool(executable: string, args: string[], timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    children.add(child)
    let log = '',
      timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.stderr?.on('data', (chunk) => {
      log = (log + String(chunk)).slice(-24000)
    })
    child.once('error', (error) => {
      clearTimeout(timeout)
      children.delete(child)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      children.delete(child)
      if (code === 0 && !timedOut) resolve(log)
      else reject(new Error(timedOut ? '读取超时；磁盘可能暂时不可用。' : '无法解码此视频，稍后可以重试。'))
    })
  })
}
function parseDuration(log: string) {
  const duration = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  return duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : 0
}
export function planPreview(durationSeconds: number, slot: number) {
  const clipSeconds = Math.min(durationSeconds || 5, Math.round((3 + Math.random() * 2) * 10) / 10)
  const maxStart = Math.max(0, durationSeconds - clipSeconds - 0.1)
  return {
    clipSeconds,
    startSeconds: Math.floor(((maxStart * (slot + Math.random())) / PREVIEW_SLOTS) * 100) / 100,
  }
}
async function generate(video: VideoRecord, preview: boolean, slot: number): Promise<MediaAssets> {
  const start = performance.now()
  const cached = await cachedAssets(video, slot)
  if (preview ? cached.preview : cached.thumbnail) return { ...cached, elapsedMs: performance.now() - start }
  const executable = ffmpegPath()
  if (!executable) return { ...cached, error: '本地 FFmpeg 不可用。', elapsedMs: performance.now() - start }
  const failedKey = `${mediaKey(video)}:${preview}:${slot}`
  if ((failures.get(failedKey) || 0) > Date.now())
    return { ...cached, error: '暂时无法读取视频，稍后再试。', elapsedMs: performance.now() - start }
  const files = locations(video, slot)
  const destination = preview ? files.preview : files.thumbnail
  const temporary = path.join(mediaCacheRoot(), `${randomUUID()}.${preview ? 'mp4' : 'jpg'}`)
  const metadataTemporary = path.join(mediaCacheRoot(), `${randomUUID()}.json`)
  try {
    await fs.mkdir(mediaCacheRoot(), { recursive: true })
    let log = ''
    let sourceDuration = cached.durationSeconds
    if (preview && sourceDuration <= 0)
      sourceDuration = parseDuration(
        await runTool(
          executable,
          [
            '-hide_banner',
            '-nostdin',
            '-threads',
            '1',
            '-i',
            video.absolutePath,
            '-t',
            '0',
            '-f',
            'null',
            '-',
          ],
          6000
        )
      )
    const plan = planPreview(sourceDuration, slot)
    let startTime = preview ? plan.startSeconds : sourceDuration > 0 ? Math.min(8, sourceDuration * 0.15) : 3
    const args = (seek: number) => [
      '-hide_banner',
      '-nostdin',
      '-nostats',
      '-y',
      '-filter_threads',
      '1',
      '-threads',
      '1',
      '-ss',
      String(seek),
      '-i',
      video.absolutePath,
      '-an',
      '-sn',
      '-dn',
      ...(preview
        ? [
            '-t',
            String(plan.clipSeconds),
            '-vf',
            'scale=480:270:force_original_aspect_ratio=decrease:force_divisible_by=2',
            '-fpsmax',
            '30',
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-crf',
            '29',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            '-threads',
            '1',
          ]
        : [
            '-frames:v',
            '1',
            '-vf',
            'scale=480:270:force_original_aspect_ratio=decrease',
            '-q:v',
            '4',
            '-threads',
            '1',
          ]),
      temporary,
    ]
    log = await runTool(executable, args(startTime), preview ? 12000 : 6000)
    if (
      !(await fs.stat(temporary).catch(() => null))?.size ||
      /Output file is empty|nothing was encoded|video:0(?:kB|KiB)/i.test(log)
    ) {
      startTime = 0
      log = await runTool(executable, args(0), preview ? 12000 : 6000)
    }
    if (!(await fs.stat(temporary)).size) throw new Error('未读取到画面。')
    if (stopping) throw new Error('应用正在退出。')
    await fs.rename(temporary, destination)
    const durationSeconds = parseDuration(log) || sourceDuration
    await fs.writeFile(
      metadataTemporary,
      JSON.stringify({
        durationSeconds,
        lastUsed: Date.now(),
        ...(preview ? { startSeconds: startTime, clipSeconds: plan.clipSeconds } : {}),
      } satisfies Metadata)
    )
    await fs.rename(metadataTemporary, preview ? files.previewMetadata : files.metadata)
    const result = await cachedAssets(video, slot)
    if (++generated % 64 === 0) void pruneMediaCache().catch(() => {})
    return { ...result, cached: false, elapsedMs: performance.now() - start }
  } catch (error) {
    failures.set(failedKey, Date.now() + 30000)
    if (failures.size > 512) failures.delete(failures.keys().next().value!)
    return {
      ...cached,
      error: error instanceof Error ? error.message : '读取失败。',
      elapsedMs: performance.now() - start,
    }
  } finally {
    await Promise.all([fs.unlink(temporary).catch(() => {}), fs.unlink(metadataTemporary).catch(() => {})])
  }
}
function pump() {
  if (stopping) return
  jobs.sort(
    (a, b) =>
      b.priority + (viewport.has(b.video.id) ? 100 : 0) - (a.priority + (viewport.has(a.video.id) ? 100 : 0))
  )
  while (active < 2 && jobs.length) {
    const job = jobs.shift()!
    active++
    void generate(job.video, job.preview, job.slot)
      .then(job.resolve)
      .catch(() =>
        job.resolve({
          thumbnail: null,
          preview: null,
          durationSeconds: 0,
          cached: false,
          elapsedMs: 0,
          error: '缓存准备失败。',
        })
      )
      .finally(() => {
        active--
        pending.delete(job.key)
        pump()
      })
  }
}
export async function getMediaAssets(
  video: VideoRecord,
  preview = false,
  urgent = true,
  slot = 0
): Promise<MediaAssets> {
  if (!Number.isInteger(slot) || slot < 0 || slot >= PREVIEW_SLOTS) throw new Error('预览片段参数无效。')
  const start = performance.now()
  const cached = await cachedAssets(video, slot)
  if (stopping) return { ...cached, error: '应用正在退出。', elapsedMs: performance.now() - start }
  if (preview ? cached.preview : cached.thumbnail) return { ...cached, elapsedMs: performance.now() - start }
  const key = `${mediaKey(video)}:${preview}:${slot}`
  if (pending.has(key)) {
    const waiting = jobs.find((job) => job.key === key)
    if (waiting && urgent) waiting.priority = 500
    return pending.get(key)!
  }
  const promise = new Promise<MediaAssets>((resolve) =>
    jobs.push({ key, video, preview, slot, resolve, priority: urgent ? (preview ? 500 : 200) : 0 })
  )
  pending.set(key, promise)
  pump()
  return promise
}
export function warmMediaViewport(videos: VideoRecord[], previewEnabled: boolean) {
  const revision = ++warmRevision
  viewport = new Set(videos.map((video) => video.id))
  pump()
  // Warm clips after covers, in small batches. Changing pages stops the old loop.
  void Promise.all(videos.slice(0, 12).map((video) => getMediaAssets(video, false, false))).then(async () => {
    if (!previewEnabled) return
    for (const video of videos.slice(0, 8)) {
      if (revision !== warmRevision || stopping) break
      await getMediaAssets(video, true, false)
    }
  })
}
export async function mediaCacheStats() {
  const root = mediaCacheRoot()
  const names = (await fs.readdir(root).catch(() => [] as string[])).filter((name) =>
    /^[a-f0-9]{64}(?:\.preview-r[12]-[0-5])?\.(jpg|mp4|json)$/.test(name)
  )
  const files = await Promise.all(
    names.map(async (name) => ({
      path: path.join(root, name),
      stat: await fs.stat(path.join(root, name)).catch(() => null),
    }))
  )
  return {
    bytes: files.reduce((sum, file) => sum + (file.stat?.size || 0), 0),
    thumbnails: names.filter((name) => name.endsWith('.jpg')).length,
    previews: names.filter((name) => name.endsWith('.mp4')).length,
    limitBytes: CACHE_LIMIT,
  }
}
export async function pruneMediaCache() {
  const root = mediaCacheRoot()
  const names = (await fs.readdir(root).catch(() => [] as string[])).filter((name) =>
    /^[a-f0-9]{64}(?:\.preview-r[12]-[0-5])?\.(jpg|mp4|json)$/.test(name)
  )
  const files = (
    await Promise.all(
      names.map(async (name) => ({ name, stat: await fs.stat(path.join(root, name)).catch(() => null) }))
    )
  ).filter((file) => file.stat)
  let size = files.reduce((sum, file) => sum + file.stat!.size, 0)
  if (size <= CACHE_LIMIT) return
  for (const file of files.sort((a, b) => a.stat!.atimeMs - b.stat!.atimeMs)) {
    if (size <= CACHE_LIMIT * 0.85) break
    await fs.unlink(path.join(root, file.name)).catch(() => {})
    size -= file.stat!.size
  }
}
export function stopMediaCache() {
  stopping = true
  warmRevision++
  for (const child of children) child.kill()
  for (const job of jobs.splice(0))
    job.resolve({
      thumbnail: null,
      preview: null,
      durationSeconds: 0,
      cached: false,
      elapsedMs: 0,
      error: '应用正在退出。',
    })
}
