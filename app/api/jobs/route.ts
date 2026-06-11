import { NextResponse } from 'next/server'
import { getScanJob, listScanJobs } from '@/lib/jobs'
import { updateScanJob } from '@/lib/store'
import { getUsageSummary } from '@/lib/usage'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ jobs: await listScanJobs(), usage: await getUsageSummary() })
  const job = await getScanJob(id)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json({ job, usage: await getUsageSummary() })
}

export async function PATCH(req: Request) {
  const { id, action } = await req.json()
  if (!['pause', 'resume', 'reset'].includes(action)) return NextResponse.json({ error: 'action must be pause, resume, or reset' }, { status: 400 })

  let targetId = id
  if (!targetId) {
    const jobs = await listScanJobs()
    const active = jobs.find(j => ['queued', 'running', 'paused'].includes(String(j.status).toLowerCase()) && j.remainingCombos > 0)
    targetId = active?.id
  }
  if (!targetId) return NextResponse.json({ error: 'No unfinished queue found' }, { status: 404 })

  const patch = action === 'pause'
    ? { status: 'paused' as const }
    : action === 'resume'
      ? { status: 'running' as const, error: undefined }
      : { status: 'queued' as const, cursor: 0, scannedCombos: 0, createdLeads: 0, error: undefined }
  const job = await updateScanJob(targetId, patch)
  return NextResponse.json({ ok: true, job: {
    id: job.id,
    status: job.status,
    totalCombos: job.combos.length,
    scannedCombos: job.scannedCombos,
    createdLeads: job.createdLeads,
    remainingCombos: Math.max(0, job.combos.length - job.cursor),
    error: job.error,
    workerLastSeenAt: job.workerLastSeenAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  } })
}

export async function POST() {
  return NextResponse.json({
    error: 'Browser/API job processing is disabled. Run `npm run worker` locally to process queued jobs.'
  }, { status: 409 })
}
