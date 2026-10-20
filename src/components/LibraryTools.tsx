import { useEffect, useState } from 'react'
import { X, Plus, Trash2, LoaderCircle, FolderOpen } from 'lucide-react'
import { Button } from './ui/button'
import { MissingCleanupPanel, ConditionalCleanupPanel } from './CleanupPanels'

type Tab = 'monitor' | 'cleanup' | 'conditional' | 'rules'
const formats = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.flv', '.ts', '.mts', '.m2ts', '.mpeg', '.mpg']
const field = 'rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 w-full'

export function LibraryTools({ videos, initialTab, onClose, onSnapshot, onStatus }: { videos: VideoRecord[]; initialTab: Tab; onClose: () => void; onSnapshot: (snapshot: LibrarySnapshot) => void; onStatus: (message: string) => void }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [monitors, setMonitors] = useState<MonitorDirectory[]>([])
  const [config, setConfig] = useState<ClassificationConfig>({ autoOnImport: false, rules: [] })
  const [preview, setPreview] = useState<AIClassificationFolder[] | null>(null)
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  const [loaded, setLoaded] = useState(false)
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  useEffect(() => {
    let active = true
    Promise.all([window.videosorter!.getMonitors(), window.videosorter!.getClassificationConfig()]).then(([items, rules]) => {
      if (active) { setMonitors(items); setConfig(rules); setLoaded(true) }
    }).catch(error => { if (active) setMessage(String(error)) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [])
  function updateMonitor(index: number, value: Partial<MonitorDirectory>) {
    setMonitors(items => items.map((item, i) => i === index ? { ...item, ...value } : item))
  }
  function updateRule(index: number, value: Partial<ClassificationConfig['rules'][number]>) {
    setPreview(null)
    setConfig(previous => ({ ...previous, rules: previous.rules.map((rule, i) => i === index ? { ...rule, ...value } : rule) }))
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="资源库管理">
    <section className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <h2 className="text-lg font-semibold">资源库管理</h2>
        <button title="关闭资源库管理" disabled={busy} onClick={onClose} className="rounded-lg p-2 hover:bg-zinc-800 disabled:opacity-40"><X className="size-5" /></button>
      </header>
      <nav className="flex flex-wrap gap-2 border-b border-zinc-800 px-6 py-3">
        {([['monitor', '目录自动检测'], ['cleanup', '失效路径清理'], ['conditional', '条件清理'], ['rules', '规则分类']] as const).map(([key, label]) => <button key={key} disabled={busy} onClick={() => { setTab(key); setMessage('') }} className={`rounded-lg px-4 py-2 text-sm ${tab === key ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400 hover:bg-zinc-800'}`}>{label}</button>)}
      </nav>
      <div className="space-y-5 overflow-y-auto p-6">
        {tab === 'monitor' && <>
          <p className="text-sm leading-6 text-zinc-400">按目录定时增量检测，只导入新增或发生变化的视频。程序运行或缩到托盘时生效；退出后停止。大小单位为 MB，最大值 0 表示不限。最近写入的文件会等待稳定后导入。</p>
          {monitors.map((item, index) => <div key={item.id} className="space-y-4 rounded-xl border border-zinc-700 p-4">
            <div className="flex items-center gap-3">
              <label className="flex shrink-0 items-center gap-2 text-sm"><input type="checkbox" checked={item.enabled} onChange={e => updateMonitor(index, { enabled: e.target.checked })} />启用</label>
              <span title={item.directory} className="flex-1 truncate text-sm text-zinc-200">{item.directory}</span>
              <button title="移除监控目录" onClick={() => setMonitors(items => items.filter((_, i) => i !== index))} className="p-2 text-zinc-400 hover:text-red-400"><Trash2 className="size-4" /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="space-y-2 text-xs text-zinc-400">最小大小 (MB)<input aria-label={`最小大小 ${index + 1}`} type="number" min="0" step="any" className={field} value={item.minSizeMB || 0} onChange={e => updateMonitor(index, { minSizeMB: Number(e.target.value) })} /></label>
              <label className="space-y-2 text-xs text-zinc-400">最大大小 (MB)<input aria-label={`最大大小 ${index + 1}`} type="number" min="0" step="any" className={field} value={item.maxSizeMB || 0} onChange={e => updateMonitor(index, { maxSizeMB: Number(e.target.value) })} /></label>
              <label className="space-y-2 text-xs text-zinc-400">检测间隔 (秒)<input type="number" min="15" max="86400" className={field} value={item.intervalSeconds} onChange={e => updateMonitor(index, { intervalSeconds: Number(e.target.value) })} /></label>
              <label className="space-y-2 text-xs text-zinc-400">写入稳定时间 (秒)<input type="number" min="10" className={field} value={item.settleSeconds || 10} onChange={e => updateMonitor(index, { settleSeconds: Number(e.target.value) })} /></label>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={item.recursive !== false} onChange={e => updateMonitor(index, { recursive: e.target.checked })} />包含子目录</label>
            <div className="flex flex-wrap gap-2">{formats.map(format => <label key={format} className="flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-xs"><input type="checkbox" checked={(item.formats || formats).includes(format)} onChange={e => updateMonitor(index, { formats: e.target.checked ? [...(item.formats || formats), format] : (item.formats || formats).filter(value => value !== format) })} />{format.slice(1).toUpperCase()}</label>)}</div>
          </div>)}
          {!monitors.length && <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">添加常用视频目录，后续文件会自动进入资源库。</div>}
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={busy || !loaded} onClick={() => void run(async () => { const directory = await window.videosorter!.pickDirectory(); if (directory) setMonitors(items => [...items, { id: crypto.randomUUID(), directory, enabled: true, intervalSeconds: 60, minSizeMB: 0, maxSizeMB: 0, formats: [...formats], recursive: true, settleSeconds: 10 }]) })}><FolderOpen className="mr-2 size-4" />添加目录</Button>
            <Button disabled={busy || !loaded} onClick={() => void run(async () => { setMonitors(await window.videosorter!.saveMonitors(monitors)); setMessage('自动检测配置已保存，将在下一轮检测时生效。') })}>保存检测配置</Button>
            <Button variant="secondary" disabled={busy || !loaded} onClick={() => void run(async () => { setMonitors(await window.videosorter!.saveMonitors(monitors)); const result = await window.videosorter!.checkMonitors(); setMessage(result.busy ? '已有检测任务正在运行。' : `检测完成：新增 ${result.added || 0}，更新 ${result.updated || 0}${result.errors?.length ? `；${result.errors.join('；')}` : ''}`) })}>保存并立即检测</Button>
          </div>
        </>}
        {tab === 'cleanup' && <MissingCleanupPanel onSnapshot={onSnapshot} onStatus={onStatus} />}
        {tab === 'conditional' && <ConditionalCleanupPanel onSnapshot={onSnapshot} onStatus={onStatus} />}
        {tab === 'rules' && <>
          <p className="text-sm leading-6 text-zinc-400">为未分类视频设置关键词规则。多个关键词用逗号分隔，命中任一词即加入分类；一个视频可以属于多个分类。先预览，再应用。AI 分类仍可通过主界面的 AI 按钮使用。</p>
          <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={config.autoOnImport} onChange={e => setConfig(previous => ({ ...previous, autoOnImport: e.target.checked }))} />导入新视频后自动应用已保存的规则</label>
          {config.rules.map((rule, index) => <div key={index} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-zinc-700 p-4 sm:grid-cols-[1fr_120px_2fr_auto]">
            <input className={field} aria-label={`分类名称 ${index + 1}`} placeholder="分类名称" value={rule.name} onChange={e => updateRule(index, { name: e.target.value })} />
            <select className={field} value={rule.target} onChange={e => updateRule(index, { target: e.target.value as 'name' | 'path' })}><option value="name">文件名</option><option value="path">完整路径</option></select>
            <input className={field} aria-label={`关键词 ${index + 1}`} placeholder="例如：奶蛙, frog, 舞蹈" value={rule.keywords.join(',')} onChange={e => updateRule(index, { keywords: e.target.value.split(/[,，]/) })} />
            <button title="移除分类规则" className="p-2 text-zinc-400 hover:text-red-400" onClick={() => { setPreview(null); setConfig(previous => ({ ...previous, rules: previous.rules.filter((_, i) => i !== index) })) }}><Trash2 className="size-4" /></button>
          </div>)}
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={busy || !loaded} onClick={() => { setPreview(null); setConfig(previous => ({ ...previous, rules: [...previous.rules, { name: '', keywords: [], target: 'name' }] })) }}><Plus className="mr-2 size-4" />添加规则</Button>
            <Button variant="secondary" disabled={busy || !loaded} onClick={() => void run(async () => { setConfig(await window.videosorter!.saveClassificationConfig(config)); setPreview(null); setMessage('规则已保存。') })}>保存规则</Button>
            <Button disabled={busy || !loaded} onClick={() => void run(async () => { setConfig(await window.videosorter!.saveClassificationConfig(config)); setPreview(await window.videosorter!.previewClassificationRules()); setMessage('预览已生成，核对后点击应用。') })}>保存并预览</Button>
          </div>
          {preview && <div className="space-y-3 rounded-xl border border-violet-500/30 p-4">
            {preview.length ? preview.map((group, index) => <details key={index} className="text-sm"><summary className="cursor-pointer">{group.name}<span className="ml-3 text-zinc-400">{group.videoIds.length} 个视频 · 展开核对</span></summary><div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-zinc-500">{group.videoIds.map(id => <div className="truncate" key={id}>{videos.find(video => video.id === id)?.name || `视频 #${id}`}</div>)}</div></details>) : <p className="text-sm text-zinc-400">没有匹配的未分类视频。</p>}
            <Button disabled={busy || !preview.length} onClick={() => void run(async () => { const result = await window.videosorter!.aiApply(preview); if (result.snapshot) onSnapshot(result.snapshot); setMessage(result.message); onStatus(result.message); setPreview(null) })}>应用以上分类</Button>
          </div>}
        </>}
        {busy && <div className="flex items-center gap-2 text-sm text-violet-300"><LoaderCircle className="size-4 animate-spin" />正在处理…</div>}
        {message && <p role="status" className="break-all rounded-lg bg-zinc-800 p-3 text-sm leading-6 text-zinc-300">{message}</p>}
      </div>
    </section>
  </div>
}
