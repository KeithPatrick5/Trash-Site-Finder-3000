# Trash Site Finder 3000 v2.2 Local

Lead scanner/control panel for finding businesses with weak websites.

This version is **local-only first**. You do **not** need Vercel.

```text
MacBook dashboard  ---> Supabase <---  MacBook worker
```

Your MacBook runs both pieces:

- the local dashboard at `http://localhost:3000`
- the scanner/email worker through `npm run worker`

Supabase is still recommended because the dashboard process and worker process both need to share the same jobs, leads, suppressions, and replies.

## Repo and folder

GitHub repo:

```text
https://github.com/KeithPatrick5/Trash-Site-Finder-3000
```

Recommended local folder:

```bash
/Users/admin/Desktop/tsf3000
```

If you are setting this up from scratch on your Mac:

```bash
cd /Users/admin/Desktop
mkdir -p tsf3000
cd tsf3000
```

Then put the project files in that folder.

To point git at your repo:

```bash
npm run github:remote
```

Or manually:

```bash
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/KeithPatrick5/Trash-Site-Finder-3000.git
git remote -v
```

## What changed in v2.2 local

- Removed Vercel as a requirement.
- README and env now assume local MacBook use.
- Added `npm run local` to run dashboard + worker together.
- Kept separate commands too:
  - `npm run dev` for dashboard only
  - `npm run worker` for scanner/email worker only
- `/api/scan` creates jobs only.
- `/api/jobs` reads status only.
- Browser/API routes do **not** process heavy scan batches.
- Dashboard email button approves emails; local worker sends approved emails.
- Screenshots are off by default.
- Cheap-mode caps stay on by default.

## 1. Install

From your project folder:

```bash
cd /Users/admin/Desktop/tsf3000
npm install
```

## 2. Supabase

Create a Supabase project and run `supabase.sql` in the SQL editor.

That creates:

- `leads`
- `scan_jobs`
- `email_suppressions`
- `replies`

## 3. Environment variables

Create this file locally:

```bash
/Users/admin/Desktop/tsf3000/.env.local
```

Use this as the starter config:

```env
LOCAL_ONLY=true
APP_PASSWORD=change-this-password
NEXT_PUBLIC_APP_URL=http://localhost:3000
COMPANY_POSTAL_ADDRESS=Your mailing address here

NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

GOOGLE_PLACES_API_KEY=
GOOGLE_PAGESPEED_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

RESEND_API_KEY=
OUTBOUND_FROM=Your Name <you@yourdomain.com>
REPLY_TO_EMAIL=you@yourdomain.com

ENABLE_SCREENSHOTS=false
SCREENSHOTONE_ACCESS_KEY=
BROWSERLESS_TOKEN=

MAX_SCAN_COMBOS=2500
MAX_SCAN_BATCH_SIZE=25
MAX_DAILY_SCANS=500
SCAN_CONCURRENCY=2
AUDIT_CONCURRENCY=2
WORKER_SLEEP_MS=5000

WORKER_SEND_APPROVED_EMAILS=true
MAX_EMAIL_BATCH_SIZE=5
MAX_DAILY_EMAILS=50
SCAN_RATE_LIMIT=20
SEND_RATE_LIMIT=30
```

Notes:

- `APP_PASSWORD` protects the local dashboard with Basic Auth. Username can be anything; password must match `APP_PASSWORD`.
- Leave screenshots off at first.
- Do not raise scan/email limits until the tool proves it is useful.

## 4. Run everything locally with one command

```bash
cd /Users/admin/Desktop/tsf3000
npm run local
```

Open:

```text
http://localhost:3000
```

This starts both:

```text
dashboard: http://localhost:3000
worker: scans jobs + sends approved emails
```

Stop both with:

```bash
CTRL + C
```

## 5. Alternative: run dashboard and worker separately

Terminal 1:

```bash
cd /Users/admin/Desktop/tsf3000
npm run dev
```

Terminal 2:

```bash
cd /Users/admin/Desktop/tsf3000
npm run worker
```

Open:

```text
http://localhost:3000
```

## 6. One-batch worker test

Use this when you want to make sure the worker is wired up without letting it loop forever:

```bash
npm run worker:once
```

## 7. Normal workflow

1. Run `npm run local`.
2. Open `http://localhost:3000`.
3. Create a scan job.
4. The local worker sees the queued job in Supabase.
5. The worker fetches/audits websites from your MacBook connection.
6. Leads appear in the dashboard.
7. You review leads.
8. Click **Approve Email** only for leads you want to contact.
9. The local worker sends approved emails.
10. Suppressions/unsubscribes are tracked.

## Recommended cheap-mode settings

```env
ENABLE_SCREENSHOTS=false
MAX_SCAN_BATCH_SIZE=25
MAX_DAILY_SCANS=500
MAX_DAILY_EMAILS=50
MAX_EMAIL_BATCH_SIZE=5
SCAN_CONCURRENCY=2
AUDIT_CONCURRENCY=2
WORKER_SLEEP_MS=5000
```

Screenshots are intentionally off by default. Turn them on only after lead quality is worth it.

## Email flow

The dashboard button says **Approve Email**.

That changes the lead status to `approved`.

The local worker sends approved emails and then marks them `sent`.

This prevents accidental bulk sending from a browser click.

## Important local-only note

Do not rely on the in-memory fallback for real use. It exists only so the app does not crash without Supabase variables. For real local use, use Supabase so the dashboard and worker share the same data.

## Later, maybe

If the tool starts making money or you want it always running, you can move the same worker command to a cheap VPS:

```bash
npm run worker
```

But for now: MacBook + Supabase + GitHub is enough. No Vercel needed.
