import { X } from 'lucide-react'

export type LibraryFilter = { format: string; minSize: string; maxSize: string; duration: string }
export const emptyLibraryFilter: LibraryFilter = { format: '', minSize: '', maxSize: '', duration: '' }

export function LibraryFilters({
  value,
  onChange,
  tags,
  selectedTag,
  onTagChange,
  onReset,
}: {
  value: LibraryFilter
  onChange: (value: LibraryFilter) => void
  tags: { name: string; count: number }[]
  selectedTag: string | null
  onTagChange: (value: string | null) => void
  onReset: () => void
}) {
  const update = (field: keyof LibraryFilter, next: string) => onChange({ ...value, [field]: next })
  const invalidSize =
    value.minSize !== '' && value.maxSize !== '' && Number(value.minSize) > Number(value.maxSize)
  return (
    <section className="library-filters" aria-label="视频库筛选条件">
      <div className="filter-fields">
        <label>
          视频格式
          <select
            aria-label="视频格式"
            value={value.format}
            onChange={(event) => update('format', event.target.value)}
          >
            <option value="">全部格式</option>
            {[
              'mp4',
              'mkv',
              'mov',
              'avi',
              'wmv',
              'webm',
              'm4v',
              'flv',
              'ts',
              'mts',
              'm2ts',
              'mpeg',
              'mpg',
            ].map((format) => (
              <option key={format} value={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          智能标签
          <select
            aria-label="智能标签"
            value={selectedTag || ''}
            onChange={(event) => onTagChange(event.target.value || null)}
          >
            <option value="">全部标签</option>
            {tags.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name} ({tag.count})
              </option>
            ))}
          </select>
        </label>
        <label>
          文件大小（MB）
          <div className="size-range">
            <input
              aria-label="筛选最小大小MB"
              type="number"
              min="0"
              placeholder="最小"
              value={value.minSize}
              onChange={(event) => update('minSize', event.target.value)}
            />
            <span>–</span>
            <input
              aria-label="筛选最大大小MB"
              type="number"
              min="0"
              placeholder="最大"
              value={value.maxSize}
              onChange={(event) => update('maxSize', event.target.value)}
            />
          </div>
        </label>
        <label>
          视频时长
          <select
            aria-label="视频时长"
            value={value.duration}
            onChange={(event) => update('duration', event.target.value)}
          >
            <option value="">全部时长</option>
            <option value="short">5 分钟以内</option>
            <option value="medium">5–30 分钟</option>
            <option value="long">30 分钟及以上</option>
            <option value="unknown">待解析时长</option>
          </select>
        </label>
      </div>
      <div className="filter-note">
        {invalidSize ? (
          <span role="alert" className="text-red-300">
            最大大小不能小于最小大小。
          </span>
        ) : (
          <span>筛选当前视频库，可与搜索、分类组合使用。</span>
        )}
        <button onClick={onReset}>
          <X size={13} />
          重置筛选
        </button>
      </div>
    </section>
  )
}
