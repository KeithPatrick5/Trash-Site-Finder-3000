import { Resend } from 'resend'
import { Lead } from './types'
import { isSuppressed, updateLead } from './store'

function resendClient() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing. Email sending disabled; queue only.')
  return new Resend(process.env.RESEND_API_KEY)
}

function fromAddress() {
  return process.env.OUTBOUND_FROM || 'Keith <onboarding@resend.dev>'
}

function replyTo() {
  const value = process.env.REPLY_TO_EMAIL
  return value ? [value] : undefined
}

function unsubscribeUrl(email: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${appUrl}/api/unsubscribe?email=${encodeURIComponent(email)}`
}

export async function sendLeadEmail(lead: Lead) {
  if (!lead.email) throw new Error('No email on lead')
  if (await isSuppressed(lead.email)) throw new Error('Email is suppressed/unsubscribed')

  const resend = resendClient()
  const unsub = unsubscribeUrl(lead.email)
  const result = await resend.emails.send({
    from: fromAddress(),
    to: lead.email,
    subject: lead.subject,
    text: `${lead.message}\n\nUnsubscribe: ${unsub}`,
    replyTo: replyTo(),
    headers: {
      'X-Entity-Ref-ID': lead.id,
      'List-Unsubscribe': `<${unsub}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  })
  await updateLead(lead.id, { status: 'sent' })
  return result
}

export async function sendReplyEmail(lead: Lead) {
  if (!lead.email) throw new Error('No email on lead')
  if (!lead.replyMessage) throw new Error('No approved reply message')
  if (await isSuppressed(lead.email)) throw new Error('Email is suppressed/unsubscribed')

  const resend = resendClient()
  const result = await resend.emails.send({
    from: fromAddress(),
    to: lead.email,
    subject: lead.replySubject || `Re: ${lead.subject || 'quick site thing'}`,
    text: lead.replyMessage,
    replyTo: replyTo(),
    headers: { 'X-Entity-Ref-ID': `${lead.id}:reply` }
  })
  await updateLead(lead.id, { status: 'replied' })
  return result
}
