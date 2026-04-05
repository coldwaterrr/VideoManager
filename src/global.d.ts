interface DatabaseMeta {
  databasePath: string
  tables: string[]
}

interface VideoRecord {
  id: number
  name: string
  absolutePath: string
  fileSize: number
  durationSeconds: number
  modifiedAt: string
  folderIds: number[]
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
  lastScanDirectory?: string
  lastScannedAt?: string
}

interface ScanFilterOptions {
  minSizeMB?: number
  maxSizeMB?: number
  formats?: string[]
}

interface ScanProgress {
  type: 'found' | 'complete'
  current?: number
  total?: number
  filePath?: string
  message?: string
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
}

interface AIClassificationResult {
  folders: AIClassificationFolder[]
}

interface AITestResult {
  ok: boolean
  message: string
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

declare global {
  interface Window {
    videosorter?: {
      getDatabaseMeta: () => Promise<DatabaseMeta>
      getLibrarySnapshot: () => Promise<LibrarySnapshot>
      createVirtualFolder: (name: string) => Promise<LibrarySnapshot>
      toggleVideoFolder: (videoId: number, folderId: number) => Promise<LibrarySnapshot>
      scanDirectory: (filterOptions?: ScanFilterOptions) => Promise<{ cancelled: boolean; snapshot: LibrarySnapshot }>
      onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
      cleanupUnsupported: () => Promise<{ deletedCount: number; snapshot: LibrarySnapshot }>
      openVideo: (filePath: string) => Promise<{ success: boolean }>
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
      onAiChunk: (callback: (chunk: { reasoning?: string; content: string }) => void) => () => void
      aiApply: (folders: AIClassificationFolder[]) => Promise<AIApplyResult>
    }
    winControls?: {
      minimize: () => void
      close: () => void
      isMaximized: () => boolean
      maximize: () => void
    }
  }
}

export {}
