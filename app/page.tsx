'use client'

import { useEffect, useMemo, useState } from 'react'
import { topCities } from '@/data/cities'
import { professions } from '@/data/professions'
import type { Lead, ReplyRecord } from '@/lib/types'

type Job = { id: string; status: string; totalCombos: number; scannedCombos: number; createdLeads: number; remainingCombos: number; error?: string; workerLastSeenAt?: string; createdAt?: string; updatedAt?: string }
type Drafts = Record<string, { subject: string; message: string; replySubject: string; replyMessage: string }>
type Tab = 'all' | 'site_ok' | 'needs_fix' | 'no_email' | 'approved' | 'sent' | 'replied' | 'hot' | 'escrow'

export default function Home() {
  const [selectedProfessions, setSelectedProfessions] = useState<string[]>(professions)
  const [selectedCities, setSelectedCities] = useState<string[]>(topCities)
  const [maxPerCombo, setMaxPerCombo] = useState(5)
  const [leads, setLeads] = useState<Lead[]>([])
  const [replies, setReplies] = useState<ReplyRecord[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [job, setJob] = useState<Job | null>(null)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState('Ready. Build the profession × city queue once, then Run/Resume. Stop anytime; the cursor stays saved.')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [replyText, setReplyText] = useState('')
  const [replyEmail, setReplyEmail] = useState('')
  const [drafts, setDrafts] = useState<Drafts>({})

  async function load() {
    const [leadRes, jobRes, replyRes] = await Promise.all([
      fetch('/api/leads', { cache: 'no-store' }),
      fetch('/api/jobs', { cache: 'no-store' }),
      fetch('/api/replies', { cache: 'no-store' })
    ])
    const leadJson = await leadRes.json()
    const jobJson = await jobRes.json()
    const replyJson = await replyRes.json()
    const nextLeads = leadJson.leads ?? []
    setLeads(nextLeads)
    setJobs(jobJson.jobs ?? [])
    if (jobJson.jobs?.[0]) setJob(jobJson.jobs[0])
    setReplies(replyJson.replies ?? [])
    setDrafts(prev => {
      const next = { ...prev }
      for (const lead of nextLeads) {
        if (!next[lead.id]) {
          next[lead.id] = {
            subject: lead.subject || 'site is doing side quests',
            message: lead.message || '',
            replySubject: lead.replySubject || `Re: ${lead.subject || 'quick site thing'}`,
            replyMessage: lead.replyMessage || ''
          }
        }
      }
      return next
    })
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  function updateDraft(id: string, patch: Partial<Drafts[string]>) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function createFullQueue() {
    setRunning(true)
    setLog(`Building full queue: ${professions.length} professions × ${topCities.length} cities = ${professions.length * topCities.length} saved combos.`)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professions, cities: topCities, maxPerCombo, sendMode: 'queue' })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not create queue')
      setJob(json.job)
      setLog(`Full queue stored. It will try to pull up to ${maxPerCombo} businesses per profession/city, dedupe them, audit them, and keep the cursor.`)
      await load()
    } catch (e: any) {
      setLog(`Error: ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  async function createTargetedQueue() {
    setRunning(true)
    setLog(`Creating targeted queue: ${selectedProfessions.length} professions × ${selectedCities.length} cities...`)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professions: selectedProfessions, cities: selectedCities, maxPerCombo, sendMode: 'queue' })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not create queue')
      setJob(json.job)
      setLog(`Targeted queue stored. ${json.job.totalCombos} combos saved.`)
      await load()
    } catch (e: any) {
      setLog(`Error: ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  async function jobAction(action: 'pause' | 'resume' | 'reset') {
    if (!activeJob) return setLog('No job selected.')
    const res = await fetch('/api/jobs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: activeJob.id, action }) })
    const json = await res.json()
    if (!res.ok) return setLog(`Job ${action} failed: ${json.error}`)
    setJob(json.job)
    setLog(action === 'pause' ? 'Stopped. Worker finishes current batch, then parks. Cursor stays saved.' : action === 'resume' ? 'Queued again. Worker continues from saved cursor.' : 'Reset to start of stored queue.')
    await load()
  }

  async function mark(id: string, status: string, extra: Record<string, unknown> = {}) {
    await fetch('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, ...extra }) })
    await load()
  }

  async function approveInitialEmail(lead: Lead) {
    const d = drafts[lead.id]
    const res = await fetch('/api/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadIds: [lead.id], subject: d?.subject, message: d?.message }) })
    const json = await res.json()
    const result = json.results?.[0]
    setLog(result?.ok ? 'Approved. Local worker will send the edited initial email.' : `Approval blocked: ${result?.error || json.error || 'unknown error'}`)
    await load()
  }

  async function approveReply(lead: Lead) {
    const d = drafts[lead.id]
    const res = await fetch('/api/replies', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, replySubject: d?.replySubject, replyMessage: d?.replyMessage, approve: true }) })
    const json = await res.json()
    if (!res.ok) return setLog(`Reply approval blocked: ${json.error}`)
    setLog('Reply approved. Local worker will send it.')
    await load()
  }

  async function sendUpworkHandoff(lead: Lead) {
    const d = drafts[lead.id]
    const res = await fetch('/api/replies', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, action: 'upwork_handoff', replySubject: d?.replySubject, replyMessage: d?.replyMessage, approve: true }) })
    const json = await res.json()
    if (!res.ok) return setLog(`Upwork handoff blocked: ${json.error}`)
    setLog('Upwork/escrow handoff approved. Worker will send it.')
    await load()
  }

  async function prepUpworkDraft(lead: Lead) {
    const res = await fetch('/api/replies', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, action: 'upwork_handoff', approve: false }) })
    const json = await res.json()
    if (!res.ok) return setLog(`Upwork draft failed: ${json.error}`)
    setLog('Upwork escrow draft loaded on this lead. Edit it, then approve.')
    await load()
  }

  async function suppress(email?: string) {
    if (!email) return setLog('No email to suppress.')
    await fetch('/api/suppressions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, reason: 'manual_dashboard' }) })
    setLog(`${email} suppressed.`)
    await load()
  }

  async function classifyReply(lead?: Lead) {
    const text = lead ? replyText || lead.lastReply || '' : replyText
    const res = await fetch('/api/replies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead?.id, email: lead?.email || replyEmail, text }) })
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

  function inTab(l: Lead) {
    if (tab === 'all') return true
    if (tab === 'site_ok') return l.auditBucket === 'site_ok' || l.status === 'site_ok'
    if (tab === 'needs_fix') return ['needs_fix', 'no_site', 'dead_site'].includes(String(l.auditBucket)) || l.status === 'needs_fix' || l.status === 'queued'
    if (tab === 'no_email') return l.auditBucket === 'no_email' || l.status === 'no_email'
    if (tab === 'approved') return l.status === 'approved' || l.status === 'reply_approved'
    if (tab === 'sent') return l.status === 'sent'
    if (tab === 'replied') return Boolean(l.lastReply) || l.status === 'replied'
    if (tab === 'hot') return l.status === 'hot' || l.dealStage === 'interested'
    if (tab === 'escrow') return l.status === 'escrow_requested' || l.status === 'upwork_sent' || l.dealStage === 'escrow_requested' || l.dealStage === 'upwork_sent'
    return true
  }

  const filtered = useMemo(() => leads.filter(l => {
    const blob = `${l.businessName} ${l.profession} ${l.city} ${l.website} ${l.email} ${l.status} ${l.auditBucket} ${l.dealStage} ${l.issues.map(i => i.label).join(' ')} ${l.lastReply || ''}`.toLowerCase()
    return inTab(l) && blob.includes(query.toLowerCase())
  }), [leads, query, tab])

  const activeJob = job || jobs[0]
  const progress = activeJob ? Math.round((activeJob.scannedCombos / Math.max(1, activeJob.totalCombos)) * 100) : 0
  const stats = {
    total: leads.length,
    siteOk: leads.filter(l => l.auditBucket === 'site_ok' || l.status === 'site_ok').length,
    needsFix: leads.filter(l => ['needs_fix', 'no_site', 'dead_site'].includes(String(l.auditBucket)) || l.status === 'needs_fix' || l.status === 'queued').length,
    noEmail: leads.filter(l => l.auditBucket === 'no_email' || l.status === 'no_email').length,
    approved: leads.filter(l => l.status === 'approved' || l.status === 'reply_approved').length,
    sent: leads.filter(l => l.status === 'sent' || l.status === 'replied').length,
    hot: leads.filter(l => l.status === 'hot' || l.dealStage === 'interested').length,
    escrow: leads.filter(l => l.status === 'escrow_requested' || l.status === 'upwork_sent' || l.dealStage === 'escrow_requested' || l.dealStage === 'upwork_sent').length,
    replies: replies.length,
    combos: activeJob?.totalCombos || 0,
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All found', count: stats.total },
    { key: 'site_ok', label: 'Site OK', count: stats.siteOk },
    { key: 'needs_fix', label: 'Needs fix', count: stats.needsFix },
    { key: 'no_email', label: 'No email', count: stats.noEmail },
    { key: 'approved', label: 'Approved', count: stats.approved },
    { key: 'sent', label: 'Emailed', count: stats.sent },
    { key: 'replied', label: 'Replied', count: stats.replies },
    { key: 'hot', label: 'Yes / hot', count: stats.hot },
    { key: 'escrow', label: 'Escrow / Upwork', count: stats.escrow }
  ]

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="mark">TSF</div><div><div className="brandTitle">Trash Site Finder 3000</div><div className="brandSub">Local lead factory</div></div></div>
      <div className="systemState"><span className="dot" /> Mac worker · resumable queue · manual approval</div>
    </header>

    <section className="hero">
      <div className="heroMain">
        <div className="kicker">Queue → scan → audit → review → reply</div>
        <h1>Find businesses. Flag broken sites. Track replies.</h1>
        <p className="sub">Runs locally from your Mac. Keeps the queue saved. Emails stay off until you approve them.</p>
      </div>
      <div className="card heroStatus">
        <h2>Queue control</h2>
        <p className="small statusText">{log}</p>
        {activeJob && <><div className="progress"><span style={{ width: `${progress}%` }} /></div><div className="small">{activeJob.status.toUpperCase()} · {activeJob.scannedCombos}/{activeJob.totalCombos} combos · {activeJob.createdLeads} businesses · {activeJob.remainingCombos} left</div></>}
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => jobAction('resume')} disabled={!activeJob}>Run / Resume</button>
          <button className="btn danger" onClick={() => jobAction('pause')} disabled={!activeJob}>Stop</button>
          <button className="btn secondary" onClick={() => load()}>Refresh</button>
          <a className="btn secondary" href="/api/export">Export CSV</a>
        </div>
      </div>
    </section>

    <section className="stats">
      <div className="stat"><b>{stats.combos}</b><span>stored combos</span></div>
      <div className="stat"><b>{stats.total}</b><span>businesses</span></div>
      <div className="stat"><b>{stats.siteOk}</b><span>site ok</span></div>
      <div className="stat"><b>{stats.needsFix}</b><span>needs fix</span></div>
      <div className="stat"><b>{stats.noEmail}</b><span>no email</span></div>
      <div className="stat"><b>{stats.approved}</b><span>approved</span></div>
      <div className="stat"><b>{stats.hot}</b><span>hot</span></div>
      <div className="stat"><b>{stats.escrow}</b><span>escrow/upwork</span></div>
    </section>

    <section className="grid">
      <aside className="card">
        <h2>Queue builder</h2>
        <div className="notice">Start small. Build a selected queue first, confirm the data looks right, then scale slowly.</div>
        <div className="row"><label>Max businesses per combo</label><input type="number" min={1} max={500} value={maxPerCombo} onChange={e => setMaxPerCombo(Number(e.target.value))} /></div>
        <button className="btn" disabled={running} onClick={createTargetedQueue}>Build Selected Queue</button>
        <div className="actions" style={{ marginTop: 10 }}>
          <button className="btn secondary" disabled={running} onClick={createFullQueue}>Build Full Queue</button>
          <button className="btn secondary" onClick={() => { setSelectedProfessions(professions); setSelectedCities(topCities) }}>Select all</button>
        </div>

        <h3>Professions</h3>
        <select multiple size={8} value={selectedProfessions} onChange={e => setSelectedProfessions(Array.from(e.currentTarget.selectedOptions).map(o => o.value))}>{professions.map(p => <option key={p} value={p}>{p}</option>)}</select>
        <h3>Cities</h3>
        <select multiple size={8} value={selectedCities} onChange={e => setSelectedCities(Array.from(e.currentTarget.selectedOptions).map(o => o.value))}>{topCities.map(c => <option key={c} value={c}>{c}</option>)}</select>

        <h3>Manual reply intake</h3>
        <div className="row"><label>Reply email</label><input placeholder="lead@email.com" value={replyEmail} onChange={e => setReplyEmail(e.target.value)} /></div>
        <div className="row"><label>Paste inbound reply</label><textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Paste the reply here. If they mention escrow/Upwork, it gets routed to that stage." /></div>
        <button className="btn secondary" onClick={() => classifyReply()}>Classify Reply</button>

        <h3>Recent replies</h3>
        <div className="replyList">{replies.slice(0, 8).map(r => <div className="replyCard" key={r.id}><b>{r.intent}</b><span>{r.email || r.leadId || 'unknown'}</span><p>{r.text}</p></div>)}</div>
      </aside>

      <section className="card">
        <div className="boardHead"><h2>Lead board</h2><input placeholder="filter leads" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div className="tabs">{tabs.map(t => <button key={t.key} className={tab === t.key ? 'tab active' : 'tab'} onClick={() => setTab(t.key)}>{t.label} <b>{t.count}</b></button>)}</div>
        <div className="leadGrid">
          {filtered.map(lead => {
            const d = drafts[lead.id] || { subject: lead.subject, message: lead.message, replySubject: lead.replySubject || `Re: ${lead.subject}`, replyMessage: lead.replyMessage || '' }
            return <article className="leadCard" key={lead.id}>
              <div className="leadTop"><div><h3>{lead.businessName}</h3><p>{lead.profession} · {lead.city}</p></div><span className={`badge ${lead.status === 'hot' || lead.dealStage === 'interested' ? 'hot' : lead.auditBucket === 'site_ok' ? 'good' : 'warn'}`}>{lead.auditBucket || lead.status} · {lead.score}</span></div>
              <div className="problemList">{lead.issues.slice(0, 5).map(i => <span className="badge warn" key={i.code}>{i.label}</span>)}{lead.issues.length === 0 && <span className="badge good">no major issue stored</span>}</div>
              <div className="small contactLine">{lead.website ? <a href={lead.website} target="_blank">site</a> : 'no site'} · {lead.email || 'no email'} · {lead.phone || 'no phone'} · stage: {lead.dealStage || 'none'}</div>

              {(lead.auditBucket !== 'site_ok' && lead.email) && <div className="emailEditor">
                <label>Initial email subject</label>
                <input value={d.subject} onChange={e => updateDraft(lead.id, { subject: e.target.value })} />
                <label>Initial email body</label>
                <textarea value={d.message} onChange={e => updateDraft(lead.id, { message: e.target.value })} />
                <div className="actions"><button className="btn" onClick={() => approveInitialEmail(lead)}>Approve initial email</button><button className="btn secondary" onClick={() => copy(`${d.subject}\n\n${d.message}`)}>Copy</button><button className="btn danger" onClick={() => suppress(lead.email)}>Suppress</button></div>
              </div>}

              {lead.lastReply && <div className="replyPanel">
                <h4>Inbound reply</h4>
                <p>{lead.lastReply}</p>
                <span className="badge hot">{lead.replyIntent || 'reply'}</span>
                <label>Reply subject</label>
                <input value={d.replySubject} onChange={e => updateDraft(lead.id, { replySubject: e.target.value })} />
                <label>Your dashboard reply</label>
                <textarea value={d.replyMessage} placeholder="Hell yeah. I can send a quick first version..." onChange={e => updateDraft(lead.id, { replyMessage: e.target.value })} />
                <div className="actions"><button className="btn" onClick={() => approveReply(lead)}>Approve reply email</button><button className="btn secondary" onClick={() => prepUpworkDraft(lead)}>Needs escrow / Upwork</button><button className="btn secondary" onClick={() => sendUpworkHandoff(lead)}>Approve Upwork handoff</button><button className="btn secondary" onClick={() => copy(`${d.replySubject}\n\n${d.replyMessage}`)}>Copy reply</button></div>
              </div>}

              <div className="actions footActions"><button className="btn secondary" onClick={() => mark(lead.id, 'hot', { dealStage: 'interested' })}>Yes / Hot</button><button className="btn secondary" onClick={() => mark(lead.id, 'preview_sent', { dealStage: 'preview_sent' })}>Preview sent</button><button className="btn secondary" onClick={() => mark(lead.id, 'upwork_sent', { dealStage: 'upwork_sent', paymentPreference: 'upwork' })}>Upwork sent</button><button className="btn secondary" onClick={() => mark(lead.id, 'won', { dealStage: 'won' })}>Won</button><button className="btn secondary" onClick={() => mark(lead.id, 'dead', { dealStage: 'lost' })}>No / Dead</button></div>
            </article>
          })}
          {filtered.length === 0 && <div className="notice">No leads in this bucket yet. Build a queue and make sure <code>npm run local</code> is running.</div>}
        </div>
      </section>
    </section>
  </main>
}
