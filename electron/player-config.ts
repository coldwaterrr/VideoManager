import path from 'node:path'
import { app } from 'electron'
import fs from 'node:fs'

export type PlayerType = 'web' | 'mpv' | 'system'

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'player-config.json')
}

export function loadPlayerConfig(): { defaultPlayer: PlayerType } {
  try {
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return { defaultPlayer: 'web', ...data }
    }
  } catch {
    // ignore
  }
  return { defaultPlayer: 'web' }
}

export function savePlayerConfig(config: { defaultPlayer: PlayerType }): void {
  const configPath = getConfigPath()
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}
