import { Minus, Maximize2, Minimize2, X } from 'lucide-react'
import { useState, useEffect } from 'react'

const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (window.winControls) {
      const checkMaximized = () => setIsMaximized(window.winControls!.isMaximized())
      checkMaximized()
      const interval = setInterval(checkMaximized, 500)
      return () => clearInterval(interval)
    }
  }, [])

  if (!window.winControls) return null

  return (
    <div className="flex h-10 w-full items-center justify-between bg-transparent select-none" style={dragStyle}>
      <div className="flex-1" style={dragStyle} />
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
    </div>
  )
}
