import { useState } from 'react'
import { HelpCircle } from 'lucide-react'

interface SettingItemProps {
  name: string
  shortDesc: string
  detail: string
  enabled: boolean
  onToggle: () => void
}

export function SettingItem({ name, shortDesc, detail, enabled, onToggle }: SettingItemProps) {
  const [showDetail, setShowDetail] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white">{name}</span>
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="text-zinc-500 hover:text-white transition"
            title="查看详细说明"
          >
            <HelpCircle className="size-3.5" />
          </button>
        </div>
        <button
          onClick={onToggle}
          className={`relative inline-flex h-5 w-9 rounded-full transition ${enabled ? 'bg-blue-500' : 'bg-zinc-600'}`}
        >
          <span className={`inline-block size-3 translate-y-1 rounded-full bg-white transition ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      </div>
      <div className="text-xs text-zinc-500">{shortDesc}</div>
      {showDetail && (
        <div className="rounded-md bg-white/5 px-3 py-2 text-xs text-zinc-400 border border-white/5">
          {detail}
        </div>
      )}
    </div>
  )
}
