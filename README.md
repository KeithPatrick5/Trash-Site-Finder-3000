# Trash Site Finder 3000 — v2.5 local lead factory

Local-only prospecting dashboard. No Vercel required.

Project path Keith uses:

```bash
/Users/admin/Desktop/tsf3000
```

GitHub:

```bash
https://github.com/KeithPatrick5/Trash-Site-Finder-3000
```

## What v2.5 does

- Builds a saved queue of every profession × every city.
- Runs from the saved cursor so you can stop today and resume tomorrow.
- Pulls as many businesses as the configured source returns, not just 2.
- Stores every business found.
- Sorts leads into buckets: site ok, needs fix, no site/dead site, no email, approved, emailed, replied, hot, escrow/Upwork.
- Shows editable email drafts before anything sends.
- Shows inbound replies and lets you reply from the dashboard.
- Adds an escrow/Upwork handoff stage for clients who do not want direct payment.

## Install

```bash
cd /Users/admin/Desktop/tsf3000
npm install --no-package-lock
cp .env.example .env.local
npm run local
```

Open:

```text
http://localhost:3000
```

## Supabase

Run `supabase.sql` in Supabase before using the dashboard. It creates/migrates the needed tables.

## Commands

```bash
npm run local       # dashboard + worker
npm run dev         # dashboard only
npm run worker      # worker only
npm run worker:once # one worker tick
```

## GitHub remote

```bash
npm run github:remote
git add .
git commit -m "Build v2.5 lead factory"
git push
```

Do not commit generated junk:

```text
node_modules/
.next/
package-lock.json
tsconfig.tsbuildinfo
.env.local
```
