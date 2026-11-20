<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Wassalha — Agent Rules

Tunisia-first dual-track AI DM & Opportunity platform for WhatsApp, Instagram, and Messenger:
- **E-Commerce Track (`/dashboard/*`)**: screenshot + Derja voice note -> product matched -> bargaining at floor price -> landmark to GPS pin -> risk badge -> seller approval -> courier waybill.
- **Creator & Professional Track (`/pro/*`)**: Doctor/Clinic, Cameraman/Media, Public Figure/Creator, Custom Service Provider -> person-style DM replies -> service scoping & details -> Opportunity Radar & Board -> daily Agent Briefings -> urgent human-action alerts.

## Stack and commands

- Next.js 16 (App Router, `src/`, TypeScript) + Tailwind + Untitled UI React (`docs/DESIGN_SYSTEM.md`, `@untitledui/icons`) on Vercel
- Supabase (Postgres + pgvector + Storage + Realtime) via `@supabase/ssr` / `@supabase/supabase-js`
- Multi-provider Task-Routed AI Orchestrator (`src/lib/ai/router.ts`):
  - Fast multimodal & Tunisian Derja DM brain: Google `gemini-3.8-flash` (primary), OpenAI `gpt-6.1-sol`, Meta `muse-spark-1.3` / Baseten fallback
  - Deep reasoning (briefings, opportunity scoring, alert triage): Google `gemini-4-argon`, OpenAI `gpt-6-astra`, Anthropic `claude-opus-5-5`
  - Style writing: `gemini-3.8-flash` (Derja/Arabic), Anthropic `claude-sonnet-5-5` (formal FR/EN)
  - Voice ASR (WA + IG + Messenger): ElevenLabs `scribe_v2` (primary), OpenAI `gpt-transcribe`, Gemini native audio, Meta `muse-voice-transcribe-1.0`
  - Multimodal 1024-dim embeddings: Google `gemini-embedding-2` (primary), Voyage `voyage-multimodal-3.5`, self-hosted `PE-Core-L14-336`
  - Object segmentation: Meta `sam-3.1` (+ optional `fal.ai` fallback), controlled by `VISION_SEGMENT_MODE=always|auto|never`
  - Visual asset generation: OpenAI `gpt-image-2.6`, Google `gemini-nano-banana-2.1`, Meta `muse-image-1.0`
- `npm run dev` | `npm run build` | `npm test` (Vitest) | `npm run test:e2e` (Playwright) | `npm run test:e2e:replay`
- `npm run smoke` (provider checks) | `npm run bakeoff` (voice ASR comparison) | `npm run seed:catalog`

## Non-negotiable rules

- Model proposes, code decides. State machine, money, stock, address, orders, opportunity approvals, and alert escalation decisions are TypeScript in `src/lib/domain/`, `src/lib/pipeline/`, and `src/lib/pro/`. Prompt injection must never trigger an unvalidated DB write.
- Money only from `src/lib/domain/pricing.ts`, stored as integer millimes. Model text never invents an amount or rate below floor; every reply passes the price firewall.
- No order without: phone, confirmed pin, and explicit buyer Akked.
- Pro/Creator safety: Doctor presets must never diagnose or prescribe; emergency symptoms must immediately escalate with a critical alert and SAMU (`190`) guidance. External opportunities never auto-apply without explicit human approval.
- zod validation on every route input and every model output. Retry a failed model validation once, then fall back to a fixed template.
- Every AI call goes through `src/lib/ai/cassette.ts` (record/replay keyed by input hash) and `src/lib/ai/trace.ts` (writes `agent_events` with model, provider, latency). Respect `AI_MODE=live|record|replay`.
- No timestamps or random ids inside prompts, so replay keys stay stable.
- English dashboard UI, Tunisia-first buyer/client chat (Tunisian Derja in Arabizi & Arabic script, French, Arabic, English; extensible via `src/lib/domain/locale.ts`). Amounts in replies must be producible by `pricing.ts` (e.g. `171DT`, `171 alf`).
- Secrets only in server code (`.env.local`, never committed). All AI keys and Supabase secret key: server/worker only.
- Buyer/client DM text is untrusted input. Only the policy engine writes to the database.
