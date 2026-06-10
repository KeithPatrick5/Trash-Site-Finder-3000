import { NextResponse } from 'next/server'
import { listLeads, updateLead } from '@/lib/store'

export async function GET() {
  return NextResponse.json({ leads: await listLeads() })
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { id, ...patch } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  return NextResponse.json({ lead: await updateLead(id, patch) })
}
