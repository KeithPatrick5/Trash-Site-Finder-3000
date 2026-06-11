-- Run this in Supabase SQL editor if you see:
-- Could not find the 'job_id' column of 'leads' in the schema cache
alter table leads add column if not exists job_id text;
create index if not exists leads_job_id_idx on leads(job_id);
notify pgrst, 'reload schema';
