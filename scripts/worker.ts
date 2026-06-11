import dotenv from 'dotenv'
dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ quiet: true })
import { claimNextScanJob, debugLatestScanJobs, processOneScanBatch } from '../lib/jobs'
import { getApprovedLeads, getApprovedReplyLeads, isSuppressed, updateLead } from '../lib/store'
import { sendLeadEmail, sendReplyEmail } from '../lib/email'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name]
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

let sentThisRun = 0
let scannedCombosThisRun = 0

async function sendApprovedEmailBatch() {
  const enabled = boolEnv('WORKER_SEND_APPROVED_EMAILS', true)
  if (!enabled) return 0

  const dailyLimit = Number(process.env.MAX_DAILY_EMAILS || process.env.DAILY_SEND_LIMIT || 50)
  if (sentThisRun >= dailyLimit) return 0
  const limit = Math.min(Number(process.env.MAX_EMAIL_BATCH_SIZE || 5), dailyLimit - sentThisRun)
  const leads = await getApprovedLeads(limit)
  let sent = 0

  for (const lead of leads) {
    if (!lead.email) {
      await updateLead(lead.id, { status: 'skipped' })
      continue
    }
    if (await isSuppressed(lead.email)) {
      await updateLead(lead.id, { status: 'suppressed' })
      continue
    }
    try {
      await sendLeadEmail(lead)
      sent++
      sentThisRun++
      console.log(`sent: ${lead.businessName} <${lead.email}>`)
    } catch (e: any) {
      console.warn(`send blocked for ${lead.businessName}: ${e?.message || e}`)
      break
    }
  }

  return sent
}


async function sendApprovedReplyBatch() {
  const enabled = boolEnv('WORKER_SEND_APPROVED_EMAILS', true)
  if (!enabled) return 0

  const dailyLimit = Number(process.env.MAX_DAILY_EMAILS || process.env.DAILY_SEND_LIMIT || 50)
  if (sentThisRun >= dailyLimit) return 0
  const limit = Math.min(Number(process.env.MAX_EMAIL_BATCH_SIZE || 5), dailyLimit - sentThisRun)
  const leads = await getApprovedReplyLeads(limit)
  let sent = 0

  for (const lead of leads) {
    if (!lead.email) {
      await updateLead(lead.id, { status: 'skipped' })
      continue
    }
    if (await isSuppressed(lead.email)) {
      await updateLead(lead.id, { status: 'suppressed' })
      continue
    }
    try {
      await sendReplyEmail(lead)
      sent++
      sentThisRun++
      console.log(`reply sent: ${lead.businessName} <${lead.email}>`)
    } catch (e: any) {
      console.warn(`reply send blocked for ${lead.businessName}: ${e?.message || e}`)
      break
    }
  }

  return sent
}

async function main() {
  const sleepMs = Number(process.env.WORKER_SLEEP_MS || 5000)
  const once = process.argv.includes('--once')

  console.log('Trash Site Finder 3000 v2.13 local worker started')
  console.log('Worker ready. Processing running/queued jobs only within your env caps.')

  let idleLoops = 0

  while (true) {
    const job = await claimNextScanJob()
    if (job) {
      const scanLimit = Number(process.env.MAX_DAILY_SCANS || 500)
      if (scannedCombosThisRun >= scanLimit) {
        console.log(`scan cap reached for this worker run: ${scannedCombosThisRun}/${scanLimit} combos. Stop/restart tomorrow or raise MAX_DAILY_SCANS.`)
      } else {
        const before = job.scannedCombos
        const result = await processOneScanBatch(job)
        scannedCombosThisRun += Math.max(0, result.scannedCombos - before)
        console.log(`job ${result.id}: ${result.status} ${result.scannedCombos}/${result.totalCombos} combos, leads ${result.createdLeads}`)
      }
    }

    const sent = await sendApprovedEmailBatch()
    const repliesSent = await sendApprovedReplyBatch()
    if (!job && sent === 0 && repliesSent === 0) {
      idleLoops++
      if (idleLoops === 1 || idleLoops % 15 === 0) {
        const latest = await debugLatestScanJobs().catch(() => [])
        console.log(`idle - no running jobs or approved emails. Latest jobs: ${latest.length ? latest.join(' | ') : 'none'}. Sleeping ${sleepMs}ms.`)
      }
    } else {
      idleLoops = 0
    }
    if (once) break
    await sleep(sleepMs)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
