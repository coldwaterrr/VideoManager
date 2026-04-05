import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clapperboard, Database, Film, Folder, FolderOpen, FolderPlus, HardDrive, LoaderCircle, ScanSearch, Search, Star, Film as FilmIcon, Settings, X, ArrowUpDown, ChevronDown, ChevronUp, Sparkles, Eye, Check, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TitleBar } from '@/components/TitleBar'
import { VideoPlayer } from '@/components/VideoPlayer'

type SidebarFolder = {
  id: string
  name: string
  count: number
  system: boolean
}

type Tag = {
  name: string
  count: number
}

interface VideoCardProps {
  video: VideoRecord
  index: number
  isSelected: boolean
  onSelect: () => void
  onOpen: () => void
  folders: VirtualFolderRecord[]
  onToggleFolder: (folderId: number) => void
  isMutatingFolder: boolean
  pendingVideoId: number | null
  isPreviewMode: boolean
  onScrape?: (videoId: number) => void
  canScrape: boolean
}

const coverClasses = [
  'from-sky-500/60 via-blue-500/30 to-transparent',
  'from-violet-500/60 via-fuchsia-500/30 to-transparent',
  'from-emerald-500/60 via-teal-500/30 to-transparent',
  'from-amber-500/60 via-orange-500/30 to-transparent',
  'from-cyan-500/60 via-sky-500/30 to-transparent',
  'from-pink-500/60 via-rose-500/30 to-transparent',
]

const previewSnapshot: LibrarySnapshot = {
  databaseMeta: {
    databasePath: '浏览器预览模式未连接本地数据库',
    tables: ['videos', 'virtual_folders', 'virtual_folder_videos'],
  },
  folders: [
    { id: 1, name: '收藏夹', videoCount: 2 },
    { id: 2, name: '待整理', videoCount: 1 },
  ],
  videos: [
    {
      id: 1,
      name: 'BladeRunner2049-Trailer.mp4',
      absolutePath: 'D:\\Media\\SciFi\\BladeRunner2049-Trailer.mp4',
      fileSize: 152_000_000,
      durationSeconds: 138,
      modifiedAt: new Date().toISOString(),
      folderIds: [1],
    },
    {
      id: 2,
      name: 'ColorGrading-Notes.mov',
      absolutePath: 'D:\\Media\\Course\\ColorGrading-Notes.mov',
      fileSize: 1_200_000_000,
      durationSeconds: 1122,
      modifiedAt: new Date().toISOString(),
      folderIds: [2],
    },
    {
      id: 3,
      name: 'Weekend-Vlog-001.mp4',
      absolutePath: 'E:\\Capture\\Weekend-Vlog-001.mp4',
      fileSize: 426_000_000,
      durationSeconds: 571,
      modifiedAt: new Date().toISOString(),
      folderIds: [],
    },
  ],
  lastScanDirectory: '浏览器预览模式',
  lastScannedAt: new Date().toISOString(),
}

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent

  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
}

// 从文本中提取标签（字母数字组合，长度>=2，支持中文）
function extractTags(text: string): string[] {
  const tags = new Set<string>()
  
  // 提取字母数字和中文组合
  const matches = text.toLowerCase().match(/[a-z0-9\u4e00-\u9fa5]+/g) || []
  for (const match of matches) {
    if (match.length >= 2) {
      tags.add(match)
    }
  }
  
  return Array.from(tags)
}

// 为视频生成标签（基于文件名、路径和文件夹名）
function generateVideoTags(
  videoName: string,
  absolutePath: string,
  folderNames: string[]
): string[] {
  const tags = new Set<string>()
  
  // 从文件名提取
  const nameWithoutExt = videoName.replace(/\.[^/.]+$/, '')
  for (const tag of extractTags(nameWithoutExt)) {
    tags.add(tag)
  }
  
  // 从路径提取（最后两级目录）
  const pathParts = absolutePath.split(/[\\/]/).filter(Boolean)
  if (pathParts.length >= 2) {
    for (const tag of extractTags(pathParts[pathParts.length - 2])) {
      tags.add(tag)
    }
  }
  
  // 从文件夹名提取
  for (const folderName of folderNames) {
    for (const tag of extractTags(folderName)) {
      tags.add(tag)
    }
  }
  
  return Array.from(tags).sort()
}

