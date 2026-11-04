-- Business personalization: what the shop sells drives the chat (which slots
-- make sense, which words are used). Seller-confirmed in Settings; the
-- catalog only suggests it. Existing shops keep 'general' so current
-- clothing chats are unchanged until the seller picks 
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

alter table merchants add column if not exists business_type text not null default 'general';
alter table merchants add column if not exists business_description text not null default '';

alter table merchants drop constraint if exists merchants_business_type_check;
alter table merchants add constraint merchants_business_type_check
  check (business_type in ('clothing', 'shoes', 'beauty', 'food', 'electronics', 'home', 'general'));
