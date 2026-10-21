import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Clapperboard,
  Database,
  Film,
  FolderOpen,
  LoaderCircle,
  Search,
  Film as FilmIcon,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Eye,
  Check,
  Trash2,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TitleBar } from '@/components/TitleBar'
import { VideoPlayer } from '@/components/VideoPlayer'
import { MpvPlayer } from '@/components/MpvPlayer'
import { PlayerSelector } from '@/components/PlayerSelector'
import { LibraryTools } from '@/components/LibraryTools'
import { VideoCard, formatBytes } from '@/components/VideoCard'
import { LibrarySidebar, type LibraryFolder } from '@/components/LibrarySidebar'
import { LibraryFilters, emptyLibraryFilter, type LibraryFilter } from '@/components/LibraryFilters'
import { Dialog, useDialogFocus } from '@/components/Dialog'
import { SeriesPanel } from '@/components/SeriesPanel'
import { SeriesCard } from '@/components/SeriesCard'
import { videoMediaKey } from '@/lib/media'
import { Layers } from 'lucide-react'
import {
  LayoutGrid,
  List,
  SlidersHorizontal,
  RefreshCw,
  Plus,
  CheckSquare,
  Play,
  ChevronRight,
  CircleHelp,
} from 'lucide-react'

type Tag = { name: string; count: number }
type LibraryEntry =
  | { kind: 'video'; video: VideoRecord }
  | { kind: 'series'; group: SeriesGroup; members: VideoRecord[] }

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
      addedAt: new Date().toISOString(),
      folderIds: [1],
    },
    {
      id: 2,
      name: 'ColorGrading-Notes.mov',
      absolutePath: 'D:\\Media\\Course\\ColorGrading-Notes.mov',
      fileSize: 1_200_000_000,
      durationSeconds: 1122,
      modifiedAt: new Date().toISOString(),
      addedAt: new Date().toISOString(),
      folderIds: [2],
    },
    {
      id: 3,
      name: 'Weekend-Vlog-001.mp4',
      absolutePath: 'E:\\Capture\\Weekend-Vlog-001.mp4',
      fileSize: 426_000_000,
      durationSeconds: 571,
      modifiedAt: new Date().toISOString(),
      addedAt: new Date().toISOString(),
      folderIds: [],
    },
  ],
  lastScanDirectory: '浏览器预览模式',
  lastScannedAt: new Date().toISOString(),
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
function generateVideoTags(videoName: string, absolutePath: string, folderNames: string[]): string[] {
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

function App() {
  const [activeFolderId, setActiveFolderId] = useState('all')
  const [seriesState, setSeriesState] = useState<SeriesState>({ databasePath: '', groups: [] })
  const [showSeries, setShowSeries] = useState(false)
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null)
  const [collapseSeries, setCollapseSeries] = useState(() => {
    try {
      return localStorage.getItem('vm-collapse-series') !== 'false'
    } catch {
      return true
    }
  })
  const [mediaStats, setMediaStats] = useState<{
    bytes: number
    thumbnails: number
    previews: number
    limitBytes: number
  } | null>(null)
  const activeSeries = seriesState.groups.find((group) => group.id === activeSeriesId)
  useEffect(() => {
    if (activeSeriesId && !activeSeries) setActiveSeriesId(null)
  }, [activeSeriesId, activeSeries])
  useEffect(() => {
    try {
      localStorage.setItem('vm-collapse-series', String(collapseSeries))
    } catch {
      /* preference is optional */
    }
  }, [collapseSeries])

  const [contextMenuFolder, setContextMenuFolder] = useState<{
    id: string
    name: string
    x: number
    y: number
  } | null>(null)
  const [keyword, setKeyword] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderError, setNewFolderError] = useState('')
  const [removeIds, setRemoveIds] = useState<number[] | null>(null)
  const [removeError, setRemoveError] = useState('')
  const [folderBusy, setFolderBusy] = useState(false)
  const [folderError, setFolderError] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(!window.videosorter)
  const [isScanning, setIsScanning] = useState(false)
  const [isMutatingFolder, setIsMutatingFolder] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [pendingVideoId, setPendingVideoId] = useState<number | null>(null)
  const [statusText, setStatusText] = useState('正在加载资源库…')
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(() =>
    window.videosorter
      ? {
          ...previewSnapshot,
          videos: [],
          folders: [],
          lastScanDirectory: null,
          lastScannedAt: null,
          databaseMeta: { databasePath: '正在加载…', tables: [] },
        }
      : previewSnapshot
  )
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [scannedFiles, setScannedFiles] = useState<string[]>([])
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<number>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(24)
  const [toolsTab, setToolsTab] = useState<'monitor' | 'cleanup' | 'conditional' | 'rules' | null>(null)
  const [batchFolderId, setBatchFolderId] = useState('')
  const [renamingFolder, setRenamingFolder] = useState<{ id: number; name: string } | null>(null)

  // 扫描筛选器
  const [showFilter, setShowFilter] = useState(false)
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>(emptyLibraryFilter)
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('vm-library-view') === 'list' ? 'list' : 'grid'
    } catch {
      return 'grid'
    }
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [previewEnabled, setPreviewEnabled] = useState(() => {
    try {
      return localStorage.getItem('vm-hover-preview') !== 'false'
    } catch {
      return true
    }
  })
  const searchRef = useRef<HTMLInputElement>(null)
  const legacyModalRef = useRef<HTMLDivElement>(null)
  const deferredKeyword = useDeferredValue(keyword)
  useEffect(() => {
    try {
      localStorage.setItem('vm-library-view', view)
    } catch {
      /* optional preference */
    }
  }, [view])
  useEffect(() => {
    try {
      localStorage.setItem('vm-hover-preview', String(previewEnabled))
    } catch {
      /* optional preference */
    }
  }, [previewEnabled])
  const [filterMinSize, setFilterMinSize] = useState(0) // MB
  const [filterMaxSize, setFilterMaxSize] = useState(0) // MB, 0表示不限制
  const [filterFormats, setFilterFormats] = useState<string[]>([
    '.mp4',
    '.mkv',
    '.avi',
    '.mov',
    '.wmv',
    '.webm',
    '.m4v',
    '.flv',
    '.ts',
    '.mts',
    '.m2ts',
    '.mpeg',
    '.mpg',
  ])

  // 标签相关状态
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  // TMDB 相关状态
  const [tmdbApiKey, setTmdbApiKey] = useState('')
  const [showTmdbConfig, setShowTmdbConfig] = useState(false)
  const [isScraping, setIsScraping] = useState(false)

  // 手动刮削相关状态
  const [showManualScrape, setShowManualScrape] = useState(false)
  const [manualScrapeVideoId, setManualScrapeVideoId] = useState<number | null>(null)
  const [manualScrapeQuery, setManualScrapeQuery] = useState('')
  const [manualScrapeResults, setManualScrapeResults] = useState<any[]>([])
  const [manualScrapeLoading, setManualScrapeLoading] = useState(false)
  const [manualScrapeSearching, setManualScrapeSearching] = useState(false)

  // 数据库选择相关状态
  const [showDbSelector, setShowDbSelector] = useState(false)
  const [availableDatabases, setAvailableDatabases] = useState<Array<{ path: string; size: number }>>([])
  const [currentDbPath, setCurrentDbPath] = useState<string | null>(null)
  const [isSwitchingDb, setIsSwitchingDb] = useState(false)

  // 排序
  const [sortField, setSortField] = useState<'name' | 'size' | 'time'>('time')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // 内置播放器状态
  const [playbackQueue, setPlaybackQueue] = useState<VideoRecord[]>([])
  const [playingVideo, setPlayingVideo] = useState<{ path: string; name: string; index: number } | null>(null)

  // MPV 播放器相关状态
  const [showMpvConfig, setShowMpvConfig] = useState(false)
  const [mpvConfigState, setMpvConfigState] = useState({
    anime4k: false,
    interpolation: false,
    interpolationFps: 60,
    superResShader: 'none' as 'anime4k' | 'fsrcnnx' | 'none',
    mpvPath: '',
  })

  // 播放器选择
  const [defaultPlayer, setDefaultPlayer] = useState<'web' | 'mpv' | 'system'>('web')
  // MPV 下载通知
  const [mpvDownload, setMpvDownload] = useState<{ stage: string; percent: number; message: string } | null>(
    null
  )

  useEffect(() => {
    if (!window.videosorter) return
    const unsub = window.videosorter.onMpvDownloadProgress((progress) => {
      setMpvDownload(progress)
      if (progress.stage === 'complete' || progress.stage === 'error') {
        setTimeout(() => setMpvDownload(null), 5000)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    window.videosorter?.playerGetConfig().then((c) => {
      if (c?.defaultPlayer) setDefaultPlayer(c.defaultPlayer as 'web' | 'mpv' | 'system')
    })
  }, [])

  // 监听 PlayerSelector 组件发来的配置变化
  const handlePlayerConfigChange = useCallback((player: 'web' | 'mpv' | 'system') => {
    setDefaultPlayer(player)
  }, [])

  // AI 分类相关状态
  const [showAiClassify, setShowAiClassify] = useState(false)
  const [aiRule, setAiRule] = useState('')
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'qwen/qwen3.6-plus:free',
  })
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
  // 进度
  const [aiCurrentBatch, setAiCurrentBatch] = useState(0)
  const [aiTotalBatches, setAiTotalBatches] = useState(0)
  const [aiProgressMessage, setAiProgressMessage] = useState('')
  const [showAiStreamDetail, setShowAiStreamDetail] = useState(false)
  const [aiDuration, setAiDuration] = useState(0)
  const aiStartTimeRef = useRef(0)

  // 自动更新相关状态
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
  >('idle')
  const [updateVersion, setUpdateVersion] = useState('')
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateError, setUpdateError] = useState('')
  useEffect(() => {
    if (
      !window.videosorter ||
      !snapshot.databaseMeta.databasePath ||
      snapshot.databaseMeta.databasePath === '正在加载…'
    )
      return
    let disposed = false
    setShowSeries(false)
    setActiveSeriesId(null)
    setSeriesState({ databasePath: snapshot.databaseMeta.databasePath, groups: [] })
    void window.videosorter
      .getSeries()
      .then((value) => {
        if (!disposed && value.databasePath === snapshot.databaseMeta.databasePath) setSeriesState(value)
      })
      .catch((error) => {
        if (!disposed) setStatusText(String(error))
      })
    return () => {
      disposed = true
    }
  }, [snapshot.databaseMeta.databasePath])
  const libraryMemberIds = snapshot.videos.map((video) => video.id).join(',')
  useEffect(() => {
    const valid = new Set(libraryMemberIds.split(',').map(Number))
    setSeriesState((previous) => ({
      ...previous,
      groups: previous.groups
        .map((group) => ({ ...group, videoIds: group.videoIds.filter((id) => valid.has(id)) }))
        .filter((group) => group.videoIds.length),
    }))
  }, [libraryMemberIds])
  useEffect(() => {
    const updates = new Map<number, { key: string; durationSeconds: number }>()
    let timer: ReturnType<typeof setTimeout> | null = null
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id: number; key: string; durationSeconds: number }>).detail
      if (!detail || !Number.isFinite(detail.durationSeconds) || detail.durationSeconds <= 0) return
      updates.set(detail.id, detail)
      if (!timer)
        timer = setTimeout(() => {
          setSnapshot((previous) => ({
            ...previous,
            videos: previous.videos.map((video) => {
              const change = updates.get(video.id)
              return change && change.key === videoMediaKey(video)
                ? { ...video, durationSeconds: change.durationSeconds }
                : video
            }),
          }))
          updates.clear()
          timer = null
        }, 100)
    }
    window.addEventListener('vm-media-metadata', handler)
    return () => {
      window.removeEventListener('vm-media-metadata', handler)
      if (timer) clearTimeout(timer)
    }
  }, [])
  useEffect(() => {
    if (showSettings)
      void window.videosorter
        ?.getMediaCacheStats()
        .then(setMediaStats)
        .catch(() => {})
  }, [showSettings])
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
    let unsubscribeScan: (() => void) | undefined
    let disposed = false
    async function bootstrap() {
      if (!window.videosorter) {
        setIsPreviewMode(true)
        setSnapshot(previewSnapshot)
        setStatusText('当前是浏览器预览模式，扫描与数据库写入仅在 Electron 窗口内可用。')
        return
      }

      try {
        const nextSnapshot = await window.videosorter.getLibrarySnapshot()
        if (disposed) return
        setSnapshot(nextSnapshot)
        setStatusText(
          nextSnapshot.videos.length > 0
            ? `已载入 ${nextSnapshot.videos.length} 个视频`
            : '数据库已初始化，点击"扫描目录"开始导入本地视频。'
        )

        unsubscribeScan = window.videosorter.onScanProgress((progress) => {
          setScanProgress(progress)
          if (progress.type === 'found' && progress.filePath) {
            setScannedFiles((prev) => [...prev.slice(-99), progress.filePath!])
          }
          if (progress.type === 'complete') {
            setStatusText(progress.message || '')
          }
        })
      } catch (error) {
        if (disposed) return
        setSnapshot({ ...previewSnapshot, videos: [], folders: [] })
        setStatusText(`资源库加载失败：${String(error)}`)
      }
    }

    void bootstrap()
    return () => {
      disposed = true
      unsubscribeScan?.()
    }
  }, [])

  useEffect(() => {
    if (!window.videosorter) return
    return window.videosorter.onMonitorUpdate((event) => {
      if (event.snapshot) setSnapshot(event.snapshot)
      if (event.message || event.error) setStatusText(event.message || `自动检测失败：${event.error}`)
    })
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
      if (!result.success && result.message === '未找到匹配的影视信息') {
        setManualScrapeVideoId(videoId)
        setManualScrapeQuery(video.name.replace(/\.[^/.]+$/, ''))
        setManualScrapeResults([])
        setShowManualScrape(true)
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '刮削失败。')
    } finally {
      setIsScraping(false)
    }
  }

  async function handleManualScrapeSearch() {
    if (!manualScrapeQuery.trim() || !window.videosorter) return
    setManualScrapeSearching(true)
    setManualScrapeResults([])
    try {
      const results = await window.videosorter.tmdbManualSearch(manualScrapeQuery.trim())
      setManualScrapeResults(results)
    } catch {
      setManualScrapeResults([])
    } finally {
      setManualScrapeSearching(false)
    }
  }

  async function handleManualScrapeSelect(result: any) {
    if (!window.videosorter || !manualScrapeVideoId) return
    setManualScrapeLoading(true)
    try {
      const updateResult = await window.videosorter.tmdbManualScrape(manualScrapeVideoId, result)
      if (updateResult.success) {
        const nextSnapshot = await window.videosorter.getLibrarySnapshot()
        setSnapshot(nextSnapshot)
        setShowManualScrape(false)
        setStatusText(`已手动刮削: ${result.title}`)
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '手动刮削失败。')
    } finally {
      setManualScrapeLoading(false)
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
      setPlayingVideo(null)
      setAiPreview(null)
      setShowAiNotification(false)
      setSelectedVideoIds(new Set())
      setActiveFolderId('all')
      setKeyword('')
      setSelectedTag(null)
      setLibraryFilter(emptyLibraryFilter)
      setToolsTab(null)
      setStatusText(`已切换数据库: ${databasePath.split(/[\\/]/).pop()}`)
      setShowDbSelector(false)
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '切换数据库失败。')
    } finally {
      setIsSwitchingDb(false)
    }
  }

  // MPV 播放器相关函数
  async function loadMpvConfig() {
    if (!window.videosorter?.mpvGetConfig) return
    try {
      const config = await window.videosorter.mpvGetConfig()
      setMpvConfigState(config)
    } catch {
      // ignore
    }
  }

  async function handleSaveMpvConfig(updates: {
    anime4k?: boolean
    interpolation?: boolean
    interpolationFps?: number
    superResShader?: 'anime4k' | 'fsrcnnx' | 'none'
    mpvPath?: string
  }) {
    if (!window.videosorter?.mpvSaveConfig) return
    const newConfig = { ...mpvConfigState, ...updates }
    setMpvConfigState(newConfig)
    try {
      await window.videosorter.mpvSaveConfig(newConfig)
    } catch (error) {
      console.error('Failed to save mpv config:', error)
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
    setAiCurrentBatch(0)
    setAiTotalBatches(0)
    setAiProgressMessage('正在连接 AI...')
    setShowAiStreamDetail(false)
    setAiDuration(0)
    aiStartTimeRef.current = Date.now()

    const cleanup = window.videosorter.onAiChunk((chunk: AIChunk) => {
      if (chunk.type === 'progress') {
        setAiCurrentBatch(chunk.batch ?? 0)
        setAiTotalBatches(chunk.totalBatches ?? 0)
        setAiProgressMessage(chunk.message ?? '')
      } else if (chunk.type === 'summary') {
        setAiCurrentBatch(chunk.batch ?? 0)
        // 中间结果：展示当前合并后的文件夹预览
        if (chunk.folders) {
          setAiPreview({ folders: chunk.folders })
        }
      } else if (chunk.type === 'reasoning') {
        setAiReasoning((prev) => prev + (chunk.reasoning ?? ''))
        setShowAiStreamDetail(true)
      } else {
        // type === 'content' or legacy
        setAiRawContent((prev) => prev + (chunk.content ?? ''))
        setShowAiStreamDetail(true)
      }
    })

    try {
      const result = await window.videosorter.aiClassifyStream(aiRule, aiConfig)
      cleanup()
      setAiDuration(Date.now() - aiStartTimeRef.current)
      if (result.success && result.result) {
        setAiPreview(result.result)
        setAiMessage(`分类完成，共 ${result.result.folders.length} 个文件夹`)
      } else if (result.message?.includes('已被取消')) {
        setAiMessage('分类已被取消')
        setAiProgressMessage('已取消')
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

  async function handleAiCancel() {
    if (!window.videosorter?.aiCancelClassify) return
    await window.videosorter.aiCancelClassify()
    setAiProgressMessage('正在取消...')
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
        setAiPreview(null)
        setAiMessage('')
        setAiReasoning('')
        setAiRawContent('')
      } else {
        setAiMessage(result.message)
      }
    } catch {
      setAiMessage('应用分类结果失败')
    } finally {
      setAiApplying(false)
    }
  }

  useEffect(() => {
    if (window.videosorter) {
      void loadTmdbConfig()
      void handleScanDatabases()
      window.videosorter.appGetVersion().then((v) => setUpdateVersion(v.version))
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

  // 自动更新事件监听
  useEffect(() => {
    if (!window.videosorter) return
    const unsubscribeAvailable = window.videosorter.onUpdateAvailable((info) => {
      setUpdateStatus('available')
      setUpdateVersion(info.version)
    })
    const unsubscribeNotAvailable = window.videosorter.onUpdateNotAvailable(() => {
      setUpdateStatus('not-available')
    })
    const unsubscribeError = window.videosorter.onUpdateError((msg) => {
      setUpdateStatus('error')
      setUpdateError(msg)
    })
    const unsubscribeProgress = window.videosorter.onUpdateProgress((p) => {
      setUpdateProgress(Math.round(p.percent))
    })
    const unsubscribeDownloaded = window.videosorter.onUpdateDownloaded((info) => {
      setUpdateStatus('downloaded')
      setUpdateVersion(info.version)
    })
    return () => {
      unsubscribeAvailable()
      unsubscribeNotAvailable()
      unsubscribeError()
      unsubscribeProgress()
      unsubscribeDownloaded()
    }
  }, [])

  async function handleCheckUpdate() {
    setShowUpdateDialog(true)
    setUpdateStatus('checking')
    if (!window.videosorter) return
    await window.videosorter.updateCheck()
  }

  async function handleDownloadUpdate() {
    setUpdateStatus('downloading')
    setUpdateProgress(0)
    if (!window.videosorter) return
    await window.videosorter.updateDownload()
  }

  async function handleInstallUpdate() {
    if (!window.videosorter) return
    await window.videosorter.updateInstall()
  }

  const filteredVideos = useMemo(() => {
    return videosWithTags.filter((video) => {
      const normalizedKeyword = deferredKeyword.trim().toLowerCase()
      const customFolderId = activeFolderId.startsWith('folder-')
        ? Number(activeFolderId.replace('folder-', ''))
        : null

      const matchesKeyword =
        normalizedKeyword.length === 0 ||
        video.name.toLowerCase().includes(normalizedKeyword) ||
        (video.title || '').toLowerCase().includes(normalizedKeyword) ||
        video.absolutePath.toLowerCase().includes(normalizedKeyword)

      if (!matchesKeyword) {
        return false
      }

      if (activeSeries && !activeSeries.videoIds.includes(video.id)) return false
      if (selectedTag && !video.tags.includes(selectedTag)) return false
      if (libraryFilter.format && !video.name.toLowerCase().endsWith('.' + libraryFilter.format)) return false
      if (libraryFilter.minSize !== '' && video.fileSize < Number(libraryFilter.minSize) * 1024 * 1024)
        return false
      if (libraryFilter.maxSize !== '' && video.fileSize > Number(libraryFilter.maxSize) * 1024 * 1024)
        return false
      const duration = video.durationSeconds
      if (libraryFilter.duration === 'short' && !(duration > 0 && duration < 300)) return false
      if (libraryFilter.duration === 'medium' && !(duration >= 300 && duration < 1800)) return false
      if (libraryFilter.duration === 'long' && !(duration >= 1800)) return false
      if (libraryFilter.duration === 'unknown' && duration > 0) return false

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
  }, [activeFolderId, deferredKeyword, selectedTag, videosWithTags, libraryFilter, activeSeries])

  // 排序
  const sortedVideos = useMemo(() => {
    return [...filteredVideos].sort((a, b) => {
      let result = 0
      if (sortField === 'name')
        result = (a.title || a.name).localeCompare(b.title || b.name, 'zh-CN', {
          numeric: true,
          sensitivity: 'base',
        })
      else if (sortField === 'size') result = a.fileSize - b.fileSize
      else result = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime()
      return sortOrder === 'desc' ? -result : result
    })
  }, [filteredVideos, sortField, sortOrder])

  const displayEntries = useMemo<LibraryEntry[]>(() => {
    if (!collapseSeries || selectionMode || activeSeriesId)
      return sortedVideos.map((video) => ({ kind: 'video', video }))
    const visible = new Map<number, VideoRecord>(sortedVideos.map((video) => [video.id, video]))
    const byVideo = new Map<number, { group: SeriesGroup; members: VideoRecord[] }>()
    for (const group of seriesState.groups) {
      const members = group.videoIds
        .map((id) => visible.get(id))
        .filter((video): video is VideoRecord => !!video)
      if (members.length >= 2) members.forEach((video) => byVideo.set(video.id, { group, members }))
    }
    const seen = new Set<string>()
    const entries: LibraryEntry[] = []
    for (const video of sortedVideos) {
      const grouped = byVideo.get(video.id)
      if (!grouped) entries.push({ kind: 'video', video })
      else if (!seen.has(grouped.group.id)) {
        entries.push({ kind: 'series', ...grouped })
        seen.add(grouped.group.id)
      }
    }
    return entries
  }, [sortedVideos, seriesState.groups, collapseSeries, selectionMode, activeSeriesId])
  const totalPages = Math.ceil(displayEntries.length / pageSize)
  const paginatedEntries = useMemo(
    () => displayEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [displayEntries, currentPage, pageSize]
  )
  const warmIds = paginatedEntries
    .map((entry) => (entry.kind === 'series' ? entry.members[0].id : entry.video.id))
    .join(',')
  useEffect(() => {
    if (isPreviewMode) return
    const ids = warmIds ? warmIds.split(',').map(Number) : []
    void window.videosorter
      ?.warmMedia(
        ids,
        previewEnabled &&
          !selectionMode &&
          !playingVideo &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
      .catch(() => {})
  }, [
    warmIds,
    isPreviewMode,
    previewEnabled,
    selectionMode,
    playingVideo,
    snapshot.databaseMeta.databasePath,
  ])

  // 切换文件夹或搜索时重置到第一页
  useEffect(() => {
    setCurrentPage(1)
  }, [
    activeFolderId,
    deferredKeyword,
    selectedTag,
    pageSize,
    libraryFilter,
    activeSeriesId,
    selectionMode,
    collapseSeries,
  ])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, Math.max(1, totalPages)))
  }, [totalPages])
  useEffect(() => {
    const visible = new Set(sortedVideos.map((video) => video.id))
    setSelectedVideoIds((previous) => new Set([...previous].filter((id) => visible.has(id))))
  }, [sortedVideos])
  useEffect(() => {
    if (
      activeFolderId.startsWith('folder-') &&
      !snapshot.folders.some((folder) => `folder-${folder.id}` === activeFolderId)
    )
      setActiveFolderId('all')
  }, [snapshot.folders, activeFolderId])

  const sidebarFolders = useMemo<LibraryFolder[]>(() => {
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
      if (!result.cancelled && result.snapshot.scanSummary)
        setStatusText(
          `扫描完成：新增 ${result.snapshot.scanSummary.added}，更新 ${result.snapshot.scanSummary.updated}，未变化 ${result.snapshot.scanSummary.unchanged}`
        )
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

  async function handleDeleteFolder(folderId: string) {
    if (!window.videosorter) return
    setContextMenuFolder(null)

    const folder = sidebarFolders.find((f) => f.id === folderId)
    if (!folder || folder.system) return
    if (!window.confirm(`确定删除文件夹"${folder.name}"吗？此操作不可撤销。`)) return

    const id = parseInt(folderId.replace('folder-', ''), 10)
    try {
      const nextSnapshot = await window.videosorter.deleteVirtualFolder(id)
      setSnapshot(nextSnapshot)
      if (activeFolderId === folderId) {
        setActiveFolderId('all')
      }
      setStatusText(`已删除文件夹"${folder.name}"`)
    } catch {
      setStatusText('删除文件夹失败')
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

    setNewFolderError('')
    setIsCreatingFolder(true)

    try {
      const nextSnapshot = await window.videosorter.createVirtualFolder(normalizedName)
      setSnapshot(nextSnapshot)
      setNewFolderName('')
      setShowCreateFolder(false)
      const created = nextSnapshot.folders.find((folder) => folder.name === normalizedName)
      if (created) setActiveFolderId(`folder-${created.id}`)
      setStatusText(`已创建虚拟文件夹“${normalizedName}”。`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建文件夹失败。'
      setNewFolderError(message)
      setStatusText(message)
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
    if (defaultPlayer === 'system') {
      void window.videosorter?.openVideo(video.absolutePath).then((result) => {
        if (!result.success) setStatusText(result.error || '打开视频失败')
      })
      return
    }
    setPlaybackQueue(sortedVideos)
    const playIndex = sortedVideos.findIndex((v) => v.id === video.id)
    setPlayingVideo({
      path: video.absolutePath,
      name: video.title || video.name,
      index: playIndex >= 0 ? playIndex : 0,
    })
  }

  async function handleRescan() {
    if (!window.videosorter) return
    setIsScanning(true)
    try {
      const result = await window.videosorter.rescanDirectory({
        minSizeMB: filterMinSize,
        maxSizeMB: filterMaxSize,
        formats: filterFormats,
      })
      setSnapshot(result)
      setStatusText(
        `增量扫描完成：新增 ${result.scanSummary?.added || 0}，更新 ${result.scanSummary?.updated || 0}`
      )
    } catch (error) {
      setStatusText(String(error))
    } finally {
      setIsScanning(false)
    }
  }
  async function handleBatchClassify(mode: 'add' | 'remove') {
    if (!window.videosorter || !batchFolderId) return
    setIsMutatingFolder(true)
    try {
      setSnapshot(
        await window.videosorter.batchClassify(Array.from(selectedVideoIds), Number(batchFolderId), mode)
      )
      setSelectedVideoIds(new Set())
      setStatusText(mode === 'add' ? '已批量加入分类。' : '已批量移出分类。')
    } catch (error) {
      setStatusText(String(error))
    } finally {
      setIsMutatingFolder(false)
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

  function handleDeleteSelected() {
    if (selectedVideoIds.size === 0 || !window.videosorter) return
    setRemoveError('')
    setRemoveIds([...selectedVideoIds])
  }
  async function confirmRemoveSelected() {
    if (!window.videosorter || !removeIds?.length || isDeleting) return
    setIsDeleting(true)
    setRemoveError('')
    try {
      const result = await window.videosorter.deleteVideos(removeIds)
      setSnapshot(result.snapshot)
      setSelectedVideoIds(new Set())
      setRemoveIds(null)
      setStatusText(`已移除 ${result.deletedCount} 条视频记录，原视频文件已保留。`)
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : '移除记录失败，请重试。')
    } finally {
      setIsDeleting(false)
    }
  }

  const legacyDialog = showDbSelector
    ? 'database'
    : showManualScrape
      ? 'manual'
      : showAiClassify && !showAiNotification
        ? 'ai'
        : showMpvConfig
          ? 'mpv'
          : showUpdateDialog
            ? 'update'
            : showTmdbConfig
              ? 'tmdb'
              : ''
  useDialogFocus(
    legacyModalRef,
    () => {
      if (legacyDialog === 'database') setShowDbSelector(false)
      if (legacyDialog === 'manual') setShowManualScrape(false)
      if (legacyDialog === 'ai') setShowAiClassify(false)
      if (legacyDialog === 'mpv') setShowMpvConfig(false)
      if (legacyDialog === 'update') setShowUpdateDialog(false)
      if (legacyDialog === 'tmdb') setShowTmdbConfig(false)
    },
    isSwitchingDb || aiApplying || manualScrapeLoading,
    !!legacyDialog,
    legacyDialog
  )

  useEffect(() => {
    const closeFolders = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('.card-folders'))
        document.querySelectorAll<HTMLDetailsElement>('.card-folders[open]').forEach((details) => {
          details.open = false
        })
    }
    document.addEventListener('pointerdown', closeFolders)
    return () => document.removeEventListener('pointerdown', closeFolders)
  }, [])

  const activeFilterCount =
    Object.values(libraryFilter).filter((value) => value !== '').length + (selectedTag ? 1 : 0)
  const totalSize = snapshot.videos.reduce((sum, video) => sum + video.fileSize, 0)
  function resetFilters() {
    setLibraryFilter(emptyLibraryFilter)
    setSelectedTag(null)
  }
  function resetSearch() {
    resetFilters()
    setKeyword('')
  }
  function openSetting(action: () => void) {
    setShowSettings(false)
    action()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const inInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable ||
        target instanceof HTMLSelectElement
      const hasOverlay =
        !!document.querySelector('[role="dialog"], [aria-modal="true"]') ||
        playingVideo ||
        showTmdbConfig ||
        showMpvConfig ||
        showAiClassify ||
        showManualScrape ||
        showDbSelector ||
        showUpdateDialog
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !hasOverlay) {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      if (event.key === 'Escape' && !hasOverlay) {
        setContextMenuFolder(null)
        document.querySelectorAll<HTMLDetailsElement>('.card-folders[open]').forEach((details) => {
          details.open = false
        })
        if (selectionMode || selectedVideoIds.size) {
          setSelectionMode(false)
          setSelectedVideoIds(new Set())
        } else if (document.activeElement === searchRef.current) {
          setKeyword('')
          searchRef.current?.blur()
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'a' && !inInput && !hasOverlay && selectionMode) {
        event.preventDefault()
        handleSelectAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    selectionMode,
    selectedVideoIds,
    sortedVideos,
    playingVideo,
    showTmdbConfig,
    showMpvConfig,
    showAiClassify,
    showManualScrape,
    showDbSelector,
    showUpdateDialog,
  ])

  return (
    <div className="app-root" onClick={() => setContextMenuFolder(null)}>
      <a className="skip-link" href="#library-content">
        跳到视频列表
      </a>
      <TitleBar />
      <div className={`app-workspace ${sidebarCollapsed ? 'sidebar-compact' : ''}`}>
        <LibrarySidebar
          folders={sidebarFolders}
          activeId={activeFolderId}
          onNavigate={(id) => {
            setActiveFolderId(id)
            setActiveSeriesId(null)
          }}
          onSeries={() => setShowSeries(true)}
          onCreate={() => {
            setNewFolderError('')
            setShowCreateFolder(true)
          }}
          onManageFolder={(folder, x, y) =>
            setContextMenuFolder({
              id: folder.id,
              name: folder.name,
              x: Math.min(x, window.innerWidth - 190),
              y: Math.min(y, window.innerHeight - 110),
            })
          }
          onTool={setToolsTab}
          onSettings={() => setShowSettings(true)}
          disabled={isPreviewMode}
          totalSize={formatBytes(totalSize)}
          lastDirectory={snapshot.lastScanDirectory}
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed((value) => !value)}
        />
        <div className="workspace-content">
          <header className="workspace-topbar">
            <div className="breadcrumb">
              <Film size={15} />
              <span>我的视频库</span>
              <ChevronRight size={13} />
              <strong>{activeFolder.name}</strong>
            </div>
            <div className="topbar-right">
              {isPreviewMode && <span className="preview-badge">演示模式</span>}
              <button
                className="icon-button"
                aria-label="使用帮助"
                title="使用帮助"
                onClick={() => {
                  setShowSettings(true)
                }}
              >
                <CircleHelp size={18} />
              </button>
            </div>
          </header>
          <main id="library-content" tabIndex={-1}>
            <div className="library-heading">
              <div>
                <h1>
                  {activeFolder.name}
                  <span>{activeFolder.count.toLocaleString()}</span>
                </h1>
                <p>
                  {activeFolderId === 'unclassified'
                    ? '给还没有归属的影像，找到合适的位置。'
                    : activeFolder.system
                      ? '所有精彩，都在这里。'
                      : '你的专属影像收藏。'}
                </p>
              </div>
              <div className="heading-actions">
                <Button
                  variant="ghost"
                  disabled={isPreviewMode}
                  onClick={() => {
                    setShowAiClassify(true)
                  }}
                >
                  <Sparkles size={16} />
                  AI 智能分类
                </Button>
                <Button onClick={() => setShowImport(true)} disabled={isScanning || isPreviewMode}>
                  {isScanning ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={18} />}
                  导入视频
                </Button>
              </div>
            </div>
            {isPreviewMode && (
              <div className="preview-notice">
                <Eye size={15} />
                <span>正在展示示例视频。打开桌面应用即可导入和管理本地视频。</span>
              </div>
            )}
            {activeSeries && (
              <div className="series-breadcrumb">
                <button onClick={() => setActiveSeriesId(null)}>返回视频列表</button>
                <Layers size={15} />
                <strong>{activeSeries.name}</strong>
                <button onClick={() => setShowSeries(true)}>管理系列</button>
              </div>
            )}
            <div className="library-toolbar">
              <div className="library-search">
                <Search size={17} />
                <Input
                  ref={searchRef}
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  aria-label="搜索视频"
                  placeholder="搜索名称、标题或路径…"
                />
                {keyword ? (
                  <button
                    className="icon-button"
                    aria-label="清除搜索"
                    onClick={() => {
                      setKeyword('')
                      searchRef.current?.focus()
                    }}
                  >
                    <X size={15} />
                  </button>
                ) : (
                  <kbd>Ctrl K</kbd>
                )}
              </div>
              <div className="toolbar-controls">
                <button
                  className={`toolbar-button ${showFilter || activeFilterCount ? 'is-active' : ''}`}
                  onClick={() => setShowFilter((value) => !value)}
                  aria-expanded={showFilter}
                  aria-controls="library-filter-panel"
                >
                  <SlidersHorizontal size={16} />
                  筛选{activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
                </button>
                <select
                  className="sort-select"
                  aria-label="排序方式"
                  value={`${sortField}-${sortOrder}`}
                  onChange={(event) => {
                    const [field, order] = event.target.value.split('-')
                    setSortField(field as 'time' | 'name' | 'size')
                    setSortOrder(order as 'asc' | 'desc')
                  }}
                >
                  <option value="time-desc">最近修改</option>
                  <option value="time-asc">最早修改</option>
                  <option value="name-asc">名称 A–Z</option>
                  <option value="name-desc">名称 Z–A</option>
                  <option value="size-desc">文件从大到小</option>
                  <option value="size-asc">文件从小到大</option>
                </select>
                {seriesState.groups.length > 0 && (
                  <button
                    className={`toolbar-button ${collapseSeries ? 'is-active' : ''}`}
                    aria-label="按系列折叠"
                    aria-pressed={collapseSeries}
                    onClick={() => {
                      setActiveSeriesId(null)
                      setCollapseSeries((value) => !value)
                    }}
                  >
                    <Layers size={15} />
                    系列
                  </button>
                )}
                <div className="view-switch" role="group" aria-label="显示方式">
                  <button
                    className={view === 'grid' ? 'active' : ''}
                    aria-label="网格视图"
                    aria-pressed={view === 'grid'}
                    onClick={() => setView('grid')}
                    title="网格视图"
                  >
                    <LayoutGrid size={17} />
                  </button>
                  <button
                    className={view === 'list' ? 'active' : ''}
                    aria-label="列表视图"
                    aria-pressed={view === 'list'}
                    onClick={() => setView('list')}
                    title="列表视图"
                  >
                    <List size={19} />
                  </button>
                </div>
              </div>
            </div>
            {showFilter && (
              <div id="library-filter-panel">
                <LibraryFilters
                  value={libraryFilter}
                  onChange={setLibraryFilter}
                  tags={allTags}
                  selectedTag={selectedTag}
                  onTagChange={setSelectedTag}
                  onReset={resetFilters}
                />
              </div>
            )}
            {(keyword || activeFilterCount > 0) && (
              <div className="active-filters">
                <span>当前条件</span>
                {keyword && (
                  <button onClick={() => setKeyword('')}>
                    搜索：{keyword}
                    <X size={12} />
                  </button>
                )}
                {selectedTag && (
                  <button onClick={() => setSelectedTag(null)}>
                    标签：{selectedTag}
                    <X size={12} />
                  </button>
                )}
                {Object.entries(libraryFilter)
                  .filter(([, value]) => value !== '')
                  .map(([key, value]) => (
                    <button
                      key={key}
                      onClick={() => setLibraryFilter((previous) => ({ ...previous, [key]: '' }))}
                    >
                      {key === 'format'
                        ? value.toUpperCase()
                        : key === 'minSize'
                          ? `≥ ${value} MB`
                          : key === 'maxSize'
                            ? `≤ ${value} MB`
                            : {
                                short: '5 分钟以内',
                                medium: '5–30 分钟',
                                long: '30 分钟及以上',
                                unknown: '待解析时长',
                              }[value] || value}
                      <X size={12} />
                    </button>
                  ))}
                <button className="clear-all" onClick={resetSearch}>
                  清除全部
                </button>
              </div>
            )}
            <div className="results-heading">
              <span>
                {keyword || activeFilterCount
                  ? `找到 ${filteredVideos.length.toLocaleString()} 个视频`
                  : `共 ${filteredVideos.length.toLocaleString()} 个视频`}
                <span className="results-size">
                  {formatBytes(filteredVideos.reduce((sum, video) => sum + video.fileSize, 0))}
                </span>
              </span>
              <div>
                <button
                  className={`text-button ${selectionMode ? 'is-active' : ''}`}
                  aria-pressed={selectionMode}
                  onClick={() => {
                    setSelectionMode((value) => !value)
                    setSelectedVideoIds(new Set())
                  }}
                >
                  <CheckSquare size={15} />
                  {selectionMode ? '退出批量选择' : '批量选择'}
                </button>
                <button
                  className="icon-button"
                  disabled={isPreviewMode || isScanning || !snapshot.lastScanDirectory}
                  onClick={() => void handleRescan()}
                  aria-label="增量扫描"
                  title="增量扫描上次目录"
                >
                  <RefreshCw size={15} className={isScanning ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            {(selectionMode || selectedVideoIds.size > 0) && (
              <div className="batch-toolbar" aria-label="批量操作">
                <label>
                  <input
                    type="checkbox"
                    aria-label="全选当前筛选结果"
                    checked={sortedVideos.length > 0 && selectedVideoIds.size === sortedVideos.length}
                    ref={(element) => {
                      if (element)
                        element.indeterminate =
                          selectedVideoIds.size > 0 && selectedVideoIds.size < sortedVideos.length
                    }}
                    onChange={handleSelectAll}
                  />
                  <span>
                    已选 {selectedVideoIds.size} / {sortedVideos.length}
                  </span>
                </label>
                <select
                  aria-label="批量分类目标"
                  value={batchFolderId}
                  onChange={(event) => setBatchFolderId(event.target.value)}
                >
                  <option value="">选择分类</option>
                  {snapshot.folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!batchFolderId || !selectedVideoIds.size || isMutatingFolder || isPreviewMode}
                  onClick={() => void handleBatchClassify('add')}
                >
                  加入分类
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!batchFolderId || !selectedVideoIds.size || isMutatingFolder || isPreviewMode}
                  onClick={() => void handleBatchClassify('remove')}
                >
                  移出分类
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={selectedVideoIds.size < 2 || isPreviewMode}
                  onClick={() => setShowSeries(true)}
                >
                  <Layers size={14} />
                  组成系列
                </Button>
                <Button
                  className="batch-remove"
                  variant="ghost"
                  size="sm"
                  disabled={!selectedVideoIds.size || isDeleting || isPreviewMode}
                  onClick={() => void handleDeleteSelected()}
                >
                  <Trash2 size={14} />
                  移除记录
                </Button>
                <button
                  className="icon-button"
                  aria-label="取消选择"
                  title="取消选择 (Esc)"
                  onClick={() => {
                    setSelectionMode(false)
                    setSelectedVideoIds(new Set())
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {isScanning && (
              <div className="scan-feedback" role="status">
                <LoaderCircle size={17} className="animate-spin" />
                <div>
                  <strong>{scanProgress?.message || '正在扫描目录…'}</strong>
                  <p>
                    {scanProgress?.total
                      ? `${scanProgress.current || 0} / ${scanProgress.total}`
                      : `已找到 ${scannedFiles.length} 个文件`}
                    {scannedFiles.length > 0
                      ? `　${scannedFiles[scannedFiles.length - 1].split(/[\\/]/).pop()}`
                      : ''}
                  </p>
                </div>
              </div>
            )}
            {showAiNotification && aiPreview && (
              <div className="ai-result">
                <Sparkles size={17} />
                <span>AI 分类完成，生成 {aiPreview.folders.length} 个分类</span>
                <Button
                  size="sm"
                  onClick={() => {
                    setShowAiNotification(false)
                    setShowAiClassify(true)
                  }}
                >
                  查看分类方案
                </Button>
                <button
                  className="icon-button"
                  aria-label="关闭分类提示"
                  onClick={() => setShowAiNotification(false)}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <div
              className={`video-collection ${view === 'list' ? 'list-view' : ''}`}
              aria-label="视频列表"
              aria-busy={keyword !== deferredKeyword}
            >
              {paginatedEntries.map((entry, index) => {
                if (entry.kind === 'series')
                  return (
                    <SeriesCard
                      key={`series-${entry.group.id}`}
                      group={entry.group}
                      members={entry.members}
                      onOpen={() => setActiveSeriesId(entry.group.id)}
                      view={view}
                      previewMode={isPreviewMode}
                    />
                  )
                const video = entry.video
                return (
                  <VideoCard
                    key={video.id}
                    video={video}
                    index={index}
                    isSelected={selectedVideoIds.has(video.id)}
                    onSelect={() => handleToggleSelect(video.id)}
                    onOpen={() => handleOpenVideo(video)}
                    folders={snapshot.folders}
                    onToggleFolder={(folderId) => void handleToggleFolder(video.id, folderId)}
                    isMutatingFolder={isMutatingFolder}
                    pendingVideoId={pendingVideoId}
                    isPreviewMode={isPreviewMode}
                    onScrape={handleScrapeVideo}
                    canScrape={!isPreviewMode && tmdbApiKey.length > 0}
                    selectionMode={selectionMode}
                    view={view}
                    previewEnabled={previewEnabled}
                  />
                )
              })}
            </div>
            {filteredVideos.length === 0 && (
              <div className="empty-library">
                <span className="empty-library-icon">
                  {snapshot.videos.length ? <Search size={30} /> : <Clapperboard size={32} />}
                </span>
                <h2>{snapshot.videos.length === 0 ? '你的影像库，从这里开始' : '没有找到匹配的视频'}</h2>
                <p>
                  {snapshot.videos.length === 0
                    ? '导入一个视频目录，让零散的影像有序归档。'
                    : keyword || activeFilterCount
                      ? '试试减少筛选条件，或换个关键词。'
                      : '这个分类还没有视频。可以从全部视频中批量加入。'}
                </p>
                {snapshot.videos.length === 0 ? (
                  <Button disabled={isPreviewMode || isScanning} onClick={() => setShowImport(true)}>
                    <Plus size={16} />
                    导入视频目录
                  </Button>
                ) : keyword || activeFilterCount ? (
                  <Button variant="secondary" onClick={resetSearch}>
                    清除搜索和筛选
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setActiveFolderId('all')}>
                    浏览全部视频
                  </Button>
                )}
              </div>
            )}
            {filteredVideos.length > 0 && (
              <footer className="library-pagination">
                <span>
                  显示 {(currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, displayEntries.length)}，共{' '}
                  {displayEntries.length.toLocaleString()} 项
                  {displayEntries.length !== filteredVideos.length
                    ? `（${filteredVideos.length} 个视频）`
                    : ''}
                </span>
                <div>
                  <select
                    aria-label="每页数量"
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                  >
                    {[12, 24, 48].map((value) => (
                      <option key={value} value={value}>
                        {value} / 页
                      </option>
                    ))}
                  </select>
                  <button
                    className="pagination-button"
                    disabled={currentPage <= 1}
                    aria-label="上一页"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    <ChevronDown size={16} className="rotate-90" />
                  </button>
                  <label className="page-jump">
                    <input
                      key={`${currentPage}-${pageSize}`}
                      type="number"
                      min={1}
                      max={Math.max(1, totalPages)}
                      defaultValue={currentPage}
                      aria-label="跳转页码"
                      title="输入页码，按 Enter 或移开焦点跳转"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          event.currentTarget.blur()
                        }
                      }}
                      onBlur={(event) => {
                        const page = Math.min(
                          Math.max(1, totalPages),
                          Math.max(1, Math.trunc(Number(event.currentTarget.value)) || 1)
                        )
                        event.currentTarget.value = String(page)
                        setCurrentPage(page)
                      }}
                    />
                    <span>/ {Math.max(1, totalPages)}</span>
                  </label>
                  <button
                    className="pagination-button"
                    disabled={currentPage >= totalPages}
                    aria-label="下一页"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  >
                    <ChevronDown size={16} className="-rotate-90" />
                  </button>
                </div>
              </footer>
            )}
            {isScraping && (
              <div className="scan-feedback" role="status">
                <LoaderCircle size={17} className="animate-spin" />
                正在匹配影视信息…
              </div>
            )}
          </main>
          <footer className="workspace-status">
            <span aria-live="polite" aria-atomic="true" title={statusText}>
              <span className="connection-dot" />
              {statusText}
            </span>
            <span title={`上次扫描：${formatTimeLabel(snapshot.lastScannedAt)}`}>
              {isPreviewMode ? '浏览器预览' : '本地存储'}
              <span className="status-shortcut">Ctrl K 搜索</span>
            </span>
          </footer>
        </div>
      </div>

      {showSeries && seriesState.databasePath === snapshot.databaseMeta.databasePath && (
        <SeriesPanel
          videos={snapshot.videos}
          state={seriesState}
          selectedIds={[...selectedVideoIds]}
          onState={(value) => {
            setSeriesState(value)
            setCollapseSeries(true)
            setSelectedVideoIds(new Set())
            setSelectionMode(false)
          }}
          onOpenGroup={(id) => {
            setActiveFolderId('all')
            setActiveSeriesId(id)
            setShowSeries(false)
          }}
          onClose={() => setShowSeries(false)}
        />
      )}
      {removeIds && (
        <Dialog
          title="移除视频记录"
          description={`将从视频库移除选中的 ${removeIds.length} 条记录和分类关联。原视频文件会保留。`}
          busy={isDeleting}
          onClose={() => setRemoveIds(null)}
        >
          <p className="field-help">这会移除库中的影视信息；需要时可以重新扫描导入。</p>
          {removeError && (
            <p className="field-error" role="alert">
              {removeError}
            </p>
          )}
          <div className="dialog-actions">
            <Button variant="ghost" disabled={isDeleting} onClick={() => setRemoveIds(null)}>
              取消
            </Button>
            <Button
              className="danger-button"
              disabled={isDeleting}
              onClick={() => void confirmRemoveSelected()}
            >
              {isDeleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
              确认移除记录
            </Button>
          </div>
        </Dialog>
      )}
      {showCreateFolder && (
        <Dialog
          title="新建分类"
          description="创建虚拟分类，同一视频可以加入多个分类。"
          onClose={() => setShowCreateFolder(false)}
          busy={isCreatingFolder}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleCreateFolder()
            }}
          >
            <label className="dialog-field">
              分类名称
              <Input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="例如：旅行记录、学习课程"
                aria-label="分类名称"
                maxLength={100}
              />
            </label>
            {newFolderError && (
              <p className="field-error" role="alert">
                {newFolderError}
              </p>
            )}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={isCreatingFolder}
                onClick={() => setShowCreateFolder(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={!newFolderName.trim() || isCreatingFolder}>
                {isCreatingFolder && <LoaderCircle size={15} className="animate-spin" />}创建分类
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {showImport && (
        <Dialog
          title="导入本地视频"
          description="选择目录后自动扫描并加入视频库，已导入的文件会自动跳过。"
          wide
          onClose={() => setShowImport(false)}
        >
          <div className="import-explainer">
            <FolderOpen size={28} />
            <div>
              <strong>选择一个视频目录</strong>
              <p>支持子目录扫描，保留文件原来的位置。</p>
            </div>
          </div>
          <details className="import-options">
            <summary>
              导入条件<span>可选</span>
            </summary>
            <div className="import-size-fields">
              <label>
                最小文件大小（MB）
                <input
                  type="number"
                  min="0"
                  aria-label="导入最小大小MB"
                  value={filterMinSize}
                  onChange={(event) => setFilterMinSize(Number(event.target.value))}
                />
              </label>
              <label>
                最大文件大小（MB）
                <input
                  type="number"
                  min="0"
                  aria-label="导入最大大小MB"
                  value={filterMaxSize}
                  onChange={(event) => setFilterMaxSize(Number(event.target.value))}
                />
              </label>
            </div>
            <p className="field-help">0 表示不限制。这些条件只影响导入，不会改变视频库里的记录。</p>
            <fieldset>
              <legend>文件格式</legend>
              <div className="format-options">
                {[
                  '.mp4',
                  '.mkv',
                  '.avi',
                  '.mov',
                  '.wmv',
                  '.webm',
                  '.m4v',
                  '.flv',
                  '.ts',
                  '.mts',
                  '.m2ts',
                  '.mpeg',
                  '.mpg',
                ].map((format) => (
                  <label key={format}>
                    <input
                      type="checkbox"
                      checked={filterFormats.includes(format)}
                      onChange={() =>
                        setFilterFormats((previous) =>
                          previous.includes(format)
                            ? previous.filter((item) => item !== format)
                            : [...previous, format]
                        )
                      }
                    />
                    {format.slice(1).toUpperCase()}
                  </label>
                ))}
              </div>
            </fieldset>
          </details>
          {((filterMaxSize > 0 && filterMaxSize < filterMinSize) || filterFormats.length === 0) && (
            <p className="field-error" role="alert">
              {filterFormats.length === 0 ? '请至少选择一种视频格式。' : '最大大小不能小于最小大小。'}
            </p>
          )}
          <div className="dialog-actions">
            <Button variant="ghost" onClick={() => setShowImport(false)}>
              取消
            </Button>
            <Button
              disabled={
                filterFormats.length === 0 ||
                (filterMaxSize > 0 && filterMaxSize < filterMinSize) ||
                filterMinSize < 0 ||
                filterMaxSize < 0
              }
              onClick={() => {
                setShowImport(false)
                void handleScanDirectory()
              }}
            >
              <FolderOpen size={16} />
              选择目录并扫描
            </Button>
          </div>
        </Dialog>
      )}
      {showSettings && (
        <Dialog
          title="设置与偏好"
          description="管理播放方式、影视信息和本地资源库。"
          onClose={() => setShowSettings(false)}
          wide
        >
          <div className="local-cache-note">
            <strong>本地封面与预览缓存</strong>
            <p>
              {mediaStats
                ? `${mediaStats.thumbnails} 张封面、${mediaStats.previews} 段预览，占用 ${formatBytes(mediaStats.bytes)} / ${formatBytes(mediaStats.limitBytes)}`
                : '保存在本机，重启后继续复用。'}
            </p>
            <p>首次浏览会读取原片生成缓存，后续直接加载小文件。封面使用本地视频画面。</p>
          </div>
          <div className="settings-group">
            <h3>播放与预览</h3>
            <div className="settings-row">
              <div>
                <strong>默认播放器</strong>
                <p>点击视频时使用的播放方式</p>
              </div>
              <PlayerSelector current={defaultPlayer} onSelect={handlePlayerConfigChange} />
            </div>
            <div className="settings-row">
              <div>
                <strong>悬停预览</strong>
                <p>每段随机播放 3–5 秒，自动切换到其他位置</p>
              </div>
              <button
                className={`preference-switch ${previewEnabled ? 'enabled' : ''}`}
                role="switch"
                aria-checked={previewEnabled}
                aria-label="悬停预览"
                onClick={() => setPreviewEnabled((value) => !value)}
              >
                <span />
              </button>
            </div>
            <button
              className="settings-link"
              disabled={isPreviewMode}
              onClick={() =>
                openSetting(() => {
                  setShowMpvConfig(true)
                  void loadMpvConfig()
                })
              }
            >
              <Play size={17} />
              <span>MPV 画质与增强设置</span>
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="settings-group">
            <h3>信息与智能整理</h3>
            <button
              className="settings-link"
              disabled={isPreviewMode}
              onClick={() => openSetting(() => setShowTmdbConfig(true))}
            >
              <FilmIcon size={17} />
              <span>TMDB 影视信息配置</span>
              <ChevronRight size={15} />
            </button>
            <button
              className="settings-link"
              disabled={isPreviewMode}
              onClick={() =>
                openSetting(() => {
                  setShowAiClassify(true)
                })
              }
            >
              <Sparkles size={17} />
              <span>AI 分类与模型配置</span>
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="settings-group">
            <h3>资源库与应用</h3>
            <button
              className="settings-link"
              disabled={isPreviewMode}
              onClick={() =>
                openSetting(() => {
                  void handleScanDatabases()
                  setShowDbSelector(true)
                })
              }
            >
              <Database size={17} />
              <span>
                选择数据库<small>{currentDbPath?.split(/[\\/]/).pop() || '本地 SQLite 数据库'}</small>
              </span>
              <ChevronRight size={15} />
            </button>
            <button
              className="settings-link"
              disabled={isPreviewMode}
              onClick={() => openSetting(() => void handleCheckUpdate())}
            >
              <Download size={17} />
              <span>检查更新</span>
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="shortcut-guide">
            <span>
              <kbd>Ctrl K</kbd>搜索视频
            </span>
            <span>
              <kbd>Esc</kbd>退出选择 / 关闭弹窗
            </span>
            <span>
              <kbd>Ctrl A</kbd>批量模式全选
            </span>
          </div>
        </Dialog>
      )}

      {/* TMDB 配置弹窗 */}
      {showTmdbConfig && (
        <div
          ref={legacyModalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="TMDB 配置"
          className="fixed inset-0 z-[100] flex items-center justify-center"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowTmdbConfig(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
            <button
              aria-label="关闭 TMDB 配置"
              onClick={() => setShowTmdbConfig(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
            >
              <X className="size-4" />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
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
                  type="password"
                  aria-label="TMDB API Key"
                  value={tmdbApiKey}
                  onChange={(e) => setTmdbApiKey(e.target.value)}
                  placeholder="输入你的 TMDB API Key"
                  className="w-full rounded-xl border-white/10 bg-white/5 text-sm"
                />
                <div className="mt-2 text-xs text-zinc-600">
                  前往{' '}
                  <span
                    className="text-zinc-400 underline cursor-pointer"
                    onClick={() => window.open('https://www.themoviedb.org/settings/api', '_blank')}
                  >
                    TMDB 设置页面
                  </span>{' '}
                  获取 API Key
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

      {/* 检查更新弹窗 */}
      {showUpdateDialog && (
        <div
          ref={legacyModalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="检查更新"
          className="fixed inset-0 z-[100] flex items-center justify-center"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowUpdateDialog(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
            <button
              onClick={() => setShowUpdateDialog(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
            >
              <X className="size-4" />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                <Download className="size-5" />
              </div>
              <div>
                <div className="text-lg font-medium text-white">检查更新</div>
                <div className="text-sm text-zinc-500">当前版本 v{updateVersion || '...'}</div>
              </div>
            </div>

            {updateStatus === 'checking' && (
              <div className="flex items-center gap-3 text-sm text-zinc-300 py-4">
                <LoaderCircle className="size-4 animate-spin text-blue-400" />
                正在检查更新...
              </div>
            )}

            {updateStatus === 'not-available' && (
              <div className="py-4 text-center text-sm text-zinc-400">当前已是最新版本，无需更新</div>
            )}

            {updateStatus === 'available' && (
              <div className="space-y-4 py-2">
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-white">
                  发现新版本 <span className="font-semibold text-blue-400">v{updateVersion}</span>
                </div>
                <Button
                  onClick={() => void handleDownloadUpdate()}
                  className="h-11 w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white"
                >
                  <Download className="mr-2 size-4" />
                  下载更新
                </Button>
              </div>
            )}

            {updateStatus === 'downloading' && (
              <div className="space-y-3 py-2">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <LoaderCircle className="size-4 animate-spin text-blue-400" />
                  正在下载... {updateProgress}%
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${updateProgress}%` }}
                  />
                </div>
              </div>
            )}

            {updateStatus === 'downloaded' && (
              <div className="space-y-4 py-2">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-white">
                  更新已下载完成，重启应用以安装{' '}
                  <span className="font-semibold text-emerald-400">v{updateVersion}</span>
                </div>
                <Button
                  onClick={() => void handleInstallUpdate()}
                  className="h-11 w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  重启并安装
                </Button>
              </div>
            )}

            {updateStatus === 'error' && <div className="py-4 text-sm text-red-400">{updateError}</div>}

            {updateStatus === 'idle' && (
              <Button
                onClick={() => void handleCheckUpdate()}
                className="h-11 w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white"
              >
                检查更新
              </Button>
            )}
          </div>
        </div>
      )}

      {/* MPV 播放器设置弹窗 */}
      {showMpvConfig && (
        <div
          ref={legacyModalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="MPV 播放器设置"
          className="fixed inset-0 z-[100] flex items-center justify-center"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowMpvConfig(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
            <button
              aria-label="关闭 MPV 设置"
              onClick={() => setShowMpvConfig(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
            >
              <X className="size-4" />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-orange-500/20 text-orange-400">
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <div className="text-lg font-medium text-white">播放器设置</div>
                <div className="text-sm text-zinc-500">mpv 超分辨率与补帧设置</div>
              </div>
            </div>

            <div className="space-y-6">
              {/* mpv 路径 */}
              <div>
                <label className="mb-2 block text-sm text-zinc-400">mpv 路径</label>
                <div className="flex gap-2">
                  <Input
                    value={mpvConfigState.mpvPath}
                    onChange={(e) => setMpvConfigState({ ...mpvConfigState, mpvPath: e.target.value })}
                    placeholder="mpv.exe 所在目录路径"
                    className="flex-1 rounded-xl border-white/10 bg-white/5 text-sm"
                  />
                  <Button
                    onClick={async () => {
                      if (!window.videosorter?.mpvCheckAvailable) return
                      const { available, path } = await window.videosorter.mpvCheckAvailable()
                      if (available) {
                        await handleSaveMpvConfig({ mpvPath: path })
                      }
                    }}
                    variant="secondary"
                    className="rounded-xl border-white/10 text-xs text-zinc-300 hover:bg-white/10"
                  >
                    检查
                  </Button>
                </div>
                <div className="mt-2 text-xs text-zinc-600">
                  默认路径: <code className="text-zinc-400">项目根目录/mpv/</code>，内含 mpv.exe 和 shaders/
                </div>
              </div>

              {/* Anime4K */}
              <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <div>
                  <div className="text-sm text-white">Anime4K 超分辨率</div>
                  <div className="text-xs text-zinc-500 mt-0.5">锐化动漫线条，提升画质</div>
                </div>
                <button
                  onClick={() => handleSaveMpvConfig({ anime4k: !mpvConfigState.anime4k })}
                  className={`relative inline-flex h-6 w-11 rounded-full transition ${
                    mpvConfigState.anime4k ? 'bg-orange-500' : 'bg-zinc-600'
                  }`}
                >
                  <span
                    className={`inline-block size-4 translate-y-1 rounded-full bg-white transition ${
                      mpvConfigState.anime4k ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* 补帧 */}
              <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <div>
                  <div className="text-sm text-white">补帧 (插帧)</div>
                  <div className="text-xs text-zinc-500 mt-0.5">使视频更流畅，动漫 24→60fps 效果显著</div>
                </div>
                <button
                  onClick={() => handleSaveMpvConfig({ interpolation: !mpvConfigState.interpolation })}
                  className={`relative inline-flex h-6 w-11 rounded-full transition ${
                    mpvConfigState.interpolation ? 'bg-orange-500' : 'bg-zinc-600'
                  }`}
                >
                  <span
                    className={`inline-block size-4 translate-y-1 rounded-full bg-white transition ${
                      mpvConfigState.interpolation ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Shader 选择 */}
              <div>
                <label className="mb-2 block text-sm text-zinc-400">超分 Shader</label>
                <div className="flex gap-2">
                  {(
                    [
                      { value: 'anime4k', label: 'Anime4K' },
                      { value: 'fsrcnnx', label: 'FSRCNNX' },
                      { value: 'none', label: '无' },
                    ] as const
                  ).map((shader) => (
                    <button
                      key={shader.value}
                      onClick={() => handleSaveMpvConfig({ superResShader: shader.value })}
                      className={`flex-1 rounded-xl px-3 py-2 text-sm transition ${
                        mpvConfigState.superResShader === shader.value
                          ? 'bg-orange-500 text-white'
                          : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                      }`}
                    >
                      {shader.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 提示 */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
                修改设置后需重新打开视频才能生效。超分和补帧对显卡配置有一定要求。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI 智能分类弹窗 */}
      {showAiClassify && !showAiNotification && (
        <div
          ref={legacyModalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="AI 智能分类"
          className="fixed inset-0 z-[100] flex items-center justify-center"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowAiClassify(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl max-h-[85vh] flex flex-col">
            <button
              aria-label="关闭 AI 智能分类"
              onClick={() => setShowAiClassify(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
            >
              <X className="size-4" />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400">
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
                    type="password"
                    aria-label="AI API Key"
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
                {snapshot.folders.length > 0 && (
                  <span className="ml-2">· 已有 {snapshot.folders.length} 个文件夹</span>
                )}
              </div>

              {/* 进度条 */}
              {aiClassifying && aiTotalBatches > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">{aiProgressMessage}</span>
                    <span className="text-zinc-500">
                      {aiCurrentBatch}/{aiTotalBatches}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all duration-300"
                      style={{ width: `${(aiCurrentBatch / aiTotalBatches) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 流式输出区域 — 可折叠 */}
              {(aiClassifying || aiReasoning || aiRawContent) && (
                <div className="rounded-lg border border-white/8 bg-black/20 overflow-hidden">
                  <button
                    onClick={() => setShowAiStreamDetail(!showAiStreamDetail)}
                    className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition"
                  >
                    {showAiStreamDetail ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronUp className="size-3" />
                    )}
                    AI 推理详情
                    {aiClassifying && <LoaderCircle className="size-3 animate-spin text-violet-400 ml-1" />}
                  </button>
                  {showAiStreamDetail && (
                    <div className="px-3 pb-3 max-h-60 overflow-auto border-t border-white/5">
                      {aiReasoning && (
                        <div className="pt-3 mb-2">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-xs font-medium text-violet-400">推理过程</span>
                          </div>
                          <div className="text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                            {aiReasoning}
                          </div>
                        </div>
                      )}
                      {aiRawContent && (
                        <div className={aiReasoning ? 'border-t border-white/5 pt-2' : 'pt-3'}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-xs font-medium text-emerald-400">原始输出</span>
                          </div>
                          <div className="font-mono text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                            {aiRawContent}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 消息提示 */}
              {aiMessage && (
                <div
                  className={`text-xs p-3 rounded-lg ${
                    aiMessage.includes('成功') || aiMessage.includes('完成') || aiMessage.includes('已应用')
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : aiMessage.includes('遗漏')
                        ? 'bg-amber-500/10 text-amber-400'
                        : aiMessage.includes('取消')
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-red-500/10 text-red-400'
                  }`}
                >
                  {aiMessage}
                  {aiDuration > 0 && aiMessage.includes('完成') && (
                    <span className="ml-2 text-zinc-500">
                      耗时 {aiDuration >= 1000 ? `${(aiDuration / 1000).toFixed(1)}s` : `${aiDuration}ms`}
                    </span>
                  )}
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
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">
                        共 {aiPreview.folders.reduce((s, f) => s + f.videoIds.length, 0)} 部
                      </span>
                      <button
                        onClick={() => {
                          if (aiExpandedFolders.size === aiPreview!.folders.length) {
                            setAiExpandedFolders(new Set())
                          } else {
                            setAiExpandedFolders(new Set(aiPreview!.folders.map((_, i) => i)))
                          }
                        }}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition"
                      >
                        {aiExpandedFolders.size === aiPreview.folders.length ? '全部折叠' : '全部展开'}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-auto">
                    {aiPreview.folders.map((folder, idx) => {
                      const isExpanded = aiExpandedFolders.has(idx)
                      const isEditing = aiEditingFolderName === idx
                      return (
                        <div
                          key={idx}
                          className={`rounded-lg border overflow-hidden ${
                            folder.existing
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : 'border-white/8 bg-white/[0.03]'
                          }`}
                        >
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
                              {isExpanded ? (
                                <ChevronDown className="size-3.5 text-zinc-400 shrink-0" />
                              ) : (
                                <ChevronUp className="size-3.5 text-zinc-400 shrink-0" />
                              )}
                              {isEditing ? (
                                <input
                                  autoFocus
                                  value={folder.name}
                                  onChange={(e) => {
                                    const newName = e.target.value
                                    setAiPreview((prev) => {
                                      if (!prev) return prev
                                      const newFolders = [...prev.folders]
                                      newFolders[idx] = { ...newFolders[idx], name: newName, existing: false }
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
                              {folder.existing && !isEditing && (
                                <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400">
                                  合并
                                </span>
                              )}
                              {!folder.existing && !isEditing && (
                                <span className="shrink-0 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-400">
                                  新建
                                </span>
                              )}
                            </button>
                            <span className="text-xs text-zinc-500 shrink-0">
                              {folder.videoIds.length} 部
                            </span>
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
                  </div>
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="mt-4 flex gap-3 pt-3 border-t border-white/8">
              {aiClassifying ? (
                <div className="flex gap-3 w-full">
                  <Button
                    onClick={() => void handleAiCancel()}
                    className="flex-1 h-11 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  >
                    <X className="mr-2 size-4" />
                    取消分类
                  </Button>
                </div>
              ) : aiPreview ? (
                <Button
                  onClick={() => void handleAiApply()}
                  disabled={aiApplying}
                  className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {aiApplying ? (
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 size-4" />
                  )}
                  确认并应用
                </Button>
              ) : (
                <Button
                  onClick={() => void handleAiClassify()}
                  disabled={aiClassifying || !aiRule || !aiConfig.apiKey}
                  className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-500 text-white"
                >
                  {aiClassifying ? (
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-4" />
                  )}
                  预览分类
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 文件夹右键菜单 */}
      {contextMenuFolder && (
        <div
          role="menu"
          className="fixed z-50 min-w-32 rounded-lg border border-white/10 bg-zinc-800 shadow-xl"
          style={{ left: contextMenuFolder.x, top: contextMenuFolder.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            onClick={() => {
              setRenamingFolder({
                id: Number(contextMenuFolder.id.replace('folder-', '')),
                name: contextMenuFolder.name,
              })
              setContextMenuFolder(null)
            }}
          >
            重命名分类
          </button>
          <button
            onClick={() => void handleDeleteFolder(contextMenuFolder.id)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/10"
          >
            <Trash2 className="size-4" />
            删除文件夹
          </button>
        </div>
      )}

      {/* 手动刮削弹窗 */}
      {showManualScrape && (
        <div
          ref={legacyModalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="匹配影视信息"
          className="fixed inset-0 z-[100] flex items-center justify-center"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowManualScrape(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl max-h-[80vh] overflow-auto">
            <button
              aria-label="关闭影视信息匹配"
              onClick={() => setShowManualScrape(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
            >
              <X className="size-4" />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400">
                <Search className="size-5" />
              </div>
              <div>
                <div className="text-lg font-medium text-white">手动刮削</div>
                <div className="text-sm text-zinc-500">自动搜索未找到，手动输入关键词搜索</div>
              </div>
            </div>

            {/* 搜索输入 */}
            <div className="flex gap-2 mb-4">
              <Input
                value={manualScrapeQuery}
                onChange={(e) => setManualScrapeQuery(e.target.value)}
                placeholder="输入电影或电视剧名称..."
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && void handleManualScrapeSearch()}
              />
              <Button
                onClick={() => void handleManualScrapeSearch()}
                disabled={manualScrapeSearching || !manualScrapeQuery.trim()}
                className="rounded-lg"
              >
                {manualScrapeSearching ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
              </Button>
            </div>

            {/* 搜索结果列表 */}
            {manualScrapeResults.length > 0 && (
              <div className="space-y-2 max-h-96 overflow-auto">
                {manualScrapeResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => void handleManualScrapeSelect(result)}
                    disabled={manualScrapeLoading}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 text-left transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    <div className="flex gap-3">
                      {result.poster_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w92${result.poster_path}`}
                          alt=""
                          className="h-20 w-14 rounded object-cover"
                        />
                      ) : (
                        <div className="h-20 w-14 rounded bg-zinc-700 flex items-center justify-center">
                          <FilmIcon className="size-6 text-zinc-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {result.title || result.name}
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          {result.release_date || result.first_air_date?.slice(0, 4) || '未知年份'}
                          {result.vote_average > 0 && ` · ${result.vote_average.toFixed(1)}分`}
                          {result.media_type && ` · ${result.media_type === 'movie' ? '电影' : '电视剧'}`}
                        </div>
                        {result.overview && (
                          <div className="text-xs text-zinc-500 mt-1 line-clamp-2">{result.overview}</div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {manualScrapeSearching && (
              <div className="flex items-center justify-center py-8 text-zinc-400">
                <LoaderCircle className="mr-2 size-5 animate-spin" />
                搜索中...
              </div>
            )}

            {!manualScrapeSearching && manualScrapeResults.length === 0 && manualScrapeQuery.trim() && (
              <div className="py-8 text-center text-zinc-500 text-sm">输入关键词后点击搜索按钮查找影视</div>
            )}
          </div>
        </div>
      )}

      {/* 数据库选择弹窗 */}
      {showDbSelector && (
        <div
          ref={legacyModalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="选择数据库"
          className="fixed inset-0 z-[100] flex items-center justify-center"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !isSwitchingDb && setShowDbSelector(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl max-h-[80vh] overflow-auto">
            <button
              onClick={() => !isSwitchingDb && setShowDbSelector(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
            >
              <X className="size-4" />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
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
              <div className="py-8 text-center text-zinc-500">未找到数据库文件</div>
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

      {toolsTab && (
        <LibraryTools
          videos={snapshot.videos}
          initialTab={toolsTab}
          onClose={() => setToolsTab(null)}
          onSnapshot={setSnapshot}
          onStatus={setStatusText}
        />
      )}
      {renamingFolder && (
        <Dialog
          title="重命名分类"
          onClose={() => {
            setRenamingFolder(null)
            setFolderError('')
          }}
          busy={folderBusy}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!renamingFolder.name.trim() || folderBusy || !window.videosorter) return
              setFolderBusy(true)
              setFolderError('')
              void window.videosorter
                .renameVirtualFolder(renamingFolder.id, renamingFolder.name.trim())
                .then((next) => {
                  setSnapshot(next)
                  setRenamingFolder(null)
                  setStatusText('分类已重命名。')
                })
                .catch((error) => setFolderError(String(error)))
                .finally(() => setFolderBusy(false))
            }}
          >
            <label className="dialog-field">
              分类名称
              <Input
                aria-label="新分类名称"
                maxLength={100}
                value={renamingFolder.name}
                onChange={(event) => setRenamingFolder({ ...renamingFolder, name: event.target.value })}
              />
            </label>
            {folderError && (
              <p className="field-error" role="alert">
                {folderError}
              </p>
            )}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={folderBusy}
                onClick={() => {
                  setRenamingFolder(null)
                  setFolderError('')
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={folderBusy || !renamingFolder.name.trim()}>
                {folderBusy && <LoaderCircle size={15} className="animate-spin" />}保存
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {/* 内置播放器 */}
      {playingVideo && defaultPlayer === 'web' && (
        <VideoPlayer
          filePath={playingVideo.path}
          videoName={playingVideo.name}
          onClose={() => setPlayingVideo(null)}
          onNext={() => {
            if (playingVideo.index < playbackQueue.length - 1) {
              const next = playbackQueue[playingVideo.index + 1]
              setPlayingVideo({
                path: next.absolutePath,
                name: next.title || next.name,
                index: playingVideo.index + 1,
              })
            }
          }}
          onPrevious={() => {
            if (playingVideo.index > 0) {
              const prev = playbackQueue[playingVideo.index - 1]
              setPlayingVideo({
                path: prev.absolutePath,
                name: prev.title || prev.name,
                index: playingVideo.index - 1,
              })
            }
          }}
          playlist={playbackQueue.map((v) => ({ path: v.absolutePath, name: v.title || v.name }))}
          currentIndex={playingVideo.index}
          onSelectVideo={(index) => {
            const video = playbackQueue[index]
            setPlayingVideo({ path: video.absolutePath, name: video.title || video.name, index })
          }}
        />
      )}

      {/* mpv 播放器 */}
      {playingVideo && defaultPlayer === 'mpv' && (
        <MpvPlayer
          filePath={playingVideo.path}
          videoName={playingVideo.name}
          onClose={() => setPlayingVideo(null)}
          onNext={() => {
            if (playingVideo.index < playbackQueue.length - 1) {
              const next = playbackQueue[playingVideo.index + 1]
              setPlayingVideo({
                path: next.absolutePath,
                name: next.title || next.name,
                index: playingVideo.index + 1,
              })
            }
          }}
          onPrevious={() => {
            if (playingVideo.index > 0) {
              const prev = playbackQueue[playingVideo.index - 1]
              setPlayingVideo({
                path: prev.absolutePath,
                name: prev.title || prev.name,
                index: playingVideo.index - 1,
              })
            }
          }}
          playlist={playbackQueue.map((v) => ({ path: v.absolutePath, name: v.title || v.name }))}
          currentIndex={playingVideo.index}
          onSelectVideo={(index) => {
            const video = playbackQueue[index]
            setPlayingVideo({ path: video.absolutePath, name: video.title || video.name, index })
          }}
        />
      )}

      {/* MPV 下载通知 */}
      {mpvDownload && (
        <div
          className={`fixed bottom-4 right-4 z-[100] rounded-xl px-4 py-3 shadow-2xl backdrop-blur-sm border text-sm transition-all ${
            mpvDownload.stage === 'error'
              ? 'bg-red-900/90 border-red-700 text-red-200'
              : mpvDownload.stage === 'complete'
                ? 'bg-emerald-900/90 border-emerald-700 text-emerald-200'
                : 'bg-zinc-900/95 border-white/10 text-zinc-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {mpvDownload.stage !== 'error' && mpvDownload.stage !== 'complete' && (
              <svg className="size-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {mpvDownload.stage === 'complete' && <span className="text-base shrink-0">✅</span>}
            {mpvDownload.stage === 'error' && <span className="text-base shrink-0">❌</span>}
            <div>
              <p className="text-xs font-medium">{mpvDownload.message}</p>
              {mpvDownload.stage === 'downloading_mpv' && mpvDownload.percent > 0 && (
                <div className="mt-1.5 w-48">
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-violet-400 rounded-full transition-all duration-300"
                      style={{ width: `${mpvDownload.percent}%` }}
                    />
                  </div>
                  <p className="text-right text-[10px] mt-0.5 text-zinc-400">{mpvDownload.percent}%</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setMpvDownload(null)}
              className="ml-3 text-xs opacity-50 hover:opacity-100 shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
