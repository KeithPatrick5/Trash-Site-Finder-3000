import { NextResponse } from 'next/server'
import { getScanJob, listScanJobs } from '@/lib/jobs'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ jobs: await listScanJobs() })
  const job = await getScanJob(id)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json({ job })
}

export async function POST() {
  return NextResponse.json({
    error: 'Browser/API job processing is disabled. Run `npm run worker` locally to process queued jobs.'
  }, { status: 409 })
}
