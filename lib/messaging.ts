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
  const prompt = `Write a cold outreach email for a local business. Keep it under 75 words. Voice: real human, slightly Gen Z, pattern-breaking, not childish. No "kindly". No "I hope this finds you well". No "I specialize". No "mockup". No fake praise. Mention the exact site problem. Do not insult the business owner. End with one easy yes/no question. Return JSON only with subject and body.
Business: ${lead.businessName}
Profession: ${lead.profession}
City: ${lead.city}
Website: ${lead.website ?? 'none found'}
Issues: ${issues || 'site looks weak'}
Mobile score: ${lead.pagespeedMobile ?? 'unknown'}
Compliance: do not lie, do not claim we bought from them, do not pretend to be local if not stated.`
  const res = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.9
  })
  const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
  return {
    subject: cleanSubject(String(parsed.subject || 'site is doing side quests')).slice(0, 80),
    message: appendFooter(String(parsed.body || parsed.message || templateMessage(lead).message))
  }
}

export function templateMessage(lead: Lead): { subject: string; message: string } {
  const top = lead.issues[0]?.label
  const second = lead.issues[1]?.label
  const profession = humanProfession(lead.profession)

  if (lead.issues.some(i => i.code === 'no_website')) {
    return {
      subject: 'your website is hiding',
      message: appendFooter(`Hey — I was looking up ${profession}s in ${lead.city} and ${lead.businessName} basically went ghost online.\n\nThat is rough for the kind of job where people just need a number fast. I can send over a quick first version so you can see what I mean.\n\nWant me to send it?`)
    }
  }

  if (lead.issues.some(i => i.code === 'site_not_loading' || i.code === 'load_failed')) {
    return {
      subject: 'your site is doing side quests',
      message: appendFooter(`Hey — your site looks like it is doing side quests instead of loading cleanly.\n\nNot ideal when someone is already impatient and just wants to call a ${profession}. I can send a quick cleaner version with the call/quote stuff up front.\n\nWant me to send it?`)
    }
  }

  if (lead.issues.some(i => i.code === 'slow_mobile')) {
    return {
      subject: 'mobile site is fighting for its life',
      message: appendFooter(`Hey — your mobile site is kind of fighting for its life${lead.pagespeedMobile ? ` — around ${lead.pagespeedMobile}/100` : ''}.\n\nMost people are not waiting. They bounce, tap the next ${profession}, and that is the whole game.\n\nWant the quick fix list?`)
    }
  }

  if (lead.issues.some(i => i.code === 'no_quote_or_booking')) {
    return {
      subject: 'missing money button',
      message: appendFooter(`Hey — your site seems to be missing the money button: quote, booking, call, whatever gets a stranger to become a lead.\n\nThat is the part I would fix first, not some giant redesign circus.\n\nWant me to send the simple version?`)
    }
  }

  return {
    subject: 'small site roast, useful one',
    message: appendFooter(`Hey — small useful roast: ${top || 'the site flow feels harder than it needs to'}${second ? `, plus ${second}` : ''}.\n\nNot saying burn it down. Just saying the first screen should make people trust you and contact you faster.\n\nWant the 3 things I’d fix first?`)
  }
}

export function followUpTemplate(lead: Lead): { subject: string; message: string } {
  const subject = lead.replySubject || `Re: ${lead.subject || 'quick site thing'}`
  return {
    subject,
    message: `Hell yeah. I can make a quick first version.\n\nSend me anything you already have — logo, photos, service list, areas you cover, or a Facebook/Google profile. If you have none of that, I can still make the first pass from what is public and we clean it up after.\n\nGoal is simple: one clean page that makes people trust you and call/request a quote.\n\nI’ll send a preview link before you pay anything.`
  }
}

export function upworkHandoffTemplate(lead: Lead): { subject: string; message: string } {
  const profile = process.env.NEXT_PUBLIC_UPWORK_PROFILE_URL || process.env.UPWORK_PROFILE_URL || '[add your Upwork profile link in .env.local]'
  const subject = lead.replySubject || `Re: ${lead.subject || 'quick site thing'}`
  return {
    subject,
    message: `All good — escrow is fine.\n\nHere’s my Upwork profile so you can see who you’re dealing with:\n${profile}\n\nI can set it up there as a fixed-price job. You fund the milestone, I finish the site, and once you approve it we wrap it up through Upwork.\n\nWant me to send the Upwork contract invite?`
  }
}

function humanProfession(p: string) {
  return p.replace(/^HVAC contractor$/, 'HVAC business')
}

function cleanSubject(s: string) {
  return s.replace(/kindly|mockup/gi, '').replace(/\s+/g, ' ').trim() || 'site is doing side quests'
}

function appendFooter(body: string) {
  const address = process.env.COMPANY_POSTAL_ADDRESS || 'Your mailing address here'
  return `${body}\n\n—\nKeith\n${address}\nReply “no” and I won’t email again.`
}
