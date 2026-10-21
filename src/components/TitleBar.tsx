import { Minus, Maximize2, Minimize2, X } from 'lucide-react'
import { useState, useEffect } from 'react'

const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (window.winControls) {
      let active = true
      const checkMaximized = async () => {
        try {
          const value = await window.winControls!.isMaximized()
          if (active) setIsMaximized(value)
        } catch {
          /* window may be closing */
        }
      }
      checkMaximized()
      const interval = setInterval(checkMaximized, 500)
      return () => {
        active = false
        clearInterval(interval)
      }
    }
  }, [])

  return (
    <div className="app-titlebar flex w-full items-center justify-between select-none" style={dragStyle}>
      <div className="titlebar-caption flex-1" style={dragStyle}>
        VideoManager
      </div>
      {window.winControls && (
        <div className="flex h-full items-stretch" style={noDragStyle}>
          <button
            type="button"
            onClick={() => window.winControls!.minimize()}
            className="flex items-center justify-center px-4 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            title="最小化"
          >
            <Minus className="size-[14px]" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => window.winControls!.maximize()}
            className="flex items-center justify-center px-4 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            title={isMaximized ? '还原' : '最大化'}
          >
            {isMaximized ? <Minimize2 className="size-[14px]" /> : <Maximize2 className="size-[14px]" />}
          </button>
          <button
            type="button"
            onClick={() => window.winControls!.close()}
            className="flex items-center justify-center px-4 text-zinc-400 hover:text-white hover:bg-red-500/80 transition"
            title="关闭"
          >
            <X className="size-[14px]" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  )
}
