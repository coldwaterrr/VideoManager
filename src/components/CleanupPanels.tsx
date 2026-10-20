import { useEffect, useState } from 'react'
import { Button } from './ui/button'

type Props = { onSnapshot: (snapshot: LibrarySnapshot) => void; onStatus: (message: string) => void }
const field = 'mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200'
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未检测'
function sizeLabel(bytes: number) { return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(2)} MB` }

export function MissingCleanupPanel({ onSnapshot, onStatus }: Props) {
  const [config, setConfig] = useState<AutoCleanupConfig>({ enabled: false, intervalMinutes: 60, confirmationChecks: 2 })
  const [status, setStatus] = useState<AutoCleanupStatus | null>(null)
  const [inspection, setInspection] = useState<MissingInspection | null>(null)
  const [busy, setBusy] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    window.videosorter!.getAutomaticCleanup().then(result => { if (active) { setConfig(result.config); setStatus(result.status); setLoaded(true) } })
      .catch(error => { if (active) setMessage(String(error)) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [])
  useEffect(() => window.videosorter!.onMonitorUpdate(event => { if (event.autoCleanupStatus) setStatus(event.autoCleanupStatus) }), [])
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  function update(value: Partial<AutoCleanupConfig>) { setConfig(previous => ({ ...previous, ...value })); setDirty(true) }
  return <div className="space-y-5">
    <p className="text-sm leading-6 text-zinc-400">只移除失效的视频库记录和分类关联，保留视频文件。磁盘离线、目录无法访问、权限不足的记录会跳过；每次清理前自动备份数据库。</p>
    <section className="space-y-4 rounded-xl border border-zinc-700 p-4">
      <label className="flex items-center gap-2 text-sm text-zinc-200"><input aria-label="启用自动失效清理" type="checkbox" checked={config.enabled} disabled={busy || !loaded} onChange={event => update({ enabled: event.target.checked })} />自动检测并清理失效路径</label>
      <p className="text-xs leading-6 text-zinc-500">启用后，在程序运行或缩到托盘时定期检测。默认连续确认 2 次失效才清理；恢复可访问或暂时无法确认的路径会重新计数。</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-zinc-400">检测间隔（分钟）<input aria-label="自动清理检测间隔" className={field} type="number" min="1" max="10080" value={config.intervalMinutes} disabled={busy || !loaded} onChange={event => update({ intervalMinutes: Number(event.target.value) })} /></label>
        <label className="text-xs text-zinc-400">连续确认失效次数<select aria-label="自动清理连续确认次数" className={field} value={config.confirmationChecks} disabled={busy || !loaded} onChange={event => update({ confirmationChecks: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} 次</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy || !loaded} onClick={() => void run(async () => { const result = await window.videosorter!.saveAutomaticCleanup(config); setConfig(result.config); setStatus(result.status); setDirty(false); setMessage(config.enabled ? '已启用自动失效清理，将从下一轮检测开始累计确认。' : '已关闭自动失效清理。') })}>保存自动清理设置</Button>
        <Button variant="secondary" disabled={busy || !loaded || !config.enabled || dirty} onClick={() => void run(async () => {
          const result = await window.videosorter!.checkAutomaticCleanup()
          if (result.status) setStatus(result.status)
          if (result.snapshot) onSnapshot(result.snapshot)
          const text = result.busy ? '已有自动清理任务正在运行。' : result.cancelled ? '设置已变化，本轮检测已取消。' : `检测完成：清理 ${result.deletedCount || 0} 条，待确认 ${result.status?.pendingCount || 0} 条，跳过 ${result.status?.skipped || 0} 条。`
          setMessage(text); onStatus(text)
        })}>立即检测一轮</Button>
      </div>
      {dirty && <p className="text-xs text-amber-300">设置尚未保存。</p>}
      {status && <div className="space-y-1 text-xs leading-6 text-zinc-500"><p>上次检测：{dateLabel(status.lastCheckedAt)}</p><p>上次清理 {status.lastDeletedCount} 条 · 累计清理 {status.totalDeletedCount} 条 · 待确认 {status.pendingCount} 条 · 跳过 {status.skipped} 条</p>{status.backupPath && <p className="break-all">最近备份：{status.backupPath}</p>}</div>}
    </section>
    <div className="space-y-4 border-t border-zinc-800 pt-5">
      <h3 className="text-sm font-medium">手动检查与清理</h3>
      <Button variant="secondary" disabled={busy || !loaded} onClick={() => void run(async () => { const result = await window.videosorter!.inspectMissing(); setInspection(result); setMessage(`找到 ${result.missing.length} 条失效路径，跳过 ${result.skipped} 条无法确认的记录。`) })}>检查失效路径</Button>
      {inspection && <>
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-zinc-700 p-4">
          {inspection.missing.length ? inspection.missing.map(item => <div key={item.id} className="border-b border-zinc-800 pb-2 last:border-0"><div className="text-sm text-zinc-200">{item.name}</div><div className="break-all text-xs text-zinc-500">{item.absolutePath}</div></div>) : <p className="text-sm text-zinc-400">没有发现可清理的失效路径。</p>}
        </div>
        <Button disabled={busy || !inspection.missing.length} onClick={() => void run(async () => { const result = await window.videosorter!.cleanupMissing(inspection.missing.map(item => item.id), inspection.databasePath); onSnapshot(result.snapshot); const text = `已清理 ${result.deletedCount} 条失效记录${result.backupPath ? `，备份：${result.backupPath}` : ''}`; setInspection(null); setMessage(text); onStatus(text) })}>备份并清理 {inspection.missing.length} 条失效记录</Button>
      </>}
    </div>
    {message && <p role="status" className="break-all rounded-lg bg-zinc-800 p-3 text-sm leading-6 text-zinc-300">{message}</p>}
  </div>
}

const timeFields = [
  ['modifiedAfter', '文件修改时间不早于（含）'], ['modifiedBefore', '文件修改时间早于（不含）'],
  ['addedAfter', '加入视频库时间不早于（含）'], ['addedBefore', '加入视频库时间早于（不含）'],
] as const
export function ConditionalCleanupPanel({ onSnapshot, onStatus }: Props) {
  const [values, setValues] = useState({ minSizeMB: '', maxSizeMB: '', keyword: '', modifiedAfter: '', modifiedBefore: '', addedAfter: '', addedBefore: '' })
  const [preview, setPreview] = useState<ConditionalCleanupPreview | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const selectedSize = preview?.videos.reduce((sum, video) => sum + (selected.has(video.id) ? video.fileSize : 0), 0) || 0
  function update(key: keyof typeof values, value: string) {
    setValues(previous => ({ ...previous, [key]: value })); setPreview(null); setSelected(new Set()); setConfirming(false); setMessage('')
  }
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); setConfirming(false) }
    finally { setBusy(false) }
  }
  function conditions(): CleanupConditions {
    const result: CleanupConditions = {}
    if (values.minSizeMB !== '') result.minSizeMB = Number(values.minSizeMB)
    if (values.maxSizeMB !== '') result.maxSizeMB = Number(values.maxSizeMB)
    if (values.keyword.trim()) result.keyword = values.keyword.trim()
    for (const [key] of timeFields) if (values[key]) result[key] = new Date(values[key]).toISOString()
    return result
  }
  return <div className="space-y-5">
    <p className="text-sm leading-6 text-zinc-400">按视频库记录筛选，多个条件同时满足才选中。大小和时间可留空，时间按本机时区输入；“加入视频库时间”与文件修改时间分别判断。清理只移除记录，保留文件。</p>
    <div className="grid gap-4 rounded-xl border border-zinc-700 p-4 sm:grid-cols-2">
      <label className="text-xs text-zinc-400">最小大小（MB，含）<input aria-label="清理最小大小MB" className={field} type="number" min="0" step="any" placeholder="不限" value={values.minSizeMB} disabled={busy} onChange={event => update('minSizeMB', event.target.value)} /></label>
      <label className="text-xs text-zinc-400">最大大小（MB，含）<input aria-label="清理最大大小MB" className={field} type="number" min="0" step="any" placeholder="不限" value={values.maxSizeMB} disabled={busy} onChange={event => update('maxSizeMB', event.target.value)} /></label>
      {timeFields.map(([key, label]) => <label key={key} className="text-xs text-zinc-400">{label}<input aria-label={label} className={field} type="datetime-local" value={values[key]} disabled={busy} onChange={event => update(key, event.target.value)} /></label>)}
      <label className="text-xs text-zinc-400 sm:col-span-2">文件名或路径包含<input aria-label="清理关键词" className={field} placeholder="留空不限" value={values.keyword} disabled={busy} onChange={event => update('keyword', event.target.value)} /></label>
    </div>
    <Button disabled={busy} onClick={() => void run(async () => { const result = await window.videosorter!.previewConditionalCleanup(conditions()); setPreview(result); setSelected(new Set(result.videos.map(video => video.id))); setConfirming(false); setMessage(`匹配 ${result.videos.length} 条记录，已默认全选；可取消勾选。`) })}>{busy ? '正在处理…' : '预览条件匹配结果'}</Button>
    {preview && <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm"><span>匹配 {preview.videos.length} 条 · 已选 {selected.size} 条</span><span className="text-xs text-zinc-500">对应视频大小 {sizeLabel(selectedSize)}</span><Button size="sm" variant="secondary" disabled={busy || !preview.videos.length} onClick={() => { setSelected(selected.size === preview.videos.length ? new Set() : new Set(preview.videos.map(video => video.id))); setConfirming(false) }}>{selected.size === preview.videos.length ? '取消全选匹配结果' : '全选匹配结果'}</Button></div>
      <div className="max-h-80 overflow-auto rounded-xl border border-zinc-700">
        <table className="w-full min-w-[700px] text-left text-xs"><thead className="sticky top-0 bg-zinc-800 text-zinc-400"><tr><th className="p-3">选择</th><th className="p-3">视频文件</th><th className="p-3">大小</th><th className="p-3">文件修改时间</th><th className="p-3">加入视频库时间</th></tr></thead><tbody>{preview.videos.map(video => <tr key={video.id} className="border-t border-zinc-800"><td className="p-3"><input type="checkbox" aria-label={`选择清理 ${video.name}`} checked={selected.has(video.id)} disabled={busy} onChange={event => { setSelected(previous => { const next = new Set(previous); event.target.checked ? next.add(video.id) : next.delete(video.id); return next }); setConfirming(false) }} /></td><td className="max-w-72 p-3"><div className="truncate text-zinc-200" title={video.name}>{video.name}</div><div className="mt-1 truncate text-zinc-500" title={video.absolutePath}>{video.absolutePath}</div></td><td className="whitespace-nowrap p-3 text-zinc-400">{sizeLabel(video.fileSize)}</td><td className="p-3 text-zinc-400">{dateLabel(video.modifiedAt)}</td><td className="p-3 text-zinc-400">{dateLabel(video.addedAt)}</td></tr>)}</tbody></table>
        {!preview.videos.length && <p className="p-6 text-center text-sm text-zinc-500">没有匹配记录，可调整条件后重新预览。</p>}
      </div>
      <p className="text-xs leading-6 text-zinc-500">已清理且未变化的文件会进入导入忽略列表，避免目录自动检测马上加回。文件大小或修改时间变化后可重新导入；需要恢复记录时也可打开清理前的数据库备份。</p>
      {confirming ? <div role="alert" className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><p className="text-sm text-amber-200">将备份数据库并移除所选 {selected.size} 条记录及分类关联，视频文件保留。预览后发生变化的记录会跳过。</p><div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void run(async () => { const result = await window.videosorter!.applyConditionalCleanup(preview.previewId, Array.from(selected)); onSnapshot(result.snapshot); const text = `已移除 ${result.deletedCount} 条记录，跳过 ${result.skipped} 条变化记录。视频文件保留。${result.backupPath ? `备份：${result.backupPath}` : ''}`; setPreview(null); setSelected(new Set()); setConfirming(false); setMessage(text); onStatus(text) })}>确认备份并移除记录</Button><Button disabled={busy} variant="secondary" onClick={() => setConfirming(false)}>返回选择</Button></div></div> : <Button disabled={busy || !selected.size} onClick={() => setConfirming(true)}>清理所选 {selected.size} 条记录</Button>}
    </section>}
    {message && <p role="status" className="break-all rounded-lg bg-zinc-800 p-3 text-sm leading-6 text-zinc-300">{message}</p>}
  </div>
}
