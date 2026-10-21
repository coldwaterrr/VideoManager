const { app, Tray, nativeImage } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let win, tray, menu, trayTooltip, count = 0, hideCalls = 0
const errors = []
async function waitFor(action) {
  for (let attempt = 0; attempt < 100; attempt++) { if (await action()) return; await pause(80) }
  throw new Error('Timed out waiting for window/tray state')
}
async function check(name, action) { await action(); console.log(`PASS ${++count}: ${name}`) }
const tooltip = Tray.prototype.setToolTip
const contextMenu = Tray.prototype.setContextMenu
Tray.prototype.setToolTip = function (value) { tray = this; trayTooltip = value; return tooltip.call(this, value) }
Tray.prototype.setContextMenu = function (value) { menu = value; return contextMenu.call(this, value) }

;(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'videomanager-tray-'))
  const setPath = app.setPath.bind(app)
  app.setPath = (key, value) => setPath(key, key === 'userData' ? temp : value)
  let fallbackUsed = false
  if (process.env.VIDEOMANAGER_TEST_MISSING_ICONS === '1') {
    nativeImage.createFromPath = () => nativeImage.createEmpty()
    const fromData = nativeImage.createFromDataURL
    nativeImage.createFromDataURL = value => { const image = fromData(value); assert.equal(image.isEmpty(), false); fallbackUsed = true; return image }
  }
  app.on('browser-window-created', (_event, created) => {
    win = created
    created.webContents.setBackgroundThrottling(false)
    const hide = created.hide.bind(created)
    created.hide = () => { hideCalls++; return hide() }
    const skip = created.setSkipTaskbar.bind(created)
    created.setSkipTaskbar = value => { assert.equal(value, false, 'Window must not be removed from taskbar by restore'); return skip(value) }
    created.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
  })
  await import(pathToFileURL(path.resolve('dist-electron/main.js')).href)
  await waitFor(() => win && tray && menu && !win.webContents.isLoading())
  win.showInactive()
  await check('tray has a real icon, tooltip, and explicit open/hide/exit actions', async () => {
    assert.equal(tray.isDestroyed(), false)
    assert.match(trayTooltip, /VideoManager/)
    assert.deepEqual(menu.items.filter(item => item.type !== 'separator').map(item => item.label), ['打开', '隐藏到托盘', '退出'])
    if (process.env.VIDEOMANAGER_TEST_MISSING_ICONS === '1') assert.equal(fallbackUsed, true)
    else {
      for (const asset of ['videomanager.png', 'videomanager-tray.png', 'videomanager.ico']) {
        const icon = nativeImage.createFromPath(path.resolve('dist', asset))
        assert.equal(icon.isEmpty(), false, asset)
        assert.ok(icon.toBitmap().some(value => value !== 0), `${asset} is transparent`)
      }
    }
  })
  await check('title-bar IPC performs real minimize without hiding the taskbar window', async () => {
    hideCalls = 0
    await win.webContents.executeJavaScript('window.winControls.minimize()', true)
    await waitFor(() => win.isMinimized())
    assert.equal(hideCalls, 0)
    assert.equal(win.isDestroyed(), false)
  })
  await check('tray click restores a minimized window', async () => {
    tray.emit('click', {}, tray.getBounds(), { x: 0, y: 0 })
    await waitFor(() => !win.isMinimized() && win.isVisible())
  })
  await check('native/taskbar minimize remains minimized and does not call hide', async () => {
    hideCalls = 0
    win.minimize()
    await waitFor(() => win.isMinimized())
    await pause(150)
    assert.equal(hideCalls, 0)
    assert.equal(win.isDestroyed(), false)
    menu.items.find(item => item.label === '打开').click()
    await waitFor(() => !win.isMinimized() && win.isVisible())
  })
  await check('only explicit hide-to-tray removes the window; double-click brings it back', async () => {
    menu.items.find(item => item.label === '隐藏到托盘').click()
    await waitFor(() => !win.isVisible())
    assert.equal(hideCalls, 1)
    assert.equal(tray.isDestroyed(), false)
    tray.emit('double-click', {}, tray.getBounds())
    await waitFor(() => win.isVisible() && !win.isMinimized())
  })
  await check('repeated minimize/restore and second-instance activation retain a reachable window', async () => {
    for (let cycle = 0; cycle < 3; cycle++) {
      win.minimize()
      await waitFor(() => win.isMinimized())
      app.emit('second-instance', {}, [], process.cwd())
      await waitFor(() => win.isVisible() && !win.isMinimized())
    }
    assert.equal(hideCalls, 1)
    assert.deepEqual(errors, [])
  })
  app.once('will-quit', () => {
    try {
      assert.equal(tray.isDestroyed(), true)
      console.log(`PASS ${++count}: exit destroys the system tray icon`)
      console.log(`RESULT: ${count} window/tray checks passed${fallbackUsed ? ' (missing-asset fallback)' : ''}. Isolated data: ${temp}`)
    } catch (error) { console.error(error); app.exit(1) }
  })
  menu.items.find(item => item.label === '退出').click()
})().catch(error => { console.error(error); console.error('Renderer:', errors); app.exit(1) })
