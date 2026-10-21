const { app, dialog } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let win,
  count = 0
const errors = []
async function js(code) {
  return win.webContents.executeJavaScript(code, true)
}
async function waitFor(code) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (win && !win.webContents.isLoading() && (await js(`Boolean(${code})`))) return
    await pause(100)
  }
  throw new Error(`Timed out: ${code}`)
}
async function check(name, action) {
  await action()
  console.log(`PASS ${++count}: ${name}`)
}
async function click(label) {
  await js(
    `(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Missing button: ' + ${JSON.stringify(label)}); button.click() })()`
  )
  await pause(80)
}
async function field(label, value) {
  await js(
    `(() => { const element = [...document.querySelectorAll('input,select')].find(element => element.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!element) throw new Error('Missing field'); Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) })()`
  )
  await pause(100)
}
async function escape() {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await pause(100)
}
;(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'vm-media-series-ui-'))
  const originalSetPath = app.setPath.bind(app)
  app.setPath = (key, value) => originalSetPath(key, key === 'userData' ? temp : value)
  app.on('browser-window-created', (_event, created) => {
    win = created
    created.hide()
    created.webContents.setBackgroundThrottling(false)
    created.webContents.on('console-message', (_event, level, message) => {
      if (level >= 3) errors.push(message)
    })
  })
  const library = path.join(temp, 'videos')
  await fs.mkdir(library)
  const names = [
    '旅行 Part01.mp4',
    '旅行 Part02.mp4',
    '旅行 Part03.mp4',
    '课程 第1集.mp4',
    '课程 第2集.mp4',
    '散步 #1.mp4',
    '远景 #2.mp4',
  ]
  for (const name of names) await fs.copyFile('output/fixtures/seek #1.mp4', path.join(library, name))
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [library] })
  await import(pathToFileURL(path.resolve('dist-electron/main.js')).href)
  await waitFor('window.videosorter && document.querySelector("main")')
  await js('window.videosorter.scanDirectory()')
  await js('location.reload()')
  await pause(300)
  await waitFor('document.querySelectorAll("article").length === 7')
  await check('visible covers use local cache files and provide parsed duration', async () => {
    await waitFor(
      '[...document.querySelectorAll("article .video-cover img")].filter(image => image.complete && image.naturalWidth > 0).length === 7'
    )
    assert.ok(
      await js(
        '[...document.querySelectorAll("article .video-cover img")].every(image => image.src.startsWith("file:") && image.src.includes("media-cache"))'
      )
    )
    await waitFor(
      '[...document.querySelectorAll(".cover-duration")].every(element => element.textContent === "00:40")'
    )
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await js('window.videosorter.getMediaCacheStats()')).previews >= 7) break
      await pause(100)
    }
    assert.equal((await js('window.videosorter.getMediaCacheStats()')).previews, 7)
  })
  let hoverMs
  await check('warmed hover starts a silent cached clip promptly and mouse leave pauses it', async () => {
    hoverMs = await js(`new Promise((resolve, reject) => {
      const start = performance.now()
      const timer = setTimeout(() => reject(new Error('Preview did not play')), 5000)
      const playing = event => { if (!event.target.closest('article')) return; clearTimeout(timer); document.removeEventListener('playing', playing, true); resolve(performance.now() - start) }
      document.addEventListener('playing', playing, true)
      document.querySelector('article').dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }))
    })`)
    assert.ok(hoverMs < 1500, `Warmed hover took ${hoverMs}ms`)
    assert.ok(
      await js(
        '(() => { const video = document.querySelector("article video"); return !video.paused && video.muted && video.src.includes("media-cache") && video.duration >= 3 && video.duration <= 5.1 })()'
      )
    )
    await js(
      'document.querySelector("article").dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }))'
    )
    await waitFor('document.querySelector("article video").paused')
  })
  await check(
    'hover rotates through different random clips after 3–5 seconds and stops on leave',
    async () => {
      const events = await js(`new Promise((resolve, reject) => {
      const events = []
      const card = document.querySelector('article')
      const timer = setTimeout(() => { document.removeEventListener('playing', playing, true); reject(new Error('Preview rotation timed out')) }, 17000)
      const playing = event => {
        const element = event.target
        if (!element.closest('article') || events.at(-1)?.src === element.src) return
        events.push({ time: performance.now(), src: element.src, slot: element.dataset.previewSlot, start: Number(element.dataset.previewStart), duration: element.duration, muted: element.muted, active: [...document.querySelectorAll('article video')].filter(video => !video.paused).length })
        if (events.length === 3) { clearTimeout(timer); document.removeEventListener('playing', playing, true); card.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); resolve(events) }
      }
      document.addEventListener('playing', playing, true)
      card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }))
    })`)
      for (let i = 0; i < events.length; i++) {
        assert.ok(events[i].duration >= 3 && events[i].duration <= 5.1)
        assert.equal(events[i].muted, true)
        assert.equal(events[i].active, 1)
        if (i) {
          assert.notEqual(events[i].slot, events[i - 1].slot)
          assert.notEqual(events[i].start, events[i - 1].start)
          const interval = events[i].time - events[i - 1].time
          assert.ok(
            interval >= events[i - 1].duration * 1000 - 200 &&
              interval <= events[i - 1].duration * 1000 + 700,
            'Unexpected segment interval: ' + interval
          )
        }
      }
      await waitFor(
        '[...document.querySelectorAll("article video")].every(video => video.paused) && !document.querySelector(".preview-visible")'
      )
    }
  )
  await check('series suggestions are editable previews and save only checked members', async () => {
    await click('系列分组')
    await click('生成分组建议')
    await waitFor('document.querySelectorAll(".series-suggestion").length === 2')
    assert.equal((await js('window.videosorter.getSeries()')).groups.length, 0)
    const groups = await js('window.videosorter.previewSeries("smart")')
    const travel = groups.groups.find((group) => group.name === '旅行')
    const snapshot = await js('window.videosorter.getLibrarySnapshot()')
    const excluded = snapshot.videos.find((video) => video.name === '旅行 Part03.mp4').id
    await field(`候选系列名称 ${travel.id}`, '旅途合集')
    await js(`document.querySelector('[aria-label="系列成员 ${excluded}"]').click()`)
    await click('保存所选 2 个系列')
    await waitFor('document.querySelector(".series-message")?.textContent.includes("系列已保存")')
    const saved = await js('window.videosorter.getSeries()')
    assert.equal(saved.groups.length, 2)
    assert.equal(saved.groups.find((group) => group.name === '旅途合集').videoIds.length, 2)
    assert.equal((await fs.readdir(library)).length, 7)
    await fs.mkdir('output/playwright', { recursive: true })
    await fs.writeFile('output/playwright/series-manager.png', (await win.webContents.capturePage()).toPNG())
    await escape()
    await waitFor(
      'document.querySelectorAll(".series-card").length === 2 && document.querySelectorAll("article").length === 3'
    )
  })
  await check(
    'series expand to their members and search does not hide matching individual videos',
    async () => {
      await js(`document.querySelector('[aria-label="展开系列 旅途合集"]').click()`)
      await waitFor(
        'document.querySelector(".series-breadcrumb") && document.querySelectorAll("article").length === 2'
      )
      assert.ok(
        await js(
          '[...document.querySelectorAll(".card-title")].every(element => element.textContent.includes("旅行"))'
        )
      )
      await field('排序方式', 'name-asc')
      assert.ok(await js('document.querySelector(".card-title").textContent.includes("Part01")'))
      await click('返回视频列表')
      await field('搜索视频', 'Part01')
      await waitFor(
        'document.querySelectorAll("article").length === 1 && document.querySelectorAll(".series-card").length === 0'
      )
      await field('搜索视频', '')
      await waitFor('document.querySelectorAll(".series-card").length === 2')
      await fs.writeFile(
        'output/playwright/series-library.png',
        (await win.webContents.capturePage()).toPNG()
      )
    }
  )
  await check('series survive renderer reload, and dissolving preserves every record and file', async () => {
    await js('location.reload()')
    await pause(350)
    await waitFor('document.querySelectorAll(".series-card").length === 2')
    await click('系列分组')
    await click('解散系列')
    await click('确认解散')
    await waitFor('document.querySelectorAll(".series-suggestion").length === 1')
    assert.equal((await js('window.videosorter.getLibrarySnapshot()')).videos.length, 7)
    assert.equal((await fs.readdir(library)).length, 7)
    await escape()
  })
  await check('batch selection can create a named series from specific videos', async () => {
    await click('批量选择')
    await waitFor('document.querySelectorAll("article").length === 7')
    await js(
      `(() => { const cards = [...document.querySelectorAll('article')].filter(card => card.querySelector('.card-title').textContent.includes('散步') || card.querySelector('.card-title').textContent.includes('远景')); cards.forEach(card => card.querySelector('input[type=checkbox]').click()) })()`
    )
    await click('组成系列')
    await field('手动系列名称', '手动收藏')
    await click('创建系列')
    await waitFor('document.querySelector(".series-message")?.textContent.includes("已将选中视频组成系列")')
    assert.ok((await js('window.videosorter.getSeries()')).groups.some((group) => group.name === '手动收藏'))
    await escape()
  })
  await check('series manager fits compact windows without horizontal overflow', async () => {
    await click('系列分组')
    win.setMinimumSize(320, 400)
    win.setSize(375, 812)
    await pause(200)
    assert.equal(
      await js(
        'document.documentElement.scrollWidth <= innerWidth && document.querySelector(".dialog-panel").scrollWidth <= document.querySelector(".dialog-panel").clientWidth'
      ),
      true
    )
    await escape()
  })
  assert.deepEqual(errors, [])
  console.log(`BENCHMARK warmed hover to playing=${hoverMs.toFixed(1)}ms (includes 100ms intent delay)`)
  console.log(`RESULT: ${count} media/series UI checks passed. Isolated data: ${temp}`)
  app.exit(0)
})().catch(async (error) => {
  console.error(error)
  console.error('Renderer errors:', errors)
  if (win && !win.isDestroyed()) {
    console.error(await js('document.querySelector(".dialog-panel")?.innerText.slice(-600)'))
    await fs.mkdir('output/playwright', { recursive: true })
    await fs.writeFile('output/playwright/series-failure.png', (await win.webContents.capturePage()).toPNG())
  }
  app.exit(1)
})
