const { app, BrowserWindow, dialog } = require('electron')
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
  try {
    return await win.webContents.executeJavaScript(code, true)
  } catch (error) {
    throw new Error(`Renderer action failed: ${code}\n${error}`)
  }
}
async function waitFor(code) {
  for (let attempt = 0; attempt < 100; attempt++) {
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
    `(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Missing button: ' + ${JSON.stringify(label)}); button.focus(); button.click() })()`
  )
  await pause(80)
}
async function field(label, value) {
  await js(
    `(() => { const element = document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']'); if (!element) throw new Error('Missing field'); const setter = Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`
  )
  await pause(100)
}
async function key(keyCode, modifiers = []) {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  await pause(100)
}
async function screenshot(name) {
  await pause(200)
  await fs.writeFile(`output/playwright/${name}.png`, (await win.webContents.capturePage()).toPNG())
}
;(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'videomanager-ui-'))
  const setPath = app.setPath.bind(app)
  app.setPath = (key, value) => setPath(key, key === 'userData' ? temp : value)
  app.on('browser-window-created', (_event, created) => {
    win = created
    created.hide()
    created.webContents.setBackgroundThrottling(false)
    created.webContents.on('console-message', (_event, level, message) => {
      if (level >= 3) errors.push(message)
    })
  })
  const videoDir = path.join(temp, '影像素材')
  await fs.mkdir(videoDir)
  const names = [
    '山野露营 · 周末记录.mp4',
    '海边日落与晚风.mp4',
    '光影之间 · 城市漫游.mov',
    '调色课程 Chapter 01.mov',
    '延时摄影 · 云的方向.mp4',
    '旅途中的一些片段.mp4',
    ...Array.from({ length: 21 }, (_, i) => `课程素材_${String(i + 2).padStart(2, '0')}.mp4`),
  ]
  for (const name of names) await fs.copyFile('output/fixtures/seek #1.mp4', path.join(videoDir, name))
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [videoDir] })
  await import(pathToFileURL(path.resolve('dist-electron/main.js')).href)
  await waitFor('!!window.videosorter && !!document.querySelector("main")')
  await fs.mkdir('output/playwright', { recursive: true })
  await js('window.videosorter.scanDirectory()')
  await js('window.videosorter.createVirtualFolder("旅行记录")')
  await js('window.videosorter.createVirtualFolder("学习课程")')
  const courseFolderId = await js(
    '(async () => (await window.videosorter.getLibrarySnapshot()).folders.find(folder => folder.name === "学习课程").id)()'
  )
  await js('location.reload()')
  await pause(350)
  await waitFor('document.querySelectorAll("article").length === 24')
  await check(
    'composed format and keyword filters update actual results; clear recovers the library',
    async () => {
      await click('筛选')
      await field('视频格式', 'mov')
      await waitFor('document.querySelectorAll("article").length === 2')
      await field('搜索视频', '调色')
      await waitFor('document.querySelectorAll("article").length === 1')
      await field('搜索视频', 'no-such-video')
      await waitFor(
        'document.querySelectorAll("article").length === 0 && document.querySelector(".empty-library")'
      )
      await click('清除搜索和筛选')
      await waitFor(
        'document.querySelectorAll("article").length === 24 && !document.querySelector(".active-filters")'
      )
      await click('筛选')
    }
  )
  await check('duration and size filters exclude unknown and out of range files', async () => {
    await click('筛选')
    await field('视频时长', 'long')
    await waitFor('document.querySelectorAll("article").length === 0')
    await click('重置筛选')
    await field('筛选最小大小MB', '99999')
    await waitFor('document.querySelectorAll("article").length === 0')
    await click('重置筛选')
    await click('筛选')
  })
  await check('pagination clamps after filters shrink results', async () => {
    await field('每页数量', '12')
    await field('跳转页码', '3')
    await js('document.querySelector("[aria-label=跳转页码]").focus()')
    await key('Enter')
    await waitFor('document.querySelector(".library-pagination").textContent.includes("25–27")')
    await js('document.querySelector("[aria-label=上一页]").click()')
    await waitFor('document.querySelector(".library-pagination").textContent.includes("13–24")')
    await js('document.querySelector("[aria-label=上一页]").click()')
    await js('document.querySelector("[aria-label=下一页]").click()')
    await waitFor('document.querySelector(".library-pagination").textContent.includes("13–24")')
    await field('搜索视频', '海边')
    await waitFor(
      'document.querySelectorAll("article").length === 1 && document.querySelector(".library-pagination").textContent.includes("1–1")'
    )
    await field('搜索视频', '')
    await field('每页数量', '24')
  })
  await check('list preference persists across reload and Ctrl+K focuses the search field', async () => {
    await js('document.querySelector("[aria-label=列表视图]").click()')
    await js('location.reload()')
    await pause(350)
    await waitFor(
      '!!document.querySelector(".list-view") && document.querySelectorAll("article").length === 24'
    )
    await key('k', ['control'])
    assert.equal(await js('document.activeElement.getAttribute("aria-label")'), '搜索视频')
    await key('Escape')
    await screenshot('redesign-list')
    await js('document.querySelector("[aria-label=网格视图]").click()')
  })
  await check(
    'new category submits with Enter, navigates to the empty category, and preserves original files',
    async () => {
      await js('document.querySelector("[aria-label=新建分类]").click()')
      await waitFor('document.activeElement.getAttribute("aria-label") === "分类名称"')
      await field('分类名称', '我的收藏')
      await key('Enter')
      await waitFor(
        '!document.querySelector("[role=dialog]") && document.querySelector("h1").textContent.includes("我的收藏")'
      )
      assert.ok(
        await js('document.querySelector(".empty-library").textContent.includes("这个分类还没有视频")')
      )
      await click('浏览全部视频')
      await js('document.querySelector("[aria-label=\\"管理分类 我的收藏\\"]").click()')
      await click('重命名分类')
      await field('新分类名称', '我的收藏 · 精选')
      await key('Enter')
      await waitFor(
        '!document.querySelector("[role=dialog]") && document.querySelector(".library-sidebar").textContent.includes("我的收藏 · 精选")'
      )
      assert.equal((await fs.readdir(videoDir)).length, names.length)
    }
  )
  await check('filtered select-all and batch classification affect only matching videos', async () => {
    await field('搜索视频', '课程素材')
    await waitFor('document.querySelectorAll("article").length === 21')
    await click('批量选择')
    await js('document.querySelector("[aria-label=\\"全选当前筛选结果\\"]").click()')
    await field('批量分类目标', String(courseFolderId))
    await click('加入分类')
    await waitFor('document.querySelector(".workspace-status").textContent.includes("已批量加入分类")')
    const snapshot = await js('window.videosorter.getLibrarySnapshot()')
    assert.equal(snapshot.videos.filter((video) => video.folderIds.includes(courseFolderId)).length, 21)
    await key('Escape')
    await field('搜索视频', '')
    await waitFor(
      '!document.querySelector(".batch-toolbar") && document.querySelectorAll("article").length === 24'
    )
  })
  await check('changing filters prunes hidden selections and Escape exits selection mode', async () => {
    await click('批量选择')
    await js('document.querySelector("article input[type=checkbox]").click()')
    await field('搜索视频', 'nonexistent')
    await waitFor('document.querySelector(".batch-toolbar").textContent.includes("已选 0")')
    await key('Escape')
    await field('搜索视频', '')
    await waitFor('!document.querySelector(".batch-toolbar")')
  })
  await check('settings trap focus, save preview preference, and restore focus on Escape', async () => {
    await click('设置与偏好')
    await waitFor('!!document.querySelector(".dialog-panel")')
    await screenshot('redesign-settings')
    await js('document.querySelector("[role=switch]").click()')
    assert.equal(await js('localStorage.getItem("vm-hover-preview")'), 'false')
    await js(
      '(() => { const buttons = [...document.querySelectorAll(".dialog-panel button:not(:disabled)")]; buttons.at(-1).focus() })()'
    )
    await key('Tab')
    assert.equal(await js('!!document.activeElement.closest("[role=dialog]")'), true)
    await key('Escape')
    await waitFor('!document.querySelector("[role=dialog]")')
    assert.equal(await js('document.activeElement.textContent.trim()'), '设置与偏好')
  })
  await check('existing configuration dialogs share Escape and focus handling', async () => {
    for (const [label, accessibleName] of [
      ['TMDB 影视信息配置', 'TMDB 配置'],
      ['AI 分类与模型配置', 'AI 智能分类'],
      ['MPV 画质与增强设置', 'MPV 播放器设置'],
    ]) {
      await click('设置与偏好')
      await click(label)
      await waitFor(`!!document.querySelector('[role="dialog"][aria-label="${accessibleName}"]')`)
      assert.equal(await js('!!document.activeElement.closest("[role=dialog]")'), true)
      await key('Escape')
      await waitFor('!document.querySelector("[role=dialog]")')
    }
  })
  await check(
    'import conditions are separate from library filters and invalid ranges block scanning',
    async () => {
      await click('导入视频')
      await js('document.querySelector(".import-options").open = true')
      await field('导入最小大小MB', '100')
      await field('导入最大大小MB', '10')
      assert.ok(
        await js(
          '!!document.querySelector(".field-error") && [...document.querySelectorAll("button")].find(button => button.textContent.includes("选择目录并扫描")).disabled'
        )
      )
      await screenshot('redesign-import')
      await key('Escape')
      assert.equal(await js('document.querySelectorAll("article").length'), 24)
    }
  )
  await check('record removal has a cancellable dialog and keeps physical video files', async () => {
    await click('批量选择')
    await js('document.querySelector("article input[type=checkbox]").click()')
    await click('移除记录')
    await waitFor('!!document.querySelector(".dialog-panel")')
    assert.ok(await js('document.querySelector(".dialog-panel").textContent.includes("原视频文件会保留")'))
    await click('取消')
    assert.equal((await js('window.videosorter.getLibrarySnapshot()')).videos.length, names.length)
    await click('移除记录')
    await click('确认移除记录')
    await waitFor(
      '!document.querySelector(".dialog-panel") && document.querySelector(".workspace-status").textContent.includes("已移除 1 条")'
    )
    assert.equal((await js('window.videosorter.getLibrarySnapshot()')).videos.length, names.length - 1)
    assert.equal((await fs.readdir(videoDir)).length, names.length)
    await key('Escape')
  })
  await check('desktop, compact, and mobile widths fit without horizontal overflow', async () => {
    win.setMinimumSize(320, 400)
    for (const width of [1440, 960, 768, 375]) {
      win.setSize(width, width === 375 ? 812 : 900)
      await pause(150)
      assert.equal(
        await js('document.documentElement.scrollWidth <= innerWidth'),
        true,
        `Overflow at ${width}`
      )
      await screenshot(`redesign-${width}`)
    }
    win.setSize(1440, 900)
    await pause(100)
    await screenshot('redesign-library')
  })
  assert.deepEqual(errors, [], `Renderer errors: ${errors.join('\n')}`)
  console.log(`RESULT: ${count} library UX checks passed. Isolated data: ${temp}`)
  app.exit(0)
})().catch(async (error) => {
  console.error(error)
  console.error('Renderer errors:', errors)
  if (win) {
    console.error(
      await js(
        'JSON.stringify({ active: document.activeElement?.outerHTML.slice(0, 160), dialog: document.querySelector("[role=dialog]")?.innerText.slice(-400) })'
      )
    )
    await screenshot('redesign-failure')
  }
  app.exit(1)
})
