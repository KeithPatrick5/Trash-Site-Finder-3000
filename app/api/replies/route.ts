import { NextResponse } from 'next/server'
import { addReply, addSuppression, findLeadByEmail, getLead, listReplies, updateLead } from '@/lib/store'
import { classifyReply } from '@/lib/replies'
import { followUpTemplate, upworkHandoffTemplate } from '@/lib/messaging'
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
    const lower = String(text).toLowerCase()
    const wantsEscrow = /escrow|upwork|safe pay|protected|milestone|contract/.test(lower)
    const status = classification.intent === 'hot' ? 'hot' : classification.intent === 'unsubscribe' || classification.intent === 'negative' ? 'dead' : 'replied'
    const draft = wantsEscrow ? upworkHandoffTemplate(lead) : classification.intent === 'hot' ? followUpTemplate(lead) : undefined
    await updateLead(lead.id, {
      status: wantsEscrow ? 'escrow_requested' : status,
      lastReply: text,
      replyIntent: classification.intent,
      replySubject: draft?.subject,
      replyMessage: draft?.message,
      dealStage: wantsEscrow ? 'escrow_requested' : classification.intent === 'hot' ? 'interested' : lead.dealStage,
      paymentPreference: wantsEscrow ? 'escrow' : lead.paymentPreference
    })
  }
  if (classification.intent === 'unsubscribe' && (email || lead?.email)) await addSuppression(email || lead!.email!, 'reply_unsubscribe')

  return NextResponse.json({ reply, classification })
}

export async function PATCH(req: Request) {
  const { leadId, replySubject, replyMessage, approve, action } = await req.json()
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })
  const lead = await getLead(leadId)
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!lead.email) return NextResponse.json({ error: 'No email on lead' }, { status: 400 })

  if (action === 'upwork_handoff') {
    const draft = upworkHandoffTemplate(lead)
    const updated = await updateLead(leadId, {
      replySubject: replySubject || draft.subject,
      replyMessage: replyMessage || draft.message,
      status: approve ? 'reply_approved' : 'escrow_requested',
      dealStage: approve ? 'upwork_sent' : 'escrow_requested',
      paymentPreference: 'upwork'
    })
    return NextResponse.json({ ok: true, lead: updated })
  }

  if (action === 'preview_sent') {
    const updated = await updateLead(leadId, { status: 'preview_sent', dealStage: 'preview_sent' })
    return NextResponse.json({ ok: true, lead: updated })
  }

  if (approve && !replyMessage) return NextResponse.json({ error: 'replyMessage required to approve' }, { status: 400 })
  const updated = await updateLead(leadId, {
    replySubject: replySubject || lead.replySubject || `Re: ${lead.subject}`,
    replyMessage: replyMessage || lead.replyMessage,
    status: approve ? 'reply_approved' : lead.status
  })
  return NextResponse.json({ ok: true, lead: updated })
}
