import { useEffect, useState, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Loader2, Settings } from 'lucide-react'
import { SettingItem } from './SettingItem'

interface MpvConfigType {
  anime4k: boolean
  interpolation: boolean
  interpolationFps: number
  superResShader: 'anime4k' | 'fsrcnnx' | 'none'
  mpvPath: string
}

const DEFAULT_CONFIG: MpvConfigType = {
  anime4k: false,
  interpolation: false,
  interpolationFps: 60,
  superResShader: 'none',
  mpvPath: '',
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
  const [mpvConfig, setMpvConfig] = useState<MpvConfigType>(DEFAULT_CONFIG)

  // 加载配置并启动 mpv（合并为单一 effect，避免竞态）
  useEffect(() => {
    if (!window.videosorter || status !== 'launching') return
    let cancelled = false

    async function launch() {
      try {
        // 1. 检查 mpv 可用性
        const { available, path } = await window.videosorter!.mpvCheckAvailable()
        if (cancelled) return
        setMpvAvailable(available)
        setMpvConfig(prev => ({ ...prev, mpvPath: path }))

        // 2. 获取已保存的配置
        const savedConfig = await window.videosorter!.mpvGetConfig()
        if (cancelled) return

        // 3. 合并：savedConfig 优先级高于 DEFAULT_CONFIG，mpvPath 必须用 checkAvailable 的结果
        const mergedConfig = { ...DEFAULT_CONFIG, ...savedConfig, mpvPath: path }
        setMpvConfig(mergedConfig)

        if (!path) {
          if (cancelled) return
          setStatus('error')
          setErrorMsg('找不到 mpv.exe，请检查 mpv 文件夹路径')
          return
        }

        // 4. 启动 mpv
        const { success, error } = await window.videosorter!.mpvLaunch(filePath, mergedConfig)
        if (cancelled) return
        if (success) {
          setStatus('playing')
        } else {
          setStatus('error')
          setErrorMsg(error || '启动 mpv 失败')
        }
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setErrorMsg(`启动 mpv 异常: ${String(e)}`)
      }
    }

    launch()

    return () => { cancelled = true }
  }, [filePath, status])

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
    setMpvConfig(prev => {
      // 确保 mpvPath 不被空值覆盖
      const newConfig: MpvConfigType = { ...prev, ...config }
      if (!newConfig.mpvPath) newConfig.mpvPath = prev.mpvPath
      window.videosorter?.mpvSaveConfig(newConfig)
      return newConfig
    })
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">

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
                <button onClick={() => setShowPlaylist(!showPlaylist)} className="rounded-lg bg-zinc-800 p-2 text-white transition hover:bg-zinc-700" title="播放列表">
                  <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6m-6 4h6m-11-4h.01M5 19h.01" /></svg>
                </button>
              )}
              <button onClick={() => setShowSettings(!showSettings)} className="rounded-lg bg-zinc-800 p-2 text-white transition hover:bg-zinc-700" title="设置">
                <Settings className="size-5" />
              </button>
              <button onClick={handleClose} className="rounded-lg bg-zinc-800 p-2 text-white transition hover:bg-zinc-700" title="关闭 (Esc)">
                <X className="size-5" />
              </button>
            </div>
          </div>

          {playlist.length > 0 && (
            <>
              <button onClick={() => onPrevious?.()} disabled={currentIndex === 0} className="absolute bottom-20 left-4 rounded-lg bg-zinc-800/80 p-3 text-white transition hover:bg-zinc-700 disabled:opacity-30">
                <ChevronLeft className="size-5" />
              </button>
              <button onClick={() => onNext?.()} disabled={currentIndex === playlist.length - 1} className="absolute bottom-20 right-4 rounded-lg bg-zinc-800/80 p-3 text-white transition hover:bg-zinc-700 disabled:opacity-30">
                <ChevronRight className="size-5" />
              </button>
            </>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-zinc-800/80 px-3 py-1 text-[10px] text-zinc-400">
            Esc 关闭 | ← → 切换视频 | 空格 暂停
          </div>
        </>
      )}

      {/* Playlist panel */}
      {showPlaylist && playlist.length > 0 && (
        <div className="absolute right-6 top-20 z-10 w-80 rounded-lg bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 shadow-xl overflow-hidden">
          <div className="sticky top-0 bg-zinc-900/90 px-4 py-3 border-b border-zinc-800">
            <div className="text-sm font-medium text-white">播放列表 ({playlist.length})</div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {playlist.map((video, index) => (
              <div key={index} className={`px-4 py-2 text-sm cursor-pointer transition ${index === currentIndex ? 'bg-violet-500/20 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`} onClick={() => handleSelectVideo(index)}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 w-6">{index + 1}</span>
                  <span className="flex-1 truncate">{video.name}</span>
                  {index === currentIndex && <span className="text-xs text-violet-400">播放中</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute right-20 top-20 z-10 w-80 rounded-lg bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 shadow-xl overflow-hidden">
          <div className="sticky top-0 bg-zinc-900/90 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="text-sm font-medium text-white">播放器设置</div>
            <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-white"><X className="size-4" /></button>
          </div>
          <div className="p-4 space-y-5">
            <SettingItem
              name="Anime4K 超分辨率"
              shortDesc="针对动漫/动画画面的 AI 超分辨率增强，锐化线条并填充细节"
              detail="专为动漫内容设计，可锐化边缘线条、增强色彩和细节。在动漫/动画画面中效果显著，但不建议用于真人影视，可能导致画面过度锐化或失真。修改设置后需重新打开视频。"
              enabled={mpvConfig.anime4k}
              onToggle={() => handleSaveConfig({ anime4k: !mpvConfig.anime4k })}
            />
            <SettingItem
              name="补帧 (插帧)"
              shortDesc="将低帧率视频插值到高帧率显示，使动画更流畅"
              detail="通过插帧算法将低帧率视频提升到高帧率显示（如 24fps → 60fps），使动作画面更流畅。但在真人影视中可能导致'肥皂效应'(动作过于平滑)、失去电影感，部分人会觉得不自然。修改设置后需重新打开视频。"
              enabled={mpvConfig.interpolation}
              onToggle={() => handleSaveConfig({ interpolation: !mpvConfig.interpolation })}
            />
            <div className="space-y-2">
              <div className="text-sm text-white">超分 Shader</div>
              <div className="flex gap-1">
                {(['anime4k', 'fsrcnnx', 'none'] as const).map(shader => (
                  <button key={shader} onClick={() => handleSaveConfig({ superResShader: shader })} className={`flex-1 rounded px-2 py-1 text-xs transition ${mpvConfig.superResShader === shader ? 'bg-blue-500 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'}`}>
                    {shader === 'none' ? '无' : shader.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="text-xs text-zinc-500">Anime4K: 适合动漫，锐化边缘 | FSRCNNX: 通用超分辨率，适合写实/真人画面</div>
            </div>
            <div className="text-xs text-zinc-500 pt-2 border-t border-white/10">修改设置后需重新打开视频。超分和补帧对显卡配置有一定要求。</div>
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
