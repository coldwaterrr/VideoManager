const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { execFileSync } = require('node:child_process')

const VERSION = '9.0.2'
const ARCHIVE_URLS = [
  `https://github.com/GyanD/codexffmpeg/releases/download/${VERSION}/ffmpeg-${VERSION}-essentials_build.zip`,
  `https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-${VERSION}-essentials_build.zip`,
]
const ARCHIVE_SHA256 = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba'
const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const outputArg = process.argv.indexOf('--output-dir')
if (outputArg >= 0 && !process.argv[outputArg + 1]) throw new Error('--output-dir requires a directory')
const output = path.resolve(outputArg >= 0 ? process.argv[outputArg + 1] : 'media-tools')
const target = path.join(output, name)
const forceDownload = process.argv.includes('--download')

function copyTool(executable) {
  const root = path.resolve(executable, '..', '..')
  const license = ['LICENSE', 'LICENSE.txt', 'LICENSE.md']
    .map((file) => path.join(root, file))
    .find((file) => fs.existsSync(file))
  if (license) fs.copyFileSync(license, path.join(output, 'FFmpeg-LICENSE.txt'))
  const readme = path.join(root, 'README.txt')
  if (fs.existsSync(readme)) fs.writeFileSync(path.join(output, 'FFmpeg-README.txt'), fs.readFileSync(readme, 'utf8').replace(/[ \t]+(?=\r?$)/gm, '').trimEnd() + '\n')
  fs.copyFileSync(executable, target + '.download')
  fs.renameSync(target + '.download', target)
  const version = execFileSync(target, ['-version'], { windowsHide: true, encoding: 'utf8' }).split(
    /\r?\n/
  )[0]
  console.log(`Prepared local media tool: ${target}`)
  console.log(version)
}

async function main() {
  if (fs.existsSync(target) && !forceDownload) return
  fs.mkdirSync(output, { recursive: true })
  const candidate = [
    process.env.VIDEOMANAGER_FFMPEG_PATH,
    ...(process.env.PATH || '').split(path.delimiter).map((dir) => path.join(dir, name)),
  ].find((file) => file && fs.existsSync(file))
  if (candidate && !forceDownload) {
    copyTool(candidate)
    return
  }
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('请设置 VIDEOMANAGER_FFMPEG_PATH；自动下载支持 Windows x64。')
  const temporaryRoot = path.resolve(os.tmpdir())
  const temp = await fsp.mkdtemp(path.join(temporaryRoot, 'videomanager-ffmpeg-'))
  try {
    const archive = path.join(temp, 'ffmpeg.zip')
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Downloading FFmpeg ${VERSION} (attempt ${attempt}/3)`)
        const response = await fetch(ARCHIVE_URLS[(attempt - 1) % ARCHIVE_URLS.length], {
          signal: AbortSignal.timeout(300000),
        })
        if (!response.ok || !response.body) throw new Error(`FFmpeg download failed: HTTP ${response.status}`)
        const hash = createHash('sha256')
        const stream = Readable.fromWeb(response.body)
        let received = 0,
          reported = 0
        stream.on('data', (chunk) => {
          hash.update(chunk)
          received += chunk.length
          if (received - reported >= 20 * 1024 ** 2) {
            reported = received
            console.log(`FFmpeg downloaded: ${Math.floor(received / 1024 ** 2)} MiB`)
          }
        })
        await pipeline(stream, fs.createWriteStream(archive))
        if (hash.digest('hex') !== ARCHIVE_SHA256) throw new Error('FFmpeg SHA-256 mismatch')
        console.log('FFmpeg archive SHA-256 verified')
        break
      } catch (error) {
        console.warn(`FFmpeg download attempt ${attempt} failed: ${error.message}`)
        if (attempt === 3) throw error
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
    const extract = path.join(temp, 'extracted')
    execFileSync(require('7zip-bin').path7za, ['x', archive, `-o${extract}`, '-y'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 120000,
    })
    copyTool(path.join(extract, `ffmpeg-${VERSION}-essentials_build`, 'bin', name))
  } finally {
    const resolved = path.resolve(temp)
    if (
      !resolved.startsWith(temporaryRoot + path.sep) ||
      !path.basename(resolved).startsWith('videomanager-ffmpeg-')
    )
      throw new Error('Unexpected temporary path')
    await fsp.rm(resolved, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
