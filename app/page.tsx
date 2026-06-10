'use client'

import { useEffect, useMemo, useState } from 'react'
import { topCities } from '@/data/cities'
import { professions } from '@/data/professions'
import type { Lead } from '@/lib/types'

type Job = { id: string; status: string; totalCombos: number; scannedCombos: number; createdLeads: number; remainingCombos: number; error?: string; workerLastSeenAt?: string }

export default function Home() {
  const [selectedProfessions, setSelectedProfessions] = useState<string[]>(professions.slice(0, 8))
  const [selectedCities, setSelectedCities] = useState<string[]>(topCities.slice(0, 8))
  const [maxPerCombo, setMaxPerCombo] = useState(2)
  const [leads, setLeads] = useState<Lead[]>([])
  const [job, setJob] = useState<Job | null>(null)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState('Ready. Local-only mode. Run npm run local, or run npm run dev and npm run worker in two terminal tabs.')
  const [query, setQuery] = useState('')
  const [replyText, setReplyText] = useState('')
  const [replyEmail, setReplyEmail] = useState('')

  async function load() {
    const res = await fetch('/api/leads', { cache: 'no-store' })
    const json = await res.json()
    setLeads(json.leads ?? [])
  }
  async function loadJobs() {
    const res = await fetch('/api/jobs', { cache: 'no-store' })
    const json = await res.json()
    if (json.jobs?.[0]) setJob(json.jobs[0])
  }

  useEffect(() => { load(); loadJobs() }, [])

  useEffect(() => {
    const timer = setInterval(async () => {
      await load()
      await loadJobs()
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  async function startScan() {
    setRunning(true)
    setLog(`Creating background job for ${selectedProfessions.length} professions × ${selectedCities.length} cities...`)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professions: selectedProfessions, cities: selectedCities, maxPerCombo, sendMode: 'queue' })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Scan failed')
      setJob(json.job)
      setLog(`Job created. ${json.job.totalCombos} combos queued. Now make sure npm run worker is running locally. No Vercel needed.`)
    } catch (e: any) {
      setLog(`Error: ${e.message}`)
      setRunning(false)
    }
  }

  async function refreshJob(id: string) {
    const res = await fetch(`/api/jobs?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok) return setLog(`Job status error: ${json.error || 'unknown error'}`)
    setJob(json.job)
    setLog(`Job ${json.job.status}. ${json.job.scannedCombos}/${json.job.totalCombos} combos scanned. Leads: ${json.job.createdLeads}.`)
    await load()
  }

  async function mark(id: string, status: string) {
    await fetch('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    await load()
  }

  async function sendLead(id: string) {
    const res = await fetch('/api/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadIds: [id] }) })
    const json = await res.json()
    const result = json.results?.[0]
    setLog(result?.ok ? 'Approved. Local Mac worker will send it.' : `Approval blocked: ${result?.error || json.error || 'unknown error'}`)
    await load()
  }

  async function suppress(email?: string) {
    if (!email) return setLog('No email to suppress.')
    await fetch('/api/suppressions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, reason: 'manual_dashboard' }) })
    setLog(`${email} suppressed.`)
    await load()
  }

  async function classifyReply() {
    const res = await fetch('/api/replies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: replyEmail, text: replyText }) })
    const json = await res.json()
    if (!res.ok) return setLog(`Reply classifier error: ${json.error}`)
    setLog(`Reply classified as ${json.classification.intent}: ${json.classification.summary}`)
    setReplyText('')
    await load()
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    setLog('Copied.')
  }

  const filtered = useMemo(() => leads.filter(l => {
    const blob = `${l.businessName} ${l.profession} ${l.city} ${l.website} ${l.email} ${l.status} ${l.issues.map(i => i.label).join(' ')}`.toLowerCase()
    return blob.includes(query.toLowerCase())
  }), [leads, query])

  const stats = {
    total: leads.length,
    hot: leads.filter(l => l.score >= 12 || l.status === 'hot').length,
    contacts: leads.filter(l => l.email || l.contactUrl).length,
    queued: leads.filter(l => l.status === 'queued' || l.status === 'new').length,
    approved: leads.filter(l => l.status === 'approved').length,
    sent: leads.filter(l => l.status === 'sent').length,
    suppressed: leads.filter(l => l.status === 'suppressed').length,
    replies: leads.filter(l => l.status === 'replied' || l.status === 'hot' || l.replyIntent).length
  }

  return <main className="shell">
    <header className="topbar">
      <div className="brand">
        <div className="mark">TSF</div>
        <div>
          <div className="brandTitle">Trash Site Finder 3000</div>
          <div className="brandSub">Local scan command center</div>
        </div>
      </div>
      <div className="systemState"><span className="dot" /> Mac worker mode · no Vercel</div>
    </header>

    <section className="hero">
      <div className="heroMain">
        <div className="kicker">Website failure detection / outreach ops</div>
        <h1>Find broken sites. Close rebuild jobs.</h1>
        <p className="sub">A local lead machine for finding businesses with no site, dead sites, weak mobile pages, missing contact paths, and rebuild opportunities. Scans run from this MacBook.</p>
      </div>
      <div className="card heroStatus" style={{ minWidth: 280 }}>
        <h2>Status</h2>
        <p className="small statusText">{log}</p>
        {job && <div className="progress"><span style={{ width: `${Math.round((job.scannedCombos / Math.max(1, job.totalCombos)) * 100)}%` }} /></div>}
        <div className="actions">
          <a className="btn secondary" href="/api/export">Export CSV</a>
          <button className="btn secondary" onClick={async () => { await load(); await loadJobs() }}>Refresh</button>
        </div>
      </div>
    </section>

    <section className="stats">
      <div className="stat"><b>{stats.total}</b><span>leads</span></div>
      <div className="stat"><b>{stats.hot}</b><span>hot</span></div>
      <div className="stat"><b>{stats.contacts}</b><span>contactable</span></div>
      <div className="stat"><b>{stats.queued}</b><span>queued</span></div>
      <div className="stat"><b>{stats.approved}</b><span>approved</span></div>
      <div className="stat"><b>{stats.sent}</b><span>sent</span></div>
      <div className="stat"><b>{stats.suppressed}</b><span>suppressed</span></div>
      <div className="stat"><b>{stats.replies}</b><span>replies</span></div>
    </section>

    <section className="grid">
      <aside className="card">
        <h2>Scanner</h2>
        <div className="notice">Create targeted jobs here. The local worker processes them from your Mac, so the dashboard stays cheap and the scan traffic never hits Vercel.</div>
        <div className="row">
          <label>Professions</label>
          <select multiple size={10} value={selectedProfessions} onChange={e => setSelectedProfessions(Array.from(e.currentTarget.selectedOptions).map(o => o.value))}>
            {professions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="btn secondary" onClick={() => setSelectedProfessions(professions)}>Select all</button>
        </div>
        <div className="row">
          <label>Cities</label>
          <select multiple size={10} value={selectedCities} onChange={e => setSelectedCities(Array.from(e.currentTarget.selectedOptions).map(o => o.value))}>
            {topCities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn secondary" onClick={() => setSelectedCities(topCities)}>Select all top 50</button>
        </div>
        <div className="row">
          <label>Max businesses per profession/city combo</label>
          <input type="number" min={1} max={20} value={maxPerCombo} onChange={e => setMaxPerCombo(Number(e.target.value))} />
        </div>
        <button className="btn" disabled={running} onClick={startScan}>{running ? 'Creating job...' : 'Create scan job'}</button>

        <h3 style={{ marginTop: 22 }}>Reply classifier</h3>
        <div className="row"><label>Reply email</label><input placeholder="lead@email.com" value={replyEmail} onChange={e => setReplyEmail(e.target.value)} /></div>
        <div className="row"><label>Paste reply</label><textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Paste their reply here..." /></div>
        <button className="btn secondary" onClick={classifyReply}>Classify Reply</button>
      </aside>

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>Lead board</h2>
          <input style={{ maxWidth: 360 }} placeholder="filter leads" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Lead</th><th>Score</th><th>Problems / Visual Audit</th><th>Contact</th><th>Message</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(lead => <tr key={lead.id}>
                <td>
                  <b>{lead.businessName}</b><br />
                  <span className="small">{lead.profession} · {lead.city}</span><br />
                  {lead.website ? <a className="small" href={lead.website} target="_blank">{lead.website}</a> : <span className="small">No website</span>}
                  {lead.visualAudit?.screenshotUrl && <><br /><a className="small" href={lead.visualAudit.screenshotUrl} target="_blank">mobile screenshot</a></>}
                </td>
                <td><span className={`badge ${lead.score >= 12 ? 'hot' : lead.score >= 8 ? 'warn' : 'good'}`}>{lead.score}</span><br /><span className="small">{lead.status}</span>{lead.replyIntent && <><br /><span className="small">reply: {lead.replyIntent}</span></>}</td>
                <td>
                  <div className="problemList">{lead.issues.map(i => <span className="badge" key={i.code}>{i.label}</span>)}</div>
                  <div className="small">Mobile: {lead.pagespeedMobile ?? 'n/a'} · Forms: {lead.visualAudit?.formCount ?? 'n/a'} · CTAs: {lead.visualAudit?.ctaCount ?? 'n/a'} · Text: {lead.visualAudit?.textLength ?? 'n/a'}</div>
                </td>
                <td><div className="small">{lead.email || 'no email found'}</div>{lead.contactUrl && <a className="small" href={lead.contactUrl} target="_blank">contact form</a>}<div className="small">{lead.phone}</div></td>
                <td><div className="small"><b>{lead.subject}</b></div><div className="copyBox">{lead.message}</div></td>
                <td>
                  <div className="actions">
                    <button className="btn secondary" onClick={() => copy(`Subject: ${lead.subject}\n\n${lead.message}`)}>Copy</button>
                    <button className="btn secondary" onClick={() => sendLead(lead.id)}>Approve Email</button>
                    <button className="btn secondary" onClick={() => mark(lead.id, 'hot')}>Hot</button>
                    <button className="btn secondary" onClick={() => suppress(lead.email)}>Suppress</button>
                    <button className="btn danger" onClick={() => mark(lead.id, 'skipped')}>Skip</button>
                  </div>
                </td>
              </tr>)}
              {filtered.length === 0 && <tr><td colSpan={6} className="small">No leads yet. Create a scan job, then make sure npm run worker is running locally.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  </main>
}
