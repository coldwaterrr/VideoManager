import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Clapperboard, Film, Folder, Play, Star } from 'lucide-react'
import { loadMedia, peekMedia } from '@/lib/media'
import { HoverPreview } from './HoverPreview'

export function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** exponent).toFixed(exponent > 0 ? 1 : 0)} ${units[exponent]}`
}
function formatDuration(seconds: number) {
  if (seconds <= 0) return '待解析'
  const values =
    seconds >= 3600
      ? [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), Math.floor(seconds % 60)]
      : [Math.floor(seconds / 60), Math.floor(seconds % 60)]
  return values.map((value) => String(value).padStart(2, '0')).join(':')
}

type Props = {
  video: VideoRecord
  index: number
  isSelected: boolean
  onSelect: () => void
  onOpen: () => void
  folders: VirtualFolderRecord[]
  onToggleFolder: (id: number) => void
  isMutatingFolder: boolean
  pendingVideoId: number | null
  isPreviewMode: boolean
  onScrape?: (id: number) => void
  canScrape: boolean
  selectionMode: boolean
  view: 'grid' | 'list'
  previewEnabled: boolean
}

export function VideoCard({
  video,
  index,
  isSelected,
  onSelect,
  onOpen,
  folders,
  onToggleFolder,
  isMutatingFolder,
  pendingVideoId,
  isPreviewMode,
  onScrape,
  canScrape,
  selectionMode,
  view,
  previewEnabled,
}: Props) {
  const [media, setMedia] = useState<MediaAssets | null>(() => peekMedia(video) || null)
  const thumbnail = media?.thumbnail || null
  const [hovering, setHovering] = useState(false)
  const card = useRef<HTMLElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setMedia(peekMedia(video) || null)
    setHovering(false)
    if (isPreviewMode) return
    let disposed = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void loadMedia(video)
          .then((value) => {
            if (!disposed) setMedia(value)
          })
          .catch(() => {})
      },
      { rootMargin: '240px' }
    )
    if (card.current) observer.observe(card.current)
    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [video.absolutePath, video.modifiedAt, video.fileSize, isPreviewMode])
  useEffect(() => {
    const pause = () => {
      if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) stopPreview()
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    document.addEventListener('visibilitychange', pause)
    motion.addEventListener('change', pause)
    return () => {
      document.removeEventListener('visibilitychange', pause)
      motion.removeEventListener('change', pause)
    }
  }, [])
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    },
    []
  )
  useEffect(() => {
    if (!previewEnabled || selectionMode) stopPreview()
  }, [previewEnabled, selectionMode])
  const stopPreview = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setHovering(false)
  }
  const assigned = folders.filter((folder) => video.folderIds.includes(folder.id))
  const name = video.title || video.name.replace(/\.[^.]+$/, '')
  return (
    <article
      ref={card}
      className={`video-card ${view === 'list' ? 'video-row' : ''} ${isSelected ? 'is-selected' : ''} ${selectionMode ? 'selection-mode' : ''}`}
      onMouseEnter={() => {
        if (
          isPreviewMode ||
          !previewEnabled ||
          selectionMode ||
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        )
          return
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        hoverTimer.current = setTimeout(() => {
          setHovering(true)
        }, 100)
      }}
      onMouseLeave={stopPreview}
    >
      <label className="card-checkbox" title={`选择 ${name}`}>
        <input type="checkbox" checked={isSelected} aria-label={`选择 ${name}`} onChange={onSelect} />
        <span>
          <Check size={13} strokeWidth={3} />
        </span>
      </label>
      <button
        type="button"
        className={`video-cover cover-tone-${index % 6}`}
        aria-label={`${selectionMode ? '选择' : '播放'} ${name}`}
        title={name}
        onClick={selectionMode ? onSelect : onOpen}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            onError={() => {
              setMedia((previous) => (previous ? { ...previous, thumbnail: null } : null))
            }}
          />
        ) : (
          <div className="cover-placeholder">
            <Clapperboard size={38} strokeWidth={1} />
            <span>{video.name.split('.').pop()?.toUpperCase()}</span>
          </div>
        )}
        {previewEnabled && !selectionMode && !isPreviewMode && (
          <HoverPreview video={video} hovering={hovering} />
        )}
        <span className="cover-format">{video.name.split('.').pop()?.toUpperCase()}</span>
        <span className="cover-duration">
          {formatDuration(media?.durationSeconds || video.durationSeconds)}
        </span>
        {!selectionMode && (
          <span className="cover-play">
            <Play size={20} fill="currentColor" />
          </span>
        )}
      </button>
      <div className="card-information">
        <button
          className="card-title"
          title={video.title ? `${video.title}\n${video.name}` : video.name}
          onClick={selectionMode ? onSelect : onOpen}
        >
          {name}
        </button>
        <p className="card-path" title={video.absolutePath}>
          {video.absolutePath}
        </p>
        <div className="card-metadata">
          <span>{formatBytes(video.fileSize)}</span>
          <span>
            {video.releaseDate?.slice(0, 4) ||
              new Date(video.modifiedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
          </span>
          {(video.voteAverage || 0) > 0 && (
            <span className="card-rating">
              <Star size={12} fill="currentColor" />
              {video.voteAverage?.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <details className="card-folders">
        <summary title="编辑视频分类">
          <Folder size={13} />
          <span>{assigned.map((folder) => folder.name).join('、') || '未分类'}</span>
          <ChevronDown size={13} />
        </summary>
        <div className="card-folder-options">
          <div className="folder-options-title">添加到分类</div>
          {folders.length ? (
            folders.map((folder) => (
              <button
                key={folder.id}
                disabled={isMutatingFolder || isPreviewMode}
                onClick={() => onToggleFolder(folder.id)}
                aria-pressed={video.folderIds.includes(folder.id)}
              >
                <Folder size={14} />
                <span>{folder.name}</span>
                {video.folderIds.includes(folder.id) && <Check size={14} />}
                {pendingVideoId === video.id && isMutatingFolder && <span>…</span>}
              </button>
            ))
          ) : (
            <p>在左侧新建一个分类</p>
          )}
          {onScrape && (
            <button
              disabled={!canScrape}
              title={!canScrape ? '请先在设置中配置 TMDB' : '搜索并匹配影视信息'}
              onClick={() => onScrape(video.id)}
            >
              <Film size={14} />
              匹配影视信息
            </button>
          )}
        </div>
      </details>
    </article>
  )
}
