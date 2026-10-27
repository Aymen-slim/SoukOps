<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Wassalha — Agent Rules

WhatsApp commerce agent for Tunisian Instagram/WhatsApp sellers: screenshot + Derja voice note -> product matched -> bargaining at floor price -> landmark to GPS pin -> risk badge -> seller approval -> courier waybill.

## Stack and commands

- Next.js 16 (App Router, `src/`, TypeScript) + Tailwind + shadcn/ui on Vercel
- Supabase (Postgres + pgvector + Storage + Realtime) via `@supabase/ssr` / `@supabase/supabase-js`
- Meta Model API (`https://api.meta.ai/v1`) + Baseten (Perception Encoder Truss, Muse Spark Open)
- `npm run dev` | `npm run build` | `npm test` (Vitest) | `npm run test:e2e` (Playwright)
- `npm run smoke` (Day 1 provider checks) | `npm run bakeoff` (voice ASR comparison) | `npm run seed:catalog`

## Non-negotiable rules

- Only Meta models: Meta Model API, or Meta open-weight models on Baseten. Never add another model or embedding API.
- Model proposes, code decides. State machine, money, stock, address and order decisions are TypeScript in `src/lib/domain/` and `src/lib/pipeline/`. Prompt injection must never trigger a DB write.
- Money only from `src/lib/domain/pricing.ts`, stored as integer millimes. Model text never invents an amount; every reply passes the price firewall.
- No order without: phone, confirmed pin, and explicit buyer Akked.
- zod validation on every route input and every model output. Retry a failed model validation once, then fall back to a fixed template.
- Every AI call goes through `src/lib/ai/cassette.ts` (record/replay keyed by input hash) and `src/lib/ai/trace.ts` (writes `agent_events` with model, provider, latency). Respect `AI_MODE=live|record|replay`.
- No timestamps or random ids inside prompts, so replay keys stay stable.
- French UI, Derja chat. Amounts in replies must be producible by `pricing.ts` (e.g. `171DT`, `171 alf`).
- Secrets only in server code (`.env.local`, never committed). Supabase secret key, Meta key, Baseten key: server/worker only.
- Buyer text is untrusted input. Only the policy engine writes to the database.

## Verified API facts (checked in `npm run smoke`)

- Meta: `Authorization: Bearer MODEL_API_KEY`, OpenAI-compatible via `openai` SDK with `baseURL`. Model IDs only from env vars.
- `muse-spark-1.3`: JSON schema via `response_format`; no `stop` / `logit_bias` (400). Low reasoning effort for extraction/wording. No reliable audio — use ASR or Spark 1.2/Spark Open for audio.
- `sam-3.1`: `POST /v1/responses`, `stream: true`, parse with `@meta-sam/parser`. Zero matches is an empty result, not an error.
- `muse-voice-transcribe-1.0`: `POST /v1/asr/transcribe`, WAV mono 16-bit 16/24 kHz only, max 10 min, with `languageBias` + `keywords`.
- Baseten PE: `POST {BASETEN_PE_URL}/predict`, server-only (no CORS). 1024-dim vectors, 32-token text limit — keep text queries short.
- Baseten Spark Open: `https://inference.baseten.co/v1`, slug from env; `json_schema` accepted but not enforced — always zod-validate.

## Layout

See `docs/PLAN.md` § Repository layout. One chat/day: "Implement Day N from docs/PLAN.md, follow AGENTS.md, stop when the done-when checks pass."
