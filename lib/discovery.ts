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

export async function findBusinesses(profession: string, city: string, max = 5): Promise<RawBusiness[]> {
  if (process.env.GOOGLE_PLACES_API_KEY) {
    const live = await googlePlacesTextSearch(profession, city, max)
    if (live.length) return live
  }
  return demoBusinesses(profession, city, max)
}

async function googlePlacesTextSearch(profession: string, city: string, max: number): Promise<RawBusiness[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY!
  const textQuery = `${profession} in ${city}`
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

function demoBusinesses(profession: string, city: string, max: number): RawBusiness[] {
  const slugCity = city.split(',')[0].replace(/\s+/g, '').toLowerCase()
  const clean = profession.replace(/\s+/g, '-').toLowerCase()
  const samples = [
    { suffix: 'Pros', domain: `https://${clean}-${slugCity}-pros.example.com` },
    { suffix: 'Group', domain: `https://${slugCity}${clean}.example.org` },
    { suffix: 'Co', domain: `https://www.${clean}${slugCity}.example.net` }
  ]
  return samples.slice(0, max).map(s => ({
    name: `${city.split(',')[0]} ${title(profession)} ${s.suffix}`,
    profession,
    city,
    source: 'demo',
    website: s.domain,
    phone: '(555) 555-0133',
    rating: 4.4,
    reviewCount: 72
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
    subject: 'quick site thing',
    message: '',
    createdAt: now,
    updatedAt: now
  }
}
