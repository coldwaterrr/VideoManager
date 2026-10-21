const fs = require('node:fs/promises')
const path = require('node:path')
const { createReadStream } = require('node:fs')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const assert = require('node:assert/strict')
const yaml = require('js-yaml')
const asar = require('@electron/asar')
const { version } = require('../package.json')
const rootArg = process.argv.indexOf('--root')
const root = path.resolve(rootArg >= 0 ? process.argv[rootArg + 1] : path.join('release', version))
const installer = `VideoManager-Windows-${version}-Setup.exe`
const portable = `VideoManager-Windows-${version}-Portable.exe`
const zip = `VideoManager-Windows-${version}-x64.zip`
async function digest(file, algorithm, encoding) {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest(encoding)
}
async function pe(file) {
  const handle = await fs.open(file)
  try {
    const bytes = Buffer.alloc(2)
    await handle.read(bytes, 0, 2, 0)
    assert.equal(bytes.toString(), 'MZ', `Invalid executable: ${file}`)
  } finally {
    await handle.close()
  }
}
async function main() {
  const publicFiles = [installer, portable, zip, installer + '.blockmap', 'latest.yml']
  for (const file of publicFiles)
    assert.ok((await fs.stat(path.join(root, file))).size > 0, `Empty release file: ${file}`)
  for (const file of [installer, portable]) await pe(path.join(root, file))
  const unpacked = path.join(root, 'win-unpacked')
  for (const file of ['VideoManager.exe', 'media-tools/ffmpeg.exe', 'mpv/mpv.exe'])
    await pe(path.join(unpacked, file))
  const entries = asar
    .listPackage(path.join(unpacked, 'resources', 'app.asar'))
    .map((file) => file.replaceAll('\\', '/'))
  assert.ok(
    entries.some((file) => file.endsWith('/node_modules/sql.js/dist/sql-wasm.wasm')),
    'Missing SQLite WASM'
  )
  assert.ok(
    entries.some((file) => file.endsWith('/dist/videomanager.ico')),
    'Missing application icon'
  )
  assert.ok(
    !entries.some(
      (file) =>
        /(?:profiles|\.videosorter|media-cache)\//.test(file) ||
        /(?:videosorter\.sqlite|ai-config\.json|tmdb-config\.json)$/.test(file)
    ),
    'Personal data found in app archive'
  )
  const updater = yaml.load(await fs.readFile(path.join(unpacked, 'resources', 'app-update.yml'), 'utf8'))
  assert.equal(updater.provider, 'github')
  assert.equal(updater.owner, 'coldwaterrr')
  assert.equal(updater.repo, 'VideoManager')
  const listing = execFileSync(require('7zip-bin').path7za, ['l', '-ba', '-slt', path.join(root, zip)], {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 ** 2,
  })
  for (const file of [
    'VideoManager.exe',
    'resources/app.asar',
    'media-tools/ffmpeg.exe',
    'media-tools/FFmpeg-LICENSE.txt',
    'mpv/mpv.exe',
  ])
    assert.ok(
      listing.includes(`Path = ${file}`) || listing.includes(`Path = ${file.replaceAll('/', '\\')}`),
      `Missing ZIP entry: ${file}`
    )
  assert.ok(
    !/Path = .*?(?:profiles[\\/]|\.videosorter[\\/]|media-cache[\\/]|videosorter\.sqlite|ai-config\.json|tmdb-config\.json)/.test(
      listing
    ),
    'Personal data found in ZIP'
  )
  execFileSync(require('7zip-bin').path7za, ['t', path.join(root, zip)], {
    windowsHide: true,
    stdio: 'ignore',
    timeout: 300000,
  })
  const latest = yaml.load(await fs.readFile(path.join(root, 'latest.yml'), 'utf8'))
  assert.equal(latest.version, version)
  assert.equal(latest.path, installer)
  assert.ok(
    latest.files?.some((file) => file.url === installer),
    'Updater must refer to the installer'
  )
  for (const file of latest.files) {
    assert.equal(path.basename(file.url), file.url, 'Unexpected updater path')
    assert.ok(publicFiles.includes(file.url), 'Unexpected updater artifact')
    const target = path.join(root, file.url)
    assert.equal(await digest(target, 'sha512', 'base64'), file.sha512, `Updater hash mismatch: ${file.url}`)
    if (file.size) assert.equal((await fs.stat(target)).size, file.size)
  }
  assert.equal(await digest(path.join(root, installer), 'sha512', 'base64'), latest.sha512)
  const sums = []
  for (const file of publicFiles)
    sums.push(`${await digest(path.join(root, file), 'sha256', 'hex')}  ${file}`)
  await fs.writeFile(path.join(root, 'SHA256SUMS.txt'), sums.join('\n') + '\n')
  console.log(
    `Verified v${version}: installer, portable, ZIP integrity, bundled tools, SQLite, icons, updater hashes and data exclusion.`
  )
  console.log(`Release checksums: ${path.join(root, 'SHA256SUMS.txt')}`)
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
