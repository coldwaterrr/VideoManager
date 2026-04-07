import { useEffect, useRef, useState, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Loader2, Settings } from 'lucide-react'

interface MpvConfigType {
  anime4k: boolean
  interpolation: boolean
  interpolationFps: number
  superResShader: 'anime4k' | 'fsrcnnx' | 'none'
  mpvPath: string
}

interface MpvPlayerProps {
  filePath: string
  videoName: string
  onClose: () => void
  onNext?: () => void
  onPrevious?: () => void
  playlist?: Array<{ path: string; name: string }>
  currentIndex?: number
  onSelectVideo?: (index: number) => void
}

export function MpvPlayer({ filePath, videoName, onClose, onNext, onPrevious, playlist = [], currentIndex = 0, onSelectVideo }: MpvPlayerProps) {
  const [status, setStatus] = useState<'launching' | 'playing' | 'error'>('launching')
  const [errorMsg, setErrorMsg] = useState('')
  const [showPlaylist, setShowPlaylist] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [mpvAvailable, setMpvAvailable] = useState<boolean | null>(null)
  const [mpvPath, setMpvPath] = useState('')
  const [mpvConfig, setMpvConfig] = useState<Partial<MpvConfigType> | null>(null)

  useEffect(() => {
    if (!window.videosorter) return
    window.videosorter.mpvCheckAvailable().then(({ available, path }) => {
      setMpvAvailable(available)
      setMpvPath(path)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!window.videosorter || status !== 'launching') return

    window.videosorter.mpvLaunch(filePath, mpvConfig ?? undefined).then(({ success, error }) => {
      if (cancelled) return
      if (success) {
        setStatus('playing')
      } else {
        setStatus('error')
        setErrorMsg(error || '启动 mpv 失败')
      }
    })

    return () => { cancelled = true }
  }, [filePath])

  useEffect(() => {
    if (!window.videosorter) return
    const cleanup = window.videosorter.onMpvEnd(() => { onClose() })
    return cleanup
  }, [onClose])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSettings) { setShowSettings(false); return }
        if (showPlaylist) { setShowPlaylist(false); return }
        onClose()
      }
      else if (e.key === 'ArrowLeft') onPrevious?.()
      else if (e.key === 'ArrowRight') onNext?.()
      else if (e.key === ' ' && status === 'playing') {
        e.preventDefault()
        window.videosorter?.mpvCommand(['cycle', 'pause'])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onNext, onPrevious, showSettings, showPlaylist, status])

  const handleSelectVideo = useCallback((index: number) => {
    onSelectVideo?.(index)
    setStatus('launching')
  }, [onSelectVideo])

  const handleClose = useCallback(() => {
    window.videosorter?.mpvTerminate()
    onClose()
  }, [onClose])

  const handleSaveConfig = useCallback((config: Partial<MpvConfigType>) => {
    setMpvConfig({ ...mpvConfig, ...config })
    if (window.videosorter) {
      window.videosorter.mpvGetConfig().then(existingConfig => {
        window.videosorter?.mpvSaveConfig({ ...existingConfig, ...config })
      })
    }
  }, [mpvConfig])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
      {/* Launching */}
      {status === 'launching' && (
        <div className="flex flex-col items-center gap-4 text-white">
          <Loader2 className="size-8 animate-spin text-white/60" />
          <span className="text-sm text-zinc-400">正在启动 mpv...</span>
          {!mpvAvailable && mpvAvailable !== null && (
            <div className="mt-4 rounded-lg bg-zinc-800 p-6 max-w-md">
              <p className="text-sm text-amber-400 mb-2">mpv 未找到</p>
              <p className="text-xs text-zinc-400 mb-3">请下载 mpv for Windows 并解压到 <code className="bg-zinc-700 px-1 rounded">mpv/</code> 目录</p>
              <button onClick={handleClose} className="rounded bg-white/10 px-4 py-1.5 text-xs text-white hover:bg-white/20">关闭</button>
            </div>
          )}
        </div>
      )}

      {/* Playing - simple controls */}
      {status === 'playing' && (
        <>
          <div className="absolute left-6 right-6 top-6 flex items-start justify-between">
            <div className="max-w-[60%]">
              <div className="truncate text-lg font-medium text-white">{videoName}</div>
              {playlist.length > 0 && (
                <div className="text-xs text-zinc-400 mt-1">{currentIndex + 1} / {playlist.length}</div>
              )}
            </div>
            <div className="flex gap-2">
              {playlist.length > 0 && (
                <button onClick={() => setShowPlaylist(!showPlaylist)} className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20" title="播放列表">
                  <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6m-6 4h6m-11-4h.01M5 19h.01" /></svg>
                </button>
              )}
              <button onClick={() => setShowSettings(!showSettings)} className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20" title="设置">
                <Settings className="size-5" />
              </button>
              <button onClick={handleClose} className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20" title="关闭 (Esc)">
                <X className="size-5" />
              </button>
            </div>
          </div>

          {playlist.length > 0 && (
            <>
              <button onClick={() => onPrevious?.()} disabled={currentIndex === 0} className="absolute bottom-20 left-4 rounded-full bg-black/40 p-3 text-white transition hover:bg-black/60 disabled:opacity-30">
                <ChevronLeft className="size-5" />
              </button>
              <button onClick={() => onNext?.()} disabled={currentIndex === playlist.length - 1} className="absolute bottom-20 right-4 rounded-full bg-black/40 p-3 text-white transition hover:bg-black/60 disabled:opacity-30">
                <ChevronRight className="size-5" />
              </button>
            </>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-[10px] text-white/40">
            Esc 关闭 | ← → 切换视频 | 空格 暂停
          </div>
        </>
      )}

      {/* Playlist panel */}
      {showPlaylist && playlist.length > 0 && (
        <div className="absolute right-6 top-20 z-10 w-80 rounded-lg bg-black/90 backdrop-blur-sm border border-white/10 shadow-xl overflow-hidden">
          <div className="sticky top-0 bg-black/50 px-4 py-3 border-b border-white/10">
            <div className="text-sm font-medium text-white">播放列表 ({playlist.length})</div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {playlist.map((video, index) => (
              <div key={index} className={`px-4 py-2 text-sm cursor-pointer transition ${index === currentIndex ? 'bg-white/20 text-white' : 'text-zinc-300 hover:bg-white/10'}`} onClick={() => handleSelectVideo(index)}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 w-6">{index + 1}</span>
                  <span className="flex-1 truncate">{video.name}</span>
                  {index === currentIndex && <span className="text-xs text-green-400">播放中</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute right-20 top-20 z-10 w-72 rounded-lg bg-black/90 backdrop-blur-sm border border-white/10 shadow-xl overflow-hidden">
          <div className="sticky top-0 bg-black/50 px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="text-sm font-medium text-white">播放器设置</div>
            <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-white"><X className="size-4" /></button>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white">Anime4K 超分辨率</div>
                <div className="text-xs text-zinc-500">提升动漫画质</div>
              </div>
              <button onClick={() => handleSaveConfig({ anime4k: !mpvConfig?.anime4k })} className={`relative inline-flex h-5 w-9 rounded-full transition ${mpvConfig?.anime4k ? 'bg-blue-500' : 'bg-zinc-600'}`}>
                <span className={`inline-block size-3 translate-y-1 rounded-full bg-white transition ${mpvConfig?.anime4k ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white">补帧 (插帧)</div>
                <div className="text-xs text-zinc-500">使视频更流畅</div>
              </div>
              <button onClick={() => handleSaveConfig({ interpolation: !mpvConfig?.interpolation })} className={`relative inline-flex h-5 w-9 rounded-full transition ${mpvConfig?.interpolation ? 'bg-blue-500' : 'bg-zinc-600'}`}>
                <span className={`inline-block size-3 translate-y-1 rounded-full bg-white transition ${mpvConfig?.interpolation ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
            <div>
              <div className="text-sm text-white mb-1">超分 shader</div>
              <div className="flex gap-1">
                {(['anime4k', 'fsrcnnx', 'none'] as const).map(shader => (
                  <button key={shader} onClick={() => handleSaveConfig({ superResShader: shader })} className={`flex-1 rounded px-2 py-1 text-xs transition ${mpvConfig?.superResShader === shader ? 'bg-blue-500 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'}`}>
                    {shader === 'none' ? '无' : shader.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs text-zinc-500 pt-2 border-t border-white/10">修改设置后需重新打开视频</div>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="rounded-lg bg-zinc-800 p-6 max-w-md">
          <p className="text-sm text-red-400 mb-2">启动 mpv 失败</p>
          <p className="text-xs text-zinc-400 mb-4">{errorMsg}</p>
          <button onClick={handleClose} className="rounded bg-white/10 px-4 py-1.5 text-xs text-white hover:bg-white/20">关闭</button>
        </div>
      )}
    </div>
  )
}
