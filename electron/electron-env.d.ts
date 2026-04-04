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
    toggleVideoFolder: (videoId: number, folderId: number) => Promise<LibrarySnapshot>
    scanDirectory: (filterOptions?: ScanFilterOptions) => Promise<ScanDirectoryResult>
    onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
    cleanupUnsupported: () => Promise<{ deletedCount: number; snapshot: LibrarySnapshot }>
    openVideo: (filePath: string) => Promise<{ success: boolean }>
    getVideoThumbnail: (filePath: string) => Promise<{ thumbnail: string | null }>
    deleteVideos: (videoIds: number[]) => Promise<{ deletedCount: number; snapshot: LibrarySnapshot }>
  }
}
