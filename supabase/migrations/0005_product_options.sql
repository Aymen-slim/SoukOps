-- Flexible catalog: any product type, seller-defined options, variant stock.
-- Existing rows keep size_policy 'required' so current clothing chats still ask for a size.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

alter table products add column if not exists description text;
alter table products add column if not exists product_type text;
alter table products add column if not exists size_policy text not null default 'required';

alter table products drop constraint if exists products_size_policy_check;
alter table products add constraint products_size_policy_check
  check (size_policy in ('required', 'none', 'options'));

create table if not exists product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  unique (product_id, position),
  unique (product_id, name)
);

alter table product_variants add column if not exists option_values jsonb not null default '{}'::jsonb;
alter table product_variants add column if not exists price_millimes integer;
alter table product_variants add column if not exists sku text;

alter table product_variants drop constraint if exists product_variants_price_nonneg;
alter table product_variants add constraint product_variants_price_nonneg
  check (price_millimes is null or price_millimes >= 0);
