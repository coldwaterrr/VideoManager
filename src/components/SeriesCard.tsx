import { useEffect, useState } from 'react'
import { Layers, ChevronRight, Clapperboard } from 'lucide-react'
import { loadMedia, peekMedia } from '@/lib/media'

export function SeriesCard({
  group,
  members,
  onOpen,
  view,
  previewMode,
}: {
  group: SeriesGroup
  members: VideoRecord[]
  onOpen: () => void
  view: 'grid' | 'list'
  previewMode: boolean
}) {
  const [thumbnail, setThumbnail] = useState<string | null>(() => peekMedia(members[0])?.thumbnail || null)
  const first = members[0]
  useEffect(() => {
    let active = true
    setThumbnail(peekMedia(first)?.thumbnail || null)
    if (!previewMode)
      void loadMedia(first)
        .then((result) => {
          if (active) setThumbnail(result.thumbnail)
        })
        .catch(() => {})
    return () => {
      active = false
    }
  }, [first.absolutePath, first.modifiedAt, first.fileSize, previewMode])
  return (
    <section className={`series-card ${view === 'list' ? 'series-row' : ''}`}>
      <button onClick={onOpen} aria-label={`展开系列 ${group.name}`}>
        <div className="series-cover">
          {thumbnail ? <img src={thumbnail} alt="" /> : <Clapperboard size={36} strokeWidth={1} />}
          <span>
            <Layers size={13} />
            {members.length} 个视频
            {members.length < group.videoIds.length ? ` / 共 ${group.videoIds.length} 个` : ''}
          </span>
        </div>
        <div className="series-card-info">
          <strong title={group.name}>{group.name}</strong>
          <p>
            {members
              .slice(0, 2)
              .map((video) => video.title || video.name)
              .join(' / ')}
          </p>
          <span>
            展开系列
            <ChevronRight size={13} />
          </span>
        </div>
      </button>
    </section>
  )
}
