# Wassalha — Spec

> Derived from the 7-day build plan (`docs/PLAN.md`) on Day 1. The original spec text was not in the workspace; review and correct this file before Day 2, since Days 2–6 build against it.

## Product

Tunisian sellers take orders over WhatsApp/Instagram DM: buyers send a screenshot (often a story screenshot with several people) plus a Derja voice note, bargain, then give a vague landmark address. Orders fail (retours) because the address is imprecise, the price was never firmly agreed, or the buyer was never serious.

Wassalha runs that conversation: it identifies and prices the product, negotiates down to a floor price and no further, turns a landmark into a buyer-confirmed GPS pin, scores delivery risk, and — only after seller approval — creates the courier shipment and waybill.

Demo flow (must never break on stage):

```
screenshot + Derja voice note
  -> product cropped (SAM) and matched (PE + Spark re-rank)
  -> bargaining stops at the floor price
  -> landmark becomes a confirmed GPS pin
  -> risk badge -> seller approves
  -> browser agent fills the courier portal -> waybill PDF
  -> buyer receives the confirmation
```

Judges can try it: the WhatsApp simulator is a public link; every visitor becomes a new buyer of the demo shop. A "Behind the scenes" trace panel streams each step with its model, provider (Meta Model API or Baseten) and timing.

## Principles

- **Model proposes, code decides.** Spark understands and phrases; TypeScript decides slots, price, stock, address, risk and order creation.
- **Trust:** prices, stock, fees and totals are deterministic. A price firewall blocks any reply containing an amount the pricing engine did not produce. The order summary is a fixed template, never model text.
- **Demo-proof:** record/replay for every AI call (`AI_MODE`), automated acceptance tests, backup video, `MATCHER=all` and `LLM_PROVIDER=baseten` fallbacks.

## One buyer turn

Buyers send screenshot + voice + text in bursts. The pipeline debounces 2.5s and runs once per conversation at a time (`run_token` compare-and-set, work continues via `after()`):

1. Transcribe WAV (provider chosen by Day 1 bake-off; keyword/language biasing).
2. Understand with Spark + strict zod schema: intents, SAM noun phrase, short English product description, spatial hint, size/color/quantity, name, phone, governorate/delegation, landmarks, floor, driver note, discount ask / counter-offer, off-topic/insult/human flags.
3. If a screenshot is present: SAM crop, then the disambiguation ladder — (a) keep the only crop matching the catalog; (b) numbered-box overlay + buyer's words; (c) numbered crops as reply buttons (max 3); (d) buyer tap -> SAM point prompt.
4. Embed the crop (PE image tower, Baseten) -> pgvector top-5 -> Spark re-rank. Voice-only: embed Spark's short English description (PE text tower) into the same index.
5. Confidence gate: >= 0.85 propose; 0.60–0.85 send top 3 as buttons; < 0.60 save to `unmatched_demands` and decline politely. Out of stock: offer nearest in-stock product by vector search, always with its real crop.
6. Policy engine picks the next action (slot order in `nextAction()`, name/phone prefilled from sender, returning buyers reuse a confirmed pin).
7. Spark phrases the Derja reply from facts only; price firewall checks every amount; on failure a fixed template is sent.

## Negotiation (deterministic)

- Concession ladder: 50%, then 80%, then 100% of the seller's max discount. Every offer rounded up to 0.5 DT and clamped at the product floor price. A counter-offer at or above the next step is accepted as-is. The third offer is final ("akher soum").
- Free delivery is mentioned when the total passes the seller's threshold. Delivery fees come only from the seller's fee table, by governorate/delegation (`locality_id` for First Delivery).
- Money is integer millimes everywhere. Derja money parsing handles "170 alf" (170 DT) and "malyoun" (1000 DT); Tunisian phones normalize +216 / 8 digits; Arabizi digits (2, 3, 5, 7, 8, 9) are mapped.

## Address and pin

