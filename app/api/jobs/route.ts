import { NextResponse } from 'next/server'
import { getScanJob, listScanJobs } from '@/lib/jobs'
import { updateScanJob } from '@/lib/store'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ jobs: await listScanJobs() })
  const job = await getScanJob(id)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json({ job })
}

export async function PATCH(req: Request) {
  const { id, action } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!['pause', 'resume', 'reset'].includes(action)) return NextResponse.json({ error: 'action must be pause, resume, or reset' }, { status: 400 })
  const patch = action === 'pause'
    ? { status: 'paused' as const }
    : action === 'resume'
      ? { status: 'running' as const, error: undefined }
      : { status: 'queued' as const, cursor: 0, scannedCombos: 0, createdLeads: 0, error: undefined }
  const job = await updateScanJob(id, patch)
  return NextResponse.json({ ok: true, job })
}

export async function POST() {
  return NextResponse.json({
    error: 'Browser/API job processing is disabled. Run `npm run worker` locally to process queued jobs.'
  }, { status: 409 })
}
