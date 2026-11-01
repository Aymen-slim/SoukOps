# Wassalha — 7-day build plan

Next.js + Supabase + Vercel, Meta models only: Muse Spark, SAM 3.1, Muse Voice Transcribe, Muse Image (Meta Model API), Perception Encoder embeddings + Muse Spark Open fallback (Baseten). The 5 acceptance tests in `docs/SPEC.md` are the finish line.

## Repository layout

```
AGENTS.md                      rules every coding-agent session follows
docs/SPEC.md, docs/PLAN.md, docs/DEMO_SCRIPT.md
supabase/migrations/0001_init.sql
baseten/pe-embed/              Truss: config.yaml, model/model.py (Perception Encoder)
scripts/smoke.ts, seed-catalog.ts, seed-landmarks.ts, demo-reset.ts, bakeoff.ts
demo-pack/products/, screenshots/, voice/*.wav, landmarks-extra.json
src/app/simulator/             public WhatsApp look-alike + trace panel
src/app/pin/[token]/           buyer pin confirmation map
src/app/dashboard/             orders, orders/[id], conversations, catalog, demand, analytics, settings, demo
src/app/courier-clone/         First Delivery look-alike portal
src/app/api/                   messages, sim/*, whatsapp/webhook, pin, orders/[id]/approve, courier/*, fd-mock/v2/*, demo/*
src/lib/ai/                    meta.ts, baseten.ts, llm.ts, spark.ts, sam.ts, asr.ts, image.ts, embeddings.ts, cassette.ts, trace.ts
src/lib/domain/                slots.ts, negotiation.ts, pricing.ts, firewall.ts, risk.ts, landmarks.ts, derja.ts
src/lib/channels/              types.ts, simulator.ts, whatsapp.ts
src/lib/couriers/              types.ts, firstDeliveryApi.ts, browserAgent.ts
src/lib/media/                 audio.ts, crop.ts
src/lib/pipeline/              handleTurn.ts, vision.ts, address.ts, order.ts
worker/                        index.ts, fdPortal.ts, login.ts
tests/unit/, tests/e2e/acceptance.spec.ts
```

## Data model (one migration)

Extensions `vector`, `pg_trgm`, `unaccent`; RLS on every table (merchant-scoped); Realtime on `orders`, `messages`, `agent_events`, `courier_jobs`. Tables: merchants, delivery_fees, products, product_variants, product_images (`embedding vector(1024)`, PE-Core-L14-336, normalized, cosine), customers, addresses (incl. `locality_id`, lat/lng, `confirmed_at`), conversations (slots/negotiation jsonb, `ai_paused`, `run_token`, `pin_token`), messages (unique external id), orders (millimes, risk score/level/reasons), order_items, risk_events, shipments, unmatched_demands, landmarks, agent_events (trace incl. provider), courier_jobs, landmark_misses, handover_logs, ai_cache, fd_clone_parcels. RPCs: `match_products(merchant, embedding, k)`, `search_landmarks(query, governorate, k)`, `claim_courier_job()` (`FOR UPDATE SKIP LOCKED`).

## Schedule

**Day 0 (human, ~1h):** accounts/keys (Meta, Baseten +$60 budget alert, Supabase us-east-1, Vercel+GitHub); pilot seller assets (20 photos, 3 story screenshots, fee table, floor prices, retour count); 6 Derja voice notes. — *Keys ready; assets pending (not on this PC yet).*

