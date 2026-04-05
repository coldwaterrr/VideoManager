import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

type AIConfig = {
  apiKey: string
  baseUrl: string
  model: string
}

export type ClassificationResult = {
  folders: { name: string; videoIds: number[] }[]
}

const DEFAULT_CONFIG: AIConfig = {
  apiKey: '',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'qwen/qwen3.6-plus:free',
}

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

/** 调用 AI 进行视频分类 */
export async function aiClassifyVideos(
  videos: { id: number; name: string; path: string; title?: string | null; overview?: string | null }[],
  rule: string,
  config: AIConfig,
  onProgress?: (done: number, total: number) => void,
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
    title: v.title || null,
    overview: v.overview || null,
  }))

  const systemPrompt = `你是一个专业的电影/视频分类助手。请将视频分配到合适的文件夹。

要求：
1. 每个视频必须属于一个文件夹，不能遗漏
2. 文件夹名使用中文，简洁明了（2-6字）
3. 返回严格的 JSON 格式，不要输出其他内容
4. 请根据 TMDB 标题和简介来判断类型（如果有的话），不要仅根据文件名判断
5. 文件夹名称应该通用化，比如"动作片"而不是"复仇者联盟"`

  const userPrompt = `分类规则：${rule}

未分类视频列表（共 ${videos.length} 部）：
${JSON.stringify(videoList, null, 2)}

请返回以下 JSON 格式（只返回 JSON，不要其他内容）：
{"folders": [{"name": "文件夹名", "videoIds": [视频id数组]}]}

注意：
- 每个视频 ID 必须恰好出现在一个文件夹中
- 不要创造空文件夹
- 如果视频的 TMDB 信息可用，优先使用它来判断`

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
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      return { success: false, message: `API 错误 (${resp.status}): ${errText}` }
    }

    const data = await resp.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return { success: false, message: 'AI 返回结果为空' }
    }

    // 尝试解析 JSON（处理可能的 markdown 代码块包裹）
    let jsonStr = content.trim()
    // 移除可能的 markdown 代码块
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    }

    const result = JSON.parse(jsonStr) as ClassificationResult

    // 验证结果格式
    if (!result.folders || !Array.isArray(result.folders)) {
      return { success: false, message: 'AI 返回的结果格式不正确，缺少 folders 数组' }
    }

    // 验证所有视频是否都被分配
    const assignedIds = new Set<number>()
    for (const folder of result.folders) {
      for (const vid of folder.videoIds) {
        assignedIds.add(vid)
      }
    }
    const allVideoIds = new Set(videos.map((v) => v.id))
    const missing = [...allVideoIds].filter((id) => !assignedIds.has(id))
    if (missing.length > 0) {
      return {
        success: false,
        message: `AI 遗漏了 ${missing.length} 个视频（ID: ${missing.join(', ')}），请重试`,
      }
    }

    return { success: true, message: '分类完成', result }
  } catch (e: any) {
    return { success: false, message: `分类失败: ${e.message}` }
  }
}
