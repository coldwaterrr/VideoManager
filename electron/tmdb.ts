import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getDatabaseHandle, persistDatabase } from './database'

type TMDBConfig = {
  apiKey: string
}

let config: TMDBConfig | null = null

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'tmdb-config.json')
}

async function loadConfig(): Promise<TMDBConfig | null> {
  try {
    const raw = await fs.readFile(getConfigPath(), 'utf-8')
    config = JSON.parse(raw)
  } catch {
    config = null
  }
  return config
}

export async function getTMDBConfig(): Promise<{ apiKey: string | null }> {
  await loadConfig()
  return { apiKey: config?.apiKey ?? null }
}

export async function setTMDBConfig(apiKey: string): Promise<void> {
  config = { apiKey }
  await fs.writeFile(getConfigPath(), JSON.stringify({ apiKey }, null, 2))
}

async function tmdbFetch(endpoint: string): Promise<any> {
  await loadConfig()
  if (!config?.apiKey) {
    throw new Error('TMDB API Key 未配置')
  }

  const url = `https://api.themoviedb.org/3${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${config.apiKey}&language=zh-CN`
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`TMDB API 错误: ${resp.status}`)
  }
  return resp.json()
}

/** 从文件名提取搜索关键词 */
export function extractSearchTerm(filename: string): { query: string; year?: number } {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')

  // 1. 先提取年份（支持多种格式: 2024年, [2024], (2024), 空格2024等）
  const yearMatch = nameWithoutExt.match(/((?:19|20)\d{2})[年\]\)\s]?/)
  const year = yearMatch ? parseInt(yearMatch[1]) : undefined

  // 2. 去掉方括号/圆括号内容（包含网站、字幕组、分辨率等噪声）
  let cleaned = nameWithoutExt
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^\)]*\)/g, ' ')
    // 去掉常见分辨率和质量标签
    .replace(/\b(?:WEB-DL|WEBDL|BluRay|BDRip|HDTV|HDRip|CAM|DTS|AC3|DD5[.]1|1080p|720p|480p|4K|2K|2160p|WEBRip|DVB|HDR|SDR|x264|x265|h264|h265|HEVC|AVC|AMZN|NF|WEB|AAC|DD5|HEVC|AV1|AAC|DDP|Dolby|DVDRip|HDTS|HDCAM|TS|TC|DVD|BD|Rip)\b/gi, ' ')
    // 去掉分隔符
    .replace(/[-_.]+/g, ' ')
    // 去掉 trailer/preview 等
    .replace(/trailer|preview|teaser|clip/gi, '')
    // 去掉年份数字（已在步骤1提取）
    .replace(/((?:19|20)\d{2})[年\]\)\s]?/, ' ')
    .trim()

  // 3. 提取中文部分 — 但只取有意义的短文本（电影名通常2-6个字）
  const chineseParts = cleaned.match(/[\u4e00-\u9fa5·]+/g) || []

  // 过滤掉明显不是片名的长描述性文本（超过10个字的片段）和极短无意义片段
  const meaningful = chineseParts.filter(p => p.length <= 10 && p.length >= 2)

  // 4. 尝试从中文片段中识别出片名
  // 策略：有《》书名号的优先取书名号内容
  const bracketed = nameWithoutExt.match(/《([^》]+)》/)
  if (bracketed) {
    return { query: bracketed[1], year }
  }

  // 没有书名号：用过滤后的中文片段拼接（限制总长度避免噪声过多）
  let chineseText = meaningful.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim()

  // 有中文用中文搜，没有再用英文搜
  if (chineseText.length >= 2) {
    return { query: chineseText, year }
  }

  const query = cleaned.replace(/\s+/g, ' ').trim()
  return { query: query || nameWithoutExt, year }
}

async function searchMovie(query: string, year?: number): Promise<any> {
  let endpoint = `/search/movie?query=${encodeURIComponent(query)}`
  if (year) endpoint += `&year=${year}`
  return tmdbFetch(endpoint)
}

async function searchTv(query: string, year?: number): Promise<any> {
  let endpoint = `/search/tv?query=${encodeURIComponent(query)}`
  if (year) endpoint += `&first_air_date_year=${year}`
  return tmdbFetch(endpoint)
}

