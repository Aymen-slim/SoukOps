-- Messenger + Instagram one-click link (same pattern as 0002_whatsapp.sql).
-- Page access tokens are secrets: server-only reads via the Supabase secret
-- key, never returned to the browser. Apply in the SQL editor or CLI.

alter table merchants
  add column if not exists messenger_page_id text,
  add column if not exists messenger_page_name text,
  add column if not exists messenger_page_token text,
  add column if not exists messenger_connected_at timestamptz,
  add column if not exists instagram_business_id text,
  add column if not exists instagram_username text,
  add column if not exists instagram_page_id text,
  add column if not exists instagram_page_token text,
  add column if not exists instagram_connected_at timestamptz;

-- Platform-scoped buyer ids (PSID for Messenger, IGSID for Instagram).
alter table customers
  add column if not exists messenger_psid text,
  add column if not exists instagram_scoped_id text;
