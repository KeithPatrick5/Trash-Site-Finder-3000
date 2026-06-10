import OpenAI from 'openai'
import { Lead } from './types'

export type ReplyIntent = 'hot' | 'neutral' | 'unsubscribe' | 'negative' | 'unknown'

export async function classifyReply(text: string, lead?: Lead | null): Promise<{ intent: ReplyIntent; summary: string }> {
  const lower = text.toLowerCase()
  if (/unsubscribe|remove me|stop emailing|don't email|do not email|no more/i.test(text)) return { intent: 'unsubscribe', summary: 'Asked to be removed from outreach.' }
  if (/fuck off|not interested|no thanks|stop|scam/i.test(text)) return { intent: 'negative', summary: 'Negative or not interested.' }
  if (/interested|how much|price|cost|send|call me|book|schedule|yes|tell me more|quote/i.test(text)) return { intent: 'hot', summary: 'Interested or asked for next step.' }

  if (process.env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const res = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Classify this cold-email reply as one of: hot, neutral, unsubscribe, negative, unknown. Return JSON with intent and summary under 20 words. Business: ${lead?.businessName ?? 'unknown'}\nReply: ${text}` }],
        response_format: { type: 'json_object' },
        temperature: 0
      })
      const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
      const intent = ['hot','neutral','unsubscribe','negative','unknown'].includes(parsed.intent) ? parsed.intent : 'unknown'
      return { intent, summary: String(parsed.summary || 'Reply classified.') }
    } catch {}
  }

  return { intent: 'neutral', summary: 'Reply needs manual review.' }
}
