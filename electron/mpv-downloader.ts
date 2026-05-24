import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import https from 'node:https'
import http from 'node:http'
import { execSync } from 'node:child_process'
import { URL } from 'node:url'

export interface MpvDownloadProgress {
  stage: 'checking' | 'downloading_7za' | 'downloading_mpv' | 'extracting' | 'installing' | 'complete' | 'error'
  percent: number
  message: string
}

const GITHUB_API_LATEST = 'https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest'
const SEVEN_ZIP_URL = 'https://www.7-zip.org/a/7za920.zip'

// 防止并发下载
let downloadPromise: Promise<{ success: boolean; message: string }> | null = null

export function isMpvDownloading(): boolean {
  return downloadPromise !== null
}

export function isMpvInstalled(mpvPath: string): boolean {
  if (!mpvPath) return false
  if (mpvPath.endsWith('.exe') && fs.existsSync(mpvPath)) return true
  for (const name of ['mpv.exe', 'mpv.com']) {
    if (fs.existsSync(path.join(mpvPath, name))) return true
  }
  try {
    const entries = fs.readdirSync(mpvPath)
    for (const entry of entries) {
      if (entry.startsWith('mpv') && (entry.endsWith('.exe') || entry.endsWith('.com'))) {
        return true
      }
    }
  } catch { /* ignore */ }
  return false
}

