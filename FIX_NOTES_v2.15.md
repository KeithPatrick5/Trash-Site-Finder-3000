# v2.15 quota/progress fix

Fixed:
- Google 429 now pauses the worker instead of skipping combos.
- Real Google runs no longer fall back to fake demo businesses unless ENABLE_DEMO_FALLBACK=true.
- Empty Google results save zero leads instead of garbage rows.
- Worker does not call email sending unless WORKER_SEND_APPROVED_EMAILS=true.
- Dashboard job payload now includes currentCombo/cursor.
- Dashboard queue status shows current profession/city.
- Email discovery now tries common contact/about/quote paths even when links are not on homepage.
- Lead upsert retries without job_id if Supabase schema cache/table is old, so the worker does not burn combos failing every insert.

Important:
- 100 businesses per combo = about 5 Google Text Search calls per combo.
- 150 calls/day = about 30 combos/day at 100 max businesses/combo.
- To run more combos/day safely, lower Max businesses per combo to 20 or raise the Google daily quota knowingly.

If Supabase still says job_id is missing, run sql/fix-job-id-schema.sql in Supabase SQL editor.