async function getMovieDetails(id: number): Promise<any> {
  return tmdbFetch(`/movie/${id}?append_to_response=credits`)
}

async function getTvDetails(id: number): Promise<any> {
  return tmdbFetch(`/tv/${id}?append_to_response=credits`)
}

export async function scrapeVideoMetadata(
  videoId: number,
  filename: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { query, year } = extractSearchTerm(filename)
    if (!query || query.length < 2) {
      return { success: false, message: '文件名太短，无法识别' }
    }

    let movieResult: any = null
    try {
      movieResult = await searchMovie(query, year)
    } catch {
      // ignore
    }

    let tvResult: any = null
    if (!movieResult?.results?.[0] || (movieResult.results[0].vote_count || 0) < 5) {
      try {
        tvResult = await searchTv(query, year)
      } catch {
        // ignore
      }
    }

    type Candidate = {
      id: number
      title: string
      originalTitle: string
      releaseDate: string
      posterPath: string
      backdropPath: string
      overview: string
      voteAverage: number
      voteCount: number
      mediaType: 'movie' | 'tv'
      genreIds: number[]
      castNames: string[]
    }

    let best: Candidate | null = null

    if (movieResult?.results?.[0]) {
      const r = movieResult.results[0]
      const details = await getMovieDetails(r.id).catch(() => null)
      const castNames = details?.credits?.cast?.slice(0, 5).map((c: any) => c.name) || []
      best = {
        id: r.id,
        title: r.title,
        originalTitle: r.original_title,
        releaseDate: r.release_date,
        posterPath: r.poster_path,
        backdropPath: r.backdrop_path,
        overview: r.overview,
        voteAverage: r.vote_average || 0,
        voteCount: r.vote_count || 0,
        mediaType: 'movie' as const,
        genreIds: r.genre_ids || [],
        castNames,
      }
    }

    if (tvResult?.results?.[0]) {
      const r = tvResult.results[0]
      const details = await getTvDetails(r.id).catch(() => null)
      const castNames = details?.credits?.cast?.slice(0, 5).map((c: any) => c.name) || []
      const tvCandidate: Candidate = {
        id: r.id,
        title: r.name,
        originalTitle: r.original_name,
        releaseDate: r.first_air_date,
        posterPath: r.poster_path,
        backdropPath: r.backdrop_path,
        overview: r.overview,
        voteAverage: r.vote_average || 0,
        voteCount: r.vote_count || 0,
        mediaType: 'tv' as const,
        genreIds: r.genre_ids || [],
        castNames,
      }

      if (tvCandidate.voteCount >= 5) {
        if (!best || tvCandidate.voteAverage > best.voteAverage ||
            (tvCandidate.voteAverage === best.voteAverage && tvCandidate.voteCount > best.voteCount)) {
          best = tvCandidate
        }
      }
    }

    if (!best || (best.voteCount < 5 && !best.posterPath)) {
      return { success: false, message: '未找到匹配的影视信息' }
    }

    const { database: db, databaseMeta: meta } = getDatabaseHandle()
    const now = new Date().toISOString()

    db.run(
      `UPDATE videos SET
        tmdb_id = ?, media_type = ?, title = ?, original_title = ?,
        overview = ?, poster_path = ?, backdrop_path = ?, release_date = ?,
        vote_average = ?, vote_count = ?, genre_ids = ?, cast_names = ?,
        scraped_at = ?
       WHERE id = ?`,
      [
        best.id,
        best.mediaType,
        best.title,
        best.originalTitle,
        best.overview,
        best.posterPath,
        best.backdropPath,
        best.releaseDate,
        best.voteAverage,
        best.voteCount,
        JSON.stringify(best.genreIds),
        JSON.stringify(best.castNames),
        now,
        videoId,
      ],
    )

    await persistDatabase(db, meta.databasePath)

    return { success: true, message: `${best.title} (${best.releaseDate?.slice(0, 4)})` }
  } catch (error) {
    return { success: false, message: `刮削失败: ${error instanceof Error ? error.message : '未知错误'}` }
  }
}
