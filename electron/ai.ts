import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

type AIConfig = {
  apiKey: string
  baseUrl: string
  model: string
}

export type ClassificationFolder = {
  name: string
  videoIds: number[]
  existing?: boolean
}

export type ClassificationResult = {
  folders: ClassificationFolder[]
}

const DEFAULT_CONFIG: AIConfig = {
  apiKey: '',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'qwen/qwen3.6-plus:free',
}

const BATCH_SIZE = 25

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'ai-config.json')
}

export async function loadAIConfig(): Promise<AIConfig> {
  try {
    const raw = await fs.readFile(getConfigPath(), 'utf-8')
    const saved = JSON.parse(raw) as Partial<AIConfig>
    return { ...DEFAULT_CONFIG, ...saved }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  await fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2))
}

/** 测试 API 连接 */
export async function testAIConnection(config: AIConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.apiKey) {
    return { ok: false, message: '请输入 API Key' }
  }
  try {
    const resp = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': 'https://github.com/coldwaterrr/VideoManager',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: '回复 OK' }],
        max_tokens: 10,
      }),
    })
    if (!resp.ok) {
      const err = await resp.text()
      return { ok: false, message: `HTTP ${resp.status}: ${err}` }
    }
    return { ok: true, message: '连接成功' }
  } catch (e: any) {
    return { ok: false, message: `连接失败: ${e.message}` }
  }
}

// ============ JSON 修复 ============

/** 尝试修复常见的 JSON 格式问题 */
function repairJSON(raw: string): string {
  let s = raw.trim()

  // 去除 markdown 代码块
  const codeBlockMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (codeBlockMatch) {
    s = codeBlockMatch[1].trim()
  }

  // 尝试定位第一个 { 和最后一个 }
  const firstBrace = s.indexOf('{')
  const lastBrace = s.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1)
  }

  // 修复尾部逗号 (最常见的问题)
  s = s.replace(/,(\s*[}\]])/g, '$1')

  // 修复单引号 key/string value（保守处理：只替换明显的位置）
  // 不处理太复杂的嵌套引号情况

  return s
}

/** 尝试解析 JSON，失败则尝试修复后重试 */
function tryParseJSON(raw: string): ClassificationResult | null {
  // 第 1 次：直接解析
  try {
    return JSON.parse(raw) as ClassificationResult
  } catch {
    // ignore
  }

  // 第 2 次：修复后解析
  const repaired = repairJSON(raw)
  try {
    return JSON.parse(repaired) as ClassificationResult
  } catch {
    // ignore
  }

  return null
}

// ============ Prompt 构建 ============

function buildSystemPrompt(existingFolders: string[]): string {
  const existingHint = existingFolders.length > 0
    ? `\n已有虚拟文件夹（请优先将视频归入这些文件夹，不要创建名称功能重复的新文件夹）：\n${existingFolders.map(f => `- ${f}`).join('\n')}`
    : ''

  return `你是一个专业的电影/视频分类助手。请将视频分配到合适的文件夹。

要求：
1. 每个视频必须恰好属于一个文件夹，不能遗漏
2. 文件夹名使用中文，简洁明了（2-6字），通用化命名（如"动作片"而非"复仇者联盟系列"）
3. 返回严格的 JSON 格式，不要输出任何其他内容
4. 综合参考视频的文件名、文件路径、TMDB 标题和简介来判断类型
5. 优先将视频归入已有文件夹（如果给定），避免创建功能重复的新文件夹
6. 无法明确归类的视频放入"其他未分类"文件夹
7. 文件名中的技术标签（分辨率如 1080p/4K/2160p、编码如 x264/x265/HEVC、字幕组名、网站名）请忽略

${existingHint}

示例输入：
[{"id":1,"name":"[crazecat]2024年美国喜剧爱情片《阿诺拉》1080P.HD.中英双字.mp4","path":"D:\\Movies\\阿诺拉.mp4","title":"阿诺拉"}]

示例输出：
{"folders":[{"name":"喜剧片","videoIds":[1]}]}

第二个示例：
输入：
[{"id":2,"name":"Oppenheimer.2023.2160p.WEB-DL.HDR.x265.DTS.mkv","path":"D:\\Movies\\Oppenheimer.mkv","title":"奥本海默"},{"id":3,"name":"The.Matrix.1999.BluRay.1080p.x264.mkv","path":"D:\\Movies\\Matrix.mkv","title":"黑客帝国"}]

输出：
{"folders":[{"name":"剧情片","videoIds":[2]},{"name":"科幻片","videoIds":[3]}]}`
}

