import OpenAI from 'openai'
import { Lead } from './types'

export async function generateMessage(lead: Lead): Promise<{ subject: string; message: string }> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await aiMessage(lead)
    } catch {
      return templateMessage(lead)
    }
  }
  return templateMessage(lead)
}

async function aiMessage(lead: Lead) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const issues = lead.issues.map(i => i.label).join(', ')
  const prompt = `Write a cold outreach email for a local business. Keep it under 90 words. Voice: sharp, simple, human, Gen Z-ish but not cringe. No agency-speak. No "kindly", no "portal", no "I specialize". Mention the exact site problem. Offer to fix/build a cleaner first version. End with one easy question. Include subject and body JSON only.
Business: ${lead.businessName}
Profession: ${lead.profession}
City: ${lead.city}
Website: ${lead.website ?? 'none found'}
Issues: ${issues || 'site looks weak'}
Mobile score: ${lead.pagespeedMobile ?? 'unknown'}
Compliance: do not make deceptive claims. Do not claim we are their customer. Do not insult too hard.`
  const res = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.75
  })
  const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
  return {
    subject: String(parsed.subject || 'quick site thing').slice(0, 80),
    message: appendFooter(String(parsed.body || parsed.message || templateMessage(lead).message))
  }
}

export function templateMessage(lead: Lead): { subject: string; message: string } {
  const top = lead.issues[0]?.label
  const second = lead.issues[1]?.label
  const profession = humanProfession(lead.profession)

  if (lead.issues.some(i => i.code === 'no_website')) {
    return {
      subject: 'couldn’t find your site',
      message: appendFooter(`Hey — I was looking for your website and either missed it or it’s not really set up.\n\nFor a ${profession}, that’s leaving easy trust on the table. Even a clean page with services, photos, and a request form would beat making people guess.\n\nWant me to send what I’d build first?`)
    }
  }

  if (lead.issues.some(i => i.code === 'slow_mobile')) {
    return {
      subject: 'your site on mobile',
      message: appendFooter(`Hey — checked your site on mobile and it’s pretty rough. ${lead.pagespeedMobile ? `It scored around ${lead.pagespeedMobile}/100.` : ''}\n\nFor a ${profession}, people should be able to land, trust you, and request help fast. Right now it feels harder than it needs to.\n\nWant me to send the quick version of what I’d fix?`)
    }
  }

  if (lead.issues.some(i => i.code === 'no_quote_or_booking')) {
    return {
      subject: 'quick site thing',
      message: appendFooter(`Hey — looked at your site and I couldn’t find a clean quote/booking flow.\n\nFor a ${profession}, that’s usually the money button: what they need, photos/details if needed, contact info, done.\n\nI build simple first versions of that. Want me to send what I’d change?`)
    }
  }

  return {
    subject: 'quick site thing',
    message: appendFooter(`Hey — I checked out your site and a couple things jumped out: ${top || 'the flow feels clunky'}${second ? ` and ${second}` : ''}.\n\nNot a giant rebuild pitch. More like clean up the first version so people can actually contact/book/request without thinking.\n\nWant me to send what I’d fix first?`)
  }
}

function humanProfession(p: string) {
  return /^[aeiou]/i.test(p) ? p : p.replace(/^HVAC contractor$/, 'HVAC business')
}

function appendFooter(body: string) {
  const address = process.env.COMPANY_POSTAL_ADDRESS || 'Your mailing address here'
  return `${body}\n\n—\nTrash Site Finder 3000\n${address}\nReply “no” and I won’t email again.`
}
