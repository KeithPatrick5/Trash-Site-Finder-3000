type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

export function clientIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('x-real-ip') || 'local'
}

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt: now + windowMs }
  }
  if (current.count >= limit) return { ok: false, remaining: 0, resetAt: current.resetAt }
  current.count++
  return { ok: true, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt }
}

export function rateLimitResponse(resetAt: number) {
  return Response.json(
    { error: 'Rate limit hit. Slow it down.', resetAt },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } }
  )
}
