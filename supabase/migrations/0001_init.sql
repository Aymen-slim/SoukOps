-- Wassalha initial schema (Day 1). Amounts are integer millimes everywhere.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

create extension if not exists vector;
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- merchants
create table if not exists merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_discount_percent numeric not null default 10,
  free_delivery_threshold_millimes integer,
  payment_link text,
  courier_mode text not null default 'mock_api' check (courier_mode in ('mock_api', 'browser', 'real_api')),
  created_at timestamptz not null default now()
);

create table if not exists delivery_fees (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  governorate text not null,
  delegation text,
  locality_id integer,
  fee_millimes integer not null check (fee_millimes >= 0),
  unique (merchant_id, governorate, delegation)
);

-- ----------------------------------------------------------------- products
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  name text not null,
  category_phrase text not null, -- short English SAM phrase, e.g. "dress"
  price_millimes integer not null check (price_millimes >= 0),
  floor_millimes integer not null check (floor_millimes >= 0),
  stock integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (floor_millimes <= price_millimes)
);

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  size text,
  color text,
  stock integer not null default 0
);

create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  merchant_id uuid not null references merchants(id) on delete cascade,
  source_path text,
  crop_path text,
  embedding vector(1024), -- PE-Core-L14-336, normalized, cosine distance
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists product_images_embedding_idx
  on product_images using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------- customers
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  name text,
  phone text, -- normalized Tunisian number
  wa_id text,
  created_at timestamptz not null default now(),
  unique (merchant_id, phone)
);

create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  governorate text,
  delegation text,
  locality_id integer,
  landmark text,
  lat double precision,
  lng double precision,
  floor text,
  driver_note text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists landmarks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  aliases text[] not null default '{}',
  type text,
  governorate text,
  delegation text,
  lat double precision not null,
  lng double precision not null
);
create index if not exists landmarks_name_trgm_idx on landmarks using gin (name gin_trgm_ops);

-- ------------------------------------------------------------- conversations
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  channel text not null default 'simulator',
  slots jsonb not null default '{}',
  negotiation jsonb not null default '{}',
  ai_paused boolean not null default false,
  run_token uuid,
  pin_token text,
  pin_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  external_id text unique,
  direction text not null check (direction in ('in', 'out')),
  kind text not null default 'text', -- text | image | audio | buttons | location
  body text,
  media_path text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- orders
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  address_id uuid references addresses(id) on delete set null,
  status text not null default 'DRAFT',
  -- DRAFT | CONFIRMED_BY_BUYER | APPROVED | WAYBILL_CREATED | SHIPPED | DELIVERED | RETURNED | CANCELLED
  subtotal_millimes integer not null default 0,
  discount_millimes integer not null default 0,
  delivery_fee_millimes integer not null default 0,
  total_millimes integer not null default 0,
  risk_score integer,
  risk_level text check (risk_level in ('green', 'yellow', 'red')),
  risk_reasons jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  variant_id uuid references product_variants(id) on delete set null,
  name_snapshot text not null,
  unit_price_millimes integer not null,
  quantity integer not null default 1
);

create table if not exists risk_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references merchants(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  kind text not null, -- delivered | returned | cancelled | pin_far | ...
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  courier text not null default 'first_delivery',
  mode text not null default 'mock_api',
  barcode text,
  waybill_path text,
  fd_state integer,
  created_at timestamptz not null default now()
);

create table if not exists unmatched_demands (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  description text,
  crop_path text,
  embedding vector(1024),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- agent / misc
create table if not exists agent_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,
  kind text not null,
  model text,
  provider text, -- meta | baseten
  latency_ms integer,
  ok boolean not null default true,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists courier_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  status text not null default 'queued', -- queued | claimed | done | failed
  payload jsonb not null default '{}',
  screenshot_path text,
  result jsonb,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create table if not exists landmark_misses (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,
  query text not null,
  governorate text,
  created_at timestamptz not null default now()
);

create table if not exists handover_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists ai_cache (
  key text primary key,
  namespace text not null,
  value jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists fd_clone_parcels (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null,
  fields jsonb not null default '{}',
  state integer not null default 0,
  barcode text,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------- RPCs
create or replace function match_products(p_merchant uuid, p_embedding vector(1024), p_k integer default 5)
returns table (product_image_id uuid, product_id uuid, distance double precision)
language sql stable as $$
  select pi.id, pi.product_id, (pi.embedding <=> p_embedding)::double precision
  from product_images pi
  join products p on p.id = pi.product_id and p.active
  where pi.merchant_id = p_merchant and pi.embedding is not null
  order by pi.embedding <=> p_embedding
  limit greatest(p_k, 1);
$$;

create or replace function search_landmarks(p_query text, p_governorate text default null, p_k integer default 5)
returns table (id uuid, name text, governorate text, delegation text, lat double precision, lng double precision, score double precision)
language sql stable as $$
  select l.id, l.name, l.governorate, l.delegation, l.lat, l.lng,
         greatest(similarity(unaccent(l.name), unaccent(p_query)),
                  coalesce((select max(similarity(unaccent(a), unaccent(p_query))) from unnest(l.aliases) a), 0))::double precision as score
  from landmarks l
  where (p_governorate is null or l.governorate = p_governorate)
  order by score desc
  limit greatest(p_k, 1);
$$;

create or replace function claim_courier_job()
returns setof courier_jobs
language sql as $$
  update courier_jobs set status = 'claimed', claimed_at = now()
  where id = (
    select id from courier_jobs where status = 'queued' order by created_at for update skip locked limit 1
  )
  returning *;
$$;

-- ------------------------------------------------------------- RLS policies
-- RLS is enabled on every table. Server routes use the secret (service-role)
-- key, which bypasses RLS; browser clients only get the policies below.
do $$
declare t text;
begin
  foreach t in array array[
    'merchants','delivery_fees','products','product_variants','product_images',
    'customers','addresses','landmarks','conversations','messages','orders',
    'order_items','risk_events','shipments','unmatched_demands','agent_events',
    'courier_jobs','landmark_misses','handover_logs','ai_cache','fd_clone_parcels'
  ] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- Landmarks are public reference data.
drop policy if exists landmarks_read on landmarks;
create policy landmarks_read on landmarks for select using (true);

-- Merchant-scoped reads for signed-in sellers (merchant id carried in JWT claims).
-- Tables without merchant_id are reachable only via the secret key until Day 6 auth.
drop policy if exists merchant_read on products;
create policy merchant_read on products for select
  using (merchant_id = nullif(auth.jwt() ->> 'merchant_id', '')::uuid);
drop policy if exists merchant_read on product_images;
create policy merchant_read on product_images for select
  using (merchant_id = nullif(auth.jwt() ->> 'merchant_id', '')::uuid);
drop policy if exists merchant_read on orders;
create policy merchant_read on orders for select
  using (merchant_id = nullif(auth.jwt() ->> 'merchant_id', '')::uuid);

-- ------------------------------------------------------------------ storage
insert into storage.buckets (id, name, public) values
  ('product-media', 'product-media', false),
  ('crops', 'crops', false),
  ('buyer-media', 'buyer-media', false),
  ('waybills', 'waybills', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------- realtime
alter publication supabase_realtime add table orders, messages, agent_events, courier_jobs;
