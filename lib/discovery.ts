import { Lead } from './types'
import { id, nowIso } from './utils'

export type RawBusiness = {
  name: string
  profession: string
  city: string
  source: string
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
  }
  return demoBusinesses(profession, city, limit)
}

async function googlePlacesWideSearch(profession: string, city: string, max: number): Promise<RawBusiness[]> {
  const queries = unique([
    `${profession} in ${city}`,
    `${profession} near ${city}`,
    `${city} ${profession}`,
    `best ${profession} ${city}`,
    `emergency ${profession} ${city}`,
    `local ${profession} ${city}`
  ])

  const all: RawBusiness[] = []
  for (const q of queries) {
    if (all.length >= max) break
    const chunk = await googlePlacesTextSearch(q, profession, city, Math.min(20, max - all.length))
    all.push(...chunk)
  }

  return dedupeBusinesses(all).slice(0, max)
}

async function googlePlacesTextSearch(textQuery: string, profession: string, city: string, max: number): Promise<RawBusiness[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY!
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri'
    },
    body: JSON.stringify({ textQuery, maxResultCount: Math.min(max, 20) })
  })
  if (!res.ok) return []
  const json = await res.json()
  return (json.places ?? []).slice(0, max).map((p: any) => ({
    name: p.displayName?.text ?? 'Unknown business',
    profession,
    city,
    source: 'google_places',
    website: p.websiteUri,
    phone: p.nationalPhoneNumber,
    rating: p.rating,
    reviewCount: p.userRatingCount,
  }))
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
    subject: 'quick site thing',
    message: '',
    createdAt: now,
    updatedAt: now
  }
}