- Landmarks seeded from OpenStreetMap (Tunis, Ariana, Ben Arous, Manouba: pharmacies, cafés, schools, mosques, post offices, banks, clinics, supermarkets, fuel stations) as a committed JSON snapshot, searched with `unaccent` + `pg_trgm` over name and aliases.
- Resolver: query variants -> `search_landmarks` -> rank by similarity/type/region -> triangulation when two landmarks are named (closest candidate pair) -> Nominatim fallback -> misses logged to `landmark_misses`.
- No summary until the pin is confirmed: magic-link page `/pin/[token]` (Leaflet, draggable pin pre-centred on the landmark, floor + driver-note fields; token random, single-use, 24h expiry) or WhatsApp location request. Buyers often order from work, so "share current location" alone is insufficient.

## Risk and confirmation

- Risk score from order history and signals (including pin > 2 km from the named landmark: −10), each with readable reasons. Green: normal. Yellow: suggested call task. Red: send the seller's own Flouci/Konnect payment link (from settings) or bureau pickup — no payment gateway is built.
- Summary is a fixed template with [Akked] / [Beddel] buttons. The order row is created only on explicit Akked, status `CONFIRMED_BY_BUYER`.

## Handover

Insult, 3 off-topic turns, explicit human request, or stuck 3 turns -> `ai_paused`, logged to `handover_logs`; the seller types from the dashboard ("Reprendre la conversation").

## Courier

`CourierAdapter` with two implementations over the same field names and First Delivery state codes:
- API adapter (`/create` returns barcode + print link; `locality_id` mandatory since June 2026; `/etat` max 1 req/s; `prix` includes delivery, 0–999 DT; states 0 pending, 1 in progress, 2 delivered, 5/7/11/30/31 returns, 6 cancelled), pointed at the built-in mock for the demo.
- Playwright browser agent (local worker, headed): fills the clone portal, reads back every field, screenshots, waits for seller "Confirmer l'envoi", submits, produces the waybill PDF (barcode + GPS QR). Any mismatch: stop, screenshot, alert the seller. Fails closed.

## Channels

`ChannelAdapter` (`sendText`, `sendImage`, `sendButtons`, `sendLocationRequest`, `sendPinLink`): WhatsApp simulator first (public, Realtime broadcast on an unguessable channel per conversation); real WhatsApp Cloud API is a stretch goal (signature verification, dedupe by message id, OGG->WAV, max 3 reply buttons, location request messages, templates outside the 24h window).

## Data model

One Supabase migration (see `supabase/migrations/0001_init.sql` and `docs/PLAN.md` § Data model): merchants, delivery_fees, products, product_variants, product_images (`embedding vector(1024)`), customers, addresses, conversations, messages, orders, order_items, risk_events, shipments, unmatched_demands, landmarks, plus agent_events, courier_jobs, landmark_misses, handover_logs, ai_cache, fd_clone_parcels. RPCs: `match_products`, `search_landmarks`, `claim_courier_job`. RLS on every table, merchant-scoped. Realtime on orders, messages, agent_events, courier_jobs.

## Acceptance tests (the finish line)

1. **Vision/matching (Day 3):** 3-person screenshot + voice -> correct crop matched (or ladder resolves it), real crop shown.
2. **Negotiation (Day 4):** bargaining stops exactly at the floor; firewall blocks invented amounts; unit tests green.
3. **Address/pin (Day 5):** landmark resolves, pin confirmed on `/pin/[token]`; no summary before confirmation.
4. **Risk/confirmation (Day 5):** bad buyer gets red badge with reasons; order exists only after Akked.
5. **Courier (Day 6):** approve -> portal filled and read back -> seller confirms -> waybill PDF -> buyer confirmation; full flow < 3 min.

## Security baseline

RLS everywhere; secret keys server/worker only; zod everywhere; webhook signature + dedupe; pin tokens random/single-use/24h; private media via signed URLs; `worker/.auth/` gitignored; simulator rate-limited per IP/conversation with `SIMULATOR_PUBLIC` kill switch; synthetic or consented personal data only.
