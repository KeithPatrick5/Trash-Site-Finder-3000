import { NextResponse } from 'next/server'
import { isSuppressed, listLeads, updateLead } from '@/lib/store'
import { checkRateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const limit = checkRateLimit(`approve:${clientIp(req)}`, Number(process.env.SEND_RATE_LIMIT || 30), 60 * 60 * 1000)
  if (!limit.ok) return rateLimitResponse(limit.resetAt)

  const { leadIds } = await req.json()
  const leads = await listLeads()
  const selected = leads.filter(l => leadIds?.includes(l.id))
  const results = []

  for (const lead of selected) {
    if (!lead.email) {
      results.push({ id: lead.id, ok: false, error: 'No email' })
      continue
    }
    if (await isSuppressed(lead.email)) {
      results.push({ id: lead.id, ok: false, error: 'Suppressed/unsubscribed' })
      continue
    }
    await updateLead(lead.id, { status: 'approved' })
    results.push({ id: lead.id, ok: true, queued: true })
  }

  return NextResponse.json({
    results,
    workerMode: 'local',
    message: 'Leads approved. The local Mac worker sends approved emails; the browser/API route only approves them.'
  })
}
