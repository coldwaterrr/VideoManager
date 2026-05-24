const https = require('node:https')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execSync } = require('node:child_process')

const GITHUB_API_LATEST = 'https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest'
const SEVEN_ZIP_URL = 'https://www.7-zip.org/a/7za920.zip'
const PROJECT_MPV_DIR = path.resolve(__dirname, '..', 'mpv')

function log(msg) { console.log(`[mpv-download] ${msg}`) }

function httpsRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const maxRedirects = options.maxRedirects ?? 5
    const doRequest = (url, redirects) => {
      const parsed = new (require('node:url').URL)(url)
      const mod = parsed.protocol === 'https:' ? https : http
      const req = mod.get(url, {
        headers: { ...options.headers, 'User-Agent': 'VideoManager/1.0' },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects >= maxRedirects) { reject(new Error('Too many redirects')); return }
          const redirectUrl = new (require('node:url').URL)(res.headers.location, url).toString()
          res.resume()
          doRequest(redirectUrl, redirects + 1)
          return
        }
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`))
          res.resume()
          return
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, stream: res })
      })
      req.on('error', reject)
      req.setTimeout(300000, () => { req.destroy(); reject(new Error('Request timeout')) })
    }
    doRequest(urlStr, 0)
  })
}

function downloadBuffer(url, onProgress) {
  return new Promise(async (resolve, reject) => {
    const { headers, stream } = await httpsRequest(url)
    const total = parseInt(headers['content-length'] || '0')
    const chunks = []
    let downloaded = 0
    let lastData = Date.now()
    const dataTimer = setInterval(() => {
      if (Date.now() - lastData > 120000) {
        clearInterval(dataTimer)
        stream.destroy()
        reject(new Error('Download stalled (no data for 120s)'))
      }
    }, 10000)
    stream.on('data', (chunk) => {
      lastData = Date.now()
      chunks.push(chunk)
      downloaded += chunk.length
      if (total && onProgress) onProgress(Math.round((downloaded / total) * 100))
    })
    stream.on('end', () => { clearInterval(dataTimer); resolve(Buffer.concat(chunks)) })
    stream.on('error', (err) => { clearInterval(dataTimer); reject(err) })
  })
}

async function getSevenZip(tempDir) {
  const sevenZipPath = path.join(tempDir, '7za.exe')
  if (fs.existsSync(sevenZipPath)) return sevenZipPath

  log('下载 7za.exe ...')
  const zipBuf = await downloadBuffer(SEVEN_ZIP_URL)
  const zipPath = path.join(tempDir, '7za920.zip')
  fs.writeFileSync(zipPath, zipBuf)

  const extractDir = path.join(tempDir, '7za-extract')
  fs.mkdirSync(extractDir, { recursive: true })
  execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'pipe', timeout: 30000 })

  const exe = path.join(extractDir, '7za.exe')
  if (!fs.existsSync(exe)) throw new Error('7za.exe not found after extract')
  fs.copyFileSync(exe, sevenZipPath)
  log('7za.exe 就绪')
  return sevenZipPath
}

async function getLatestMpvUrl() {
  log('获取最新 mpv 版本...')
  const { stream } = await httpsRequest(GITHUB_API_LATEST, { headers: { Accept: 'application/vnd.github+json' } })
  const buf = await new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (c) => chunks.push(c))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
  const release = JSON.parse(buf.toString('utf-8'))
  const assets = release.assets || []
  const mpvAsset = assets.find((a) => a.name.includes('mpv') && !a.name.includes('dev') && a.name.includes('x86_64') && a.name.endsWith('.7z') && !a.name.includes('d3d'))
  if (!mpvAsset) throw new Error('找不到合适的 mpv 下载资源')
  log(`最新版本: ${release.tag_name}, 文件: ${mpvAsset.name}`)
  return { url: mpvAsset.browser_download_url, filename: mpvAsset.name }
}

function copyMpvFiles(srcDir, targetDir, depth = 0) {
  if (depth > 5) return false
  for (const name of ['mpv.exe', 'mpv.com']) {
    const exePath = path.join(srcDir, name)
    if (fs.existsSync(exePath)) {
      fs.mkdirSync(targetDir, { recursive: true })
      const entries = fs.readdirSync(srcDir, { withFileTypes: true })
      let copied = 0
      for (const entry of entries) {
        if (entry.isFile()) {
          const src = path.join(srcDir, entry.name)
          const dest = path.join(targetDir, entry.name)
          if (!fs.existsSync(dest)) { fs.copyFileSync(src, dest); copied++ }
        }
      }
      log(`复制了 ${copied} 个文件到 ${targetDir}`)
      return true
    }
  }
  try {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        if (copyMpvFiles(path.join(srcDir, entry.name), targetDir, depth + 1)) return true
      }
    }
  } catch { /* ignore */ }
  return false
}

async function main() {
  // 已存在则跳过
  const mpvExe = path.join(PROJECT_MPV_DIR, 'mpv.exe')
  if (fs.existsSync(mpvExe)) {
    log(`mpv.exe 已存在 (${(fs.statSync(mpvExe).size / 1024 / 1024).toFixed(1)} MB)，跳过下载`)
    return
  }

  log('开始下载 mpv 播放器...')

  const tempDir = path.join(os.tmpdir(), 'videomanager-mpv-download')
  fs.mkdirSync(tempDir, { recursive: true })

  try {
    const sevenZipPath = await getSevenZip(tempDir)
    const { url, filename } = await getLatestMpvUrl()
    const archivePath = path.join(tempDir, filename)

    log(`下载 ${filename} (约 50MB)...`)
    const archiveBuf = await downloadBuffer(url, (pct) => {
      if (pct % 20 === 0 || pct === 100) log(`下载进度: ${pct}%`)
    })
    fs.writeFileSync(archivePath, archiveBuf)
    log('下载完成')

    const extractDir = path.join(tempDir, 'mpv-extract')
    fs.mkdirSync(extractDir, { recursive: true })
    log('解压中...')
    execSync(`"${sevenZipPath}" x "${archivePath}" -o"${extractDir}" -y`, { stdio: 'pipe', timeout: 120000 })

    log('复制 mpv 文件到项目目录...')
    if (!copyMpvFiles(extractDir, PROJECT_MPV_DIR)) {
      console.error('错误: 解压后找不到 mpv.exe')
      process.exit(1)
    }

    const exeSize = (fs.statSync(mpvExe).size / 1024 / 1024).toFixed(1)
    log(`完成! mpv.exe 就绪 (${exeSize} MB)`)
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

main().catch((err) => {
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('timeout') || err.message?.includes('stalled')) {
    console.error(`⚠ 网络下载失败: ${err.message}`)
    console.error('请手动下载 mpv 并解压到 mpv/ 目录:')
    console.error('  https://github.com/shinchiro/mpv-winbuild-cmake/releases/latest')
    console.error('  (下载 mpv-dev-x86_64-*.7z，解压后将 mpv.exe 和 DLL 放入 mpv/ 目录)')
    process.exit(0) // 不阻塞构建
  }
  console.error(`下载失败: ${err.message}`)
  process.exit(1)
})
