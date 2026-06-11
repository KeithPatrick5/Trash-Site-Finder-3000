import { Lead, SiteIssue, VisualAudit } from './types'
import { clamp } from './utils'

const issueDefs: Record<string, { label: string; severity: number }> = {
  no_website: { label: 'no website found', severity: 5 },
  no_https: { label: 'no HTTPS', severity: 3 },
  load_failed: { label: 'site did not load cleanly', severity: 5 },
  slow_mobile: { label: 'bad mobile speed', severity: 4 },
  no_email: { label: 'no public email found', severity: 1 },
  no_contact_form: { label: 'contact form hard to find', severity: 3 },
  no_quote_or_booking: { label: 'no obvious quote/booking flow', severity: 4 },
  old_copyright: { label: 'old copyright/footer', severity: 2 },
  weak_cta: { label: 'weak call-to-action', severity: 3 },
  no_mobile_viewport: { label: 'missing mobile viewport tag', severity: 3 },
  thin_content: { label: 'thin content', severity: 2 },
  no_forms: { label: 'no form detected', severity: 2 },
  phone_not_clickable: { label: 'phone not clickable', severity: 2 },
  wixy: { label: 'template-site energy', severity: 2 }
}

export async function auditLead(lead: Lead): Promise<Lead> {
  const issues: SiteIssue[] = []
  let html = ''
  let email: string | undefined
  let contactUrl: string | undefined
  let visualAudit: VisualAudit | undefined

  if (!lead.website) {
    issues.push(issue('no_website'))
  } else {
    if (!lead.website.startsWith('https://')) issues.push(issue('no_https'))
    try {
      const res = await fetchWithTimeout(lead.website, 9000)
      if (!res.ok) issues.push(issue('load_failed'))
      html = await res.text()
      const discovery = await discoverContactInfo(html, lead.website)
      email = discovery.email
      contactUrl = discovery.contactUrl
      visualAudit = buildVisualAudit(html, lead.website)

      if (!email) issues.push(issue('no_email'))
      if (!contactUrl && !/contact|request|estimate|quote|book|appointment/i.test(html)) issues.push(issue('no_contact_form'))
      if (!/quote|estimate|booking|appointment|schedule|request|upload photo|free consultation/i.test(html)) issues.push(issue('no_quote_or_booking'))
      if (/20(0\d|1[0-9]|20|21|22)\b/.test(html)) issues.push(issue('old_copyright'))
      if (!/(call now|get started|book|schedule|request|quote|estimate|contact us)/i.test(html)) issues.push(issue('weak_cta'))
      if (!visualAudit.hasViewport) issues.push(issue('no_mobile_viewport'))
      if (visualAudit.textLength < 800) issues.push(issue('thin_content'))
      if (visualAudit.formCount < 1) issues.push(issue('no_forms'))
      if (lead.phone && visualAudit.phoneLinks < 1) issues.push(issue('phone_not_clickable'))
      if (/wix|squarespace|weebly|godaddy|cdn-cgi|wp-content\/themes/i.test(html)) issues.push(issue('wixy'))
    } catch {
      issues.push(issue('load_failed'))
    }
  }

  const page = await pageSpeed(lead.website)
  if (page.mobile !== null && page.mobile < 55) issues.push(issue('slow_mobile'))

  const deduped = dedupeIssues(issues)
  const score = scoreLead({ ...lead, email: email ?? lead.email, contactUrl: contactUrl ?? lead.contactUrl }, deduped, page.mobile)

  return {
    ...lead,
    email: email ?? lead.email,
    contactUrl: contactUrl ?? lead.contactUrl,
    pagespeedMobile: page.mobile,
    pagespeedDesktop: page.desktop,
    visualAudit,
    issues: deduped,
    score,
    status: bucketFromIssues(deduped, score, email ?? lead.email) === 'site_ok' ? 'site_ok' : bucketFromIssues(deduped, score, email ?? lead.email) === 'no_email' ? 'no_email' : 'needs_fix',
    auditBucket: bucketFromIssues(deduped, score, email ?? lead.email),
    updatedAt: new Date().toISOString()
  }
}


function bucketFromIssues(issues: SiteIssue[], score: number, email?: string): Lead['auditBucket'] {
  if (issues.some(i => i.code === 'no_website')) return email ? 'no_site' : 'no_email'
  if (issues.some(i => i.code === 'load_failed')) return email ? 'dead_site' : 'no_email'
  if (score >= 8) return email ? 'needs_fix' : 'no_email'
  return 'site_ok'
}

function issue(code: string): SiteIssue {
  const d = issueDefs[code]
  return { code, label: d.label, severity: d.severity }
}

function dedupeIssues(items: SiteIssue[]) {
  return Array.from(new Map(items.map(i => [i.code, i])).values()).sort((a,b) => b.severity - a.severity)
}

function scoreLead(lead: Lead, issues: SiteIssue[], mobile: number | null) {
  let score = issues.reduce((sum, i) => sum + i.severity, 0)
  const highTicket = /roofer|plumber|HVAC|lawyer|dentist|med spa|clinic|remodel|chiropractor|real estate|property|accountant/i.test(lead.profession)
  if (highTicket) score += 4
  if ((lead.reviewCount ?? 0) >= 20) score += 2
  if ((lead.rating ?? 0) >= 4.2) score += 1
  if (lead.email) score += 2
  if (lead.contactUrl) score += 1
  if (mobile !== null && mobile < 35) score += 2
  return clamp(score, 0, 40)
}