function buildUserPrompt(
  videos: { id: number; name: string; path: string; title?: string | null; overview?: string | null }[],
  rule: string,
  batchInfo?: { batch: number; totalBatches: number },
): string {
  const batchHint = batchInfo
    ? `（第 ${batchInfo.batch}/${batchInfo.totalBatches} 批）`
    : ''

  return `分类规则：${rule}

未分类视频列表${batchHint}（共 ${videos.length} 部）：
${JSON.stringify(videos, null, 2)}

请返回以下 JSON 格式（只返回 JSON，不要其他内容）：
{"folders":[{"name":"文件夹名","videoIds":[视频id数组]}]}

注意：
- 每个视频 ID 必须恰好出现在一个文件夹中
- 不要创造空文件夹
- 如果视频的 TMDB 信息（title/overview）可用，优先用它来判断类别
- 结合文件名（name）和文件路径（path）一起判断类别，但忽略技术标签`
}

// ============ 流式 API 调用 ============

async function callAIStream(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
  onChunk: (chunk: { reasoning?: string; content: string }) => void,
  signal?: AbortSignal,
): Promise<string> {
  const resp = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'HTTP-Referer': 'https://github.com/coldwaterrr/VideoManager',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.3,
      stream: true,
    }),
    signal,
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`API 错误 (${resp.status}): ${errText}`)
  }

  if (!resp.body) {
    throw new Error('响应体为空')
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) continue

      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta

        if (delta?.reasoning) {
          onChunk({ reasoning: delta.reasoning, content: '' })
        }
        if (delta?.content) {
          fullContent += delta.content
          onChunk({ content: delta.content })
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  return fullContent
}

// ============ 单批分类 ============

async function classifyBatch(
  videos: { id: number; name: string; path: string; title?: string | null; overview?: string | null }[],
  rule: string,
  config: AIConfig,
  existingFolders: string[],
  onChunk: (chunk: { reasoning?: string; content: string }) => void,
  signal?: AbortSignal,
): Promise<ClassificationResult> {
  const systemPrompt = buildSystemPrompt(existingFolders)
  const userPrompt = buildUserPrompt(videos, rule)

  let fullContent = await callAIStream(config, systemPrompt, userPrompt, onChunk, signal)

  if (!fullContent) {
    throw new Error('AI 返回结果为空')
  }

  // 尝试解析
  const result = tryParseJSON(fullContent)
  if (result && result.folders && Array.isArray(result.folders)) {
    return result
  }

  // JSON 解析失败，重试一次
  const retryUserPrompt = userPrompt + `\n\n你上次的回复格式不正确，请严格按照 JSON 格式输出，不要包含其他文字：`

  const retryContent = await callAIStream(config, systemPrompt, retryUserPrompt, onChunk, signal)

  if (!retryContent) {
    throw new Error('AI 重试后返回结果仍为空')
  }

  const retryResult = tryParseJSON(retryContent)
  if (retryResult && retryResult.folders && Array.isArray(retryResult.folders)) {
    return retryResult
  }

  throw new Error('AI 返回的 JSON 格式不正确，请重试分类')
}

// ============ 主分类函数 ============

