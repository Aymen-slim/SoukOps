-- Live Workspace AI Context & Knowledge Memory (shared across E-Commerce & Creator/Pro).
-- Owners add/update notes like chat messages; the assistant injects active notes into replies.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

create table if not exists workspace_context_entries (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  category text not null default 'general'
    check (category in ('general', 'policy', 'hours', 'pricing_note', 'promo', 'faq', 'location', 'availability', 'style')),
  content text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_context_entries_merchant_idx
  on workspace_context_entries (merchant_id, active, created_at asc);

alter table workspace_context_entries enable row level security;
