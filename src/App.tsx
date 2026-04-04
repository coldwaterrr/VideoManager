import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Clapperboard,
  Database,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  LoaderCircle,
  ScanSearch,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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

function VideoCard({ video, index, isSelected, onSelect, onOpen, folders, onToggleFolder, isMutatingFolder, pendingVideoId, isPreviewMode }: VideoCardProps) {
  const [isHovering, setIsHovering] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const thumbnailTimeRef = useRef<number>(1)

  // 生成视频封面 - 从随机位置截取
  useEffect(() => {
    const videoEl = document.createElement('video')
    videoEl.crossOrigin = 'anonymous'
    videoEl.preload = 'auto'
    videoEl.muted = true
    
    videoEl.onloadedmetadata = () => {
      // 随机选取封面时间点
      const randomTime = getRandomThumbnailTime(videoEl.duration)
      thumbnailTimeRef.current = randomTime
      videoEl.currentTime = randomTime
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

  // 悬停预览 - 使用事件委托避免子元素触发 mouseleave
  const handleMouseEnter = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovering(true)
      setTimeout(() => {
        if (previewRef.current) {
          previewRef.current.currentTime = 0
          previewRef.current.play().catch(() => {})
        }
      }, 50)
    }, 500)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsHovering(false)
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
            />
          )}
          
          {/* 悬停预览视频 */}
          {isHovering && !isPreviewMode && (
            <video
              ref={previewRef}
              src={`file:///${video.absolutePath.replace(/\\/g, '/')}`}
              className="absolute inset-0 size-full object-cover"
              muted
              loop
              playsInline
              preload="auto"
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
          <div className="truncate text-base font-medium text-white">{video.name}</div>
          <div className="truncate text-sm text-zinc-500">{video.absolutePath}</div>
          <div className="flex items-center justify-between pt-1 text-sm text-zinc-400">
            <span>{formatDuration(video.durationSeconds)}</span>
            <span>{formatBytes(video.fileSize)}</span>
          </div>
          <div className="text-xs text-zinc-600">修改时间：{formatTimeLabel(video.modifiedAt)}</div>
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

  const totalPages = Math.ceil(filteredVideos.length / pageSize)
  const paginatedVideos = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredVideos.slice(start, start + pageSize)
  }, [filteredVideos, currentPage, pageSize])

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

  async function handleOpenVideo(filePath: string) {
    if (!window.videosorter) {
      setStatusText('浏览器预览模式不支持打开视频。')
      return
    }
    await window.videosorter.openVideo(filePath)
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
    if (selectedVideoIds.size === filteredVideos.length) {
      setSelectedVideoIds(new Set())
    } else {
      setSelectedVideoIds(new Set(filteredVideos.map((v) => v.id)))
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
      <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col px-6 pb-6 pt-5">
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
                  onOpen={() => void handleOpenVideo(video.absolutePath)}
                  folders={snapshot.folders}
                  onToggleFolder={(folderId: number) => void handleToggleFolder(video.id, folderId)}
                  isMutatingFolder={isMutatingFolder}
                  pendingVideoId={pendingVideoId}
                  isPreviewMode={isPreviewMode}
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
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
