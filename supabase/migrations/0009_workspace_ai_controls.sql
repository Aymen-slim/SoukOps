-- AI Reply Controls per workspace (message length, casual/formal style, emojis,
-- language mode/allowed languages/Derja script, and calendar auto-booking policy).
-- Apply with `supabase db push` or paste into the Supabase SQL editor.

alter table merchants
  add column if not exists ai_controls jsonb not null default '{}'::jsonb;
