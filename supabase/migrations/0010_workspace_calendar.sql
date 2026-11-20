-- Built-in Workspace Calendar & Two-Way Google Calendar OAuth Sync.
-- Shared across E-Commerce and Creator/Pro workspaces.
-- Apply with `supabase db push` or paste into the Supabase SQL editor.

create table if not exists workspace_calendar_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  title text not null,
  description text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  timezone text not null default 'Africa/Tunis',
  location text not null default '',
  event_type text not null default 'appointment'
    check (event_type in ('appointment', 'shoot', 'meeting', 'delivery', 'blocked', 'reminder', 'external_google')),
  status text not null default 'confirmed'
    check (status in ('tentative', 'confirmed', 'cancelled')),
  source text not null default 'manual'
    check (source in ('manual', 'ai_dm', 'inquiry', 'google')),
  conversation_id uuid references conversations(id) on delete set null,
  inquiry_id uuid,
  client_name text,
  client_phone text,
  google_event_id text,
  google_calendar_id text,
  google_etag text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at >= start_at)
);

create index if not exists workspace_calendar_events_merchant_start_idx
  on workspace_calendar_events (merchant_id, start_at asc);

create unique index if not exists workspace_calendar_events_google_uidx
  on workspace_calendar_events (merchant_id, google_event_id)
  where google_event_id is not null;

alter table workspace_calendar_events enable row level security;

create table if not exists workspace_calendar_connections (
  merchant_id uuid primary key references merchants(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  google_email text not null default '',
  calendar_id text not null default 'primary',
  calendar_name text not null default 'Primary Calendar',
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  auto_push boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table workspace_calendar_connections enable row level security;
