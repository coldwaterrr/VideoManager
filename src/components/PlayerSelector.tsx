import { useState } from 'react'
import { Monitor, MonitorPlay, Globe } from 'lucide-react'

type PlayerType = 'web' | 'mpv' | 'system'

const PLAYER_OPTIONS: Array<{
  value: PlayerType
  label: string
  icon: React.ReactNode
  desc: string
}> = [
  {
    value: 'web',
    label: 'Web 播放器',
    icon: <Monitor className="size-4" />,
    desc: '内置播放器，支持 MP4/WebM',
  },
  {
    value: 'mpv',
    label: 'mpv 播放器',
    icon: <MonitorPlay className="size-4" />,
    desc: '支持超分/补帧，画质增强',
  },
  {
    value: 'system',
    label: '系统默认',
    icon: <Globe className="size-4" />,
    desc: '使用系统默认应用打开',
  },
]

interface PlayerSelectorProps {
  current?: PlayerType
  onSelect?: (player: PlayerType) => void
}

export function PlayerSelector({ current = 'web', onSelect }: PlayerSelectorProps) {
  const [open, setOpen] = useState(false)

  const select = async (type: PlayerType) => {
    setOpen(false)
    onSelect?.(type)
    await window.videosorter?.playerSaveConfig({ defaultPlayer: type })
  }

  const currentOpt = PLAYER_OPTIONS.find((o) => o.value === current)!

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg bg-[#1e1e20] px-2.5 py-1.5 text-xs text-white transition hover:bg-[#2a2a2e]"
        title="切换播放器"
      >
        {PLAYER_OPTIONS.find((o) => o.value === current)!.icon}
        <span className="hidden sm:inline">{PLAYER_OPTIONS.find((o) => o.value === current)!.label}</span>
        <svg className="size-3 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          {/* Click outside to close */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-lg border border-[#2a2a2e] bg-[#1a1a1c] shadow-xl overflow-hidden">
            <div className="px-3 py-2 text-xs text-zinc-500 border-b border-[#2a2a2e]">选择默认播放器</div>
            {PLAYER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => select(opt.value)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition ${
                  current === opt.value
                    ? 'bg-gradient-to-r from-[#6366f1]/20 to-[#8b5cf6]/20 text-white'
                    : 'text-zinc-300 hover:bg-[#1e1e20]'
                }`}
              >
                <div className={`flex-shrink-0 ${current === opt.value ? 'text-[#8b5cf6]' : 'text-zinc-500'}`}>
                  {opt.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-zinc-500">{opt.desc}</div>
                </div>
                {current === opt.value && (
                  <svg className="size-4 text-[#8b5cf6] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
