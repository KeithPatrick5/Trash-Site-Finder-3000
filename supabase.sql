create table if not exists leads (
  id text primary key,
  business_name text not null,
  profession text not null,
  city text not null,
  source text not null,
  website text,
  phone text,
  email text,
  contact_url text,
  rating numeric,
  review_count integer,
  pagespeed_mobile integer,
  pagespeed_desktop integer,
  issues jsonb default '[]'::jsonb,
  visual_audit jsonb,
  score integer default 0,
  status text default 'new',
  message text,
  subject text,
  last_reply text,
  reply_intent text,
  reply_subject text,
  reply_message text,
  audit_bucket text,
  deal_stage text default 'none',
  payment_preference text default 'unknown',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists scan_jobs (
  id text primary key,
  status text not null default 'queued',
  combos jsonb not null default '[]'::jsonb,
  max_per_combo integer not null default 3,
  cursor integer not null default 0,
  scanned_combos integer not null default 0,
  created_leads integer not null default 0,
  error text,
  worker_last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists email_suppressions (
  email text primary key,
  reason text default 'manual',
  created_at timestamptz default now()
);

create table if not exists replies (
  id text primary key,
  lead_id text references leads(id) on delete set null,
  email text,
  text text not null,
  intent text not null default 'unknown',
  summary text,
  created_at timestamptz default now()
);

create index if not exists scan_jobs_status_idx on scan_jobs(status, created_at);
create index if not exists leads_score_idx on leads(score desc);
create index if not exists leads_status_idx on leads(status);
create index if not exists leads_city_profession_idx on leads(city, profession);
create unique index if not exists leads_unique_website on leads(website) where website is not null;
create index if not exists leads_email_idx on leads(lower(email));
create index if not exists replies_intent_idx on replies(intent);


-- v2.4 migration helpers for existing databases
alter table leads add column if not exists reply_subject text;
alter table leads add column if not exists reply_message text;

-- v2.5 lead factory / deal pipeline fields
alter table leads add column if not exists audit_bucket text;
alter table leads add column if not exists deal_stage text default 'none';
alter table leads add column if not exists payment_preference text default 'unknown';
create index if not exists leads_audit_bucket_idx on leads(audit_bucket);
create index if not exists leads_deal_stage_idx on leads(deal_stage);
