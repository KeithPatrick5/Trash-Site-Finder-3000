import { NextResponse } from 'next/server'
import { addSuppression, listSuppressions } from '@/lib/store'

export async function GET() {
  return NextResponse.json({ suppressions: await listSuppressions() })
}

export async function POST(req: Request) {
  const { email, reason } = await req.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  return NextResponse.json({ suppression: await addSuppression(email, reason || 'manual') })
}
