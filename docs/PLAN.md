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
- [ ] Live on Vercel *(needs Vercel link + env vars)*

**Day 2: Simulator, pipeline, understanding (steps 1–2).** Public simulator (persona picker, text/image/WAV/recorder, buttons, location bubbles, typing indicator, `dir="auto"`); `ChannelAdapter`; `/api/messages` with zod + `after()` + 2.5s debounce + `run_token` CAS; `transcribe()`; `understand()` strict schema; `derja.ts` parsers. Done when: transcript + JSON in trace < ~6s and replay reproduces offline.

**Day 3: Vision and matching (steps 3, 4, 13).** SAM concept/point prompts, mask crop on white, disambiguation ladder, `matchProduct()` PE->top5->Spark re-rank->gate (0.85 / 0.60), voice-only text-embedding path, out-of-stock alternative. Done when: acceptance test 1 passes.

**Day 4: Conversation engine (steps 5, 14).** `nextAction()` slot policy, negotiation ladder (50/80/100%, round up 0.5 DT, floor clamp, 3rd offer final), `pricing.ts` millimes, firewall, Derja phrasing + template fallback, handover triggers. Vitest incl. never-below-floor property test. Done when: test 2 passes, unit tests green.

**Day 5: Address, pin, risk, confirmation (steps 6–8).** OSM landmark snapshot (committed JSON), resolver + triangulation + Nominatim fallback, `/pin/[token]`, risk engine (+pin>2km: −10), seeded buyer histories, fixed summary + Akked-gated order. Done when: tests 3–4 pass.

**Day 6: Dashboard, courier agent, waybill (steps 0 UI, 9, 10).** Live queue (crop/total/mini-map/risk/approve), order detail with agent screenshot, takeover, catalog upload (SAM preview, PE embedding, blur check), settings, demo panel; courier clone + FD mock; `CourierAdapter`; Playwright worker (login session, fill->read-back->confirm->PDF with GPS QR->buyer confirmation). Done when: test 5 passes, full flow < 3 min.

**Day 7: After-sale, hardening, demo (steps 11, 12, P1, stretch).** Pre-dispatch reconfirmation, FD status sync -> risk events, unmatched demand + analytics, `tests/e2e/acceptance.spec.ts` in replay mode, `demo:reset`, `docs/DEMO_SCRIPT.md`, warm PE replica for rehearsals/demo (back to 0 after), backup video. Stretch only if green by midday: real WhatsApp Cloud API, Muse Image poster (background only, real SAM crop composited with `sharp`).

## Cut list (in order)

Real WhatsApp -> Muse Image poster -> Spark Open LLM fallback (keep if it won the bake-off) -> analytics page (slide) -> pre-dispatch flow (slide) -> OSM seed (~150 landmarks by hand). Never cut: price firewall, pin gate, approval->waybill, trace panel, replay mode.

## Risks and fallbacks

Derja ASR quality (bake-off + keyword biasing + Spark normalization); latency 10–15s first message (typing indicator + live trace, low effort, parallel steps); Baseten cold start (warm replica for demo; `MATCHER=all` fallback); Meta outage (`LLM_PROVIDER=baseten`; SAM covered by replay); venue network (`AI_MODE=replay` + backup video); browser agent breakage (API adapter or manual prefilled values).

## Baseten budget ($100)

PE on L4 ≈ $0.85/h: scale-to-zero in dev, 2×2h rehearsals ≈ $3.50, demo day warm ≈ $8.50. Spark Open tokens ≈ $15. Expected total ≈ $30; $60 alert set on Day 0.
