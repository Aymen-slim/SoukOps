-- Seller accounts, per-shop demo slugs, AI language, and product controls.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

alter table merchants add column if not exists owner_user_id uuid unique references auth.users(id) on delete set null;
alter table merchants add column if not exists slug text;
alter table merchants add column if not exists reply_language text not null default 'derja';
alter table merchants add column if not exists ai_instructions text not null default '';
alter table merchants add column if not exists is_sandbox boolean not null default false;

alter table merchants drop constraint if exists merchants_reply_language_check;
alter table merchants add constraint merchants_reply_language_check
  check (reply_language in ('derja', 'ar', 'fr', 'en'));

create unique index if not exists merchants_slug_key on merchants (slug) where slug is not null;
create index if not exists merchants_owner_idx on merchants (owner_user_id);

update merchants m
set slug = case
  when m.id = (select id from merchants order by created_at asc limit 1) then 'wassalha-demo'
  else 'shop-' || substr(m.id::text, 1, 8)
end
where m.slug is null;

alter table products add column if not exists category text not null default 'general';
alter table products add column if not exists ai_enabled boolean not null default true;
update products set category = category_phrase where category = 'general' and category_phrase <> '';

alter table orders add column if not exists hidden_at timestamptz;

-- Vector match skips products whose AI is off. `active` still means listed for sale.
create or replace function match_products(p_merchant uuid, p_embedding vector(1024), p_k integer default 5)
returns table (product_image_id uuid, product_id uuid, distance double precision)
language sql stable as $$
  select pi.id, pi.product_id, (pi.embedding <=> p_embedding)::double precision
  from product_images pi
  join products p on p.id = pi.product_id and p.active and p.ai_enabled
  where pi.merchant_id = p_merchant and pi.embedding is not null
  order by pi.embedding <=> p_embedding
  limit greatest(p_k, 1);
$$;
