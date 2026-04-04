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
    }
  }
}

export {}