**Day 1: Foundation, Baseten deployment, smoke tests (spec step 0)**
- [x] Scaffold Next.js (TS, Tailwind, App Router, `src/`) + shadcn/ui + `@supabase/ssr` + Vitest + Playwright
- [x] `AGENTS.md`, `docs/SPEC.md`, `docs/PLAN.md`, `.env.example`
- [x] Baseten Truss written (`baseten/pe-embed/`) — deploy pending API key in `.env.local` (see `baseten/README.md`)
- [x] AI clients in `src/lib/ai/` with cassette + trace; `llm.ts` provider switch
- [x] `scripts/smoke.ts` (7 checks), `scripts/bakeoff.ts`, `scripts/seed-catalog.ts`
- [x] Migration + buckets defined in `supabase/migrations/0001_init.sql` — apply pending Supabase keys
- [x] `npm run smoke` green for every provider — 7/7 PASS on 2026-10-29 (PE on Modal CPU; Baseten workspace had $0 credit and an inference-only key, Modal GPU needs a payment method the user does not have — redeploy with `PE_USE_GPU=1` if billing opens)
- [ ] Bake-off winner -> `ASR_PROVIDER` *(needs `demo-pack/voice/*.wav`)*
- [x] Products cropped + embedded in Supabase — 16/16 seeded 2026-10-29 (`match_products` RPC verified), with plausible demo prices/floors/stock (replace with the pilot seller's real numbers when available; catalog has 16 unique products, not 20; `Sweat rose (duo)` is stock 0 on purpose for the out-of-stock alternative)
- [x] Live on Vercel — https://souk-ops.vercel.app (2026-11-01; env vars imported from `.env.local`, `APP_BASE_URL` set to the production URL; build fix in `c5f1b07`)

**Day 2: Simulator, pipeline, understanding (steps 1–2).** ✅ Done 2026-10-29. Public simulator at `/simulator` (persona picker, text/image/WAV upload/in-browser 16kHz WAV recorder, buttons rendering, typing indicator, `dir="auto"`, live trace panel + slot chips — transport is server-route polling behind `ChannelAdapter`, no anon RLS opened). `/api/messages` with zod + `after()` + 2.5s debounce + single-flight `runTurn`; `transcribe()` with catalog keyword biasing; `understand()` strict zod schema (all fields); `derja.ts` parsers + tests; Day-2 template ack (no negotiation until Day 4); insult/human handover sets `ai_paused`. Verified live: text turn (slots hoodie/black/L, ack sent), voice turn (ASR 2s, insult detected -> handover), Spark latency cut to ~3.3s with `reasoning_effort: low`. Replay verified: `AI_MODE=record` wrote cassettes for the demo note; `AI_MODE=replay` reproduced transcript + understanding with zero provider calls in trace. Unit 7/7, e2e 2/2, build+lint clean. Notes: only 1 real voice note exists so far (bake-off final still pending 5 more); vision/matching stubbed as `vision.pending` (Day 3).

**Day 3: Vision and matching (steps 3, 4, 13).** ✅ Done 2026-10-29. SAM concept/point prompts, mask crop on white, disambiguation ladder, `matchProduct()` PE->top5->Spark re-rank->gate (0.85 / 0.60), voice-only text-embedding path, out-of-stock alternative. Done when: acceptance test 1 passes. — Verified live: two-person screenshot + hint -> `Sweat jaune` propose (Spark 0.90, vector 0.889), no-hint -> numbered-crop buttons -> SAM box+point re-segment (point alone segments the chest print; box+point gives the garment, 0.98) -> propose 0.993 with the real crop shown; stock-0 match offers the nearest in-stock alternative with its real catalog crop; text-only turn gates to top-3 buttons via PE text embedding. Unit 26/26, e2e 5/5 (acceptance 1 + 1b live). Notes: catalog crops for two-person photos embed whichever garment SAM picked at seed time, so both crops of `story-two-people-sweatshirts` probe `Sweat jaune` — buttons/hint still resolve correctly; `landmarks.ts` resolver core (variants, threshold, triangulation, miss logging) landed early, pin wiring stays Day 5.

**Day 4: Conversation engine (steps 5, 14).** ✅ Done 2026-10-30 (landed with Day 5). `nextAction()` slot policy, negotiation ladder (50/80/100%, round up 0.5 DT, floor clamp, 3rd offer final), `pricing.ts` millimes, firewall, Derja phrasing + template fallback, handover triggers. Vitest incl. never-below-floor property test. Verified: acceptance test 2 passes live — ladder 112.5 → 108 → 105 DT (floor) and stays at the floor under further pressure; `negotiation.offer` trace shows `phrasing: spark` on all offers (firewall-checked, fixed-template fallback in `src/lib/pipeline/phrasing.ts`, mocked-Spark unit tests incl. invented-amount rejection); deterministic bargain wording in `derja.ts` (`na9esli`/`ghalia` win over "soum"); counter-offers parsed by code (`parseMoneyMillimes`) when the model omits them.

**Day 5: Address, pin, risk, confirmation (steps 6–8).** ✅ Done 2026-10-30. OSM landmark snapshot (38 landmarks, `scripts/landmarks.json`, `npm run seed:landmarks`), resolver + triangulation + Nominatim fallback wired, `/pin/[token]` (Leaflet, SHA-256 token hash, single-use, 24h), risk engine (+pin>2km: −10; returns −30 capped −60, cancels −15 capped −30, first order −10; green ≥70 / yellow ≥40 / red <40), seeded buyer histories + fees (`npm run seed:day5`), fixed summary + Akked-gated order (Akked/Beddel intercepted pre-model, idempotent `CONFIRMED_BY_BUYER`). Day-4 minimal gate landed with it: `slots.ts` `nextAction()`, `negotiation.ts` ladder, `pricing.ts` totals/fees. Verified: acceptance 3+4 pass live (incl. re-run pin-reuse path), unit 48/48, build+lint clean. Note: red buyer gets the merchant payment link inside the pre-Akked summary.

**Day 6: Dashboard, courier agent, waybill (steps 0 UI, 9, 10).** ✅ Done 2026-10-30. French seller console at `/dashboard` (queue with crop, total, risk, OSM thumbnail, approve; order detail with pin, read-back screenshot, Confirmer l'envoi, waybill link; conversations takeover; catalog upload with blur check before SAM and PE only after confirm; settings; demo panel). First Delivery clone at `/courier-clone` plus `/api/fd-mock/v2` (create, etat 1/s, PDF). Shared parcel + A6 waybill (Code 128 + GPS QR). `npm run worker` fills the clone, fails closed on any read-back diff, waits for the seller, then submits. Verified: acceptance 5 in 1.0 min (approve → read-back → confirm → PDF `FD…` → buyer line with the barcode and the stored total) and 5b (missing `locality_id` writes neither job nor shipment). Unit 70/70, lint and build clean. Browser: bordereau opened, seller reply sent, settings saved, clone login reaches the parcel form.

**Day 7: After-sale, hardening, demo (steps 11, 12, P1, stretch).** ✅ Done 2026-11-01. Stretch WhatsApp Cloud API landed 2026-11-01 (Settings > Link WhatsApp wizard with save/test/send-test, `/api/whatsapp/webhook` with signature + `external_id` dedupe + OGG->WAV voice notes, channel router in `src/lib/channels/index.ts`; needs `supabase/migrations/0002_whatsapp.sql` applied or `WHATSAPP_*` env); Muse Image poster not started. Pre-dispatch reconfirmation (seller-triggered, buyer button intercepted pre-model in `handleTurn`, approval gated in `dispatch.ts`, state in conversation slots — no migration), FD status sync -> risk events (`statusSync.ts` pure FD mapping + idempotent `risk_events`, `POST /api/orders/[id]/sync-status`, `npm run sync:fd`, clone state setter for staging), unmatched demand + analytics (`/dashboard/demand`, `/dashboard/analytics`), `tests/e2e/acceptance.spec.ts` in replay mode (`playwright.replay.config.ts` / `test:e2e:replay`, record via `test:e2e:record`; acceptance 6 sync + 7 reconfirm added), `npm run demo:reset` (+ dashboard button), `docs/DEMO_SCRIPT.md`, hardening (`SIMULATOR_PUBLIC` enforced + per-IP rate limits on simulator routes). Warm PE replica + backup video remain stage ops in `docs/DEMO_SCRIPT.md` (warm 15 min before, scale back to 0 after). Verified 2026-11-01: unit 83/83, lint+build clean, live acceptance 6+7+5b pass, replay suite 12/12 offline (22 cassettes recorded via `test:e2e:record`), smoke 7/7, `SIMULATOR_PUBLIC=false` kill switch verified (closed page + API 403), `demo:reset`+`seed:day5` clean state restored. Stretch only if green by midday: real WhatsApp Cloud API, Muse Image poster (background only, real SAM crop composited with `sharp`).

## Cut list (in order)

Real WhatsApp -> Muse Image poster -> Spark Open LLM fallback (keep if it won the bake-off) -> analytics page (slide) -> pre-dispatch flow (slide) -> OSM seed (~150 landmarks by hand). Never cut: price firewall, pin gate, approval->waybill, trace panel, replay mode.

## Risks and fallbacks

Derja ASR quality (bake-off + keyword biasing + Spark normalization); latency 10–15s first message (typing indicator + live trace, low effort, parallel steps); Baseten cold start (warm replica for demo; `MATCHER=all` fallback); Meta outage (`LLM_PROVIDER=baseten`; SAM covered by replay); venue network (`AI_MODE=replay` + backup video); browser agent breakage (API adapter or manual prefilled values).

## Baseten budget ($100)

PE on L4 ≈ $0.85/h: scale-to-zero in dev, 2×2h rehearsals ≈ $3.50, demo day warm ≈ $8.50. Spark Open tokens ≈ $15. Expected total ≈ $30; $60 alert set on Day 0.
