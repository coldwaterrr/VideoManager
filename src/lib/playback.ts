export function seekTarget(current: number, duration: number, delta: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(duration) || duration <= 0) return null
  return Math.max(0, Math.min(Math.max(0, duration - 0.05), current + delta))
}

// Encode each segment so #, %, ? and spaces remain part of the local filename.
export function localFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.startsWith('//')) {
    const [host, ...parts] = normalized.slice(2).split('/')
    return `file://${host}/${parts.map(encodeURIComponent).join('/')}`
  }
  return `file://${normalized.startsWith('/') ? '' : '/'}${normalized.split('/').map((part, index) => index === 0 && /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part)).join('/')}`
}
