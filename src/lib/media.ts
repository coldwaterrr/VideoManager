import { localFileUrl } from './playback'

const cache = new Map<string, MediaAssets>()
const clips = new Map<string, MediaAssets>()
const pending = new Map<string, Promise<MediaAssets>>()
export function videoMediaKey(video: VideoRecord) {
  return `${video.absolutePath}|${video.modifiedAt}|${video.fileSize}`
}
export function peekMedia(video: VideoRecord) {
  return cache.get(videoMediaKey(video))
}
export function cachedPreviewSlots(video: VideoRecord) {
  const key = videoMediaKey(video)
  return Array.from({ length: 6 }, (_, slot) => slot).filter((slot) => clips.has(`${key}:${slot}`))
}
export async function loadMedia(video: VideoRecord, preview = false, slot = 0): Promise<MediaAssets> {
  const key = videoMediaKey(video)
  const existing = preview ? clips.get(`${key}:${slot}`) : cache.get(key)
  if (preview ? existing?.preview : existing?.thumbnail) return existing!
  const requestKey = `${key}:${preview}:${slot}`
  if (pending.has(requestKey)) return pending.get(requestKey)!
  const request = (async () => {
    const result = await window.videosorter!.getMediaAssets(video.id, preview, slot)
    const previous = cache.get(key)
    const normalized = {
      ...result,
      thumbnail: result.thumbnail ? localFileUrl(result.thumbnail) : previous?.thumbnail || null,
      preview: result.preview ? localFileUrl(result.preview) : null,
    }
    cache.set(key, normalized)
    if (normalized.preview) clips.set(`${key}:${result.previewSlot ?? slot}`, normalized)
    if (clips.size > 480) clips.delete(clips.keys().next().value!)
    if (cache.size > 240) cache.delete(cache.keys().next().value!)
    if (result.durationSeconds > 0 && result.durationSeconds !== video.durationSeconds)
      window.dispatchEvent(
        new CustomEvent('vm-media-metadata', {
          detail: { id: video.id, key, durationSeconds: result.durationSeconds },
        })
      )
    return normalized
  })()
  pending.set(requestKey, request)
  try {
    return await request
  } finally {
    pending.delete(requestKey)
  }
}
let playing: HTMLVideoElement | null = null
export function playPreview(element: HTMLVideoElement) {
  if (playing && playing !== element) playing.pause()
  playing = element
  return element.play()
}
