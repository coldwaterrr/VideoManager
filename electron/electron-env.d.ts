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
  }
  winControls?: {
    minimize: () => void
    close: () => void
    isMaximized: () => boolean
    maximize: () => void
  }
}
