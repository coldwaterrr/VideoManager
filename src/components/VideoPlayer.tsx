import { useEffect, useRef, useState } from 'react'
import { X, Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react'

interface VideoPlayerProps {
  filePath: string
  videoName: string
  onClose: () => void
  onNext?: () => void
  onPrevious?: () => void
  playlist?: Array<{ path: string; name: string }>
  currentIndex?: number
  onSelectVideo?: (index: number) => void
}

export function VideoPlayer({ filePath, videoName, onClose, onNext, onPrevious, playlist = [], currentIndex = 0, onSelectVideo }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showPlaylist, setShowPlaylist] = useState(false)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
    }

    const handleMetadata = () => {
      setDuration(video.duration)
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('loadedmetadata', handleMetadata)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)

    // 自动播放
    video.play().catch(() => {})

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadedmetadata', handleMetadata)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [])

  // 切换视频时自动播放
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    setCurrentTime(0)
    video.play().catch(() => {})
  }, [filePath])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'f') {
        toggleFullscreen()
      } else if (e.key === 'm') {
        setIsMuted(!isMuted)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        skipBackward()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        skipForward()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, isMuted])

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {})
      } else {
        videoRef.current.pause()
      }
    }
  }

  const toggleFullscreen = async () => {
    if (!containerRef.current) return

    try {
      if (!isFullscreen) {
        await containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (err) {
      console.error('Fullscreen error:', err)
    }
  }

  const handleMouseMove = () => {
    setShowControls(true)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }
  }

  const formatTime = (seconds: number) => {
    if (!seconds || Number.isNaN(seconds)) return '0:00'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`
  }

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number(e.target.value)
    setVolume(newVolume)
    if (videoRef.current) {
      videoRef.current.volume = newVolume
    }
    if (newVolume > 0) {
      setIsMuted(false)
    }
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
    }
  }

  const skipBackward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5)
    }
  }

  const skipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5)
    }
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
      onMouseMove={handleMouseMove}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute right-6 top-6 z-10 rounded-lg bg-zinc-800/80 p-2 text-white backdrop-blur-sm transition hover:bg-zinc-700"
        title="关闭 (Esc)"
      >
        <X className="size-6" />
      </button>

      {/* 播放列表按钮 */}
      {playlist.length > 0 && (
        <button
          onClick={() => setShowPlaylist(!showPlaylist)}
          className="absolute right-20 top-6 z-10 rounded-lg bg-zinc-800/80 p-2 text-white backdrop-blur-sm transition hover:bg-zinc-700"
          title="播放列表"
        >
          <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6m-6 4h6m-11-4h.01M5 19h.01" />
          </svg>
        </button>
      )}

      {/* 播放列表面板 */}
      {showPlaylist && playlist.length > 0 && (
        <div className="absolute right-6 top-20 z-10 w-80 rounded-lg bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 shadow-xl overflow-hidden">
          <div className="sticky top-0 bg-zinc-900/90 px-4 py-3 border-b border-zinc-800">
            <div className="text-sm font-medium text-white">播放列表 ({playlist.length})</div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {playlist.map((video, index) => (
              <div
                key={index}
                className={`px-4 py-2 text-sm cursor-pointer transition ${
                  index === currentIndex
                    ? 'bg-violet-500/20 text-white'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
                onClick={() => onSelectVideo?.(index)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 w-6">{index + 1}</span>
                  <span className="flex-1 truncate">{video.name}</span>
                  {index === currentIndex && (
                    <svg className="size-4 text-violet-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 视频标题 */}
      <div className="absolute left-6 top-6 z-10 max-w-2xl text-lg font-medium text-white">
        <div className="truncate">{videoName}</div>
        {playlist.length > 0 && (
          <div className="text-xs text-zinc-400 mt-1">
            {currentIndex + 1} / {playlist.length}
          </div>
        )}
      </div>

      {/* 视频元素 */}
      <video
        ref={videoRef}
        src={`file:///${filePath.replace(/\\/g, '/')}`}
        className="h-full w-full object-contain"
        playsInline
      />

      {/* 播放器控制条 */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-black via-black/80 to-transparent px-6 py-8 transition-opacity ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* 进度条 */}
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={handleProgressChange}
          className="h-1 w-full cursor-pointer rounded-full bg-zinc-700 accent-violet-500"
        />

        {/* 控制条 */}
        <div className="flex items-center gap-4">
          {/* 上一个视频按钮 */}
          {playlist.length > 0 && (
            <button
              onClick={() => onPrevious?.()}
              disabled={currentIndex === 0}
              className="rounded-lg p-2.5 bg-zinc-800 text-white transition hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800"
              title="上一个视频"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}

          {/* 后退5s */}
          <button
            onClick={skipBackward}
            className="rounded-lg p-2.5 text-zinc-300 transition hover:text-white hover:bg-zinc-800"
            title="后退5秒"
          >
            <SkipBack className="size-5" />
          </button>

          {/* 播放按钮 */}
          <button
            onClick={togglePlay}
            className="rounded-lg bg-violet-500 p-2.5 text-white transition hover:bg-violet-400"
            title={isPlaying ? '暂停 (空格)' : '播放 (空格)'}
          >
            {isPlaying ? (
              <Pause className="size-6" />
            ) : (
              <Play className="size-6" />
            )}
          </button>

          {/* 快进5s */}
          <button
            onClick={skipForward}
            className="rounded-lg p-2.5 text-zinc-300 transition hover:text-white hover:bg-zinc-800"
            title="快进5秒"
          >
            <SkipForward className="size-5" />
          </button>

          {/* 下一个视频按钮 */}
          {playlist.length > 0 && (
            <button
              onClick={() => onNext?.()}
              disabled={currentIndex === playlist.length - 1}
              className="rounded-lg p-2.5 bg-zinc-800 text-white transition hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800"
              title="下一个视频"
            >
              <ChevronRight className="size-5" />
            </button>
          )}

          {/* 音量控制 */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="rounded-lg p-2 text-white transition hover:bg-zinc-800"
              title={isMuted ? '取消静音 (M)' : '静音 (M)'}
            >
              {isMuted ? (
                <VolumeX className="size-5" />
              ) : (
                <Volume2 className="size-5" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="h-1 w-16 cursor-pointer rounded-full bg-zinc-700 accent-violet-500"
            />
          </div>

          {/* 时间显示 */}
          <div className="text-sm text-white/80">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          {/* 全屏按钮 */}
          <button
            onClick={toggleFullscreen}
            className="ml-auto rounded-lg p-2 text-white transition hover:bg-zinc-800"
            title={isFullscreen ? '退出全屏 (F)' : '全屏 (F)'}
          >
            {isFullscreen ? (
              <Minimize2 className="size-6" />
            ) : (
              <Maximize2 className="size-6" />
            )}
          </button>
        </div>

        {/* 快捷键提示 */}
        <div className="mt-2 text-xs text-white/60">
          空格: 播放/暂停 | ←/→: 快退/快进5s | M: 静音 | F: 全屏
        </div>
      </div>
    </div>
  )
}
