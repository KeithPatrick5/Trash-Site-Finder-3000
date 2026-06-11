import { supabaseAdmin } from './store'
import { nowIso } from './utils'

export type UsageCheck = { ok: true } | { ok: false; reason: string }

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function monthKey() {
  return new Date().toISOString().slice(0, 7)
}

function dailyLimit() {
  return Number(process.env.GOOGLE_TEXT_SEARCH_CALLS_PER_DAY || 150)
}

function monthlyLimit() {
  return Number(process.env.GOOGLE_TEXT_SEARCH_CALLS_PER_MONTH || 4500)
}

async function getCount(provider: string, metric: string, period: string) {
  const sb = supabaseAdmin()
  if (!sb) return 0
  const { data, error } = await sb
    .from('api_usage')
    .select('count')
    .eq('provider', provider)
    .eq('metric', metric)
    .eq('period_key', period)
    .maybeSingle()
  if (error) throw error
  return Number(data?.count || 0)
}

async function bumpCount(provider: string, metric: string, period: string) {
  const sb = supabaseAdmin()
  if (!sb) return
  const current = await getCount(provider, metric, period)
  const { error } = await sb.from('api_usage').upsert({
    provider,
    metric,
    period_key: period,
    count: current + 1,
    updated_at: nowIso()
  }, { onConflict: 'provider,metric,period_key' })
  if (error) throw error
}

export async function canUseGoogleTextSearch(): Promise<UsageCheck> {
  const day = await getCount('google', 'text_search', todayKey())
  if (day >= dailyLimit()) return { ok: false, reason: `daily ${day}/${dailyLimit()}` }
  const month = await getCount('google', 'text_search', monthKey())
  if (month >= monthlyLimit()) return { ok: false, reason: `monthly ${month}/${monthlyLimit()}` }
  return { ok: true }
}

export async function recordGoogleTextSearchCall(_query?: string) {
  await bumpCount('google', 'text_search', todayKey())
  await bumpCount('google', 'text_search', monthKey())
}

export async function getUsageSummary() {
  return {
    googleTextSearchToday: await getCount('google', 'text_search', todayKey()),
    googleTextSearchTodayLimit: dailyLimit(),
    googleTextSearchMonth: await getCount('google', 'text_search', monthKey()),
    googleTextSearchMonthLimit: monthlyLimit()
  }
}
