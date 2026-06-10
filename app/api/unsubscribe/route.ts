import { NextResponse } from 'next/server'
import { addSuppression } from '@/lib/store'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const email = url.searchParams.get('email')
  if (!email) return new Response('Missing email', { status: 400 })
  await addSuppression(email, 'unsubscribe_link')
  return new Response('You are unsubscribed. You will not receive more outreach emails from this sender.', { headers: { 'Content-Type': 'text/plain' } })
}

export async function POST(req: Request) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  return NextResponse.json({ suppression: await addSuppression(email, 'unsubscribe_post') })
}