function formatDuration(seconds: number) {
  if (seconds <= 0) {
    return '待解析时长'
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
  }

  return [minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function formatTimeLabel(value: string | null) {
  if (!value) {
    return '尚未扫描'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 生成随机封面时间点 (视频的 10%-50%)
function getRandomThumbnailTime(duration: number): number {
  if (duration <= 0) return 1
  const min = Math.max(1, duration * 0.1)
  const max = Math.max(min + 1, duration * 0.5)
  return min + Math.random() * (max - min)
}

function VideoCard({ video, index, isSelected, onSelect, onOpen, folders, onToggleFolder, isMutatingFolder, pendingVideoId, isPreviewMode, onScrape, canScrape }: VideoCardProps) {
  const [isHovering, setIsHovering] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const previewTimesRef = useRef<number[]>([])
  const currentClipRef = useRef(0)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 生成视频封面 - 从随机位置截取
  useEffect(() => {
    const videoEl = document.createElement('video')
    videoEl.crossOrigin = 'anonymous'
    videoEl.preload = 'auto'
    videoEl.muted = true
    
    videoEl.onloadedmetadata = () => {
      // 随机选取封面时间点
      videoEl.currentTime = getRandomThumbnailTime(videoEl.duration)
    }
    
    videoEl.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = videoEl.videoWidth
      canvas.height = videoEl.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0)
        setThumbnailUrl(canvas.toDataURL('image/jpeg', 0.8))
      }
    }
    
    videoEl.onerror = () => {
      // 如果无法加载视频，保持使用渐变背景
    }
    
    try {
      videoEl.src = `file:///${video.absolutePath.replace(/\\/g, '/')}`
    } catch (e) {
      // 忽略错误
    }
    
    return () => {
      videoEl.src = ''
    }
  }, [video.absolutePath])

  // 多段随机预览：生成5个时间点，每段2-3秒
  // 使用 timeupdate 事件驱动，避免 seek 冲突
  useEffect(() => {
    if (!isHovering) {
      previewTimesRef.current = []
    }
  }, [isHovering])

  const startPreview = useCallback((videoEl: HTMLVideoElement) => {
    const duration = videoEl.duration
    if (duration <= 0) return
    const times: number[] = []
    const min = Math.max(1, duration * 0.1)
    const max = Math.max(min + 15, duration * 0.9)
    for (let i = 0; i < 5; i++) {
      const start = min + (max - min) * (i / 5)
      times.push(start + Math.random() * 2)
    }
    previewTimesRef.current = times
    currentClipRef.current = 0
    videoEl.currentTime = times[0]
    videoEl.play().catch(() => {})
  }, [])

  const handlePreviewTimeUpdate = useCallback(() => {
    if (!previewRef.current || !previewTimesRef.current.length) return
    const video = previewRef.current
    const times = previewTimesRef.current
    const clipIndex = currentClipRef.current
    const startTime = times[clipIndex]
    const elapsed = video.currentTime - startTime

    if (elapsed >= 3 || video.currentTime < startTime - 0.5) {
      // 切换到下一段
      const nextClip = (clipIndex + 1) % times.length
      currentClipRef.current = nextClip
      video.currentTime = times[nextClip]
    }
  }, [])

  // 悬停预览开始
  const handleMouseEnter = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovering(true)
    }, 500)
  }, [])

  // 当 preview video 的 metadata 加载完成时开始播放
  const handlePreviewLoadedMetadata = useCallback(() => {
    const videoEl = previewRef.current
    if (videoEl && isHovering) {
      startPreview(videoEl)
    }
  }, [isHovering, startPreview])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsHovering(false)
    previewTimesRef.current = []
    if (previewRef.current) {
      previewRef.current.pause()
    }
  }, [])

  const coverClass = coverClasses[index % coverClasses.length]

  return (
    <article
      className={`group relative rounded-[30px] border p-4 transition ${
        isSelected
          ? 'border-white/20 bg-white/[0.06]'
          : 'border-white/6 bg-black/20 hover:border-white/12 hover:bg-white/[0.03]'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="absolute left-4 top-4 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          className="size-5 cursor-pointer rounded border-white/20 bg-black/40 accent-white"
        />
      </div>
      <div
        onClick={onOpen}
        className="cursor-pointer"
      >
        <div
          className={`mb-4 relative flex h-44 items-end rounded-[24px] overflow-hidden ${thumbnailUrl ? '' : `bg-gradient-to-br ${coverClass}`} p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition group-hover:scale-[1.01]`}
        >
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt={video.name}
              className="absolute inset-0 size-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          )}
          {(video.posterPath || video.title) && (
            <img
              src={video.posterPath ? `https://image.tmdb.org/t/p/w500${video.posterPath}` : undefined}
              alt={video.title || video.name}
              className="absolute inset-0 size-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          
          {/* 悬停预览视频 */}
          {isHovering && !isPreviewMode && (
            <video
              ref={previewRef}
              src={`file:///${video.absolutePath.replace(/\\/g, '/')}`}
              className="absolute inset-0 size-full object-cover"
              muted
              playsInline
              preload="auto"
              onLoadedMetadata={handlePreviewLoadedMetadata}
              onTimeUpdate={handlePreviewTimeUpdate}
            />
          )}
          
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
            <div className="flex size-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <svg className="size-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
          <div className="relative z-10 rounded-full border border-white/12 bg-black/25 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/80">
            {video.name.split('.').pop() ?? 'VIDEO'}
          </div>
        </div>
        <div className="space-y-2">
          {video.title ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="truncate text-base font-medium text-white">
                  {video.title} {video.releaseDate ? `(${video.releaseDate.slice(0, 4)})` : ''}
                </div>
                {onScrape && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onScrape(video.id) }}
                    disabled={!canScrape}
                    className="shrink-0 rounded-full p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition disabled:opacity-30 disabled:hover:bg-transparent"
                    title="重新刮削"
                  >
                    <FilmIcon className="size-4" />
                  </button>
                )}
              </div>
              {(video.voteAverage ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                  <Star className="size-3.5 text-yellow-500" />
                  <span>{(video.voteAverage ?? 0).toFixed(1)}</span>
                  <span className="text-zinc-600">({video.voteCount ?? 0} 评分)</span>
                </div>
              )}
              {video.originalTitle && video.originalTitle !== video.title && (
                <div className="truncate text-xs text-zinc-600">{video.originalTitle}</div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="truncate text-base font-medium text-white">{video.name}</div>
                {onScrape && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onScrape(video.id) }}
                    disabled={!canScrape}
                    className="shrink-0 rounded-full p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition disabled:opacity-30 disabled:hover:bg-transparent"
                    title="刮削元数据"
                  >
                    <FilmIcon className="size-4" />
                  </button>
                )}
              </div>
              <div className="truncate text-sm text-zinc-500">{video.absolutePath}</div>
              <div className="flex items-center justify-between pt-1 text-sm text-zinc-400">
                <span>{formatDuration(video.durationSeconds)}</span>
                <span>{formatBytes(video.fileSize)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="text-xs uppercase tracking-[0.24em] text-zinc-600">归类到虚拟文件夹</div>
        <div className="flex flex-wrap gap-2">
        {folders.map((folder: VirtualFolderRecord) => {
         const assigned = video.folderIds.includes(folder.id)

         return (
           <button
             key={`${video.id}-${folder.id}`}
             type="button"
             onClick={() => onToggleFolder(folder.id)}
             disabled={isMutatingFolder || isPreviewMode}
             className={`rounded-full px-3 py-1.5 text-xs transition ${
               assigned
                 ? 'bg-white text-zinc-950'
                 : 'bg-white/[0.05] text-zinc-400 hover:bg-white/[0.1] hover:text-white'
             }`}
           >
             {pendingVideoId === video.id && isMutatingFolder ? (
               <LoaderCircle className="size-3.5 animate-spin" />
             ) : (
               folder.name
             )}
           </button>
         )
       })}
       </div>
     </div>
    </article>
  )
}

