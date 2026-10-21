import { useEffect, useRef, useState } from 'react'
import { cachedPreviewSlots, loadMedia, playPreview, videoMediaKey } from '@/lib/media'

export function HoverPreview({ video, hovering }: { video: VideoRecord; hovering: boolean }) {
  const buffers = useRef<(HTMLVideoElement | null)[]>([null, null])
  const [front, setFront] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [message, setMessage] = useState('')
  const frontRef = useRef(0)
  const key = videoMediaKey(video)
  useEffect(() => {
    if (!hovering) return
    let cancelled = false
    const elements = [...buffers.current]
    let current = 0
    let bag: number[] = []
    let prepared: Promise<number | null>
    const nextSlot = (exclude: number) => {
      if (!bag.length) {
        bag = Array.from({ length: 6 }, (_, slot) => slot).filter((slot) => slot !== exclude)
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[bag[i], bag[j]] = [bag[j], bag[i]]
        }
      }
      return bag.pop()!
    }
    const load = async (index: number, slot: number) => {
      const asset = await loadMedia(video, true, slot)
      if (cancelled) return null
      if (!asset.preview) throw new Error(asset.error || '暂无法预览')
      const element = elements[index]!
      element.src = asset.preview
      element.dataset.previewSlot = String(slot)
      element.dataset.previewStart = String(asset.previewStartSeconds ?? 0)
      element.load()
      return slot
    }
    const start = async (index: number, slot: number) => {
      if (cancelled) return
      current = index
      frontRef.current = index
      setFront(index)
      setMessage('')
      // Prepare the other buffer while this 3–5 second segment is playing.
      prepared = load(1 - index, nextSlot(slot)).catch(() => null)
      try {
        await playPreview(elements[index]!)
      } catch {
        if (!cancelled) setMessage('暂无法预览')
      }
    }
    const ended = async (index: number) => {
      if (cancelled || index !== current) return
      setPlaying(false)
      setMessage('正在准备下个片段…')
      const slot = await prepared
      if (cancelled) return
      if (slot === null) {
        setMessage('暂时无法读取下个片段')
        return
      }
      await start(1 - index, slot)
    }
    const listeners = elements.map((element, index) => {
      const listener = () => {
        void ended(index)
      }
      element?.addEventListener('ended', listener)
      return listener
    })
    const known = cachedPreviewSlots(video)
    const first = known.length ? known[Math.floor(Math.random() * known.length)] : 0
    setPlaying(false)
    setMessage('正在准备本地预览…')
    void load(0, first)
      .then((slot) => {
        if (slot !== null) return start(0, slot)
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : '暂无法预览')
      })
    return () => {
      cancelled = true
      elements.forEach((element, index) => {
        element?.removeEventListener('ended', listeners[index])
        if (element) {
          element.pause()
          element.removeAttribute('src')
          element.load()
        }
      })
    }
  }, [hovering, key])
  return (
    <>
      {[0, 1].map((index) => (
        <video
          key={index}
          ref={(element) => {
            buffers.current[index] = element
          }}
          muted
          playsInline
          preload="auto"
          className={hovering && playing && front === index ? 'preview-visible' : 'preview-hidden'}
          onPlaying={() => {
            if (frontRef.current === index) setPlaying(true)
          }}
          onPause={() => {
            if (frontRef.current === index) setPlaying(false)
          }}
          onError={() => {
            if (frontRef.current === index && hovering) {
              setPlaying(false)
              setMessage('暂无法预览')
            }
          }}
        />
      ))}
      {hovering && !playing && <span className="preview-status">{message || '正在准备本地预览…'}</span>}
    </>
  )
}
