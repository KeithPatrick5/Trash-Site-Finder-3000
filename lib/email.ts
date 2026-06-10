import { Resend } from 'resend'
import { Lead } from './types'
import { isSuppressed, updateLead } from './store'

export async function sendLeadEmail(lead: Lead) {
  if (!lead.email) throw new Error('No email on lead')
  if (await isSuppressed(lead.email)) throw new Error('Email is suppressed/unsubscribed')
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing. Email sending disabled; queue only.')

  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.OUTBOUND_FROM || 'Trash Site Finder <onboarding@resend.dev>'
  const replyTo = process.env.REPLY_TO_EMAIL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const unsubscribeUrl = `${appUrl}/api/unsubscribe?email=${encodeURIComponent(lead.email)}`

  const result = await resend.emails.send({
    from,
    to: lead.email,
    subject: lead.subject,
    text: `${lead.message}\n\nUnsubscribe: ${unsubscribeUrl}`,
    replyTo: replyTo ? [replyTo] : undefined,
    headers: {
      'X-Entity-Ref-ID': lead.id,
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  })
  await updateLead(lead.id, { status: 'sent' })
  return result
}
