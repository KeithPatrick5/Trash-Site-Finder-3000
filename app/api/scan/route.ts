import { NextResponse } from 'next/server'
import { createScanJob, createScanJobSchema } from '@/lib/jobs'
import { checkRateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const limit = checkRateLimit(`scan:${clientIp(req)}`, Number(process.env.SCAN_RATE_LIMIT || 20), 60 * 60 * 1000)
  if (!limit.ok) return rateLimitResponse(limit.resetAt)

  try {
    const input = createScanJobSchema.parse(await req.json())
    const job = await createScanJob(input)
    return NextResponse.json({ ok: true, job, workerMode: 'local' })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Invalid scan request' }, { status: 400 })
  }
}
