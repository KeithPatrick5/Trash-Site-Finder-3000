import { z } from 'zod'
import { findBusinesses, rawToLead } from './discovery'
import { auditLead } from './audit'
import { generateMessage } from './messaging'
import { createScanJob as persistScanJob, getNextQueuedScanJob, getScanJob as getPersistedScanJob, listScanJobs as listPersistedScanJobs, updateScanJob, upsertLeads } from './store'
import { id, nowIso, mapLimit } from './utils'
import type { ScanJob } from './types'

export const createScanJobSchema = z.object({
  professions: z.array(z.string()).min(1).max(500),
  cities: z.array(z.string()).min(1).max(500),
  maxPerCombo: z.number().int().min(1).max(20).default(3),
  sendMode: z.enum(['queue','send']).default('queue')
})

export function publicJob(job: ScanJob) {
  return {
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
  }
}

export async function createScanJob(input: z.infer<typeof createScanJobSchema>) {
  const combos = input.professions.flatMap(profession => input.cities.map(city => ({ profession, city })))
  const maxCombos = Number(process.env.MAX_SCAN_COMBOS || 2500)
  if (combos.length > maxCombos) throw new Error(`Too many combinations. Limit is ${maxCombos}.`)
  const now = nowIso()
  const job: ScanJob = {
    id: id('job'),
    status: 'queued',
    combos,
    maxPerCombo: input.maxPerCombo,
    cursor: 0,
    scannedCombos: 0,
    createdLeads: 0,
    createdAt: now,
    updatedAt: now
  }
  return publicJob(await persistScanJob(job))
}

export async function getScanJob(jobId: string) {
  const job = await getPersistedScanJob(jobId)
  return job ? publicJob(job) : null
}

export async function listScanJobs() {
  const jobs = await listPersistedScanJobs()
  return jobs.map(publicJob)
}

export async function claimNextScanJob() {
  const job = await getNextQueuedScanJob()
  if (!job || job.status === 'paused') return null
  return updateScanJob(job.id, { status: 'running', workerLastSeenAt: nowIso(), error: undefined })
}

export async function processOneScanBatch(job: ScanJob) {
  if (job.status === 'done' || job.status === 'failed' || job.status === 'paused') return publicJob(job)

  const batchSize = Number(process.env.MAX_SCAN_BATCH_SIZE || process.env.SCAN_BATCH_SIZE || 25)
  const comboConcurrency = Number(process.env.SCAN_CONCURRENCY || 2)
  const auditConcurrency = Number(process.env.AUDIT_CONCURRENCY || 2)
  const slice = job.combos.slice(job.cursor, job.cursor + batchSize)

  if (!slice.length) {
    const done = await updateScanJob(job.id, { status: 'done', workerLastSeenAt: nowIso() })
    return publicJob(done)
  }

  await updateScanJob(job.id, { status: 'running', workerLastSeenAt: nowIso() })

  try {
    const chunks = await mapLimit(slice, comboConcurrency, async combo => {
      const raw = await findBusinesses(combo.profession, combo.city, job.maxPerCombo)
      return mapLimit(raw.map(rawToLead), auditConcurrency, async lead => {
        const audited = await auditLead(lead)
        const msg = await generateMessage(audited)
        return { ...audited, ...msg }
      })
    })

    const leads = chunks.flat()
    await upsertLeads(leads)

    const nextCursor = job.cursor + slice.length
    const status = nextCursor >= job.combos.length ? 'done' : 'queued'
    const updated = await updateScanJob(job.id, {
      cursor: nextCursor,
      scannedCombos: job.scannedCombos + slice.length,
      createdLeads: job.createdLeads + leads.length,
      status,
      workerLastSeenAt: nowIso()
    })
    return publicJob(updated)
  } catch (e: any) {
    const failed = await updateScanJob(job.id, {
      status: 'failed',
      error: e?.message || 'Scan failed',
      workerLastSeenAt: nowIso()
    })
    return publicJob(failed)
  }
}