async function pageSpeed(url?: string): Promise<{ mobile: number | null; desktop: number | null }> {
  if (!url) return { mobile: null, desktop: null }
  const enabled = ['1', 'true', 'yes', 'on'].includes(String(process.env.ENABLE_PAGESPEED || 'false').toLowerCase())
  const key = process.env.GOOGLE_PAGESPEED_API_KEY
  if (!enabled || !key || url.includes('example.')) return { mobile: null, desktop: null }
  const fetchScore = async (strategy: 'mobile' | 'desktop') => {
    try {
      const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&key=${key}`
      const res = await fetch(api)
      if (!res.ok) return null
      const json = await res.json()
      const score = json.lighthouseResult?.categories?.performance?.score
      return typeof score === 'number' ? Math.round(score * 100) : null
    } catch { return null }
  }
  return { mobile: await fetchScore('mobile'), desktop: await fetchScore('desktop') }
}

function buildVisualAudit(html: string, url: string): VisualAudit {
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1]?.trim()
  const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/is)?.[1]?.replace(/<[^>]+>/g, '').trim()
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return {
    screenshotUrl: shouldIncludeScreenshot() ? screenshotUrl(url) : undefined,
    title,
    description,
    h1,
    hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    imageCount: (html.match(/<img\b/gi) ?? []).length,
    ctaCount: (html.match(/call now|get started|book|schedule|request|quote|estimate|contact us/gi) ?? []).length,
    formCount: (html.match(/<form\b/gi) ?? []).length,
    phoneLinks: (html.match(/href=["']tel:/gi) ?? []).length,
    emailLinks: (html.match(/href=["']mailto:/gi) ?? []).length,
    textLength: text.length
  }
}

function shouldIncludeScreenshot() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.ENABLE_SCREENSHOTS || 'false').toLowerCase())
}

function screenshotUrl(url: string) {
  if (process.env.SCREENSHOTONE_ACCESS_KEY) {
    return `https://api.screenshotone.com/take?access_key=${process.env.SCREENSHOTONE_ACCESS_KEY}&url=${encodeURIComponent(url)}&viewport_width=390&viewport_height=844&device_scale_factor=2&format=jpg&block_ads=true&block_cookie_banners=true`
  }
  if (process.env.BROWSERLESS_TOKEN) {
    return `https://chrome.browserless.io/screenshot?token=${process.env.BROWSERLESS_TOKEN}&url=${encodeURIComponent(url)}`
  }
  return undefined
}

async function discoverContactInfo(homeHtml: string, base: string): Promise<{ email?: string; contactUrl?: string }> {
  const homeEmail = extractEmail(homeHtml)
  const links = extractCandidateContactUrls(homeHtml, base)
  const contactUrl = links[0]
  if (homeEmail) return { email: homeEmail, contactUrl }

  const maxPages = Math.max(0, Number(process.env.MAX_EMAIL_DISCOVERY_PAGES || 3))
  for (const url of links.slice(0, maxPages)) {
    try {
      const res = await fetchWithTimeout(url, 7000)
      if (!res.ok) continue
      const html = await res.text()
      const found = extractEmail(html)
      if (found) return { email: found, contactUrl: url }
    } catch {}
  }

  return { contactUrl }
}

function extractEmail(html: string) {
  const decoded = decodeHtmlEntities(html)
    .replace(/\s*\[at\]\s*|\s*\(at\)\s*|\s+at\s+/gi, '@')
    .replace(/\s*\[dot\]\s*|\s*\(dot\)\s*|\s+dot\s+/gi, '.')

  const mailto = decoded.match(/mailto:([^"'?#>\s]+)/i)?.[1]
  const direct = mailto || decoded.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0]
  if (!direct) return undefined
  const cleaned = direct.trim().replace(/^mailto:/i, '').replace(/[),.;]+$/g, '').toLowerCase()
  if (/example\.com|domain\.com|yourdomain\.com|email\.com|sentry\.io|wixpress\.com|schema\.org/.test(cleaned)) return undefined
  return cleaned
}

function extractCandidateContactUrls(html: string, base: string) {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1])
  const ranked = hrefs
    .filter(h => !h.startsWith('#') && !/^mailto:|^tel:|javascript:/i.test(h))
    .map(h => {
      try { return new URL(h, base).toString() } catch { return '' }
    })
    .filter(Boolean)
    .filter(url => sameHostOrSubPath(url, base))
    .map(url => ({ url, score: contactScore(url) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.url)
  return Array.from(new Set(ranked))
}

function extractContactUrl(html: string, base: string) {
  return extractCandidateContactUrls(html, base)[0]
}

function contactScore(url: string) {
  const u = url.toLowerCase()
  if (/contact/.test(u)) return 10
  if (/quote|estimate|book|appointment|schedule/.test(u)) return 8
  if (/about|company|team/.test(u)) return 5
  if (/service|location/.test(u)) return 2
  return 0
}

function sameHostOrSubPath(url: string, base: string) {
  try {
    const a = new URL(url)
    const b = new URL(base)
    return a.hostname === b.hostname || a.hostname.endsWith(`.${b.hostname}`)
  } catch { return false }
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&#64;|&commat;/gi, '@')
    .replace(/&#46;|&period;/gi, '.')
    .replace(/&amp;/gi, '&')
}

async function fetchWithTimeout(url: string, ms: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrashSiteFinder3000/2.14; local lead audit)' } })
  } finally {
    clearTimeout(timeout)
  }
}
