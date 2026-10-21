import { useEffect, useState } from 'react'
import { Layers, LoaderCircle, Search, Trash2 } from 'lucide-react'
import { Dialog } from './Dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'

export function SeriesPanel({
  videos,
  state,
  selectedIds,
  onState,
  onOpenGroup,
  onClose,
}: {
  videos: VideoRecord[]
  state: SeriesState
  selectedIds: number[]
  onState: (value: SeriesState) => void
  onOpenGroup: (id: string) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'smart' | 'directory' | 'name'>('smart')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<SeriesPreview | null>(null)
  const [drafts, setDrafts] = useState<SeriesSuggestion[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'discover' | 'saved'>(
    state.groups.length && selectedIds.length < 2 ? 'saved' : 'discover'
  )
  const [manualName, setManualName] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const byId = new Map(videos.map((video) => [video.id, video]))
  useEffect(() => {
    setNames(Object.fromEntries(state.groups.map((group) => [group.id, group.name])))
  }, [state.groups])
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const selectedGroups = drafts.filter((group) => chosen.has(group.id) && group.videoIds.length >= 2)
  return (
    <Dialog
      title="系列分组"
      description="把同一系列收成一组，展开后浏览。分组保存在当前视频库中，原文件位置保持不变。"
      wide
      busy={busy}
      onClose={onClose}
      className="series-dialog"
    >
      <div className="series-tabs">
        <button aria-pressed={tab === 'discover'} disabled={busy} onClick={() => setTab('discover')}>
          发现系列
        </button>
        <button aria-pressed={tab === 'saved'} disabled={busy} onClick={() => setTab('saved')}>
          已保存（{state.groups.length}）
        </button>
      </div>
      {tab === 'discover' ? (
        <>
          {selectedIds.length >= 2 && (
            <form
              className="manual-series"
              onSubmit={(event) => {
                event.preventDefault()
                void run(async () => {
                  onState(await window.videosorter!.saveSeries(state.databasePath, manualName, selectedIds))
                  setMessage('已将选中视频组成系列。')
                  setTab('saved')
                })
              }}
            >
              <label>
                把已选 {selectedIds.length} 个视频组成系列
                <Input
                  aria-label="手动系列名称"
                  value={manualName}
                  maxLength={100}
                  placeholder="输入系列名称"
                  onChange={(event) => setManualName(event.target.value)}
                />
              </label>
              <Button disabled={busy || !manualName.trim()} type="submit">
                <Layers size={15} />
                创建系列
              </Button>
            </form>
          )}
          <div className="series-discovery">
            <label>
              识别方式
              <select
                aria-label="系列识别方式"
                value={mode}
                disabled={busy}
                onChange={(event) => {
                  setMode(event.target.value as typeof mode)
                  setPreview(null)
                  setDrafts([])
                }}
              >
                <option value="smart">智能规则（本地）</option>
                <option value="name">按编号和相近名称</option>
                <option value="directory">按所在目录</option>
              </select>
            </label>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await window.videosorter!.previewSeries(mode)
                  setPreview(result)
                  setDrafts(result.groups)
                  setChosen(new Set(result.groups.map((group) => group.id)))
                  setMessage(
                    result.groups.length
                      ? `发现 ${result.groups.length} 个候选系列，请核对名称和成员。`
                      : '没有发现新的系列。可换一种方式，或在视频列表勾选后手动组成系列。'
                  )
                })
              }
            >
              {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Search size={15} />}生成分组建议
            </Button>
          </div>
          <p className="field-help">
            只分析尚未归入系列的视频。智能规则忽略“视频、下载”等通用目录；“按目录”会列出所有同目录候选。整个过程在本机完成。
          </p>
          {!!drafts.length && (
            <div className="series-select-all">
              <label>
                <input
                  type="checkbox"
                  aria-label="全选分组建议"
                  checked={chosen.size === drafts.length}
                  onChange={() =>
                    setChosen(
                      chosen.size === drafts.length ? new Set() : new Set(drafts.map((group) => group.id))
                    )
                  }
                />
                全选建议
              </label>
              <span>已选 {selectedGroups.length} 组</span>
            </div>
          )}
          <div className="series-results">
            {drafts.map((group) => (
              <section className="series-suggestion" key={group.id}>
                <div className="series-suggestion-heading">
                  <input
                    type="checkbox"
                    aria-label={`采用系列 ${group.name}`}
                    checked={chosen.has(group.id)}
                    onChange={() =>
                      setChosen((previous) => {
                        const next = new Set(previous)
                        if (next.has(group.id)) next.delete(group.id)
                        else next.add(group.id)
                        return next
                      })
                    }
                  />
                  <Input
                    aria-label={`候选系列名称 ${group.id}`}
                    maxLength={100}
                    value={group.name}
                    onChange={(event) =>
                      setDrafts((previous) =>
                        previous.map((item) =>
                          item.id === group.id ? { ...item, name: event.target.value } : item
                        )
                      )
                    }
                  />
                  <span>{group.videoIds.length} 个视频</span>
                </div>
                <p>
                  {group.reason}
                  {group.confidence === 'high' ? ' · 匹配较强' : ''}
                </p>
                <details>
                  <summary>核对成员</summary>
                  <div className="series-members">
                    {preview!.groups
                      .find((item) => item.id === group.id)!
                      .videoIds.map((id) => (
                        <label key={id} title={byId.get(id)?.absolutePath}>
                          <input
                            type="checkbox"
                            aria-label={`系列成员 ${id}`}
                            checked={group.videoIds.includes(id)}
                            onChange={() =>
                              setDrafts((previous) =>
                                previous.map((item) =>
                                  item.id === group.id
                                    ? {
                                        ...item,
                                        videoIds: item.videoIds.includes(id)
                                          ? item.videoIds.filter((value) => value !== id)
                                          : [...item.videoIds, id],
                                      }
                                    : item
                                )
                              )
                            }
                          />
                          <span>{byId.get(id)?.name || `视频 ${id}`}</span>
                        </label>
                      ))}
                  </div>
                </details>
                {group.videoIds.length < 2 && <p className="field-error">至少保留两个视频后才能采用此组。</p>}
              </section>
            ))}
          </div>
          {preview && preview.groups.length > 0 && (
            <div className="dialog-actions">
              <Button
                disabled={
                  busy || !selectedGroups.length || selectedGroups.some((group) => !group.name.trim())
                }
                onClick={() =>
                  void run(async () => {
                    onState(await window.videosorter!.applySeries({ ...preview, groups: selectedGroups }))
                    setPreview(null)
                    setDrafts([])
                    setTab('saved')
                    setMessage('系列已保存，可以在视频列表中按系列折叠浏览。')
                  })
                }
              >
                保存所选 {selectedGroups.length} 个系列
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="series-results">
          {state.groups.length ? (
            state.groups.map((group) => (
              <section className="series-suggestion" key={group.id}>
                <div className="series-suggestion-heading">
                  <Layers size={17} />
                  <Input
                    aria-label={`已保存系列名称 ${group.id}`}
                    value={names[group.id] ?? group.name}
                    maxLength={100}
                    onChange={(event) =>
                      setNames((previous) => ({ ...previous, [group.id]: event.target.value }))
                    }
                  />
                  <span>{group.videoIds.length} 个视频</span>
                </div>
                <div className="series-saved-actions">
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => onOpenGroup(group.id)}>
                    查看视频
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      busy ||
                      !names[group.id]?.trim() ||
                      names[group.id] === group.name ||
                      group.videoIds.length < 2
                    }
                    onClick={() =>
                      void run(async () => {
                        onState(
                          await window.videosorter!.saveSeries(
                            state.databasePath,
                            names[group.id],
                            group.videoIds,
                            group.id
                          )
                        )
                        setMessage('系列名称已保存。')
                      })
                    }
                  >
                    保存名称
                  </Button>
                  {deleteId === group.id ? (
                    <>
                      <span>仅移除分组关系</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            onState(await window.videosorter!.deleteSeries(state.databasePath, group.id))
                            setDeleteId(null)
                            setMessage('已解散系列，视频记录和文件均已保留。')
                          })
                        }
                      >
                        确认解散
                      </Button>
                      <button className="text-button" onClick={() => setDeleteId(null)}>
                        取消
                      </button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeleteId(group.id)}>
                      <Trash2 size={13} />
                      解散系列
                    </Button>
                  )}
                </div>
                <details>
                  <summary>展开成员</summary>
                  <div className="series-members">
                    {group.videoIds.map((id) => (
                      <p key={id} title={byId.get(id)?.absolutePath}>
                        {byId.get(id)?.name}
                      </p>
                    ))}
                  </div>
                </details>
              </section>
            ))
          ) : (
            <p className="field-help">还没有保存的系列。可以切到“发现系列”生成建议。</p>
          )}
        </div>
      )}
      {message && (
        <p className="series-message" role="status">
          {message}
        </p>
      )}
    </Dialog>
  )
}
