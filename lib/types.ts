export type LeadStatus =
  | 'new'
  | 'queued'
  | 'approved'
  | 'sent'
  | 'replied'
  | 'reply_approved'
  | 'hot'
  | 'dead'
  | 'skipped'
  | 'suppressed'
  | 'site_ok'
  | 'needs_fix'
  | 'no_email'
  | 'escrow_requested'
  | 'upwork_sent'
  | 'preview_sent'
  | 'won'
  | 'lost'

export type SiteIssue = {
  code: string
  label: string
  severity: number
}

export type VisualAudit = {
  screenshotUrl?: string
  title?: string
  description?: string
  h1?: string
  hasViewport: boolean
  imageCount: number
  ctaCount: number
  formCount: number
  phoneLinks: number
  emailLinks: number
  textLength: number
}

export type Lead = {
  id: string
  businessName: string
  profession: string
  city: string
  source: string
  website?: string
  phone?: string
  email?: string
  contactUrl?: string
  rating?: number
  reviewCount?: number
  pagespeedMobile?: number | null
  pagespeedDesktop?: number | null
  issues: SiteIssue[]
  visualAudit?: VisualAudit
  score: number
  status: LeadStatus
  message: string
  subject: string
  lastReply?: string
  replyIntent?: 'hot' | 'neutral' | 'unsubscribe' | 'negative' | 'unknown'
  replySubject?: string
  replyMessage?: string
  auditBucket?: 'site_ok' | 'needs_fix' | 'no_site' | 'dead_site' | 'no_email' | 'needs_review'
  dealStage?: 'none' | 'interested' | 'preview_requested' | 'preview_sent' | 'direct_payment' | 'escrow_requested' | 'upwork_sent' | 'won' | 'lost'
  paymentPreference?: 'unknown' | 'direct' | 'escrow' | 'upwork'
  createdAt: string
  updatedAt: string
}

export type ScanRequest = {
  professions: string[]
  cities: string[]
  maxPerCombo: number
  sendMode: 'queue' | 'send'
}

export type ScanJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'paused'

export type ScanCombo = { profession: string; city: string }

export type ScanJob = {
  id: string
  status: ScanJobStatus
  combos: ScanCombo[]
  maxPerCombo: number
  cursor: number
  scannedCombos: number
  createdLeads: number
  error?: string
  workerLastSeenAt?: string
  createdAt: string
  updatedAt: string
}

export type Suppression = {
  email: string
  reason: string
  createdAt: string
}

export type ReplyRecord = {
  id: string
  leadId?: string
  email?: string
  text: string
  intent: 'hot' | 'neutral' | 'unsubscribe' | 'negative' | 'unknown'
  summary: string
  createdAt: string
}
