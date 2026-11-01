-- WhatsApp Cloud API link (stretch, Settings > Link WhatsApp).
-- Stores the seller's own WhatsApp Business credentials on the merchant row.
-- The access token is a secret: it is only ever read by server code with the
-- Supabase secret key, and the dashboard API never returns it to the browser.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

alter table merchants
  add column if not exists whatsapp_phone_number_id text,
  add column if not exists whatsapp_waba_id text,
  add column if not exists whatsapp_access_token text,
  add column if not exists whatsapp_verify_token text,
  add column if not exists whatsapp_connected_at timestamptz;
