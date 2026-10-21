const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const assert = require('node:assert/strict')
const initSql = require('sql.js')
const { version } = require('../package.json')
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hash = (value) => createHash('sha256').update(value).digest('hex')

;(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'videomanager-package-'))
  const source = process.argv[2] ? path.resolve(process.argv[2]) : null
  let sourceHash
  if (source) {
    const bytes = await fs.readFile(source)
    sourceHash = hash(bytes)
    const SQL = await initSql()
    const db = new SQL.Database(bytes)
    // The smoke test runs a copy with background writes disabled.
    db.run("DELETE FROM app_meta WHERE key IN ('monitor_directories', 'automatic_missing_cleanup')")
    await fs.writeFile(path.join(profile, 'videosorter.sqlite'), db.export())
    db.close()
  }
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  const env = { ...process.env, VIDEOMANAGER_DATA_DIR: profile }
  const testMedia = process.argv.includes('--media')
  if (testMedia) {
    env.PATH = ''
    env.VIDEOMANAGER_FFMPEG_PATH = ''
  }
  delete env.ELECTRON_RUN_AS_NODE
  const executableArg = process.argv.indexOf('--executable')
  const executable = path.resolve(
    executableArg >= 0 ? process.argv[executableArg + 1] : `release/${version}/win-unpacked/VideoManager.exe`
  )
  const child = spawn(executable, [`--remote-debugging-port=${port}`], {
    env,
    windowsHide: true,
    stdio: 'ignore',
  })
  let socket
  try {
    let target
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(
          (item) => item.type === 'page' && !item.url.startsWith('devtools:')
        )
        if (target) break
      } catch {
        /* starting */
      }
      await pause(100)
    }
    assert.ok(target, 'Packaged application did not expose its renderer')
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    let nextId = 0
    const calls = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      const callback = calls.get(message.id)
      if (callback) {
        calls.delete(message.id)
        message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result)
      }
    })
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId
        const timer = setTimeout(() => {
          calls.delete(id)
          reject(new Error(`Timed out: ${method}`))
        }, 8000)
        calls.set(id, {
          resolve: (result) => {
            clearTimeout(timer)
            resolve(result)
          },
          reject: (error) => {
            clearTimeout(timer)
            reject(error)
          },
        })
        socket.send(JSON.stringify({ id, method, params }))
      })
    }
    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails)
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
      return result.result.value
    }
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        await evaluate(
          'Boolean(window.videosorter && document.querySelector(".video-collection") && !document.querySelector(".workspace-status").textContent.includes("正在加载"))'
        )
      )
        break
      await pause(100)
    }
    const info = await evaluate(
      '(async () => { const snapshot = await window.videosorter.getLibrarySnapshot(); return { version: (await window.videosorter.appGetVersion()).version, databasePath: snapshot.databaseMeta.databasePath, count: snapshot.videos.length, rendered: document.querySelectorAll("article").length, title: document.querySelector("h1")?.textContent, overflow: document.documentElement.scrollWidth > innerWidth } })()'
    )
    assert.equal(info.version, version)
    assert.equal(path.resolve(info.databasePath), path.join(profile, 'videosorter.sqlite'))
    assert.ok(info.title.includes('全部视频'))
    assert.equal(info.overflow, false)
    const icons = await evaluate(`(() => {
      const path = require('node:path')
      const root = path.dirname(require('node:url').fileURLToPath(location.href))
      return ['videomanager.ico', 'videomanager.png', 'videomanager-tray.png'].map(name => ({ name, valid: !require('electron').nativeImage.createFromPath(path.join(root, name)).isEmpty() }))
    })()`)
    assert.ok(
      icons.every((icon) => icon.valid),
      `Missing packaged icon: ${JSON.stringify(icons)}`
    )
    console.log('PASS: packaged application and tray icons are present and decode correctly')
    if (testMedia) {
      const media = await evaluate(`(async () => {
        const snapshot = await window.videosorter.getLibrarySnapshot()
        const video = snapshot.videos[0]
        const cover = await window.videosorter.getMediaAssets(video.id)
        const preview = await window.videosorter.getMediaAssets(video.id, true)
        const warm = await window.videosorter.getMediaAssets(video.id, true)
        return { cover: Boolean(cover.thumbnail), preview: Boolean(preview.preview), warm: warm.cached, duration: warm.durationSeconds, same: warm.preview === preview.preview, series: (await window.videosorter.getSeries()).groups.length }
      })()`)
      assert.ok(media.cover && media.preview && media.warm && media.same)
      assert.ok(media.duration > 0)
      console.log(
        `PASS: bundled FFmpeg generates local covers and previews with PATH empty; ${media.series} saved series loaded`
      )
      const rotation = await evaluate(`new Promise((resolve, reject) => {
        const card = document.querySelector('article')
        const events = []
        const timer = setTimeout(() => { document.removeEventListener('playing', playing, true); reject(new Error('Packaged random preview timed out')) }, 7000)
        const playing = event => {
          const video = event.target
          if (!video.closest('article') || events.at(-1)?.src === video.src) return
          events.push({ src: video.src, slot: video.dataset.previewSlot, duration: video.duration })
          if (events.length === 2) { clearTimeout(timer); document.removeEventListener('playing', playing, true); card.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); resolve(events) }
        }
        document.addEventListener('playing', playing, true)
        card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }))
      })`)
      assert.notEqual(rotation[0].slot, rotation[1].slot)
      assert.ok(rotation.every((event) => event.duration >= 3 && event.duration <= 5.1))
      console.log('PASS: actual packaged renderer plays and switches random 3–5 second clips')
    }
    if (source) assert.equal(hash(await fs.readFile(source)), sourceHash, 'Source library was modified')
    console.log(
      `PASS: packaged v${version}, ${info.count} videos, ${info.rendered} cards, isolated profile and original library unchanged`
    )
    await evaluate('document.querySelector(".sidebar-bottom > button").click()')
    await pause(100)
    assert.ok(await evaluate('Boolean(document.querySelector(".dialog-panel"))'))
    console.log('PASS: actual packaged settings dialog opens through the rendered UI')
    console.log('PASS: redesigned UI loads without horizontal overflow')
    console.log(`Isolated profile: ${profile}`)
    await evaluate('setTimeout(() => window.winControls.close(), 100); true').catch(() => {})
    await pause(250)
  } finally {
    socket?.close()
    if (child.exitCode === null) child.kill()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
