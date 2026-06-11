import { NextResponse } from 'next/server'
import { isSuppressed, listLeads, updateLead } from '@/lib/store'
import { checkRateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const limit = checkRateLimit(`approve:${clientIp(req)}`, Number(process.env.SEND_RATE_LIMIT || 60), 60 * 60 * 1000)
  if (!limit.ok) return rateLimitResponse(limit.resetAt)

  const { leadIds, subject, message } = await req.json()
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
    await updateLead(lead.id, {
      status: 'approved',
      subject: typeof subject === 'string' && selected.length === 1 ? subject : lead.subject,
      message: typeof message === 'string' && selected.length === 1 ? message : lead.message,
    })
    results.push({ id: lead.id, ok: true, queued: true })
  }

  return NextResponse.json({
    results,
    workerMode: 'local',
    message: 'Approved. The local Mac worker sends approved emails; the browser/API route only queues them.'
  })
}
