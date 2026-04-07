import path from 'node:path'
import { app, ipcMain, BrowserWindow } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import { spawn, ChildProcess } from 'node:child_process'

export interface MpvConfig {
  anime4k: boolean
  interpolation: boolean
  interpolationFps: number
  superResShader: 'anime4k' | 'fsrcnnx' | 'none'
  mpvPath: string
}

let win: BrowserWindow | null = null
let mpvChild: ChildProcess | null = null
let mpvSocketPath: string | null = null

export function setMpvWindowRef(browserWin: BrowserWindow | null) {
  win = browserWin
}

function getMpvConfigPath(): string {
  return path.join(app.getPath('userData'), 'mpv-config.json')
}

function defaultConfig(): MpvConfig {
  const baseDir = app.isPackaged
    ? path.dirname(process.execPath)
    : process.env.APP_ROOT || app.getAppPath()
  return {
    anime4k: false,
    interpolation: false,
    interpolationFps: 60,
    superResShader: 'none',
    mpvPath: path.join(baseDir, 'mpv'),
  }
}

export function loadMpvConfig(): MpvConfig {
  try {
    const configPath = getMpvConfigPath()
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return { ...defaultConfig(), ...data }
    }
  } catch {
    // ignore
  }
  return defaultConfig()
}

export function saveMpvConfig(config: MpvConfig): void {
  const configPath = getMpvConfigPath()
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}

export function findMpvExe(mpvDir: string): string | null {
  if (!mpvDir) return null
  const candidates = ['mpv.exe', 'mpv.com']
  for (const name of candidates) {
    const p = path.join(mpvDir, name)
    if (fs.existsSync(p)) return p
  }
  if (mpvDir.endsWith('.exe') && fs.existsSync(mpvDir)) return mpvDir
  try {
    const entries = fs.readdirSync(mpvDir)
    for (const entry of entries) {
      if (entry.startsWith('mpv') && (entry.endsWith('.exe') || entry.endsWith('.com'))) {
        return path.join(mpvDir, entry)
      }
    }
  } catch {
    // ignore
  }
  return null
}

function buildShaderArgs(config: MpvConfig): string[] {
  const baseDir = app.isPackaged
    ? path.dirname(process.execPath)
    : process.env.APP_ROOT || app.getAppPath()
  const shaderDir = path.join(baseDir, 'mpv', 'shaders')
  const args: string[] = []

  if (config.anime4k || config.superResShader === 'anime4k') {
    const animeShaders = [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_Soft_M.glsl',
      'Anime4K_Upscale_M.glsl',
    ]
    for (const shader of animeShaders) {
      const shaderPath = path.join(shaderDir, shader)
      if (fs.existsSync(shaderPath)) {
        args.push(`--glsl-shader=${shaderPath}`)
      }
    }
  } else if (config.superResShader === 'fsrcnnx') {
    const shaderPath = path.join(shaderDir, 'fsrcnnx', 'FSRCNNX_x2_16-0-4-1.glsl')
    if (fs.existsSync(shaderPath)) {
      args.push(`--glsl-shader=${shaderPath}`)
    }
  }

  if (config.interpolation) {
    args.push('--interpolation')
    args.push('--video-sync=display-resample')
    args.push('--tscale=oversample')
  }

  return args
}

export function terminateMpv() {
  if (mpvChild) {
    try {
      mpvChild.kill('SIGTERM')
    } catch {
      // ignore
    }
    mpvChild = null
  }
  if (mpvSocketPath && process.platform === 'win32') {
    try {
      fs.unlinkSync(mpvSocketPath)
    } catch {
      // ignore
    }
  }
  mpvSocketPath = null
}