/** 调用 AI 进行视频分类（分批处理、流式输出、支持取消） */
export async function aiClassifyVideosStream(
  videos: { id: number; name: string; path: string; title?: string | null; overview?: string | null }[],
  rule: string,
  config: AIConfig,
  existingFolders: string[],
  onChunk: (chunk: { type?: string; reasoning?: string; content?: string; batch?: number; totalBatches?: number; message?: string; folders?: ClassificationFolder[] }) => void,
  signal?: AbortSignal,
): Promise<{ success: boolean; message: string; result?: ClassificationResult }> {
  if (!config.apiKey) {
    return { success: false, message: '请先配置 API Key' }
  }
  if (!rule || rule.trim().length < 2) {
    return { success: false, message: '请输入分类规则' }
  }
  if (videos.length === 0) {
    return { success: false, message: '没有未分类的视频' }
  }

  const videoList = videos.map((v) => ({
    id: v.id,
    name: v.name,
    path: v.path,
    title: v.title || null,
    overview: v.overview || null,
  }))

  // 分批处理
  const totalBatches = Math.ceil(videoList.length / BATCH_SIZE)
  const allFolders: Map<string, { videoIds: number[]; existing: boolean }> = new Map()
  const existingSet = new Set(existingFolders.map((f) => f.toLowerCase()))

  for (let batch = 0; batch < totalBatches; batch++) {
    if (signal?.aborted) {
      return { success: false, message: '分类已被取消' }
    }

    const start = batch * BATCH_SIZE
    const batchVideos = videoList.slice(start, start + BATCH_SIZE)

    onChunk({
      type: 'progress',
      batch: batch + 1,
      totalBatches,
      message: `正在分类第 ${batch + 1}/${totalBatches} 批（${batchVideos.length} 个视频）...`,
    })

    try {
      const batchResult = await classifyBatch(
        batchVideos,
        rule,
        config,
        existingFolders,
        (chunk) => onChunk({ type: chunk.reasoning ? 'reasoning' : 'content', ...chunk }),
        signal,
      )

      if (signal?.aborted) {
        return { success: false, message: '分类已被取消' }
      }

      // 合并到总结果
      for (const folder of batchResult.folders) {
        const key = folder.name.toLowerCase()
        const isExisting = existingSet.has(key)
        const existing = allFolders.get(key)

        if (existing) {
          existing.videoIds.push(...folder.videoIds)
        } else {
          allFolders.set(key, {
            videoIds: folder.videoIds,
            existing: isExisting || (folder as any).existing === true,
          })
        }
        // 将新出现的文件夹名也加入 existingSet，后续批次可复用
        if (!existingSet.has(key)) {
          existingSet.add(key)
        }
      }

      onChunk({
        type: 'summary',
        batch: batch + 1,
        totalBatches,
        message: `第 ${batch + 1}/${totalBatches} 批完成`,
        folders: Array.from(allFolders.entries()).map(([name, data]) => ({
          name: data.existing ? name : (allFolders.get(name)?.existing ? name : name),
          videoIds: data.videoIds,
          existing: data.existing,
        })),
      })
    } catch (e: any) {
      if (signal?.aborted) {
        return { success: false, message: '分类已被取消' }
      }
      return { success: false, message: `第 ${batch + 1}/${totalBatches} 批分类失败: ${e.message}` }
    }
  }

  // 构建最终结果
  const folders: ClassificationFolder[] = Array.from(allFolders.entries()).map(([name, data]) => ({
    name: data.existing
      ? (existingFolders.find((f) => f.toLowerCase() === name.toLowerCase()) || name)
      : name,
    videoIds: data.videoIds,
    existing: data.existing,
  }))

  // 验证所有视频是否都被分配
  const assignedIds = new Set<number>()
  for (const folder of folders) {
    for (const vid of folder.videoIds) {
      assignedIds.add(vid)
    }
  }
  const allVideoIds = new Set(videoList.map((v) => v.id))
  const missing = [...allVideoIds].filter((id) => !assignedIds.has(id))
  if (missing.length > 0) {
    return {
      success: false,
      message: `AI 遗漏了 ${missing.length} 个视频（ID: ${missing.join(', ')}），请重试`,
    }
  }

  return { success: true, message: '分类完成', result: { folders } }
}
