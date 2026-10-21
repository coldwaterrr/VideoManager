const fs = require('node:fs')
const path = require('node:path')
const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const target = path.resolve('media-tools', name)
const candidate = [
  process.env.VIDEOMANAGER_FFMPEG_PATH,
  ...(process.env.PATH || '').split(path.delimiter).map((dir) => path.join(dir, name)),
].find((file) => file && fs.existsSync(file))
fs.mkdirSync('media-tools', { recursive: true })
if (!fs.existsSync(target)) {
  if (!candidate)
    throw new Error(
      '构建本地封面/预览功能需要 FFmpeg：请将 ffmpeg 加入 PATH 或设置 VIDEOMANAGER_FFMPEG_PATH。'
    )
  fs.copyFileSync(candidate, target)
  console.log(`Prepared local media tool: ${target}`)
  const license = ['LICENSE', 'LICENSE.txt', 'LICENSE.md']
    .map((file) => path.resolve(candidate, '..', '..', file))
    .find((file) => fs.existsSync(file))
  if (license) fs.copyFileSync(license, 'media-tools/FFmpeg-LICENSE.txt')
}