function App() {
  const [activeFolderId, setActiveFolderId] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [isMutatingFolder, setIsMutatingFolder] = useState(false)
  const [isCleaningUp, setIsCleaningUp] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [pendingVideoId, setPendingVideoId] = useState<number | null>(null)
  const [statusText, setStatusText] = useState('正在加载资源库…')
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(previewSnapshot)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [scannedFiles, setScannedFiles] = useState<string[]>([])
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<number>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 12
  
  // 扫描筛选器
  const [showFilter, setShowFilter] = useState(false)
  const [filterMinSize, setFilterMinSize] = useState(0) // MB
  const [filterMaxSize, setFilterMaxSize] = useState(0) // MB, 0表示不限制
  const [filterFormats, setFilterFormats] = useState<string[]>(['.mp4', '.mkv', '.avi', '.mov', '.wmv'])
  
  // 标签相关状态
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  // TMDB 相关状态
  const [tmdbApiKey, setTmdbApiKey] = useState('')
  const [showTmdbConfig, setShowTmdbConfig] = useState(false)
  const [isScraping, setIsScraping] = useState(false)

  // 数据库选择相关状态
  const [showDbSelector, setShowDbSelector] = useState(false)
  const [availableDatabases, setAvailableDatabases] = useState<Array<{ path: string; size: number }>>([])
  const [currentDbPath, setCurrentDbPath] = useState<string | null>(null)
  const [isSwitchingDb, setIsSwitchingDb] = useState(false)

  // 排序
  const [sortField, setSortField] = useState<'name' | 'size' | 'time'>('time')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // 内置播放器状态
  const [playingVideo, setPlayingVideo] = useState<{ path: string; name: string; index: number } | null>(null)

  // AI 分类相关状态
  const [showAiClassify, setShowAiClassify] = useState(false)
  const [aiRule, setAiRule] = useState('')
  const [aiConfig, setAiConfig] = useState<AIConfig>({ apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3.6-plus:free' })
  const [aiTestResult, setAiTestResult] = useState<AITestResult | null>(null)
  const [aiIsTesting, setAiIsTesting] = useState(false)
  const [aiClassifying, setAiClassifying] = useState(false)
  const [aiPreview, setAiPreview] = useState<AIClassificationResult | null>(null)
  const [aiApplying, setAiApplying] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const [aiReasoning, setAiReasoning] = useState('')
  const [aiRawContent, setAiRawContent] = useState('')
  const [aiExpandedFolders, setAiExpandedFolders] = useState<Set<number>>(new Set())
  const [aiEditingFolderName, setAiEditingFolderName] = useState<number | null>(null)
  const [showAiNotification, setShowAiNotification] = useState(false)
  
  // 为视频生成标签
  const videosWithTags = useMemo(() => {
    const folderMap = new Map<number, string>()
    for (const folder of snapshot.folders) {
      folderMap.set(folder.id, folder.name)
    }
    
    return snapshot.videos.map((video) => {
      const videoFolderNames = video.folderIds
        .map((id) => folderMap.get(id))
        .filter((name): name is string => !!name)
      
      const tags = generateVideoTags(video.name, video.absolutePath, videoFolderNames)
      return { ...video, tags }
    })
  }, [snapshot.videos, snapshot.folders])
  
  // 计算所有标签
  useEffect(() => {
    const tagCounts = new Map<string, number>()
    for (const video of videosWithTags) {
      for (const tag of video.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }
    
    const tags = Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
    
    setAllTags(tags)
  }, [videosWithTags])

  useEffect(() => {
    async function bootstrap() {
      if (!window.videosorter) {
        setIsPreviewMode(true)
        setSnapshot(previewSnapshot)
        setStatusText('当前是浏览器预览模式，扫描与数据库写入仅在 Electron 窗口内可用。')
        return
      }

      try {
        const nextSnapshot = await window.videosorter.getLibrarySnapshot()
        setSnapshot(nextSnapshot)
        setStatusText(
          nextSnapshot.videos.length > 0
            ? `已载入 ${nextSnapshot.videos.length} 个视频`
            : '数据库已初始化，点击"扫描目录"开始导入本地视频。',
        )

        window.videosorter.onScanProgress((progress) => {
          setScanProgress(progress)
          if (progress.type === 'found' && progress.filePath) {
            setScannedFiles((prev) => [...prev, progress.filePath!])
          }
          if (progress.type === 'complete') {
            setStatusText(progress.message)
          }
        })
      } catch {
        setIsPreviewMode(true)
        setSnapshot(previewSnapshot)
        setStatusText('桌面桥接未就绪，已回退到预览数据。')
      }
    }

    void bootstrap()
  }, [])

  // TMDB 相关函数
  async function loadTmdbConfig() {
    if (!window.videosorter) return
    try {
      const { apiKey } = await window.videosorter.tmdbGetConfig()
      setTmdbApiKey(apiKey || '')
    } catch {
      // ignore
    }
  }

  async function handleSaveTmdbConfig() {
    if (!window.videosorter) return
    try {
      await window.videosorter.tmdbSetConfig(tmdbApiKey.trim())
      setShowTmdbConfig(false)
      setStatusText('TMDB 配置已保存。')
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '保存 TMDB 配置失败。')
    }
  }

  // TMDB 配置变更时自动保存（延迟 1 秒）
  useEffect(() => {
    if (tmdbApiKey) {
      const timer = setTimeout(() => {
        void window.videosorter?.tmdbSetConfig(tmdbApiKey.trim())
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [tmdbApiKey])

  async function handleScrapeVideo(videoId: number) {
    if (!window.videosorter || !tmdbApiKey) {
      setShowTmdbConfig(true)
      return
    }
    const video = snapshot.videos.find((v) => v.id === videoId)
    if (!video) return
    setIsScraping(true)
    setStatusText(`正在刮削: ${video.name}...`)
    try {
      const result = await window.videosorter.tmdbScrapeVideo(videoId)
      const nextSnapshot = await window.videosorter.getLibrarySnapshot()
      setSnapshot(nextSnapshot)
      setStatusText(result.message || '刮削完成')
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '刮削失败。')
    } finally {
      setIsScraping(false)
    }
  }

  // 数据库相关函数
  async function handleScanDatabases() {
    if (!window.videosorter) return
    try {
      const databases = await window.videosorter.dbScanForDatabases()
      setAvailableDatabases(databases)
      const currentPath = await window.videosorter.dbGetCurrentPath()
      setCurrentDbPath(currentPath)
    } catch {
      // ignore
    }
  }

  async function handleSwitchDatabase(databasePath: string) {
    if (!window.videosorter) return
    setIsSwitchingDb(true)
    try {
      const nextSnapshot = await window.videosorter.dbSelectDatabase(databasePath)
      setSnapshot(nextSnapshot)
      setCurrentDbPath(databasePath)
      setStatusText(`已切换数据库: ${databasePath.split(/[\\/]/).pop()}`)
      setShowDbSelector(false)
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '切换数据库失败。')
    } finally {
      setIsSwitchingDb(false)
    }
  }

  // AI 分类相关函数
  async function loadAiConfig() {
    if (!window.videosorter?.aiGetConfig) return
    try {
      const config = await window.videosorter.aiGetConfig()
      setAiConfig(config)
    } catch {
      // ignore
    }
  }

  async function saveAiConfigLocal() {
    if (!window.videosorter?.aiSaveConfig) return
    try {
      await window.videosorter.aiSaveConfig(aiConfig)
    } catch {
      // ignore
    }
  }

  async function handleAiTest() {
    if (!window.videosorter?.aiTestConnection) return
    setAiIsTesting(true)
    setAiTestResult(null)
    try {
      const result = await window.videosorter.aiTestConnection(aiConfig)
      setAiTestResult(result)
    } catch {
      setAiTestResult({ ok: false, message: '连接测试失败' })
    } finally {
      setAiIsTesting(false)
    }
  }

  async function handleAiClassify() {
    if (!window.videosorter?.aiClassifyStream) return
    setAiClassifying(true)
    setAiMessage('')
    setAiPreview(null)
    setAiReasoning('')
    setAiRawContent('')

    // 监听 AI chunk 流
    const cleanup = window.videosorter.onAiChunk((chunk) => {
      if (chunk.reasoning) {
        setAiReasoning((prev) => prev + chunk.reasoning!)
      }
      if (chunk.content) {
        setAiRawContent((prev) => prev + chunk.content)
      }
    })

    try {
      const result = await window.videosorter.aiClassifyStream(aiRule, aiConfig)
      cleanup()
      if (result.success && result.result) {
        setAiPreview(result.result)
        setAiMessage(`分类完成，共 ${result.result.folders.length} 个文件夹`)
      } else {
        setAiMessage(result.message || '分类失败')
      }
    } catch {
      cleanup()
      setAiMessage('分类请求失败')
    } finally {
      setAiClassifying(false)
    }
  }

  async function handleAiApply() {
    if (!window.videosorter?.aiApply || !aiPreview) return
    setAiApplying(true)
    setAiMessage('正在应用分类结果...')
    try {
      const result = await window.videosorter.aiApply(aiPreview.folders)
      if (result.success) {
        const nextSnapshot = await window.videosorter.getLibrarySnapshot()
        setSnapshot(nextSnapshot)
        setAiMessage(`应用成功！${result.message}`)
        setStatusText(`AI 分类已应用: ${result.message}`)
      } else {
        setAiMessage(result.message)
      }
    } catch {
      setAiMessage('应用分类结果失败')
    } finally {
      setAiApplying(false)
    }
  }

  // 从底部通知直接应用分类
  async function handleAiApplyDirect() {
    if (!window.videosorter?.aiApply || !aiPreview) return
    try {
      const result = await window.videosorter.aiApply(aiPreview.folders)
      if (result.success) {
        const nextSnapshot = await window.videosorter.getLibrarySnapshot()
        setSnapshot(nextSnapshot)
        setStatusText(`AI 分类已应用: ${result.message}`)
      } else {
        setStatusText(result.message)
      }
    } catch {
      setStatusText('应用分类结果失败')
    } finally {
      setShowAiNotification(false)
      setAiPreview(null)
      setAiMessage('')
      setAiReasoning('')
      setAiRawContent('')
    }
  }

  useEffect(() => {
    if (window.videosorter) {
      void loadTmdbConfig()
      void handleScanDatabases()
    }
  }, [])

  // AI 配置在打开面板时才加载
  useEffect(() => {
    if (showAiClassify) {
      void loadAiConfig()
    }
  }, [showAiClassify])

  // AI 配置变更时自动保存（延迟 1 秒避免频繁写入）
  useEffect(() => {
    if (aiConfig.apiKey) {
      const timer = setTimeout(() => {
        void saveAiConfigLocal()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [aiConfig.apiKey, aiConfig.baseUrl, aiConfig.model])

  const filteredVideos = useMemo(() => {
    return videosWithTags.filter((video) => {
      const normalizedKeyword = keyword.trim().toLowerCase()
      const customFolderId = activeFolderId.startsWith('folder-')
        ? Number(activeFolderId.replace('folder-', ''))
        : null

      const matchesKeyword =
        normalizedKeyword.length === 0 ||
        video.name.toLowerCase().includes(normalizedKeyword) ||
        video.absolutePath.toLowerCase().includes(normalizedKeyword)

      if (!matchesKeyword) {
        return false
      }

      if (activeFolderId === 'all') {
        return true
      }

      if (activeFolderId === 'unclassified') {
        return video.folderIds.length === 0
      }

      if (customFolderId !== null) {
        return video.folderIds.includes(customFolderId)
      }

      // 标签筛选
      if (selectedTag) {
        return video.tags.includes(selectedTag)
      }

      return true
    })
  }, [activeFolderId, keyword, selectedTag, videosWithTags])

  // 排序
  const sortedVideos = useMemo(() => {
    return [...filteredVideos].sort((a, b) => {
      let result = 0
      if (sortField === 'name') result = a.name.localeCompare(b.name)
      else if (sortField === 'size') result = a.fileSize - b.fileSize
      else result = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime()
      return sortOrder === 'desc' ? -result : result
    })
  }, [filteredVideos, sortField, sortOrder])

  const totalPages = Math.ceil(sortedVideos.length / pageSize)
  const paginatedVideos = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedVideos.slice(start, start + pageSize)
  }, [sortedVideos, currentPage, pageSize])

  // 切换文件夹或搜索时重置到第一页
  useEffect(() => {
    setCurrentPage(1)
  }, [activeFolderId, keyword, selectedTag])

  const sidebarFolders = useMemo<SidebarFolder[]>(() => {
    const allVideosCount = snapshot.videos.length
    const unclassifiedCount = snapshot.videos.filter((video) => video.folderIds.length === 0).length

    return [
      { id: 'all', name: '全部视频', count: allVideosCount, system: true },
      { id: 'unclassified', name: '未分类', count: unclassifiedCount, system: true },
      ...snapshot.folders.map((folder) => ({
        id: `folder-${folder.id}`,
        name: folder.name,
        count: folder.videoCount,
        system: false,
      })),
    ]
  }, [snapshot.folders, snapshot.videos])

  const activeFolder = sidebarFolders.find((folder) => folder.id === activeFolderId) ?? sidebarFolders[0]

  async function handleScanDirectory() {
    if (!window.videosorter) {
      setStatusText('浏览器预览模式不支持扫描目录，请在 Electron 桌面窗口中运行。')
      return
    }

    setIsScanning(true)
    setScanProgress(null)
    setScannedFiles([])
    setStatusText('正在选择扫描目录...')

    try {
      const filterOptions = {
        minSizeMB: filterMinSize,
        maxSizeMB: filterMaxSize,
        formats: filterFormats,
      }
      const result = await window.videosorter.scanDirectory(filterOptions)
      setSnapshot(result.snapshot)
      if (result.cancelled) {
        setStatusText('已取消目录选择。')
        setScanProgress(null)
        setScannedFiles([])
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '扫描失败，请稍后重试。')
    } finally {
      setIsScanning(false)
    }
  }

  async function handleCreateFolder() {
    const normalizedName = newFolderName.trim()

    if (!normalizedName) {
      setStatusText('请输入虚拟文件夹名称。')
      return
    }

    if (!window.videosorter) {
      setStatusText('浏览器预览模式不支持创建虚拟文件夹。')
      return
    }

    setIsCreatingFolder(true)

    try {
      const nextSnapshot = await window.videosorter.createVirtualFolder(normalizedName)
      setSnapshot(nextSnapshot)
      setNewFolderName('')
      setStatusText(`已创建虚拟文件夹“${normalizedName}”。`)
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '创建文件夹失败。')
    } finally {
      setIsCreatingFolder(false)
    }
  }

  async function handleToggleFolder(videoId: number, folderId: number) {
    if (!window.videosorter) {
      setStatusText('浏览器预览模式不支持归类操作。')
      return
    }

    setPendingVideoId(videoId)
    setIsMutatingFolder(true)

    try {
      const nextSnapshot = await window.videosorter.toggleVideoFolder(videoId, folderId)
      setSnapshot(nextSnapshot)
      setStatusText('视频归类已更新。')
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '更新视频归类失败。')
    } finally {
      setPendingVideoId(null)
      setIsMutatingFolder(false)
    }
  }

  function handleOpenVideo(video: VideoRecord) {
    const playIndex = sortedVideos.findIndex((v) => v.id === video.id)
    setPlayingVideo({
      path: video.absolutePath,
      name: video.title || video.name,
      index: playIndex >= 0 ? playIndex : 0,
    })
  }

  async function handleCleanupUnsupported() {
    if (!window.videosorter) {
      setStatusText('浏览器预览模式不支持清理操作。')
      return
    }
    setIsCleaningUp(true)
    setStatusText('正在清理不支持的视频格式...')
    try {
      const result = await window.videosorter.cleanupUnsupported()
      setSnapshot(result.snapshot)
      setStatusText(`清理完成，已删除 ${result.deletedCount} 条记录。`)
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '清理失败。')
    } finally {
      setIsCleaningUp(false)
    }
  }

  function handleToggleSelect(videoId: number) {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev)
      if (next.has(videoId)) {
        next.delete(videoId)
      } else {
        next.add(videoId)
      }
      return next
    })
  }

  function handleSelectAll() {
    if (selectedVideoIds.size === sortedVideos.length) {
      setSelectedVideoIds(new Set())
    } else {
      setSelectedVideoIds(new Set(sortedVideos.map((v) => v.id)))
    }
  }

  async function handleDeleteSelected() {
    if (!window.videosorter) {
      setStatusText('浏览器预览模式不支持删除操作。')
      return
    }
    if (selectedVideoIds.size === 0) {
      setStatusText('请先选择要删除的视频。')
      return
    }
    const count = selectedVideoIds.size
    if (!confirm(`确定要删除选中的 ${count} 个视频记录吗？`)) {
      return
    }
    setIsDeleting(true)
    setStatusText(`正在删除 ${count} 个视频记录...`)
    try {
      const result = await window.videosorter.deleteVideos(Array.from(selectedVideoIds))
      setSnapshot(result.snapshot)
      setSelectedVideoIds(new Set())
      setStatusText(`已删除 ${result.deletedCount} 个视频记录。`)
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '删除失败。')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-transparent text-zinc-50">
      <TitleBar />
      <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col px-6 pb-6">
        <header className="flex flex-col gap-5 pb-6 pt-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white/[0.06] text-white shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
              <Clapperboard className="size-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-zinc-500">VideoSorter</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-white">本地视频映射管理</div>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 rounded-full border border-white/8 bg-white/[0.04] px-5 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl xl:mx-0">
            <Search className="size-5 shrink-0 text-zinc-500" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索视频名称或绝对路径"
              className="h-auto border-0 bg-transparent px-0 py-0 text-base text-zinc-50 shadow-none placeholder:text-zinc-500 focus-visible:ring-0 focus:placeholder-transparent"
            />
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="flex min-h-[760px] flex-col rounded-[32px] border border-white/6 bg-white/[0.04] p-5 backdrop-blur-2xl">
            <div className="rounded-[28px] border border-white/8 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-white">资源库状态</div>
                <div className="rounded-full border border-white/8 px-3 py-1 text-[11px] text-zinc-400">
                  {isPreviewMode ? '预览模式' : '桌面模式'}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/[0.04] p-3">
                  <div className="text-xs text-zinc-500">视频总数</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{snapshot.videos.length}</div>
                </div>
                <div className="rounded-2xl bg-white/[0.04] p-3">
                  <div className="text-xs text-zinc-500">自定义文件夹</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{snapshot.folders.length}</div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-white/[0.04] p-3 text-xs text-zinc-400">
                <div className="flex items-center gap-2 text-zinc-200">
                  <Database className="size-3.5" />
                  SQLite
                </div>
                <div className="mt-2 truncate">{snapshot.databaseMeta.databasePath}</div>
              </div>
            </div>

            <div className="px-1 pb-4 pt-6">
              <div className="text-xs uppercase tracking-[0.28em] text-zinc-500">Folders</div>
              <div className="mt-2 text-2xl font-semibold text-white">虚拟文件夹</div>
            </div>

            <div className="space-y-1.5">
              {sidebarFolders.map((folder) => {
                const isActive = folder.id === activeFolderId
                const Icon = folder.id === 'all' ? Film : folder.system ? HardDrive : FolderOpen

                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setActiveFolderId(folder.id)}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
                      isActive
                        ? 'bg-white text-zinc-950 shadow-[0_14px_40px_rgba(255,255,255,0.08)]'
                        : 'text-zinc-300 hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="size-4" />
                      <span className="text-sm font-medium">{folder.name}</span>
                    </span>
                    <span className="text-xs text-zinc-500">{folder.count}</span>
                  </button>
                )
              })}
            </div>
            
            {/* 智能标签区域 */}
            {allTags.length > 0 && (
              <div className="mt-6 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-zinc-500">
                  按标签筛选
                </div>
                <select
                  value={selectedTag || ''}
                  onChange={(e) => setSelectedTag(e.target.value || null)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-200 focus:border-white/20 focus:outline-none focus:ring-0"
                >
                  <option value="" className="text-zinc-900">全部标签</option>
                  {allTags.map((tag) => (
                    <option key={tag.name} value={tag.name} className="text-zinc-900">
                      {tag.name} ({tag.count})
                    </option>
                  ))}
                </select>
                {selectedTag && (
                  <button
                    onClick={() => setSelectedTag(null)}
                    className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition"
                  >
                    清除标签筛选
                  </button>
                )}
              </div>
            )}

            <div className="mt-auto space-y-4 px-2 pb-2 pt-6">
              <div className="rounded-[28px] border border-white/8 bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                  <FolderPlus className="size-4" />
                  新建虚拟文件夹
                </div>
                <div className="space-y-3">
                  <Input
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    placeholder="例如：课程素材"
                    className="rounded-2xl border-white/8 bg-white/[0.03]"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleCreateFolder()}
                    disabled={isCreatingFolder || isPreviewMode}
                    className="h-11 w-full rounded-2xl"
                  >
                    {isCreatingFolder ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Folder className="mr-2 size-4" />}
                    创建文件夹
                  </Button>
                </div>
              </div>

              <div className="rounded-[28px] bg-black/20 px-4 py-4 text-xs text-zinc-500">
                <div className="flex items-center gap-2 text-zinc-300">
                  <FolderOpen className="size-3.5" />
                  最近扫描目录
                </div>
                <div className="mt-2 truncate">{snapshot.lastScanDirectory ?? '尚未选择扫描目录'}</div>
                <div className="mt-2 text-zinc-600">上次扫描：{formatTimeLabel(snapshot.lastScannedAt)}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCleanupUnsupported()}
                  disabled={isCleaningUp || isPreviewMode}
                  className="mt-3 w-full text-xs"
                >
                  {isCleaningUp ? <LoaderCircle className="mr-2 size-3 animate-spin" /> : null}
                  清理旧格式记录
                </Button>
              </div>

              {/* 数据库选择 */}
              <div className="rounded-[28px] border border-white/8 bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                  <Database className="size-4" />
                  数据库
                </div>
                <div className="mt-2 truncate text-xs text-zinc-500">
                  {currentDbPath ? `当前: ${currentDbPath.split(/[\\/]/).pop()}` : '加载中...'}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleScanDatabases()
                    setShowDbSelector(true)
                  }}
                  disabled={isPreviewMode}
                  className="mt-2 w-full text-xs"
                >
                  选择数据库
                </Button>
              </div>
            </div>
          </aside>

          <main className="rounded-[36px] border border-white/6 bg-white/[0.03] p-5 backdrop-blur-2xl">
            <div className="flex flex-col gap-5 border-b border-white/6 px-2 pb-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-sm text-zinc-500">当前视图</div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{activeFolder.name}</h1>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="rounded-full border border-white/8 px-4 py-2 text-sm text-zinc-400">
                    {filteredVideos.length} 个视频 · {selectedVideoIds.size > 0 && `已选 ${selectedVideoIds.size}`}
                  </div>
                  {filteredVideos.length > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleSelectAll}
                      className="h-11 rounded-full px-5"
                    >
                      {selectedVideoIds.size === filteredVideos.length ? '取消全选' : '全选'}
                    </Button>
                  )}
                  {selectedVideoIds.size > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleDeleteSelected()}
                      disabled={isDeleting || isPreviewMode}
                      className="h-11 rounded-full px-5 bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300"
                    >
                      {isDeleting ? (
                        <LoaderCircle className="mr-2 size-4 animate-spin" />
                      ) : null}
                      删除选中 ({selectedVideoIds.size})
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => setShowFilter(!showFilter)}
                    variant={showFilter ? "default" : "secondary"}
                    className="h-11 rounded-full px-5"
                  >
                    筛选器
                  </Button>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select
                        value={sortField}
                        onChange={(e) => setSortField(e.target.value as 'name' | 'size' | 'time')}
                        className="h-11 rounded-full border border-white/8 bg-white/[0.04] px-4 pr-8 text-sm text-zinc-300 appearance-none cursor-pointer focus:outline-none focus:border-white/20"
                      >
                        <option value="time" className="bg-zinc-900">按时间</option>
                        <option value="name" className="bg-zinc-900">按名称</option>
                        <option value="size" className="bg-zinc-900">按大小</option>
                      </select>
                      <ArrowUpDown className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500 pointer-events-none" />
                    </div>
                    <button
                      onClick={() => setSortOrder((o) => o === 'asc' ? 'desc' : 'asc')}
                      className="h-11 w-11 rounded-full border border-white/8 bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-white hover:border-white/20 transition"
                      title={sortOrder === 'asc' ? '升序' : '降序'}
                    >
                      {sortOrder === 'asc' ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    onClick={() => void handleScanDirectory()}
                    disabled={isScanning || isPreviewMode}
                    className="h-11 rounded-full px-5"
                  >
                    {isScanning ? (
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                    ) : (
                      <ScanSearch className="mr-2 size-4" />
                    )}
                    扫描目录
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setShowTmdbConfig(true)}
                    variant="ghost"
                    className="size-11 rounded-full p-0"
                    disabled={isPreviewMode}
                    title="TMDB 配置"
                  >
                    <Settings className="size-5" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => { setShowAiClassify(true); void loadAiConfig() }}
                    variant="ghost"
                    className="size-11 rounded-full p-0"
                    disabled={isPreviewMode}
                    title="AI 智能分类"
                  >
                    <Sparkles className="size-5" />
                  </Button>
                </div>
              </div>

              {showFilter && (
                <div className="rounded-[24px] border border-white/8 bg-black/30 p-4">
                  <div className="mb-4 text-sm font-medium text-white">扫描筛选器</div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-xs text-zinc-400">最小文件大小 (MB)</label>
                      <input
                        type="number"
                        min="0"
                        value={filterMinSize}
                        onChange={(e) => setFilterMinSize(Number(e.target.value))}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-white/20 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs text-zinc-400">最大文件大小 (MB，0表示不限制)</label>
                      <input
                        type="number"
                        min="0"
                        value={filterMaxSize}
                        onChange={(e) => setFilterMaxSize(Number(e.target.value))}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-white/20 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs text-zinc-400">文件格式</label>
                      <div className="flex flex-wrap gap-2">
                        {['.mp4', '.mkv', '.avi', '.mov', '.wmv'].map((format) => (
                          <button
                            key={format}
                            type="button"
                            onClick={() => {
                              setFilterFormats((prev) =>
                                prev.includes(format)
                                  ? prev.filter((f) => f !== format)
                                  : [...prev, format]
                              )
                            }}
                            className={`rounded-full px-3 py-1 text-xs transition ${
                              filterFormats.includes(format)
                                ? 'bg-white text-zinc-950'
                                : 'bg-white/10 text-zinc-400 hover:bg-white/20'
                            }`}
                          >
                            {format}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
                    <span>当前设置：</span>
                    <span>大小: {filterMinSize > 0 ? `${filterMinSize}MB` : '不限'} ~ {filterMaxSize > 0 ? `${filterMaxSize}MB` : '不限'}</span>
                    <span>格式: {filterFormats.join(', ')}</span>
                  </div>
                </div>
              )}

              <div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-3 text-sm text-zinc-400">
                  {isScanning && scanProgress ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <LoaderCircle className="size-4 animate-spin" />
                        <span>{scanProgress.message}</span>
                        {scanProgress.total && (
                          <span className="text-zinc-500">({scanProgress.current || 0}/{scanProgress.total})</span>
                        )}
                      </div>
                      {scannedFiles.length > 0 && (
                        <div className="mt-2 max-h-40 overflow-y-auto rounded-xl bg-black/30 p-3">
                          <div className="mb-2 text-xs text-zinc-500">已找到 {scannedFiles.length} 个视频文件：</div>
                          <div className="space-y-1">
                            {scannedFiles.slice(-10).map((file, idx) => (
                              <div key={idx} className="truncate text-xs text-zinc-300">
                                {file.split('\\').pop() || file.split('/').pop()}
                              </div>
                            ))}
                            {scannedFiles.length > 10 && (
                              <div className="text-xs text-zinc-500">...还有 {scannedFiles.length - 10} 个文件</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : showAiNotification && aiPreview ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-violet-300">
                        AI 分类完成，共 {aiPreview.folders.length} 个文件夹
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void handleAiApplyDirect()}
                          className="rounded-full bg-violet-600 px-4 py-1 text-xs text-white hover:bg-violet-500 transition"
                        >
                          应用分类
                        </button>
                        <button
                          onClick={() => { setShowAiNotification(false); setStatusText('') }}
                          className="rounded-full border border-white/10 px-4 py-1 text-xs text-zinc-400 hover:text-white transition"
                        >
                          关闭
                        </button>
                      </div>
                    </div>
                  ) : (
                    statusText
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 pt-6 md:grid-cols-2 2xl:grid-cols-3">
              {paginatedVideos.map((video, index) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  index={index}
                  isSelected={selectedVideoIds.has(video.id)}
                  onSelect={() => handleToggleSelect(video.id)}
                  onOpen={() => handleOpenVideo(video)}
                  folders={snapshot.folders}
                  onToggleFolder={(folderId: number) => void handleToggleFolder(video.id, folderId)}
                  isMutatingFolder={isMutatingFolder}
                  pendingVideoId={pendingVideoId}
                  isPreviewMode={isPreviewMode}
                  onScrape={handleScrapeVideo}
                  canScrape={!isPreviewMode && tmdbApiKey.length > 0}
                />
              ))}
            </div>

            {filteredVideos.length > 0 && totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="rounded-full px-3"
                >
                  首页
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-full px-3"
                >
                  上一页
                </Button>
                <div className="flex items-center gap-1 px-3">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`size-8 rounded-full text-sm transition ${
                          currentPage === pageNum
                            ? 'bg-white text-zinc-950'
                            : 'text-zinc-400 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-full px-3"
                >
                  下一页
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="rounded-full px-3"
                >
                  末页
                </Button>
                <span className="ml-2 text-sm text-zinc-500">
                  {currentPage}/{totalPages} 页
                </span>
              </div>
            )}

            {filteredVideos.length === 0 && (
              <div className="mt-6 flex h-[340px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/8 bg-black/10 px-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.04] text-zinc-300">
                  <Film className="size-6" />
                </div>
                <div className="mt-5 text-lg font-medium text-white">
                  {snapshot.videos.length === 0 ? '资源库还是空的' : '没有找到匹配的视频'}
                </div>
                <div className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                  {snapshot.videos.length === 0
                    ? '先扫描一个本地目录，系统会把视频绝对路径写入 SQLite，再通过虚拟文件夹完成归类。'
                    : '试试更换搜索关键词，或者切换到其他虚拟文件夹视图。'}
                </div>
                <Button
                  type="button"
                  onClick={() => void handleScanDirectory()}
                  disabled={isScanning || isPreviewMode}
                  className="mt-6 rounded-full px-5"
                >
                  {isScanning ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <ScanSearch className="mr-2 size-4" />}
                  扫描目录
                </Button>
              </div>
            )}

            {/* 刮削进度 */}
            {isScraping && (
              <div className="mt-4 rounded-[24px] border border-white/8 bg-black/30 p-4">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <LoaderCircle className="size-4 animate-spin text-emerald-400" />
                  <span>正在刮削...</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 animate-pulse transition-all duration-300"
                    style={{ width: '30%' }}
                  />
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* TMDB 配置弹窗 */}
      {showTmdbConfig && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowTmdbConfig(false)}
          />
          <div className="relative w-full max-w-md rounded-[32px] border border-white/10 bg-zinc-900 p-8 shadow-2xl">
            <button
              onClick={() => setShowTmdbConfig(false)}
              className="absolute right-4 top-4 rounded-full p-1 text-zinc-500 hover:bg-white/10 hover:text-white transition"
            >
              <X className="size-4" />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <FilmIcon className="size-5" />
              </div>
              <div>
                <div className="text-lg font-medium text-white">TMDB 配置</div>
                <div className="text-sm text-zinc-500">获取电影和电视剧元数据</div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">API Key</label>
                <Input
                  value={tmdbApiKey}
                  onChange={(e) => setTmdbApiKey(e.target.value)}
                  placeholder="输入你的 TMDB API Key"
                  className="w-full rounded-xl border-white/10 bg-white/5 text-sm"
                />
                <div className="mt-2 text-xs text-zinc-600">
                  前往{' '}
                  <span className="text-zinc-400 underline cursor-pointer" onClick={() => window.open('https://www.themoviedb.org/settings/api', '_blank')}>
                    TMDB 设置页面
                  </span>
                  {' '}获取 API Key
                </div>
              </div>
              <Button
                onClick={() => void handleSaveTmdbConfig()}
                disabled={tmdbApiKey.trim().length === 0}
                className="h-11 w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                保存配置
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AI 智能分类弹窗 */}
      {showAiClassify && !showAiNotification && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowAiClassify(false)}
          />
          <div className="relative w-full max-w-lg rounded-[32px] border border-white/10 bg-zinc-900 p-8 shadow-2xl max-h-[85vh] flex flex-col">
            <button
              onClick={() => setShowAiClassify(false)}
              className="absolute right-4 top-4 rounded-full p-1 text-zinc-500 hover:bg-white/10 hover:text-white transition"
            >
              <X className="size-4" />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-400">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="text-lg font-medium text-white">AI 智能分类</div>
                <div className="text-sm text-zinc-500">自动将未分类视频分配到虚拟文件夹</div>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-auto pr-1">
              {/* 分类规则 */}
              <div>
                <label className="mb-2 block text-sm text-zinc-400">分类规则</label>
                <textarea
                  value={aiRule}
                  onChange={(e) => setAiRule(e.target.value)}
                  placeholder="例如：按电影类型分成动作片、喜剧片、科幻片等"
                  className="w-full h-20 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 resize-none"
                />
              </div>

              {/* API 配置 */}
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs text-zinc-500">API Key</label>
                  <Input
                    value={aiConfig.apiKey}
                    onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                    placeholder="sk-or-v1-..."
                    className="w-full rounded-lg border-white/10 bg-white/5 text-xs"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1.5 block text-xs text-zinc-500">模型</label>
                    <Input
                      value={aiConfig.model}
                      onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                      placeholder="qwen/qwen3.6-plus:free"
                      className="w-full rounded-lg border-white/10 bg-white/5 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1.5 block text-xs text-zinc-500">端点</label>
                    <Input
                      value={aiConfig.baseUrl}
                      onChange={(e) => setAiConfig({ ...aiConfig, baseUrl: e.target.value })}
                      className="w-full rounded-lg border-white/10 bg-white/5 text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => void handleAiTest()}
                    disabled={aiIsTesting || !aiConfig.apiKey}
                    className="h-8 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs"
                  >
                    {aiIsTesting ? <LoaderCircle className="mr-1 size-3 animate-spin" /> : null}
                    测试连接
                  </Button>
                  {aiTestResult && (
                    <span className={`text-xs ${aiTestResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                      {aiTestResult.ok ? '✓' : '✗'} {aiTestResult.message}
                    </span>
                  )}
                </div>
              </div>

              {/* 未分类视频数量 */}
              <div className="text-xs text-zinc-500">
                待分类视频: {snapshot.videos.filter((v) => v.folderIds.length === 0).length} 部
              </div>

              {/* 流式输出区域 */}
              {(aiClassifying || aiReasoning || aiRawContent) && (
                <div className="rounded-lg border border-white/8 bg-black/20 p-3 max-h-72 overflow-auto">
                  {aiReasoning && (
                    <div className="mb-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <LoaderCircle className={`size-3 ${aiClassifying ? 'animate-spin' : ''} text-violet-400`} />
                        <span className="text-xs font-medium text-violet-400">推理过程</span>
                      </div>
                      <div className="text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">{aiReasoning}</div>
                    </div>
                  )}
                  {aiRawContent && (
                    <div className={aiReasoning ? 'border-t border-white/5 pt-3' : ''}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-xs font-medium text-emerald-400">分类结果</span>
                      </div>
                      <div className="font-mono text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">{aiRawContent}</div>
                    </div>
                  )}
                  {!aiReasoning && !aiRawContent && aiClassifying && (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <LoaderCircle className="size-4 animate-spin text-violet-400" />
                      <span>AI 思考中...</span>
                    </div>
                  )}
                </div>
              )}

              {/* 消息提示 */}
              {aiMessage && (
                <div className={`text-xs p-3 rounded-lg ${
                  aiMessage.includes('成功') || aiMessage.includes('完成') || aiMessage.includes('已应用')
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : aiMessage.includes('遗漏')
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {aiMessage}
                </div>
              )}

              {/* 分类预览 — 可编辑的文件夹列表 */}
              {aiPreview && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Eye className="size-3" />
                      <span>预览分类结果（{aiPreview.folders.length} 个文件夹）</span>
                    </div>
                    <span className="text-xs text-zinc-500">共 {aiPreview.folders.reduce((s, f) => s + f.videoIds.length, 0)} 部视频</span>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-auto">
                    {aiPreview.folders.map((folder, idx) => {
                      const isExpanded = aiExpandedFolders.has(idx)
                      const isEditing = aiEditingFolderName === idx
                      return (
                        <div key={idx} className="rounded-lg border border-white/8 bg-white/[0.03] overflow-hidden">
                          {/* 文件夹头部 */}
                          <div className="flex items-center gap-2 p-3">
                            <button
                              onClick={() => {
                                if (isEditing) return
                                setAiExpandedFolders((prev) => {
                                  const next = new Set(prev)
                                  isExpanded ? next.delete(idx) : next.add(idx)
                                  return next
                                })
                              }}
                              className="flex items-center gap-1 flex-1 min-w-0"
                            >
                              {isExpanded ? <ChevronDown className="size-3.5 text-zinc-400 shrink-0" /> : <ChevronUp className="size-3.5 text-zinc-400 shrink-0" />}
                              {isEditing ? (
                                <input
                                  autoFocus
                                  value={folder.name}
                                  onChange={(e) => {
                                    const newName = e.target.value
                                    setAiPreview((prev) => {
                                      if (!prev) return prev
                                      const newFolders = [...prev.folders]
                                      newFolders[idx] = { ...newFolders[idx], name: newName }
                                      return { ...prev, folders: newFolders }
                                    })
                                  }}
                                  onBlur={() => setAiEditingFolderName(null)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') setAiEditingFolderName(null)
                                    if (e.key === 'Escape') setAiEditingFolderName(null)
                                  }}
                                  className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-sm text-white focus:outline-none focus:border-violet-500/50 w-32"
                                />
                              ) : (
                                <span
                                  onDoubleClick={() => setAiEditingFolderName(idx)}
                                  className="text-sm font-medium text-white truncate"
                                >
                                  {folder.name}
                                </span>
                              )}
                            </button>
                            <span className="text-xs text-zinc-500 shrink-0">{folder.videoIds.length} 部</span>
                            <button
                              onClick={() => {
                                setAiPreview((prev) => {
                                  if (!prev) return prev
                                  const newFolders = [...prev.folders]
                                  newFolders.splice(idx, 1)
                                  return { ...prev, folders: newFolders }
                                })
                                setAiExpandedFolders((prev) => {
                                  const next = new Set(prev)
                                  next.delete(idx)
                                  return next
                                })
                              }}
                              className="p-0.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition"
                              title="删除此文件夹"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                          {/* 展开的视频列表 */}
                          {isExpanded && (
                            <div className="border-t border-white/5 px-3 py-2 max-h-40 overflow-auto">
                              {folder.videoIds.map((vid) => {
                                const video = snapshot.videos.find((v) => v.id === vid)
                                return (
                                  video && (
                                    <div key={vid} className="text-xs text-zinc-400 truncate py-1">
                                      {video.title || video.name}
                                    </div>
                                  )
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {aiPreview === null && aiPreview?.folders?.length === 0 && (
                      <div className="text-xs text-zinc-500 text-center py-4">没有可分类的视频</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="mt-4 flex gap-3 pt-3 border-t border-white/8">
              {aiPreview ? (
                <Button
                  onClick={() => void handleAiApply()}
                  disabled={aiApplying}
                  className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {aiApplying ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
                  确认并应用
                </Button>
              ) : (
                <Button
                  onClick={() => void handleAiClassify()}
                  disabled={aiClassifying || !aiRule || !aiConfig.apiKey}
                  className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-500 text-white"
                >
                  {aiClassifying ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                  预览分类
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 数据库选择弹窗 */}
      {showDbSelector && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !isSwitchingDb && setShowDbSelector(false)}
          />
          <div className="relative w-full max-w-lg rounded-[32px] border border-white/10 bg-zinc-900 p-8 shadow-2xl max-h-[80vh] overflow-auto">
            <button
              onClick={() => !isSwitchingDb && setShowDbSelector(false)}
              className="absolute right-4 top-4 rounded-full p-1 text-zinc-500 hover:bg-white/10 hover:text-white transition"
            >
              <X className="size-4" />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                <Database className="size-5" />
              </div>
              <div>
                <div className="text-lg font-medium text-white">选择数据库</div>
                <div className="text-sm text-zinc-500">切换到其他 SQLite 数据库文件</div>
              </div>
            </div>
            {isSwitchingDb ? (
              <div className="flex items-center justify-center py-8 text-zinc-400">
                <LoaderCircle className="mr-2 size-5 animate-spin" />
                正在切换数据库...
              </div>
            ) : availableDatabases.length === 0 ? (
              <div className="py-8 text-center text-zinc-500">
                未找到数据库文件
              </div>
            ) : (
              <div className="space-y-2">
                {availableDatabases.map((db) => {
                  const isCurrent = db.path === currentDbPath
                  return (
                    <button
                      key={db.path}
                      onClick={() => void handleSwitchDatabase(db.path)}
                      disabled={isCurrent}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        isCurrent
                          ? 'border-emerald-500/50 bg-emerald-500/10'
                          : 'border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 truncate text-sm text-white">
                          {db.path.split(/[\\/]/).pop()}
                        </div>
                        {isCurrent && (
                          <span className="ml-2 shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
                            当前
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-xs text-zinc-500">
                        {db.path} · {formatBytes(db.size)}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 内置播放器 */}
      {playingVideo && (
        <VideoPlayer
          filePath={playingVideo.path}
          videoName={playingVideo.name}
          onClose={() => setPlayingVideo(null)}
          onNext={() => {
            if (playingVideo.index < sortedVideos.length - 1) {
              const next = sortedVideos[playingVideo.index + 1]
              setPlayingVideo({ path: next.absolutePath, name: next.title || next.name, index: playingVideo.index + 1 })
            }
          }}
          onPrevious={() => {
            if (playingVideo.index > 0) {
              const prev = sortedVideos[playingVideo.index - 1]
              setPlayingVideo({ path: prev.absolutePath, name: prev.title || prev.name, index: playingVideo.index - 1 })
            }
          }}
          playlist={sortedVideos.map((v) => ({ path: v.absolutePath, name: v.title || v.name }))}
          currentIndex={playingVideo.index}
          onSelectVideo={(index) => {
            const video = sortedVideos[index]
            setPlayingVideo({ path: video.absolutePath, name: video.title || video.name, index })
          }}
        />
      )}
    </div>
  )
}

export default App
