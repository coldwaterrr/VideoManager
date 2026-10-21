import { useState } from 'react'

type PlayerType = 'web' | 'mpv' | 'system'
export function PlayerSelector({
  current = 'web',
  onSelect,
}: {
  current?: PlayerType
  onSelect?: (player: PlayerType) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function select(player: PlayerType) {
    setBusy(true)
    setError('')
    try {
      await window.videosorter?.playerSaveConfig({ defaultPlayer: player })
      onSelect?.(player)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '保存播放器设置失败，请重试。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <select
        className="player-preference"
        aria-label="默认播放器"
        value={current}
        disabled={busy}
        onChange={(event) => void select(event.target.value as PlayerType)}
      >
        <option value="web">内置播放器</option>
        <option value="mpv">MPV 增强播放器</option>
        <option value="system">系统默认播放器</option>
      </select>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
