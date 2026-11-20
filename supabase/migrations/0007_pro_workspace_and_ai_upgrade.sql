-- Phase 2: Dual-Track Workspace Split (E-Commerce vs Creator & Professional)
-- Adds workspace_mode / pro_category on merchants + Creator/Pro tables with
-- RLS, HNSW 1024-dim vector indexes, match_pro_services RPC, and Realtime.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

-- ------------------------------------------------------------ workspace split
alter table merchants
  add column if not exists workspace_mode text not null default 'ecommerce',
  add column if not exists pro_category text;

alter table merchants drop constraint if exists merchants_workspace_mode_check;
alter table merchants add constraint merchants_workspace_mode_check
  check (workspace_mode in ('ecommerce', 'pro'));

alter table merchants drop constraint if exists merchants_pro_category_check;
alter table merchants add constraint merchants_pro_category_check
  check (pro_category is null or pro_category in ('doctor', 'cameraman', 'creator', 'custom'));

create index if not exists merchants_workspace_mode_idx on merchants (workspace_mode);

-- --------------------------------------------------------------- pro_profiles
create table if not exists pro_profiles (
  merchant_id uuid primary key references merchants(id) on delete cascade,
  display_name text not null,
  headline text not null default '',
  profession_preset text not null default 'custom'
    check (profession_preset in ('doctor', 'cameraman', 'creator', 'custom')),
  bio text not null default '',
  location_city text not null default 'Tunis',
  clinic_or_studio_address text not null default '',
  lat double precision,
  lng double precision,
  style_samples jsonb not null default '[]'::jsonb,
  style_rules text not null default '',
  boundaries_note text not null default '',
  opportunity_goals text not null default '',
  opportunity_keywords text[] not null default '{}',
  min_deal_budget_millimes integer check (min_deal_budget_millimes is null or min_deal_budget_millimes >= 0),
  auto_reply_enabled boolean not null default true,
  alert_whatsapp_phone text,
  alert_email text,
  embedding vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------- pro_services
create table if not exists pro_services (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  title text not null,
  category text not null default 'general',
  description text not null default '',
  deliverables text[] not null default '{}',
  duration_label text not null default '',
  price_millimes integer check (price_millimes is null or price_millimes >= 0),
  price_display text not null default '',
  floor_millimes integer check (floor_millimes is null or floor_millimes >= 0),
  pricing_mode text not null default 'fixed'
    check (pricing_mode in ('fixed', 'starting_at', 'custom_quote')),
  intake_questions jsonb not null default '[]'::jsonb,
  prep_or_details_template text not null default '',
  booking_url text,
  active boolean not null default true,
  embedding vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (floor_millimes is null or price_millimes is null or floor_millimes <= price_millimes)
);
create index if not exists pro_services_merchant_idx on pro_services (merchant_id, active);
create index if not exists pro_services_embedding_idx
  on pro_services using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------- service_inquiries
create table if not exists service_inquiries (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  service_id uuid references pro_services(id) on delete set null,
  client_name text,
  client_phone text,
  requested_date text,
  location_text text,
  budget_millimes integer check (budget_millimes is null or budget_millimes >= 0),
  scope_summary text not null default '',
  extracted_details jsonb not null default '{}'::jsonb,
  status text not null default 'discussing'
    check (status in ('discussing', 'details_sent', 'needs_approval', 'confirmed', 'declined')),
  ai_summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_inquiries_merchant_idx on service_inquiries (merchant_id, updated_at desc);
create index if not exists service_inquiries_conv_idx on service_inquiries (conversation_id);

-- -------------------------------------------------------------- opportunities
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references merchants(id) on delete cascade,
  source text not null default 'board'
    check (source in ('dm', 'comment', 'board', 'manual')),
  conversation_id uuid references conversations(id) on delete set null,
  title text not null,
  brand_or_client text not null default '',
  category text not null default 'custom'
    check (category in ('sponsorship', 'shoot', 'medical_talk', 'partnership', 'vip_client', 'custom')),
  description text not null default '',
  compensation_text text not null default '',
  budget_millimes integer check (budget_millimes is null or budget_millimes >= 0),
  deadline_at timestamptz,
  apply_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  embedding vector(1024),
  created_at timestamptz not null default now()
);
create index if not exists opportunities_merchant_idx on opportunities (merchant_id, created_at desc);
create index if not exists opportunities_embedding_idx
  on opportunities using hnsw (embedding vector_cosine_ops);

-- -------------------------------------------------------- opportunity_matches
create table if not exists opportunity_matches (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  fit_score integer not null default 50 check (fit_score >= 0 and fit_score <= 100),
  urgency text not null default 'medium'
    check (urgency in ('low', 'medium', 'high', 'critical')),
  fit_reasons jsonb not null default '[]'::jsonb,
  draft_pitch text not null default '',
  status text not null default 'new'
    check (status in ('new', 'shortlisted', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, opportunity_id)
);
create index if not exists opportunity_matches_merchant_idx
  on opportunity_matches (merchant_id, status, fit_score desc);

-- ----------------------------------------------------------------- pro_alerts
create table if not exists pro_alerts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  inquiry_id uuid references service_inquiries(id) on delete set null,
  severity text not null default 'important'
    check (severity in ('info', 'important', 'urgent', 'critical')),
  category text not null default 'custom_request'
    check (category in ('opportunity_match', 'medical_red_flag', 'vip_quote', 'custom_request', 'angry_client', 'deadline')),
  title text not null,
  summary text not null default '',
  recommended_action text not null default '',
  draft_reply text,
  status text not null default 'unread'
    check (status in ('unread', 'acknowledged', 'acted', 'dismissed')),
  notified_channels jsonb not null default '["in_app"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pro_alerts_merchant_idx on pro_alerts (merchant_id, status, created_at desc);

-- ------------------------------------------------------------ agent_briefings
create table if not exists agent_briefings (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  period_start timestamptz not null default (now() - interval '24 hours'),
  period_end timestamptz not null default now(),
  headline text not null,
  highlights jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_briefings_merchant_idx on agent_briefings (merchant_id, created_at desc);

-- ----------------------------------------------------------------------- RPCs
create or replace function match_pro_services(
  p_merchant uuid,
  p_embedding vector(1024),
  p_k integer default 5
)
returns table (service_id uuid, title text, distance double precision)
language sql stable as $$
  select s.id, s.title, (s.embedding <=> p_embedding)::double precision
  from pro_services s
  where s.merchant_id = p_merchant
    and s.active = true
    and s.embedding is not null
  order by s.embedding <=> p_embedding
  limit greatest(p_k, 1);
$$;

-- --------------------------------------------------------------- RLS + Realtime
do $$
declare t text;
begin
  foreach t in array array[
    'pro_profiles', 'pro_services', 'service_inquiries',
    'opportunities', 'opportunity_matches', 'pro_alerts', 'agent_briefings'
  ] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'pro_alerts', 'service_inquiries', 'opportunity_matches', 'agent_briefings'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %I;', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
