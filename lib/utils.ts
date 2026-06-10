import crypto from 'crypto'

export function id(prefix = 'lead') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function normalizeDomain(input?: string) {
  if (!input) return ''
  try {
    const u = new URL(input.startsWith('http') ? input : `https://${input}`)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return input.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  }
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let next = 0
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}
