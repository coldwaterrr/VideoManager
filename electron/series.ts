import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import {
  getLibrarySnapshot,
  getDatabaseHandle,
  saveLibrarySetting,
  type VideoRecord,
  type LibrarySnapshot,
} from './database'

export type SeriesGroup = { id: string; name: string; videoIds: number[]; createdAt: string }
export type SeriesState = { databasePath: string; groups: SeriesGroup[] }
export type SeriesSuggestion = {
  id: string
  name: string
  videoIds: number[]
  reason: string
  confidence: 'high' | 'review'
}
export type SeriesPreview = { databasePath: string; fingerprint: string; groups: SeriesSuggestion[] }
const key = 'series_groups_v1'
let writes: Promise<unknown> = Promise.resolve()
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const request = writes.catch(() => {}).then(action)
  writes = request
  return request
}
function active(snapshot: LibrarySnapshot) {
  const handle = getDatabaseHandle()
  if (handle.databaseMeta.databasePath !== snapshot.databaseMeta.databasePath)
    throw new Error('视频库已切换，请重新载入系列。')
  return handle
}
function groupsFrom(snapshot: LibrarySnapshot): SeriesGroup[] {
  const { database } = active(snapshot)
  const value = database.exec('SELECT value FROM app_meta WHERE key = ?', [key])[0]?.values[0]?.[0]
  const stored = value ? (JSON.parse(String(value)) as SeriesGroup[]) : []
  const valid = new Set(snapshot.videos.map((video) => video.id))
  return stored
    .map((group) => ({ ...group, videoIds: group.videoIds.filter((id) => valid.has(id)) }))
    .filter((group) => group.videoIds.length)
}
function fingerprint(snapshot: LibrarySnapshot, groups: SeriesGroup[]) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        snapshot.videos
          .map((video) => [video.id, video.absolutePath, video.fileSize, video.modifiedAt])
          .sort((a, b) => Number(a[0]) - Number(b[0])),
        groups,
      ])
    )
    .digest('hex')
}
export async function getSeries(): Promise<SeriesState> {
  const snapshot = await getLibrarySnapshot()
  return { databasePath: snapshot.databaseMeta.databasePath, groups: groupsFrom(snapshot) }
}
const generic = /^(?:videos?|movies?|media|downloads?|clips?|视频|电影|下载|素材|未分类|新建文件夹)$/i
export function seriesStem(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .normalize('NFKC')
    .replace(
      /\b(?:2160p|1080p|720p|480p|4k|8k|x26[45]|h\.?26[45]|hevc|avc|aac|bluray|web[- .]?dl|webrip|hdtv|hdr|remux)\b/gi,
      ' '
    )
    .replace(/\b(?:s\d{1,2}e\d{1,3}|(?:episode|ep|part|chapter|disc|cd)\s*[-_]?\s*\d{1,3})\b/gi, ' ')
    .replace(/第[零一二三四五六七八九十百\d]+[集章节部期段课讲]/g, ' ')
    .replace(/(?:[\s._-]+|[（(])\d{1,3}[）)]?$/g, ' ')
    .replace(/([^\d])\d{1,3}$/, '$1')
    .replace(/^[\d]{1,3}[\s._-]+/g, '')
    .replace(/[._\-\[\]()（）【】]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function parentDirectory(video: VideoRecord) {
  return (video.absolutePath.includes('\\') ? path.win32 : path).dirname(video.absolutePath)
}
export function suggestSeries(
  videos: VideoRecord[],
  mode: 'smart' | 'directory' | 'name'
): SeriesSuggestion[] {
  const assigned = new Set<number>()
  const results: SeriesSuggestion[] = []
  function add(name: string, members: VideoRecord[], reason: string, confidence: 'high' | 'review') {
    const available = members.filter((video) => !assigned.has(video.id))
    if (available.length < 2) return
    available.forEach((video) => assigned.add(video.id))
    results.push({
      id: createHash('sha256')
        .update(JSON.stringify([name, available.map((video) => video.id)]))
        .digest('hex')
        .slice(0, 16),
      name: name.slice(0, 100),
      videoIds: available.map((video) => video.id),
      reason,
      confidence,
    })
  }
  if (mode !== 'directory') {
    const exact = new Map<string, VideoRecord[]>()
    for (const video of videos) {
      const stem = seriesStem(video.name)
      const normalized = stem.toLocaleLowerCase()
      if ((stem.length < 3 && !/\p{Script=Han}{2}/u.test(stem)) || generic.test(stem)) continue
      exact.set(normalized, [...(exact.get(normalized) || []), video])
    }
    for (const members of exact.values())
      add(seriesStem(members[0].name), members, '名称主体一致，编号或清晰度不同', 'high')
    const prefixes = new Map<string, VideoRecord[]>()
    for (const video of videos.filter((video) => !assigned.has(video.id))) {
      const stem = seriesStem(video.name)
      const tokens = stem.split(' ')
      for (let length = Math.min(6, tokens.length - 1); length >= 2; length--) {
        const prefix = tokens.slice(0, length).join(' ')
        if (prefix.length < 8 || prefix.length / stem.length < 0.55 || generic.test(prefix)) continue
        const normalized = `${parentDirectory(video).toLocaleLowerCase()}|${prefix.toLocaleLowerCase()}`
        prefixes.set(normalized, [...(prefixes.get(normalized) || []), video])
      }
    }
    for (const [prefix, members] of [...prefixes].sort((a, b) => b[0].length - a[0].length))
      add(prefix.split('|').at(-1)!, members, '同目录且名称有较长的共同前缀，请核对', 'review')
  }
  if (mode !== 'name') {
    const directories = new Map<string, VideoRecord[]>()
    for (const video of videos.filter((video) => !assigned.has(video.id))) {
      const directory = parentDirectory(video)
      directories.set(directory, [...(directories.get(directory) || []), video])
    }
    for (const [directory, members] of directories) {
      const name = (directory.includes('\\') ? path.win32 : path).basename(directory)
      if (!name || (mode === 'smart' && (generic.test(name) || members.length > 100))) continue
      add(
        name,
        members,
        mode === 'directory' ? '文件位于同一目录，请确认是否属于同一系列' : '同一专用目录，建议核对',
        'review'
      )
    }
  }
  return results.sort(
    (a, b) =>
      (a.confidence === 'high' ? -1 : 1) - (b.confidence === 'high' ? -1 : 1) ||
      b.videoIds.length - a.videoIds.length
  )
}
export async function previewSeries(mode: 'smart' | 'directory' | 'name'): Promise<SeriesPreview> {
  if (!['smart', 'directory', 'name'].includes(mode)) throw new Error('分组方式无效。')
  const snapshot = await getLibrarySnapshot()
  const existing = groupsFrom(snapshot)
  const grouped = new Set(existing.flatMap((group) => group.videoIds))
  return {
    databasePath: snapshot.databaseMeta.databasePath,
    fingerprint: fingerprint(snapshot, existing),
    groups: suggestSeries(
      snapshot.videos.filter((video) => !grouped.has(video.id)),
      mode
    ),
  }
}
function validate(name: string, ids: number[], snapshot: LibrarySnapshot, occupied: Set<number>) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100)
    throw new Error('系列名称需为 1–100 个字符。')
  if (
    !Array.isArray(ids) ||
    ids.length < 2 ||
    ids.some((id) => !Number.isSafeInteger(id)) ||
    new Set(ids).size !== ids.length
  )
    throw new Error('一个新系列至少需要两个不同视频。')
  const valid = new Set(snapshot.videos.map((video) => video.id))
  for (const id of ids) {
    if (!valid.has(id)) throw new Error('部分视频已被移除，请重新预览。')
    if (occupied.has(id)) throw new Error('部分视频已有系列，不能重复归组。')
    occupied.add(id)
  }
}
async function write(snapshot: LibrarySnapshot, groups: SeriesGroup[]): Promise<SeriesState> {
  const { database } = active(snapshot)
  const previous = database.exec('SELECT value FROM app_meta WHERE key = ?', [key])[0]?.values[0]?.[0]
  try {
    await saveLibrarySetting(key, groups, snapshot.databaseMeta.databasePath)
  } catch (error) {
    if (getDatabaseHandle().database === database) {
      if (previous === undefined) database.run('DELETE FROM app_meta WHERE key = ?', [key])
      else database.run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [key, previous])
    }
    throw error
  }
  return { databasePath: snapshot.databaseMeta.databasePath, groups }
}
export function applySeries(preview: SeriesPreview): Promise<SeriesState> {
  return serialized(async () => {
    const snapshot = await getLibrarySnapshot()
    const existing = groupsFrom(snapshot)
    if (
      snapshot.databaseMeta.databasePath !== preview.databasePath ||
      fingerprint(snapshot, existing) !== preview.fingerprint
    )
      throw new Error('视频库或系列已变化，请重新生成建议。')
    if (!Array.isArray(preview.groups) || !preview.groups.length) throw new Error('请选择要保存的系列。')
    const occupied = new Set(existing.flatMap((group) => group.videoIds))
    const added = preview.groups.map((group) => {
      validate(group.name, group.videoIds, snapshot, occupied)
      return {
        id: randomUUID(),
        name: group.name.trim(),
        videoIds: group.videoIds,
        createdAt: new Date().toISOString(),
      }
    })
    return write(snapshot, [...existing, ...added])
  })
}
export function saveSeries(
  databasePath: string,
  name: string,
  ids: number[],
  id?: string
): Promise<SeriesState> {
  return serialized(async () => {
    const snapshot = await getLibrarySnapshot()
    if (databasePath !== snapshot.databaseMeta.databasePath) throw new Error('视频库已切换，请重新打开分组。')
    const existing = groupsFrom(snapshot)
    if (id && !existing.some((group) => group.id === id)) throw new Error('该系列已不存在。')
    const other = existing.filter((group) => group.id !== id)
    validate(name, ids, snapshot, new Set(other.flatMap((group) => group.videoIds)))
    const group = {
      id: id || randomUUID(),
      name: name.trim(),
      videoIds: ids,
      createdAt: existing.find((item) => item.id === id)?.createdAt || new Date().toISOString(),
    }
    return write(snapshot, [...other, group])
  })
}
export function deleteSeries(databasePath: string, id: string): Promise<SeriesState> {
  return serialized(async () => {
    const snapshot = await getLibrarySnapshot()
    if (databasePath !== snapshot.databaseMeta.databasePath) throw new Error('视频库已切换，请重新打开分组。')
    return write(
      snapshot,
      groupsFrom(snapshot).filter((group) => group.id !== id)
    )
  })
}