function getTempDir(): string {
  const dir = path.join(os.tmpdir(), 'videomanager-mpv-setup')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function httpsRequest(urlStr: string, options?: { headers?: Record<string, string>; maxRedirects?: number }): Promise<{ statusCode: number; headers: Record<string, string>; stream: http.IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const maxRedirects = options?.maxRedirects ?? 5
    const doRequest = (url: string, redirects: number) => {
      const parsed = new URL(url)
      const mod = parsed.protocol === 'https:' ? https : http
      const req = mod.get(
        url,
        {
          headers: {
            ...options?.headers,
            'User-Agent': 'VideoSorter/1.0',
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirects >= maxRedirects) {
              reject(new Error(`Too many redirects (${res.statusCode})`))
              return
            }
            const redirectUrl = new URL(res.headers.location, url).toString()
            res.resume() // drain response
            doRequest(redirectUrl, redirects + 1)
            return
          }
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'error'}`))
            res.resume()
            return
          }
          resolve({ statusCode: res.statusCode, headers: res.headers as Record<string, string>, stream: res })
        },
      )
      req.on('error', reject)
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')) })
    }
    doRequest(urlStr, 0)
  })
}

function readStreamToBuffer(stream: http.IncomingMessage, contentLength: number, onProgress?: (percent: number) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let downloaded = 0
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      downloaded += chunk.length
      if (contentLength && onProgress) {
        onProgress(Math.round((downloaded / contentLength) * 100))
      }
    })
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

function readStreamToText(stream: http.IncomingMessage): Promise<string> {
  return readStreamToBuffer(stream, 0).then((buf) => buf.toString('utf-8'))
}

async function downloadFile(url: string, destPath: string, onProgress?: (percent: number) => void): Promise<void> {
  const { headers, stream } = await httpsRequest(url)
  const total = parseInt(headers['content-length'] || '0')
  const buffer = await readStreamToBuffer(stream, total, onProgress)
  fs.writeFileSync(destPath, buffer)
}

async function getLatestMpvDownloadUrl(): Promise<{ url: string; filename: string }> {
  const { stream } = await httpsRequest(GITHUB_API_LATEST, {
    headers: { 'Accept': 'application/vnd.github+json' },
  })
  const text = await readStreamToText(stream)
  const release = JSON.parse(text) as any
  const assets: any[] = release.assets || []

  const mpvAsset = assets.find((a: any) =>
    a.name.includes('mpv') && !a.name.includes('dev') && a.name.includes('x86_64') && a.name.endsWith('.7z') && !a.name.includes('d3d'),
  )

  if (!mpvAsset) {
    throw new Error('在最新 release 中找不到合适的 mpv 下载')
  }

  return { url: mpvAsset.browser_download_url as string, filename: mpvAsset.name as string }
}

async function getSevenZip(targetDir: string, onProgress?: (p: MpvDownloadProgress) => void): Promise<string> {
  const sevenZipPath = path.join(targetDir, '7za.exe')
  if (fs.existsSync(sevenZipPath)) return sevenZipPath

  onProgress?.({ stage: 'downloading_7za', percent: 0, message: '正在下载解压工具...' })

  const tempDir = getTempDir()
  const zipPath = path.join(tempDir, '7za920.zip')

  await downloadFile(SEVEN_ZIP_URL, zipPath, (pct) => {
    onProgress?.({ stage: 'downloading_7za', percent: pct, message: `正在下载解压工具 ${pct}%` })
  })

  onProgress?.({ stage: 'downloading_7za', percent: 100, message: '正在解压工具...' })

  const extractDir = path.join(tempDir, '7za-extract')
  fs.mkdirSync(extractDir, { recursive: true })

  // Windows 10+ has PowerShell Expand-Archive for .zip files
  execSync(
    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
    { stdio: 'pipe', timeout: 30000 },
  )

  const sevenZipExe = path.join(extractDir, '7za.exe')
  if (!fs.existsSync(sevenZipExe)) {
    throw new Error('解压后找不到 7za.exe')
  }

  fs.mkdirSync(targetDir, { recursive: true })
  fs.copyFileSync(sevenZipExe, sevenZipPath)
  return sevenZipPath
}

function findAndCopyMpvFiles(srcDir: string, targetDir: string, depth = 0): boolean {
  if (depth > 5) return false

  // Check current dir for mpv.exe
  for (const name of ['mpv.exe', 'mpv.com']) {
    const exePath = path.join(srcDir, name)
    if (fs.existsSync(exePath)) {
      // Copy all files in this directory to target
      fs.mkdirSync(targetDir, { recursive: true })
      const entries = fs.readdirSync(srcDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile()) {
          const src = path.join(srcDir, entry.name)
          const dest = path.join(targetDir, entry.name)
          if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest)
          }
        }
      }
      return true
    }
  }

  // Search subdirectories
  try {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (findAndCopyMpvFiles(path.join(srcDir, entry.name), targetDir, depth + 1)) {
          return true
        }
      }
    }
  } catch { /* ignore */ }

  return false
}

async function doEnsureMpvInstalled(
  mpvPath: string,
  onProgress?: (p: MpvDownloadProgress) => void,
): Promise<{ success: boolean; message: string }> {
  onProgress?.({ stage: 'checking', percent: 0, message: '正在检查 mpv 播放器...' })

  if (isMpvInstalled(mpvPath)) {
    onProgress?.({ stage: 'complete', percent: 100, message: 'mpv 已就绪' })
    return { success: true, message: 'mpv 已就绪' }
  }

  const targetDir = mpvPath.endsWith('.exe') ? path.dirname(mpvPath) : mpvPath

  // Step 1: Get 7za extractor
  let sevenZipPath: string
  try {
    sevenZipPath = await getSevenZip(targetDir, onProgress)
  } catch (err: any) {
    const msg = `下载解压工具失败: ${err.message || err}`
    onProgress?.({ stage: 'error', percent: 0, message: msg })
    return { success: false, message: msg }
  }

  // Step 2: Get latest mpv download URL
  onProgress?.({ stage: 'downloading_mpv', percent: 0, message: '正在获取最新 mpv 版本...' })

  let archiveUrl: string
  let archiveFilename: string
  try {
    const info = await getLatestMpvDownloadUrl()
    archiveUrl = info.url
    archiveFilename = info.filename
  } catch (err: any) {
    const msg = `获取 mpv 下载地址失败: ${err.message || err}`
    onProgress?.({ stage: 'error', percent: 0, message: msg })
    return { success: false, message: msg }
  }

  // Step 3: Download mpv 7z
  const tempDir = getTempDir()
  const archivePath = path.join(tempDir, archiveFilename)

  await downloadFile(archiveUrl, archivePath, (pct) => {
    onProgress?.({ stage: 'downloading_mpv', percent: pct, message: `正在下载 mpv ${pct}%` })
  })

  // Step 4: Extract
  onProgress?.({ stage: 'extracting', percent: 0, message: '正在解压 mpv...' })

  const extractDir = path.join(tempDir, 'mpv-extract')
  fs.mkdirSync(extractDir, { recursive: true })

  try {
    execSync(`"${sevenZipPath}" x "${archivePath}" -o"${extractDir}" -y`, {
      stdio: 'pipe',
      timeout: 120000,
    })
  } catch (err: any) {
    const msg = `解压 mpv 失败: ${err.message || err}`
    onProgress?.({ stage: 'error', percent: 0, message: msg })
    return { success: false, message: msg }
  }

  // Step 5: Install mpv files
  onProgress?.({ stage: 'installing', percent: 0, message: '正在安装 mpv...' })

  if (!findAndCopyMpvFiles(extractDir, targetDir)) {
    const msg = '解压后找不到 mpv.exe'
    onProgress?.({ stage: 'error', percent: 0, message: msg })
    return { success: false, message: msg }
  }

  // Step 6: Clean up
  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch { /* ignore */ }

  onProgress?.({ stage: 'complete', percent: 100, message: 'mpv 安装完成' })

  return { success: true, message: 'mpv 安装完成' }
}

export async function ensureMpvInstalled(
  mpvPath: string,
  onProgress?: (p: MpvDownloadProgress) => void,
): Promise<{ success: boolean; message: string }> {
  // 如果已有下载进行中，复用同一个 Promise
  if (downloadPromise) {
    onProgress?.({ stage: 'downloading_mpv', percent: 0, message: '下载已在后台进行中...' })
    return downloadPromise
  }

  downloadPromise = doEnsureMpvInstalled(mpvPath, onProgress)
  try {
    return await downloadPromise
  } finally {
    downloadPromise = null
  }
}
