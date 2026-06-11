import { createClient } from '@supabase/supabase-js'
import { Lead, ReplyRecord, ScanJob, ScanJobStatus, Suppression } from './types'
import { nowIso } from './utils'

const demoLeads: Lead[] = []
const demoSuppressions: Suppression[] = []
const demoReplies: ReplyRecord[] = []
const demoJobs: ScanJob[] = []

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function listLeads(): Promise<Lead[]> {
  const sb = supabaseAdmin()
  if (!sb) return demoLeads.sort((a,b) => b.score - a.score)
  const { data, error } = await sb.from('leads').select('*').order('score', { ascending: false }).limit(500)
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function getLead(id: string) {
  const sb = supabaseAdmin()
  if (!sb) return demoLeads.find(l => l.id === id) ?? null
  const { data, error } = await sb.from('leads').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export async function findLeadByEmail(email: string) {
  const normalized = email.toLowerCase().trim()
  const sb = supabaseAdmin()
  if (!sb) return demoLeads.find(l => l.email?.toLowerCase() === normalized) ?? null
  const { data, error } = await sb.from('leads').select('*').ilike('email', normalized).maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export async function getApprovedLeads(limit = 25) {
  const sb = supabaseAdmin()
  if (!sb) return demoLeads.filter(l => l.status === 'approved').slice(0, limit)
  const { data, error } = await sb.from('leads').select('*').eq('status', 'approved').order('score', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function getApprovedReplyLeads(limit = 25) {
  const sb = supabaseAdmin()
  if (!sb) return demoLeads.filter(l => l.status === 'reply_approved').slice(0, limit)
  const { data, error } = await sb.from('leads').select('*').eq('status', 'reply_approved').order('updated_at', { ascending: true }).limit(limit)
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function upsertLeads(leads: Lead[]) {
  const sb = supabaseAdmin()
  if (!sb) {
    for (const lead of leads) {
      const idx = demoLeads.findIndex(l => l.id === lead.id || (l.website && lead.website && l.website === lead.website) || (l.email && lead.email && l.email.toLowerCase() === lead.email.toLowerCase()))
      if (idx >= 0) demoLeads[idx] = { ...demoLeads[idx], ...lead, updatedAt: nowIso() }
      else demoLeads.push(lead)
    }
    return
  }
  const rows = leads.map(toRow)
  const { error } = await sb.from('leads').upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

export async function updateLead(id: string, patch: Partial<Lead>) {
  const sb = supabaseAdmin()
  if (!sb) {
    const idx = demoLeads.findIndex(l => l.id === id)
    if (idx >= 0) demoLeads[idx] = { ...demoLeads[idx], ...patch, updatedAt: nowIso() }
    return demoLeads[idx]
  }
  const { data, error } = await sb.from('leads').update(toRowPatch({ ...patch, updatedAt: nowIso() })).eq('id', id).select('*').single()
  if (error) throw error
  return fromRow(data)
}

export async function addSuppression(email: string, reason = 'unsubscribe') {
  const normalized = email.toLowerCase().trim()
  const row: Suppression = { email: normalized, reason, createdAt: nowIso() }
  const sb = supabaseAdmin()
  if (!sb) {
    if (!demoSuppressions.some(s => s.email === normalized)) demoSuppressions.push(row)
    const lead = demoLeads.find(l => l.email?.toLowerCase() === normalized)
    if (lead) lead.status = 'suppressed'
    return row
  }
  const { error } = await sb.from('email_suppressions').upsert({ email: normalized, reason, created_at: row.createdAt }, { onConflict: 'email' })
  if (error) throw error
  await sb.from('leads').update({ status: 'suppressed', updated_at: nowIso() }).ilike('email', normalized)
  return row
}

export async function isSuppressed(email?: string | null) {
  if (!email) return false
  const normalized = email.toLowerCase().trim()
  const sb = supabaseAdmin()
  if (!sb) return demoSuppressions.some(s => s.email === normalized)
  const { data, error } = await sb.from('email_suppressions').select('email').eq('email', normalized).maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function listSuppressions() {
  const sb = supabaseAdmin()
  if (!sb) return demoSuppressions
  const { data, error } = await sb.from('email_suppressions').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  return (data ?? []).map(r => ({ email: r.email, reason: r.reason, createdAt: r.created_at }))
}

export async function addReply(reply: ReplyRecord) {
  const sb = supabaseAdmin()
  if (!sb) {
    demoReplies.unshift(reply)
    return reply
  }
  const { error } = await sb.from('replies').insert({
    id: reply.id,
    lead_id: reply.leadId,
    email: reply.email,
    text: reply.text,
    intent: reply.intent,
    summary: reply.summary,
    created_at: reply.createdAt
  })
  if (error) throw error
  return reply
}

export async function listReplies() {
  const sb = supabaseAdmin()
  if (!sb) return demoReplies
  const { data, error } = await sb.from('replies').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data ?? []).map(r => ({ id: r.id, leadId: r.lead_id, email: r.email, text: r.text, intent: r.intent, summary: r.summary, createdAt: r.created_at }))
}

export async function createScanJob(job: ScanJob) {
  const sb = supabaseAdmin()
  if (!sb) {
    demoJobs.unshift(job)
    return job
  }
  const { data, error } = await sb.from('scan_jobs').insert(toJobRow(job)).select('*').single()
  if (error) throw error
  return fromJobRow(data)
}

export async function getScanJob(jobId: string) {
  const sb = supabaseAdmin()
  if (!sb) return demoJobs.find(j => j.id === jobId) ?? null
  const { data, error } = await sb.from('scan_jobs').select('*').eq('id', jobId).maybeSingle()
  if (error) throw error
  return data ? fromJobRow(data) : null
}

export async function listScanJobs(limit = 25) {
  const sb = supabaseAdmin()
  if (!sb) return demoJobs.slice(0, limit)
  const { data, error } = await sb.from('scan_jobs').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []).map(fromJobRow)
}

export async function getNextQueuedScanJob() {
  const sb = supabaseAdmin()
  if (!sb) return demoJobs.find(j => normalizeStatus(j.status) === 'running') ?? null

  const { data, error } = await sb.from('scan_jobs')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) throw error
  const row = (data ?? []).find(r => normalizeStatus(r.status) === 'running')
  return row ? fromJobRow(row) : null
}

export async function latestScanJobSummary(limit = 5) {
  const sb = supabaseAdmin()
  if (!sb) return demoJobs.slice(0, limit).map(j => `${j.id}:${j.status}:${j.cursor}/${j.combos.length}`)
  const { data, error } = await sb.from('scan_jobs')
    .select('id,status,cursor,combos,updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(r => `${r.id}:${r.status}:${r.cursor}/${Array.isArray(r.combos) ? r.combos.length : 0}`)
}

function normalizeStatus(status?: string | null) {
  return String(status || '').trim().toLowerCase()
}

export async function updateScanJob(jobId: string, patch: Partial<ScanJob>) {
  const sb = supabaseAdmin()
  const withTime = { ...patch, updatedAt: nowIso() }
  if (!sb) {
    const idx = demoJobs.findIndex(j => j.id === jobId)
    if (idx >= 0) demoJobs[idx] = { ...demoJobs[idx], ...withTime }
    return demoJobs[idx]
  }
  const { data, error } = await sb.from('scan_jobs').update(toJobRowPatch(withTime)).eq('id', jobId).select('*').single()
  if (error) throw error
  return fromJobRow(data)
}

export async function stats() {
  const leads = await listLeads()
  const suppressions = await listSuppressions()
  const replies = await listReplies()
  return {
    total: leads.length,
    hot: leads.filter(l => l.score >= 12 || l.status === 'hot').length,
    queued: leads.filter(l => l.status === 'queued' || l.status === 'new').length,
    approved: leads.filter(l => l.status === 'approved').length,
    sent: leads.filter(l => l.status === 'sent').length,
    contacts: leads.filter(l => l.email || l.contactUrl).length,
    suppressed: suppressions.length,
    replies: replies.length,
    siteOk: leads.filter(l => l.auditBucket === 'site_ok' || l.status === 'site_ok').length,
    needsFix: leads.filter(l => l.auditBucket === 'needs_fix' || l.auditBucket === 'no_site' || l.auditBucket === 'dead_site' || l.status === 'needs_fix').length,
    escrow: leads.filter(l => l.dealStage === 'escrow_requested' || l.status === 'escrow_requested' || l.status === 'upwork_sent').length,
  }
}

function toRow(l: Lead) {
  return {
    id: l.id,
    business_name: l.businessName,
    profession: l.profession,
    city: l.city,
    source: l.source,
    source_url: l.sourceUrl,
    website: l.website,
    phone: l.phone,
    email: l.email,
    contact_url: l.contactUrl,
    rating: l.rating,
    review_count: l.reviewCount,
    pagespeed_mobile: l.pagespeedMobile,
    pagespeed_desktop: l.pagespeedDesktop,
    issues: l.issues,
    visual_audit: l.visualAudit,
    score: l.score,
    status: l.status,
    message: l.message,
    subject: l.subject,
    last_reply: l.lastReply,
    reply_intent: l.replyIntent,
    reply_subject: l.replySubject,
    reply_message: l.replyMessage,
    audit_bucket: l.auditBucket,
    deal_stage: l.dealStage,
    payment_preference: l.paymentPreference,
    review_notes: l.reviewNotes,
    created_at: l.createdAt,
    updated_at: l.updatedAt,
  }
}

function toRowPatch(p: Partial<Lead>) {
  const row: Record<string, unknown> = {}
  if (p.businessName !== undefined) row.business_name = p.businessName
  if (p.profession !== undefined) row.profession = p.profession
  if (p.city !== undefined) row.city = p.city
  if (p.source !== undefined) row.source = p.source
  if (p.sourceUrl !== undefined) row.source_url = p.sourceUrl
  if (p.website !== undefined) row.website = p.website
  if (p.phone !== undefined) row.phone = p.phone
  if (p.email !== undefined) row.email = p.email
  if (p.contactUrl !== undefined) row.contact_url = p.contactUrl
  if (p.rating !== undefined) row.rating = p.rating
  if (p.reviewCount !== undefined) row.review_count = p.reviewCount
  if (p.pagespeedMobile !== undefined) row.pagespeed_mobile = p.pagespeedMobile
  if (p.pagespeedDesktop !== undefined) row.pagespeed_desktop = p.pagespeedDesktop
  if (p.issues !== undefined) row.issues = p.issues
  if (p.visualAudit !== undefined) row.visual_audit = p.visualAudit
  if (p.score !== undefined) row.score = p.score
  if (p.status !== undefined) row.status = p.status
  if (p.message !== undefined) row.message = p.message
  if (p.subject !== undefined) row.subject = p.subject
  if (p.lastReply !== undefined) row.last_reply = p.lastReply
  if (p.replyIntent !== undefined) row.reply_intent = p.replyIntent
  if (p.replySubject !== undefined) row.reply_subject = p.replySubject
  if (p.replyMessage !== undefined) row.reply_message = p.replyMessage
  if (p.auditBucket !== undefined) row.audit_bucket = p.auditBucket
  if (p.dealStage !== undefined) row.deal_stage = p.dealStage
  if (p.paymentPreference !== undefined) row.payment_preference = p.paymentPreference
  if (p.reviewNotes !== undefined) row.review_notes = p.reviewNotes
  if (p.createdAt !== undefined) row.created_at = p.createdAt
  if (p.updatedAt !== undefined) row.updated_at = p.updatedAt
  return row
}

function fromRow(r: any): Lead {
  return {
    id: r.id,
    businessName: r.business_name,
    profession: r.profession,
    city: r.city,
    source: r.source,
    sourceUrl: r.source_url ?? undefined,
    website: r.website,
    phone: r.phone,
    email: r.email,
    contactUrl: r.contact_url,
    rating: r.rating,
    reviewCount: r.review_count,
    pagespeedMobile: r.pagespeed_mobile,
    pagespeedDesktop: r.pagespeed_desktop,
    issues: r.issues ?? [],
    visualAudit: r.visual_audit ?? undefined,
    score: r.score ?? 0,
    status: r.status ?? 'new',
    message: r.message ?? '',
    subject: r.subject ?? 'quick site thing',
    lastReply: r.last_reply ?? undefined,
    replyIntent: r.reply_intent ?? undefined,
    replySubject: r.reply_subject ?? undefined,
    replyMessage: r.reply_message ?? undefined,
    auditBucket: r.audit_bucket ?? undefined,
    dealStage: r.deal_stage ?? 'none',
    paymentPreference: r.payment_preference ?? 'unknown',
    reviewNotes: r.review_notes ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function toJobRow(j: ScanJob) {
  return {
    id: j.id,
    status: j.status,
    combos: j.combos,
    max_per_combo: j.maxPerCombo,
    cursor: j.cursor,
    scanned_combos: j.scannedCombos,
    created_leads: j.createdLeads,
    error: j.error,
    worker_last_seen_at: j.workerLastSeenAt,
    created_at: j.createdAt,
    updated_at: j.updatedAt,
  }
}

function toJobRowPatch(p: Partial<ScanJob>) {
  const row: Record<string, unknown> = {}
  if (p.status !== undefined) row.status = p.status
  if (p.combos !== undefined) row.combos = p.combos
  if (p.maxPerCombo !== undefined) row.max_per_combo = p.maxPerCombo
  if (p.cursor !== undefined) row.cursor = p.cursor
  if (p.scannedCombos !== undefined) row.scanned_combos = p.scannedCombos
  if (p.createdLeads !== undefined) row.created_leads = p.createdLeads
  if (p.error !== undefined) row.error = p.error
  if (p.workerLastSeenAt !== undefined) row.worker_last_seen_at = p.workerLastSeenAt
  if (p.createdAt !== undefined) row.created_at = p.createdAt
  if (p.updatedAt !== undefined) row.updated_at = p.updatedAt
  return row
}

function fromJobRow(r: any): ScanJob {
  return {
    id: r.id,
    status: r.status as ScanJobStatus,
    combos: r.combos ?? [],
    maxPerCombo: r.max_per_combo ?? 3,
    cursor: r.cursor ?? 0,
    scannedCombos: r.scanned_combos ?? 0,
    createdLeads: r.created_leads ?? 0,
    error: r.error ?? undefined,
    workerLastSeenAt: r.worker_last_seen_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
