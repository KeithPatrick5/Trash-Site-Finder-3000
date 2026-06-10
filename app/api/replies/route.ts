import { NextResponse } from 'next/server'
import { addReply, addSuppression, findLeadByEmail, getLead, listReplies, updateLead } from '@/lib/store'
import { classifyReply } from '@/lib/replies'
import { id, nowIso } from '@/lib/utils'

export async function GET() {
  return NextResponse.json({ replies: await listReplies() })
}

export async function POST(req: Request) {
  const { leadId, email, text } = await req.json()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
  const lead = leadId ? await getLead(leadId) : email ? await findLeadByEmail(email) : null
  const classification = await classifyReply(text, lead)
  const reply = await addReply({ id: id('reply'), leadId: lead?.id || leadId, email: email || lead?.email, text, intent: classification.intent, summary: classification.summary, createdAt: nowIso() })

  if (lead) {
    const status = classification.intent === 'hot' ? 'hot' : classification.intent === 'unsubscribe' || classification.intent === 'negative' ? 'dead' : 'replied'
    await updateLead(lead.id, { status, lastReply: text, replyIntent: classification.intent })
  }
  if (classification.intent === 'unsubscribe' && (email || lead?.email)) await addSuppression(email || lead!.email!, 'reply_unsubscribe')

  return NextResponse.json({ reply, classification })
}
