import { Lead } from './types'
import { id, nowIso } from './utils'
import { canUseGoogleTextSearch, recordGoogleTextSearchCall } from './usage'

export class GooglePlacesQuotaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GooglePlacesQuotaError'
  }
}

export type RawBusiness = {
  name: string
  profession: string
  city: string
  source: string
  sourceUrl?: string
  website?: string
  phone?: string
  rating?: number
  reviewCount?: number
}

export async function findBusinesses(profession: string, city: string, max = 100): Promise<RawBusiness[]> {
  const limit = Math.max(1, Math.min(max, Number(process.env.MAX_BUSINESSES_PER_COMBO || max || 100)))
  if (process.env.GOOGLE_PLACES_API_KEY) {
    const live = await googlePlacesWideSearch(profession, city, limit)
    if (live.length) return live

    // Do not silently switch to fake/demo rows in a real Google run.
    // Empty Google result sets should save zero leads, not garbage leads.
    const demoFallback = ['1', 'true', 'yes', 'on'].includes(String(process.env.ENABLE_DEMO_FALLBACK || 'false').toLowerCase())
    return demoFallback ? demoBusinesses(profession, city, limit) : []
  }
  return demoBusinesses(profession, city, limit)
}

async function googlePlacesWideSearch(profession: string, city: string, max: number): Promise<RawBusiness[]> {
  const baseQuery = `${profession} in ${city}`
  const all = await googlePlacesTextSearch(baseQuery, profession, city, max)

  // Cost gate: extra query variations are OFF unless explicitly enabled.
  // This prevents one combo from quietly becoming 6+ billable Google calls.
  const variationsEnabled = ['1', 'true', 'yes', 'on'].includes(String(process.env.ENABLE_GOOGLE_QUERY_VARIATIONS || 'false').toLowerCase())
  if (!variationsEnabled || all.length >= max) return dedupeBusinesses(all).slice(0, max)

  const variations = unique([
    `${profession} near ${city}`,
    `${city} ${profession}`,
    `best ${profession} ${city}`,
    `local ${profession} ${city}`
  ])

  for (const q of variations) {
    if (all.length >= max) break
    const chunk = await googlePlacesTextSearch(q, profession, city, max - all.length)
    all.push(...chunk)
  }

  return dedupeBusinesses(all).slice(0, max)
}

async function googlePlacesTextSearch(textQuery: string, profession: string, city: string, max: number): Promise<RawBusiness[]> {
  const pageSize = Math.max(1, Math.min(20, Number(process.env.PLACES_PAGE_SIZE || 20)))
  const maxPages = Math.max(1, Number(process.env.MAX_PAGES_PER_COMBO || 3))
  const key = process.env.GOOGLE_PLACES_API_KEY!
  const results: RawBusiness[] = []
  let pageToken: string | undefined

  for (let page = 0; page < maxPages && results.length < max; page++) {
    const allowed = await canUseGoogleTextSearch()
    if (!allowed.ok) {
      console.warn(`Google Places cap reached: ${allowed.reason}`)
      break
    }

    if (pageToken) await delay(2000)

    await recordGoogleTextSearchCall(textQuery)
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri,nextPageToken'
      },
      body: JSON.stringify({ textQuery, pageSize: Math.min(pageSize, max - results.length), pageToken })
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const message = `Google Places search failed: ${res.status} ${text.slice(0, 180)}`
      console.warn(message)
      if (res.status === 429) throw new GooglePlacesQuotaError(message)
      break
    }
    const json = await res.json()
    results.push(...(json.places ?? []).map((p: any) => {
      const name = p.displayName?.text ?? 'Unknown business'
      return {
        name,
        profession,
        city,
        source: 'google_places',
        sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${city}`)}`,
        website: p.websiteUri,
        phone: p.nationalPhoneNumber,
        rating: p.rating,
        reviewCount: p.userRatingCount,
      }
    }))
    pageToken = json.nextPageToken
    if (!pageToken) break
  }

  return results.slice(0, max)
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function dedupeBusinesses(items: RawBusiness[]) {
  const seen = new Set<string>()
  const out: RawBusiness[] = []
  for (const item of items) {
    const key = `${item.website || ''}|${item.phone || ''}|${item.name}`.toLowerCase().replace(/\W+/g, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function unique(items: string[]) {
  return Array.from(new Set(items.map(s => s.trim()).filter(Boolean)))
}

function demoBusinesses(profession: string, city: string, max: number): RawBusiness[] {
  const slugCity = city.split(',')[0].replace(/\s+/g, '').toLowerCase()
  const clean = profession.replace(/\s+/g, '-').toLowerCase()
  const suffixes = ['Pros','Group','Co','Crew','Works','247','Experts','Solutions','Repair','Services','Local','Team','HQ','Prime','Ace','Brothers','Collective','Plus','Now','Direct']
  return suffixes.slice(0, max).map((suffix, i) => ({
    name: `${city.split(',')[0]} ${title(profession)} ${suffix}`,
    profession,
    city,
    source: 'demo',
    sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(`${profession} ${city} ${suffix}`)}`,
    website: i % 7 === 0 ? undefined : `https://${clean}-${slugCity}-${suffix.toLowerCase()}.example.com`,
    phone: `(555) 555-${String(1000 + i).slice(-4)}`,
    rating: 4.1 + ((i % 8) / 10),
    reviewCount: 8 + i * 7
  }))
}

function title(s: string) {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

export function rawToLead(raw: RawBusiness): Lead {
  const now = nowIso()
  return {
    id: id('lead'),
    businessName: raw.name,
    profession: raw.profession,
    city: raw.city,
    source: raw.source,
    sourceUrl: raw.sourceUrl,
    website: raw.website,
    phone: raw.phone,
    rating: raw.rating,
    reviewCount: raw.reviewCount,
    pagespeedMobile: null,
    pagespeedDesktop: null,
    issues: [],
    score: 0,
    status: 'new',
    auditBucket: 'needs_review',
    dealStage: 'none',
    paymentPreference: 'unknown',
    reviewNotes: '',
    subject: 'quick site thing',
    message: '',
    createdAt: now,
    updatedAt: now
  }
}
