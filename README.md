# Trash Site Finder 3000 — local lead factory

Local-only prospecting dashboard. No Vercel required.

Project path Keith uses:

```bash
/Users/admin/Desktop/tsf3000
```

GitHub:

```bash
https://github.com/KeithPatrick5/Trash-Site-Finder-3000
```

## What it does

- Builds a saved profession × city queue.
- Runs from the saved cursor so stop/resume works.
- Uses Google Places with daily/monthly caps.
- Stores every business found.
- Shows clickable website/source links for review.
- Lets you write review notes on why the site sucks.
- Sorts leads into site ok, needs fix, no email, approved, emailed, replied, hot, escrow/Upwork.
- Shows editable email drafts before anything sends.
- Keeps email/screenshots/OpenAI off unless enabled.

## Cost-safe defaults

Target Google Places cap:

```env
GOOGLE_TEXT_SEARCH_CALLS_PER_DAY=150
GOOGLE_TEXT_SEARCH_CALLS_PER_MONTH=4500
PLACES_PAGE_SIZE=20
```

That is up to 3,000 raw businesses/day or 90,000/month if Google returns 20 results per call.

Still off by default:

```env
ENABLE_SCREENSHOTS=false
MAX_DAILY_SCREENSHOTS=0
MAX_DAILY_EMAILS=0
OPENAI_API_KEY=
RESEND_API_KEY=
```

## Commands

```bash
npm run local       # dashboard + worker
npm run dev         # dashboard only
npm run worker      # worker only
npm run worker:once # one worker tick
```

Open:

```text
http://localhost:3000
```

## Supabase

Run `supabase.sql` in Supabase before using the dashboard. Re-run it after updates; it uses safe `create table if not exists` / `alter table if not exists` lines.

Do not commit generated/local junk:

```text
node_modules/
.next/
package-lock.json
tsconfig.tsbuildinfo
.env.local
```
