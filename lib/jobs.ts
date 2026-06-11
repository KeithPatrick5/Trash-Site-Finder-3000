import { z } from 'zod'
import { findBusinesses, rawToLead } from './discovery'
import { auditLead } from './audit'
import { generateMessage } from './messaging'
import { createScanJob as persistScanJob, getNextQueuedScanJob, getScanJob as getPersistedScanJob, latestScanJobSummary, listScanJobs as listPersistedScanJobs, updateScanJob, upsertLeads } from './store'
import { id, nowIso, mapLimit } from './utils'
import { canUseGoogleTextSearch } from './usage'
import type { ScanJob } from './types'

export const createScanJobSchema = z.object({
  professions: z.array(z.string()).min(1).max(500),
  cities: z.array(z.string()).min(1).max(500),
  maxPerCombo: z.number().int().min(1).max(500).default(100),
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
  const maxCombos = Number(process.env.MAX_SCAN_COMBOS || 10000)
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

export async function debugLatestScanJobs() {
  return latestScanJobSummary(5)
}

export async function processOneScanBatch(job: ScanJob) {
  if (job.status === 'done' || job.status === 'failed' || job.status === 'paused') return publicJob(job)

  const batchSize = Math.max(1, Number(process.env.MAX_SCAN_BATCH_SIZE || process.env.SCAN_BATCH_SIZE || 10))
  const auditConcurrency = Math.max(1, Number(process.env.AUDIT_CONCURRENCY || 1))
  const slice = job.combos.slice(job.cursor, job.cursor + batchSize)

  if (!slice.length) {
    const done = await updateScanJob(job.id, { status: 'done', workerLastSeenAt: nowIso(), error: undefined })
    return publicJob(done)
  }

  let cursor = job.cursor
  let scanned = job.scannedCombos
  let created = job.createdLeads
  let lastJob = await updateScanJob(job.id, { status: 'running', workerLastSeenAt: nowIso(), error: undefined })

  for (const combo of slice) {
    const allowed = await canUseGoogleTextSearch()
    if (!allowed.ok) {
      lastJob = await updateScanJob(job.id, {
        status: 'paused',
        error: `Google cap reached: ${allowed.reason}`,
        workerLastSeenAt: nowIso()
      })
      console.log(`paused: Google cap reached before ${combo.profession} / ${combo.city}: ${allowed.reason}`)
      return publicJob(lastJob)
    }

    console.log(`combo ${cursor + 1}/${job.combos.length}: ${combo.profession} / ${combo.city}`)

    try {
      const raw = await findBusinesses(combo.profession, combo.city, job.maxPerCombo)
      const leads = await mapLimit(raw.map(rawToLead).map(lead => ({ ...lead, jobId: job.id })), auditConcurrency, async lead => {
        const audited = await auditLead(lead)
        const msg = await generateMessage(audited)
        return { ...audited, ...msg }
      })

      await upsertLeads(leads)

      cursor += 1
      scanned += 1
      created += leads.length
      const status = cursor >= job.combos.length ? 'done' : 'running'
      lastJob = await updateScanJob(job.id, {
        cursor,
        scannedCombos: scanned,
        createdLeads: created,
        status,
        error: undefined,
        workerLastSeenAt: nowIso()
      })
      console.log(`saved: ${leads.length} leads from ${combo.profession} / ${combo.city}. progress ${cursor}/${job.combos.length}, total leads ${created}`)

      if (status === 'done') return publicJob(lastJob)
    } catch (e: any) {
      cursor += 1
      scanned += 1
      lastJob = await updateScanJob(job.id, {
        cursor,
        scannedCombos: scanned,
        status: cursor >= job.combos.length ? 'done' : 'running',
        error: `Skipped ${combo.profession} / ${combo.city}: ${e?.message || e}`,
        workerLastSeenAt: nowIso()
      })
      console.warn(`skipped combo ${combo.profession} / ${combo.city}: ${e?.message || e}`)
    }
  }

  return publicJob(lastJob)
}
