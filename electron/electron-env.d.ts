/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string
    VITE_PUBLIC: string
  }
}

interface DatabaseMeta {
  databasePath: string
  tables: string[]
}

interface VirtualFolderRecord {
  id: number
  name: string
  videoCount: number
}

interface VideoRecord {
  id: number
  name: string
  absolutePath: string
  fileSize: number
  durationSeconds: number
  modifiedAt: string
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

interface LibrarySnapshot {
  databaseMeta: DatabaseMeta
  folders: VirtualFolderRecord[]
  videos: VideoRecord[]
  lastScanDirectory: string | null
  lastScannedAt: string | null
}

interface ScanDirectoryResult {
  cancelled: boolean
  snapshot: LibrarySnapshot
}

interface ScanProgress {
  type: 'scanning' | 'found' | 'processing' | 'complete'
  message: string
  current?: number
  total?: number
  filePath?: string
}

interface ScanFilterOptions {
  minSizeMB?: number
  maxSizeMB?: number
  formats?: string[]
}

interface MpvPlayerConfig {
  anime4k: boolean
  interpolation: boolean
  interpolationFps: number
  superResShader: 'anime4k' | 'fsrcnnx' | 'none'
  mpvPath: string
}

interface Window {
  videosorter?: {
    getDatabaseMeta: () => Promise<DatabaseMeta>
    getLibrarySnapshot: () => Promise<LibrarySnapshot>
    createVirtualFolder: (name: string) => Promise<LibrarySnapshot>
    deleteVirtualFolder: (folderId: number) => Promise<LibrarySnapshot>
    toggleVideoFolder: (videoId: number, folderId: number) => Promise<LibrarySnapshot>
    scanDirectory: (filterOptions?: ScanFilterOptions) => Promise<ScanDirectoryResult>
    onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
    cleanupUnsupported: () => Promise<{ deletedCount: number; snapshot: LibrarySnapshot }>
    openVideo: (filePath: string) => Promise<{ success: boolean }>
    getVideoThumbnail: (filePath: string) => Promise<{ thumbnail: string | null }>
    deleteVideos: (videoIds: number[]) => Promise<{ deletedCount: number; snapshot: LibrarySnapshot }>
    // TMDB
    tmdbGetConfig: () => Promise<{ apiKey: string | null }>
    tmdbSetConfig: (apiKey: string) => Promise<{ success: boolean }>
    tmdbScrapeVideo: (videoId: number) => Promise<{ success: boolean; message: string }>
    tmdbScrapeAll: () => Promise<{ success: boolean; message: string; total: number; scraped: number }>
    onTMDBScrapeProgress: (callback: (progress: { scraped: number; total: number; success: boolean; message: string }) => void) => () => void
    // Database selection
    dbScanForDatabases: () => Promise<Array<{ path: string; size: number }>>
    dbSelectDatabase: (databasePath: string) => Promise<LibrarySnapshot>
    dbGetCurrentPath: () => Promise<string | null>
    // AI Classification
    aiGetConfig: () => Promise<{ apiKey: string; baseUrl: string; model: string }>
    aiSaveConfig: (config: { apiKey: string; baseUrl: string; model: string }) => Promise<{ success: boolean }>
    aiTestConnection: (config: { apiKey: string; baseUrl: string; model: string }) => Promise<{ ok: boolean; message: string }>
    aiClassifyStream: (rule: string, config: { apiKey: string; baseUrl: string; model: string }) => Promise<{ success: boolean; message: string; result?: { folders: Array<{ name: string; videoIds: number[] }> } }>
    onAiChunk: (callback: (chunk: { reasoning?: string; content: string }) => void) => () => void
    aiApply: (folders: Array<{ name: string; videoIds: number[] }>) => Promise<{ success: boolean; message: string; snapshot?: LibrarySnapshot }>
    // MPV Player
    mpvLaunch: (filePath: string, config?: Partial<MpvPlayerConfig>) => Promise<{ success: boolean; error?: string; socket?: string }>
    mpvLoadFile: (filePath: string, mode?: string) => Promise<{ success: boolean; error?: string }>
    mpvCommand: (cmd: unknown[]) => Promise<{ success: boolean; data: unknown }>
    mpvTerminate: () => Promise<{ success: boolean }>
    mpvGetConfig: () => Promise<MpvPlayerConfig>
    mpvSaveConfig: (config: MpvPlayerConfig) => Promise<{ success: boolean }>
    mpvCheckAvailable: () => Promise<{ available: boolean; path: string }>
    onMpvEnd: (callback: () => void) => () => void
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
    isMaximized: () => boolean
    maximize: () => void
  }
}