function generateSocketPath(): string {
  const random = Math.random().toString(36).substring(2, 10)
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\mpv-${random}`
  }
  return path.join(os.tmpdir(), `mpv-${random}.sock`)
}

async function sendMpvCommand(cmd: unknown[]): Promise<unknown> {
  if (!mpvSocketPath) return null

  const command = { version: 1, command: cmd }

  return new Promise((resolve) => {
    const client = new net.Socket()
    let settled = false
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; client.destroy(); resolve(null) }
    }, 2000)

    client.on('connect', () => {
      client.write(JSON.stringify(command) + '\n')
      setTimeout(() => {
        if (!settled) { settled = true; clearTimeout(timeout); client.destroy(); resolve(null) }
      }, 300)
    })

    client.on('error', () => {
      if (!settled) { settled = true; clearTimeout(timeout); resolve(null) }
    })

    client.connect({ path: mpvSocketPath as string })
  })
}

export function setupMpvIPC() {
  ipcMain.handle('mpv:launch', async (_event, filePath: string, config?: Partial<MpvConfig>) => {
    terminateMpv()

    const savedConfig = loadMpvConfig()
    const currentConfig = { ...savedConfig, ...config }

    const mpvExe = findMpvExe(currentConfig.mpvPath)
    if (!mpvExe) {
      return { success: false, error: '找不到 mpv.exe，请设置 mpv 路径' }
    }

    if (!fs.existsSync(filePath)) {
      return { success: false, error: '视频文件不存在: ' + filePath }
    }

    if (!win) {
      return { success: false, error: '主窗口不存在' }
    }

    const socketPath = generateSocketPath()
    mpvSocketPath = socketPath

    // mpv window size: slightly smaller than main window
    const b = win.getBounds()
    const mpvW = Math.floor(b.width * 0.85)
    const mpvH = Math.floor(b.height * 0.85)
    const mpvX = Math.floor(b.x + (b.width - mpvW) / 2)
    const mpvY = Math.floor(b.y + (b.height - mpvH) / 2)
    const geoArg = `--geometry=${mpvW}x${mpvH}+${mpvX}+${mpvY}`

    const args = [
      filePath,
      '--force-window=immediate',
      '--idle=yes',
      `--input-ipc-server=${socketPath}`,
      '--osd-level=1',
      '--osc=yes',
      '--save-position-on-quit=no',
      '--hwdec=auto',
      '--keepaspect=yes',
      '--no-border',
      geoArg,
    ]

    const shaderArgs = buildShaderArgs(currentConfig)
    args.push(...shaderArgs)

    try {
      mpvChild = spawn(mpvExe, args, {
        detached: false,
        stdio: 'ignore',
        windowsHide: false,
      })

      mpvChild.on('exit', (code) => {
        if (code !== 0) {
          console.log(`[mpv] exited with code ${code}`)
        }
        mpvChild = null
        if (win) {
          win.webContents.send('mpv:ended')
        }
      })

      mpvChild.on('error', (err) => {
        console.error('[mpv] error:', err)
        terminateMpv()
      })

      await new Promise(resolve => setTimeout(resolve, 500))

      return { success: true, socket: socketPath }
    } catch (error) {
      terminateMpv()
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('mpv:loadfile', async (_event, filePath: string, mode = 'replace') => {
    if (!mpvSocketPath) return { success: false, error: 'mpv 未启动' }
    const result = await sendMpvCommand(['loadfile', filePath, mode])
    return { success: true, data: result }
  })

  ipcMain.handle('mpv:command', async (_event, cmd: unknown[]) => {
    if (!mpvSocketPath) return { success: false, error: 'mpv 未启动' }
    const result = await sendMpvCommand(cmd)
    return { success: true, data: result }
  })

  ipcMain.handle('mpv:getConfig', async () => loadMpvConfig())

  ipcMain.handle('mpv:saveConfig', async (_event, config: MpvConfig) => {
    saveMpvConfig(config)
    return { success: true }
  })

  ipcMain.handle('mpv:terminate', async () => {
    terminateMpv()
    return { success: true }
  })

  ipcMain.handle('mpv:check-available', async () => {
    const config = loadMpvConfig()
    const exePath = findMpvExe(config.mpvPath)
    return { available: !!exePath, path: exePath || '' }
  })
}

app.on('before-quit', () => terminateMpv())
app.on('window-all-closed', () => terminateMpv())
