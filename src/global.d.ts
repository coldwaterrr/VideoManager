interface DatabaseMeta {
  databasePath: string
  tables: string[]
}

interface MediaAssets { thumbnail: string | null; preview: string | null; durationSeconds: number; cached: boolean; elapsedMs: number; previewSlot?: number; previewStartSeconds?: number; previewDurationSeconds?: number; error?: string }
interface SeriesGroup { id: string; name: string; videoIds: number[]; createdAt: string }
interface SeriesState { databasePath: string; groups: SeriesGroup[] }
interface SeriesSuggestion { id: string; name: string; videoIds: number[]; reason: string; confidence: 'high' | 'review' }
interface SeriesPreview { databasePath: string; fingerprint: string; groups: SeriesSuggestion[] }

interface VideoRecord {
  id: number
  name: string
  absolutePath: string
  fileSize: number
  durationSeconds: number
  modifiedAt: string
  addedAt: string
  folderIds: number[]
  tags?: string[]
  // TMDB metadata
  tmdbId?: number | null
  mediaType?: string | null
  title?: string | null
  originalTitle?: string | null
  overview?: string | null
  posterPath?: string | null
  backdropPath?: string | null
  releaseDate?: string | null
  voteAverage?: number
  voteCount?: number
  genreIds?: number[]
  castNames?: string[]
  scrapedAt?: string | null
}

interface VirtualFolderRecord {
  id: number
  name: string
  videoCount: number
}

interface LibrarySnapshot {
  databaseMeta: DatabaseMeta
  folders: VirtualFolderRecord[]
  videos: VideoRecord[]
  lastScanDirectory: string | null
  lastScannedAt: string | null
  scanSummary?: { added: number; updated: number; unchanged: number; skipped: number }
}

interface ScanFilterOptions {
  minSizeMB?: number
  maxSizeMB?: number
  formats?: string[]
  recursive?: boolean
  settleSeconds?: number
}

interface ScanProgress {
  type: 'scanning' | 'found' | 'processing' | 'complete'
  current?: number
  total?: number
  filePath?: string
  message: string
}

interface TMDBScrapeProgress {
  scraped: number
  total: number
  success: boolean
  message: string
}

interface AIConfig {
  apiKey: string
  baseUrl: string
  model: string
}

interface AIClassificationFolder {
  name: string
  videoIds: number[]
  existing?: boolean
}

interface AIClassificationResult {
  folders: AIClassificationFolder[]
}

interface AITestResult {
  ok: boolean
  message: string
}

type AIChunkType = 'reasoning' | 'content' | 'progress' | 'summary'

interface AIChunk {
  type?: AIChunkType
  reasoning?: string
  content?: string
  batch?: number
  totalBatches?: number
  message?: string
  folders?: AIClassificationFolder[]
}

interface AIApplyResult {
  success: boolean
  message: string
  snapshot?: LibrarySnapshot
}

interface DatabaseInfo {
  path: string
  size: number
}

interface MpvConfig {
  anime4k: boolean
  interpolation: boolean
  interpolationFps: number
  superResShader: 'anime4k' | 'fsrcnnx' | 'none'
  mpvPath: string
}

interface MpvDownloadProgress {
  stage: 'checking' | 'downloading_7za' | 'downloading_mpv' | 'extracting' | 'installing' | 'complete' | 'error'
  percent: number
  message: string
}

  interface Window {
    videosorter?: {
      getDatabaseMeta: () => Promise<DatabaseMeta>
      getLibrarySnapshot: () => Promise<LibrarySnapshot>
      getMediaAssets: (videoId: number, preview?: boolean, slot?: number) => Promise<MediaAssets>
      warmMedia: (ids: number[], preview: boolean) => Promise<void>
      getMediaCacheStats: () => Promise<{ bytes: number; thumbnails: number; previews: number; limitBytes: number }>
      getSeries: () => Promise<SeriesState>
      previewSeries: (mode: 'smart' | 'directory' | 'name') => Promise<SeriesPreview>
      applySeries: (preview: SeriesPreview) => Promise<SeriesState>
      saveSeries: (databasePath: string, name: string, videoIds: number[], id?: string) => Promise<SeriesState>
      deleteSeries: (databasePath: string, id: string) => Promise<SeriesState>
      appGetVersion: () => Promise<{ version: string }>
      createVirtualFolder: (name: string) => Promise<LibrarySnapshot>
    deleteVirtualFolder: (folderId: number) => Promise<LibrarySnapshot>
      toggleVideoFolder: (videoId: number, folderId: number) => Promise<LibrarySnapshot>
      scanDirectory: (filterOptions?: ScanFilterOptions) => Promise<{ cancelled: boolean; snapshot: LibrarySnapshot }>
      onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
      inspectMissing: () => Promise<MissingInspection>
      cleanupMissing: (ids: number[], databasePath: string) => Promise<{ deletedCount: number; backupPath?: string; snapshot: LibrarySnapshot }>
      previewConditionalCleanup: (conditions: CleanupConditions) => Promise<ConditionalCleanupPreview>
      applyConditionalCleanup: (previewId: string, ids: number[]) => Promise<{ deletedCount: number; skipped: number; backupPath?: string; snapshot: LibrarySnapshot }>
      getAutomaticCleanup: () => Promise<{ config: AutoCleanupConfig; status: AutoCleanupStatus }>
      saveAutomaticCleanup: (config: AutoCleanupConfig) => Promise<{ config: AutoCleanupConfig; status: AutoCleanupStatus }>
      checkAutomaticCleanup: () => Promise<{ busy?: boolean; disabled?: boolean; cancelled?: boolean; deletedCount?: number; status?: AutoCleanupStatus; snapshot?: LibrarySnapshot }>
      rescanDirectory: (options?: ScanFilterOptions) => Promise<LibrarySnapshot>
      pickDirectory: () => Promise<string | null>
      getMonitors: () => Promise<MonitorDirectory[]>
      saveMonitors: (items: MonitorDirectory[]) => Promise<MonitorDirectory[]>
      checkMonitors: () => Promise<{ busy?: boolean; added?: number; updated?: number; errors?: string[] }>
      onMonitorUpdate: (callback: (event: { snapshot?: LibrarySnapshot; message?: string; error?: string; autoCleanupStatus?: AutoCleanupStatus }) => void) => () => void
      renameVirtualFolder: (id: number, name: string) => Promise<LibrarySnapshot>
      batchClassify: (ids: number[], folderId: number, mode: 'add' | 'remove') => Promise<LibrarySnapshot>
      getClassificationConfig: () => Promise<ClassificationConfig>
      saveClassificationConfig: (config: ClassificationConfig) => Promise<ClassificationConfig>
      previewClassificationRules: () => Promise<AIClassificationFolder[]>
      openVideo: (filePath: string) => Promise<{ success: boolean; error?: string }>
      getVideoThumbnail: (filePath: string) => Promise<{ thumbnail: string | null }>
      deleteVideos: (videoIds: number[]) => Promise<{ deletedCount: number; snapshot: LibrarySnapshot }>
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      // TMDB
      tmdbGetConfig: () => Promise<{ apiKey: string | null }>
      tmdbSetConfig: (apiKey: string) => Promise<{ success: boolean }>
      tmdbScrapeVideo: (videoId: number) => Promise<{ success: boolean; message: string }>
      tmdbScrapeAll: () => Promise<{ success: boolean; message: string; total: number; scraped: number }>
      tmdbManualSearch: (query: string) => Promise<any[]>
      tmdbManualScrape: (videoId: number, result: any) => Promise<{ success: boolean; message: string }>
      onTMDBScrapeProgress: (callback: (progress: TMDBScrapeProgress) => void) => () => void
      // Database selection
      dbScanForDatabases: () => Promise<DatabaseInfo[]>
      dbSelectDatabase: (databasePath: string) => Promise<LibrarySnapshot>
      dbGetCurrentPath: () => Promise<string | null>
      // AI Classification
      aiGetConfig: () => Promise<AIConfig>
      aiSaveConfig: (config: AIConfig) => Promise<{ success: boolean }>
      aiTestConnection: (config: AIConfig) => Promise<AITestResult>
      aiClassifyStream: (rule: string, config: AIConfig) => Promise<{ success: boolean; message: string; result?: AIClassificationResult }>
      onAiChunk: (callback: (chunk: AIChunk) => void) => () => void
      aiCancelClassify: () => Promise<{ success: boolean }>
      aiApply: (folders: AIClassificationFolder[]) => Promise<AIApplyResult>
      // MPV Player
      mpvLaunch: (filePath: string, config?: Partial<MpvConfig>) => Promise<{ success: boolean; error?: string; socket?: string }>
      mpvLoadFile: (filePath: string, mode?: string) => Promise<{ success: boolean; error?: string }>
      mpvCommand: (cmd: unknown[]) => Promise<{ success: boolean; data: unknown }>
      mpvTerminate: () => Promise<{ success: boolean }>
      mpvGetConfig: () => Promise<MpvConfig>
      mpvSaveConfig: (config: MpvConfig) => Promise<{ success: boolean }>
      mpvCheckAvailable: () => Promise<{ available: boolean; path: string; mpvPath: string }>
      mpvDownload: () => Promise<{ success: boolean; message: string }>
      mpvIsDownloading: () => Promise<{ downloading: boolean }>
      onMpvDownloadProgress: (callback: (progress: MpvDownloadProgress) => void) => () => void
      onMpvEnd: (callback: () => void) => () => void
      // Player selection
      playerGetConfig: () => Promise<{ defaultPlayer: string }>
      playerSaveConfig: (config: { defaultPlayer: string }) => Promise<{ success: boolean }>
      // Auto Update
      updateCheck: () => Promise<{ available?: boolean; message?: string; success?: boolean }>
      updateDownload: () => Promise<{ success: boolean; message?: string }>
      updateInstall: () => Promise<{ success: boolean }>
      onUpdateAvailable: (callback: (info: { version: string; releaseNotes: string }) => void) => () => void
      onUpdateNotAvailable: (callback: () => void) => () => void
      onUpdateError: (callback: (msg: string) => void) => () => void
      onUpdateProgress: (callback: (p: { percent: number }) => void) => () => void
      onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void
    }
    winControls?: {
      minimize: () => void
      close: () => void
      isMaximized: () => Promise<boolean>
      maximize: () => void
    }
  }
interface MissingInspection { missing: Array<{ id: number; name: string; absolutePath: string }>; skipped: number; databasePath: string }
interface MonitorDirectory extends ScanFilterOptions { id: string; directory: string; enabled: boolean; intervalSeconds: number }
interface ClassificationConfig { autoOnImport: boolean; rules: Array<{ name: string; keywords: string[]; target: 'name' | 'path' }> }
interface CleanupConditions { minSizeMB?: number; maxSizeMB?: number; keyword?: string; modifiedAfter?: string; modifiedBefore?: string; addedAfter?: string; addedBefore?: string }
interface ConditionalCleanupPreview { previewId: string; databasePath: string; conditions: CleanupConditions; videos: VideoRecord[]; totalSize: number }
interface AutoCleanupConfig { enabled: boolean; intervalMinutes: number; confirmationChecks: number }
interface AutoCleanupStatus { lastCheckedAt: string | null; lastDeletedCount: number; totalDeletedCount: number; pendingCount: number; skipped: number; backupPath?: string }
