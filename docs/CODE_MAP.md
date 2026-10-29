# Wassalha — complete code & runtime map

> Snapshot: 29 Oct 2026, commit `9967878` (Day 1 of `docs/PLAN.md` done, Day 2 not started).
> Everything tagged **[built]** is in the working tree. Everything tagged **[designed]** is
> specified in `docs/SPEC.md` / `docs/PLAN.md` but has no code yet. Never read this as if the
> whole product exists — today it is the foundation plus the provider layer.

---

## 0. TL;DR — where the project actually stands

| Area | State |
|---|---|
| Next.js shell + provider status page | **built** |
| Env/config loader | **built** |
| Meta client (Spark / SAM / ASR / Image) | **built** |
| Baseten client (Spark Open) + PE predict | **built** |
| Cassette (record/replay) + trace (`agent_events`) | **built** |
| SAM segmentation + mask crop (sharp) | **built** (concept prompts only) |
| Price firewall (DT + "alf" forms) | **built** (Day 4 extends) |
| Supabase schema, RPCs, RLS, buckets, realtime | **built** (migration written, applied separately) |
| Smoke / bake-off / catalog-seed scripts | **built** |
| PE served on Modal (CPU) + Baseten Truss fallback | **built** |
| Simulator UI, `/api/messages`, `handleTurn` pipeline | **designed** |
| Negotiation, pricing engine, slots policy | **designed** |
| Landmark resolver, pin page, risk engine | **designed** |
| Dashboard, catalog upload, approval queue | **designed** |
| Courier adapter + Playwright worker | **designed** |
| WhatsApp Cloud API | **designed** (stretch) |

The repo is a **vertical slice of the AI/provider layer** plus a **complete database schema**.
The conversation brain (`src/lib/pipeline/`), the policy/domain layer (`src/lib/domain/` beyond
the firewall), channels, couriers, API routes and every page except `/` do not exist yet.
`worker/` exists as an empty folder.

---

## 1. The product in one page

**Who it is for.** Tunisian D2C sellers (Instagram/WhatsApp) who take orders in DMs and ship
cash-on-delivery. 80%+ of sales happen in DMs, ~70% COD; failed deliveries ("retours") are the
main loss.

**The buyer turn (target behaviour).** A buyer sends a store-story screenshot plus a Derja
voice note ("Slm, el veste beige b9adeh? 3andkom taille L?"). Wassalha must:

1. hear the note → transcript,
2. see the screenshot → isolate the garment the buyer means,
3. match it to the seller's catalog and real stock,
4. bargain deterministically down to a floor price and no lower,
5. turn "Khezama, ba7dha Pharmacie de Nuit" into a confirmed GPS pin,
6. score delivery risk (history + pin distance),
7. ask the seller to approve,
8. only then create the courier shipment and waybill PDF,
9. send the buyer the confirmation.

**Non-negotiable invariants** (from `AGENTS.md`, enforced by design):

- Model **proposes**, code **decides** — no DB write from model text.
- Money only from `pricing.ts`, integer millimes; every reply passes the **price firewall**.
- No order without **phone + confirmed pin + explicit Akked**.
- Only Meta models (Meta Model API, Muse Spark Open on Baseten, PE self-hosted).
- Every AI call goes through **cassette + trace**.

**Demo surface** (`docs/SPEC.md`): a public WhatsApp-lookalike simulator where each visitor is a
new buyer of the demo shop, plus a "Behind the scenes" trace panel showing model, provider and
latency for each step.

---

## 2. Repository tree, annotated

```
hackathon-project/
├── AGENTS.md                  rules every agent session must follow (stack, invariants, API facts)
├── README.md                  Day-1 setup + command table
├── docs/
│   ├── PLAN.md                7-day schedule, repo layout target, cut list, risks, budget
│   ├── SPEC.md                product spec: flow, negotiation, address, risk, courier, acceptance tests
│   ├── CODE_MAP.md            this file
│   └── bakeoff-results.md     ASR comparison table + preliminary decision
├── supabase/migrations/
│   └── 0001_init.sql          entire schema, RPCs, RLS, storage buckets, realtime publication
├── scripts/
│   ├── load-env.ts            dotenv: .env.local then .env, for tsx scripts
│   ├── smoke.ts               7 provider checks (the Day-1 acceptance gate)
│   ├── bakeoff.ts             Meta ASR vs Spark Open audio on demo-pack/voice/*.wav
│   └── seed-catalog.ts        photos → SAM crop → PE embedding → Storage + Postgres
├── src/
│   ├── app/
│   │   ├── layout.tsx         fr locale, Geist fonts, metadata
│   │   ├── page.tsx           provider-status dashboard (server component)
│   │   ├── globals.css        Tailwind 4 + shadcn tokens (light/dark, charts, sidebar)
│   │   └── favicon.ico
│   ├── components/ui/         shadcn "base-nova" primitives on @base-ui/react
│   │   ├── badge.tsx  button.tsx  card.tsx  input.tsx  label.tsx
│   ├── lib/
│   │   ├── env.ts             zod-parsed, cached server env + providerStatus()
│   │   ├── utils.ts           `export { cn } from "cn"`
│   │   ├── ai/
│   │   │   ├── meta.ts        OpenAI SDK pointed at https://api.meta.ai/v1
│   │   │   ├── baseten.ts     Spark Open client + raw PE predict call
│   │   │   ├── llm.ts         LLM_PROVIDER switch → {client, model, provider}
│   │   │   ├── spark.ts       sparkJson (schema+zod+retry) and sparkText
│   │   │   ├── asr.ts         Muse Voice Transcribe multipart + Spark Open fallback
│   │   │   ├── sam.ts         SAM 3.1 streaming → boxes + masks
│   │   │   ├── embeddings.ts  PE image/text embeddings, cosine helper
│   │   │   ├── image.ts       Muse Image generation (P2 poster)
│   │   │   ├── cassette.ts    content-hash record/replay
│   │   │   └── trace.ts       agent_events writer + timed wrapper
│   │   ├── domain/
│   │   │   └── firewall.ts    amount extraction + allow-list check
│   │   ├── media/
│   │   │   └── crop.ts        mask → white-background PNG (sharp)
│   │   └── supabase/
│   │       ├── admin.ts       secret-key client (bypasses RLS)
│   │       ├── server.ts      SSR cookie client
│   │       └── client.ts      browser publishable client
├── modal/
│   ├── pe_embed.py            PE-Core-L14-336 on Modal (primary embedding endpoint)
│   └── README.md              deploy, secret, billing caveat
├── baseten/
│   ├── pe-embed/config.yaml   Truss config (L4, scale-to-zero, concurrency 4)
│   ├── pe-embed/model/model.py  same contract as Modal, open_clip
│   └── README.md              deploy + contract + cost note
├── demo-pack/
│   ├── products.json          16 entries (name + categoryPhrase, prices all 0 — TODO)
│   ├── products/              16 product JPEGs
│   ├── screenshots/           3 story screenshots (one has two people — Day 3 material)
│   ├── voice/06.wav           one Derja note (5 more needed for the bake-off)
│   └── out/                   gitignored smoke-test output
├── tests/
│   ├── unit/firewall.test.ts  amount parsing + allow-list
│   ├── unit/cassette.test.ts  key stability
│   └── e2e/acceptance.spec.ts currently only "home page loads"
├── worker/                    EMPTY — Playwright courier agent lands Day 6
├── next.config.ts             cacheComponents, partialPrefetching, Turbopack CSS loader
├── package.json               Next 16.4.3, React 19.3, Tailwind 4, zod 4, openai 7, sharp
├── playwright.config.ts       baseURL localhost:3000, reuses dev server
├── vitest.config.mts          node env, `@` → src
└── tsconfig.json              strict, bundler resolution, `@/*` paths
```

Assets that will be needed but are absent: `docs/DEMO_SCRIPT.md`,
`demo-pack/landmarks-extra.json`, `demo-pack/voice/*` (5 more), `scripts/seed-landmarks.ts`,
`scripts/demo-reset.ts`, `.ai-cassettes/` (nothing recorded yet).

---

## 3. Runtime topology

```
                         ┌──────────────────────────────────────────┐
  buyer phone / browser  │ Next.js 16 app (Vercel)                  │
  ─────────────────────► │  / (built)                               │
   screenshot, WAV, text │  /simulator, /pin/[token]   [designed]   │
                         │  /dashboard, /courier-clone [designed]   │
                         │  /api/*                     [designed]   │
                         └───────┬───────────────┬──────────────────┘
                                 │               │
             ┌───────────────────┘               └───────────────┐
             ▼                                                   ▼
   ┌──────────────────┐                              ┌────────────────────────┐
   │ Meta Model API   │                              │ Supabase               │
   │ api.meta.ai/v1   │                              │ Postgres + pgvector    │
   │  muse-spark-1.3  │                              │ Storage (4 buckets)    │
   │  sam-3.1         │                              │ Realtime (4 tables)    │
   │  asr transcribe  │                              │ Auth/RLS               │
   │  muse-image      │                              └────────────────────────┘
   └──────────────────┘
             ▲
             │  fallback LLM / ASR competitor
   ┌──────────────────┐        ┌──────────────────────────────┐
   │ Baseten          │        │ Modal (CPU)                  │
   │ inference.baseten│        │ wassalha-pe-embed            │
   │ muse-spark-open  │        │ PE-Core-L14-336 → 1024-dim   │
   └──────────────────┘        └──────────────────────────────┘
             ▲                        ▲
             └──── same PE contract ───┘   (Baseten Truss = fallback)

  seller browser ──► /dashboard [designed] ──► worker/ Playwright [designed] ──► FD portal
```

Every arrow that crosses a process boundary is server-only: no secret ever reaches the browser.
`providerStatus()` exposes booleans, not values.

---

## 4. The AI layer, file by file

### 4.1 `src/lib/env.ts` — configuration spine **[built]**

- A single `z.object` schema over `process.env`. All credentials optional so the app and scripts
  boot keyless and can report what is missing.
- Defaults: `META_SPARK_MODEL=muse-spark-1.3`, `SAM_MODEL=sam-3.1`,
  `ASR_MODEL=muse-voice-transcribe-1.0`, `IMAGE_MODEL=muse-image-1.0`,
  `BASETEN_SPARK_OPEN_MODEL=meta-models/muse-spark-open-1026`,
  `LLM_PROVIDER=meta`, `ASR_PROVIDER=transcribe`, `MATCHER=vector`, `AI_MODE=live`,
  `CASSETTE_DIR=.ai-cassettes`, `APP_BASE_URL=http://localhost:3000`, `SIMULATOR_PUBLIC=true`.
- Legacy alias resolution happens after parse: `NEXT_PUBLIC_SUPABASE_ANON_KEY` → publishable,
  `SUPABASE_SERVICE_ROLE_KEY` → secret, `BASETEN_PE_URL` → `PE_EMBED_URL`,
  `BASETEN_API_KEY` → `PE_EMBED_API_KEY`.
- `getServerEnv()` caches on first call. **Caveat:** a typo in an enum (`LLM_PROVIDER=mata`)
  throws on the first env access, i.e. every route fails until fixed.
- `requireEnv(key)` throws `Missing required env var: X (set it in .env.local)` — the smoke
  script's SKIP classifier matches that string.
- `providerStatus()` returns presence booleans + active switches + model ids. Used by `/`.
  It never returns a key value.

### 4.2 `src/lib/ai/meta.ts` — Meta Model API client **[built]**

`new OpenAI({ apiKey: MODEL_API_KEY, baseURL: "https://api.meta.ai/v1" })`. The Meta API is
OpenAI-compatible, so the official `openai` SDK is reused for chat, responses and images.
`metaConfigured()` is a boolean helper. Server-only by convention (imported only from server code).

### 4.3 `src/lib/ai/baseten.ts` — Baseten client + PE endpoint **[built]**

- `getBasetenLlmClient()`: OpenAI SDK at `https://inference.baseten.co/v1`, key `BASETEN_API_KEY`.
- `pePredict(body)`: raw `fetch` to `peEmbedUrl` (Modal or Truss), `POST` JSON.
  - Sends `Authorization: Bearer <PE_EMBED_API_KEY>` when a key exists.
  - Also injects `_secret` into the JSON body when a key exists, because the Modal endpoint
    validates the body field, not the header.
  - Non-2xx → `PE predict failed: <status> <body>`.
- `peConfigured()` gates check 4 of the smoke test.

### 4.4 `src/lib/ai/llm.ts` — provider switch **[built]**

Returns `{ client, model, provider }`:
`LLM_PROVIDER=baseten` → Baseten Spark Open; otherwise Meta Muse Spark 1.3.
This is the outage fallback in `docs/PLAN.md` ("Meta outage → LLM_PROVIDER=baseten").

### 4.5 `src/lib/ai/spark.ts` — the brain adapter **[built]**

Two entry points, both cassette-wrapped and traced.

**`sparkJson(req)`** — structured extraction/wording:

1. Builds user content: plain string, or `[text, ...image_url]` when `images` are supplied.
2. Cassette key input = `{model, schemaName, system, user, imageCount, imageHashes}`.
3. Performs up to **2 attempts** of `chat.completions.create` with
   `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`.
4. Parses `choices[0].message.content` as JSON and runs `req.schema.parse(...)`.
5. On validation/parse failure, retries once; after that throws
   `Spark JSON validation failed after retry: ...`.
   Note: transport/API errors are **not** retried — only bad output.
6. Never sends `stop` or `logit_bias`: Muse Spark returns 400 on those.

Why both `jsonSchema` and `schema`: Meta enforces the JSON Schema, Baseten accepts but ignores
it, so the zod parse is the real gate.

**`sparkText(req)`** — plain completion for Derja phrasing. Documented contract: the caller must
run the price firewall on the result. Cassette namespace `spark.text`.

### 4.6 `src/lib/ai/asr.ts` — hearing **[built]**

**`transcribeWithMeta(req)`**
- Preconditions: WAV mono 16-bit 16/24 kHz, ≤10 min.
- `POST https://api.meta.ai/v1/asr/transcribe`, `multipart/form-data`:
  - `request` = JSON `{model, audioEncoding: "WAV", languageBias: ["Arabic","French"], keywords}`
  - `audio` = Blob `audio/wav`
- Response schema is a lenient `z.object({text?, transcript?, transcription?}).passthrough()`
  because the exact field name was not pinned down; first non-empty wins.
- Empty transcript → error (not an empty reply).
- Cassette key: `{model, wav: "<length>:<first 64 bytes hex>", keywords}` — a cheap content
  fingerprint, not a full hash.

**`transcribeWithSparkOpen(req)`** — sends `input_audio` (base64 WAV) in a chat completion.
The bake-off showed Baseten's OpenAI-compatible endpoint ignored the audio part and the model
answered "no audio was attached", so this path is effectively non-functional today.

**`transcribe(req)`** — `ASR_PROVIDER === "spark-open" ? sparkOpen : meta`. Decision after the
bake-off: keep `transcribe`.

### 4.7 `src/lib/ai/sam.ts` — seeing **[built, concept prompts]**

`segmentImage({imageDataUrl, nounPhrase})`:

1. `client.responses.create({ model: "sam-3.1", stream: true, input: [message with
   input_text(nounPhrase) + input_image(dataUrl, detail:"auto")], metadata: {
   include_confidence:"true", mask_encoding:"one_bit", score_threshold:"0.5" } })`.
2. `parseImageStream(events)` → an async iterable that must be **drained** so `finalResult`
   resolves; the code loops over it discarding events, then awaits `parsed.finalResult`.
3. `recordsOfKind(records, "mask")` → for each record: `decodeMaskToRaster(record.mask)`.
4. Returns `{ objects: [{objectId, box{l,t,r,b}, confidence, mask{width,height,encoding,payload},
   rasterBase64}], diagnostics[] }`.
5. **Zero matches is a valid empty list, not an error** — callers must handle it (smoke prints a
   hint; the Day-3 ladder will fall back).

Constraints: `nounPhrase` must be a short English category ("dress", "hoodie"), never a brand
name. Point/tap prompts are not implemented yet (Day 3).

### 4.8 `src/lib/ai/embeddings.ts` — the vector path **[built]**

- `PE_DIMENSIONS = 1024`.
- `embedImages(base64[])` → `pePredict({images})` → zod `{embeddings: number[][]}` → assert each
  vector is 1024 long. Traced as `pe.embedImages` with model label `PE-Core-L14-336`.
- `embedTexts(texts[])` → same for `{texts}`; keep prompts short (model text tower is 32 tokens).
- `cosineSimilarity(a,b)` — plain dot/norm, used by smoke check 4 and useful for in-process rerank.
- Providers are labelled `baseten` in the trace even when the endpoint is Modal. Cosmetic
  inaccuracy worth fixing if judges read the trace panel.

### 4.9 `src/lib/ai/image.ts` — Muse Image (P2) **[built, unused]**

`images.generate({model, prompt, n:1})` → `{b64Json|url}`; throws if neither.
Policy comment: for the out-of-stock poster, generate **only the background** and composite the
real SAM crop with sharp — never let the image model redraw the garment.

### 4.10 `src/lib/ai/cassette.ts` — demo-proofing **[built]**

The single most important reliability primitive.

- `stableStringify(value)`: recursively sorts object keys, preserves array order, drops
  `undefined` values, so logically equal inputs serialize identically.
- `cassetteKey(namespace, input)` = `sha256("<namespace>:<stableString>")`, hex, first 32 chars.
- File path = `<cwd>/<CASSETTE_DIR>/<namespace>/<key>.json`.
- `withCassette(namespace, input, call)`:
  - `AI_MODE=replay` → read file; parse and return; on any miss throw
    `Cassette miss in replay mode: <ns>/<key>. Re-run with AI_MODE=record.`
  - `live` → just `call()`.
  - `record` → `call()`, `mkdir -p`, write pretty JSON, return result.
- Namespaces in use: `spark.json.<schemaName>`, `spark.text`, `asr.meta`, `asr.sparkOpen`,
  `sam.segment`, `pe.embedImages`, `pe.embedTexts`, `image.generate`.

Consequence: **no timestamp or random id may enter the cassette input**, otherwise replay keys
change every run (this is why `AGENTS.md` forbids it in prompts).

### 4.11 `src/lib/ai/trace.ts` — observability **[built]**

- `trace(event)` formats `[trace] <kind> <provider>/<model> <ms>ms ok=<bool>`.
  - If Supabase admin is configured → insert row into `agent_events`
    (`conversation_id, kind, model, provider, latency_ms, ok, detail`).
  - Otherwise `console.info`.
  - Any insert error is caught and only warned — tracing never breaks a call.
- `traced(meta, call)` times with `performance.now()`, traces success and failure (adding
  `detail.error`), then rethrows. This is the wrapper every provider function uses.

Note: `ai_cache` (a Postgres table) exists but is unused; cassettes are files on disk.

---

## 5. Media: turning a mask into a sellable crop

`src/lib/media/crop.ts` **[built]**

`cropWithMask(imageBuffer, samObject)`:

1. Box size from `right-left`, `bottom-top` (min 1 px).
2. Decode `rasterBase64` to bytes.
3. Accept the raster if `raster.length === boxW*boxH` **and** the mask's declared dimensions equal
   the box.
4. Else, if `raster.length === maskW*maskH`, treat the raster as a raw 1-channel image at
   `maskW×maskH` and `sharp(...).resize(boxW, boxH).raw()`.
5. Else throw `SAM mask raster size mismatch: ...` (visible in smoke logs).
6. `sharp(image).extract(box).ensureAlpha().raw()` → RGBA buffer.
7. For every pixel: alpha = `mask>0 ? 255 : 0`. Then `flatten({background:"#ffffff"}).png()`.

Result: the garment on a white studio background — the same visual language for the catalog,
the chat preview and the out-of-stock alternative.

`cropToBox(image, box)` — plain rectangle crop for smoke/debug.

**Assumptions to verify on Day 3:** SAM `bounds` are interpreted as original-image pixel
coordinates. If the API returns normalized or model-resized coordinates, crops will be offset.
`extract()` also throws if the box exceeds the image, so clamping belongs in the Day-3 ladder.

---

## 6. Domain rules: what exists and what is prescribed

### 6.1 Built: `src/lib/domain/firewall.ts`

`extractAmountsMillimes(reply)`:

- `/(\d{1,6})(?:[.,](\d{1,3}))?\s*(?:dt|dinar)/gi`
  → `171DT` = 171000, `171,500 DT` = 171500, `171.5 DT` = 171500
  (fraction zero-padded to 3: `5` → `500`).
- `/(\d{1,6})\s*alf\b/gi` → `170 alf` = 170000.

`passesPriceFirewall(reply, allowed: Set<number>)` — true only if **every** extracted amount is in
the allow-list. A reply with no amounts passes (there is nothing to leak).

Known gaps to close on Day 4: bare numbers (`150`), `mille/malyoun`, Arabic-Indic digits, phone
numbers that look like amounts, TND spelled in Arabic script, amounts in button labels.

### 6.2 Designed: the modules the plan names

`src/lib/domain/` (from `docs/PLAN.md` § Repository layout):
`slots.ts`, `negotiation.ts`, `pricing.ts`, `risk.ts`, `landmarks.ts`, `derja.ts`.

**`pricing.ts` — the only source of money.** Integer millimes. Fee lookup by
governorate/delegation from `delivery_fees`, free delivery above
`merchants.free_delivery_threshold_millimes`, totals = subtotal − discount + fee. No floats.

**`negotiation.ts` — deterministic ladder.**

```
maxDiscount = price - floor                    (seller's floor, DT)
rung 1 = 50% of maxDiscount
rung 2 = 80%
rung 3 = 100%  (floor)  → "akher soum", final
each offer = ceil_to_0.5DT(price - rung), clamped at floor
counter-offer >= next rung → accept as-is
```

Every generated amount becomes an entry in the allow-list handed to the firewall.

**`slots.ts` — `nextAction()`.** A fixed priority order (product → size → negotiation →
name/phone → governorate → landmark → pin → summary → Akked → handover). Name/phone prefilled
from the channel sender; returning customers reuse a confirmed pin. The model never chooses the
next step.

**`risk.ts`.** Score from `risk_events` history plus signals; `pin > 2 km` from the named
landmark = −10. Output `{score, level: green|yellow|red, reasons[]}` with human-readable
reasons. Red → seller's Flouci/Konnect link or bureau pickup (no gateway built).

**`landmarks.ts`.** Query variants → `search_landmarks` RPC → rank by similarity/type/region →
triangulation when two landmarks are named (closest candidate pair) → Nominatim fallback →
log misses to `landmark_misses`.

**`derja.ts`.** Phone normalization (`+216`, 8 digits), Arabizi digit mapping (2,3,5,7,8,9),
money words (`alf` = 1000 DT, `malyoun` = 1000 DT), size/color synonyms.

---

## 7. Conversation pipeline (Day 2+, designed)

Target files: `src/lib/pipeline/handleTurn.ts`, `vision.ts`, `address.ts`, `order.ts`;
`src/lib/channels/{types,simulator,whatsapp}.ts`; `src/app/api/messages/route.ts`.

```
inbound burst (image + audio + text)
        │
        ▼
zod-validate payload ──► insert messages (external_id dedupe)
        │
        ▼
debounce 2.5 s  ──►  CAS conversations.run_token
        │             (only one turn per conversation at a time;
        │              work continues in after())
        ▼
transcribe(wav)                    asr.ts        [built primitive]
        ▼
understand(transcript, text)       sparkJson     [schema designed]
  intents, samNoun, englishDesc, spatialHint,
  size/color/qty, name, phone, governorate,
  delegation, landmarks, floor, driverNote,
  discountAsk/counterOffer, offTopic/insult/human
        ▼
if screenshot:
  segmentImage(noun)               sam.ts        [built]
  cropWithMask                    crop.ts       [built]
  disambiguation ladder:
    a. exactly one crop matches catalog → use it
    b. numbered boxes overlay + buyer's words
    c. ≤3 numbered crops as reply buttons
    d. buyer taps → SAM point prompt (not built)
        ▼
embedImages(crop) → match_products(merchant, vec, 5) → Spark re-rank
  voice-only path: embedTexts(englishDesc) into the same index
        ▼
confidence gate: ≥0.85 propose | 0.60–0.85 top-3 buttons | <0.60 unmatched_demands + decline
out of stock: nearest in-stock product by vector search, always with its real crop
        ▼
nextAction(slots)  → policy engine (code)
        ▼
sparkText(facts only) → price firewall → send  (on fail: fixed template)
        ▼
channel.sendText / sendImage / sendButtons / sendLocationRequest / sendPinLink
```

**Handover triggers:** insult, 3 off-topic turns, explicit human request, or stuck 3 turns →
`ai_paused=true`, row in `handover_logs`; seller resumes from the dashboard.

**Address → pin:** no summary until confirmed. Magic-link page `/pin/[token]` (Leaflet,
draggable pin pre-centred on the landmark, floor + driver-note fields; random single-use token,
24 h expiry) or a WhatsApp location request.

**Order creation:** fixed summary template with `[Akked]` / `[Beddel]`. The `orders` row is
created **only** on Akked, status `CONFIRMED_BY_BUYER`. Seller approval in the dashboard moves it
to `APPROVED`; the courier step moves it to `WAYBILL_CREATED`.

**Courier:** `CourierAdapter` with two implementations — API (mock by default; `/create` returns
barcode + print link; `locality_id` mandatory; `/etat` ≤1 req/s; FD state codes 0/1/2/5/7/11/30/31/6)
and a headed Playwright worker that fills the clone portal, reads every field back, screenshots,
waits for the seller's "Confirmer l'envoi", submits, and produces the waybill PDF with barcode +
GPS QR. Any mismatch → stop, screenshot, alert; fails closed.

---

## 8. Database (built migration)

`supabase/migrations/0001_init.sql` — one migration, ~320 lines.

### 8.1 Extensions

`vector` (pgvector), `pg_trgm`, `unaccent`, `pgcrypto` (for `gen_random_uuid`).

### 8.2 Tables

| Table | Key columns | Why it exists |
|---|---|---|
| `merchants` | `max_discount_percent`, `free_delivery_threshold_millimes`, `payment_link`, `courier_mode ∈ {mock_api,browser,real_api}` | seller settings; courier mode selects the adapter |
| `delivery_fees` | `governorate`, `delegation`, `locality_id`, `fee_millimes`; unique `(merchant, gov, delegation)` | the only legal source of delivery prices; `locality_id` for FD |
| `products` | `name`, `category_phrase` (SAM noun), `price_millimes`, `floor_millimes`, `stock`, `active`; check `floor ≤ price` | catalog; the floor is enforced in SQL too |
| `product_variants` | `size`, `color`, `stock` | size/colour matrix (not yet seeded) |
| `product_images` | `source_path`, `crop_path`, `embedding vector(1024)`, `is_primary` | visual index; HNSW cosine index |
| `customers` | `phone` unique per merchant, `wa_id` | identity + risk history anchor |
| `addresses` | `governorate`, `delegation`, `locality_id`, `landmark`, `lat`, `lng`, `floor`, `driver_note`, `confirmed_at` | pin confirmation is `confirmed_at != null` |
| `landmarks` | `name`, `aliases text[]`, `type`, `gov`, `delegation`, `lat`, `lng`; GIN trgm on name | OSM snapshot + demo aliases |
| `conversations` | `slots jsonb`, `negotiation jsonb`, `ai_paused`, `run_token uuid`, `pin_token`, `pin_token_expires_at` | state machine memory + concurrency lock |
| `messages` | `external_id unique`, `direction ∈ {in,out}`, `kind ∈ {text,image,audio,buttons,location}`, `body`, `media_path` | transcript/audit + webhook dedupe |
| `orders` | `status` enum, `subtotal/discount/delivery/total_millimes`, `risk_score`, `risk_level`, `risk_reasons jsonb` | the commercial record |
| `order_items` | `name_snapshot`, `unit_price_millimes`, `quantity` | price snapshot survives catalog edits |
| `risk_events` | `kind ∈ {delivered,returned,cancelled,pin_far,...}`, `detail` | history that feeds the score |
| `shipments` | `courier`, `mode`, `barcode`, `waybill_path`, `fd_state` | waybill + status sync |
| `unmatched_demands` | `description`, `crop_path`, `embedding` | "we don't sell this" analytics |
| `agent_events` | `kind`, `model`, `provider`, `latency_ms`, `ok`, `detail` | the trace panel + judge proof |
| `courier_jobs` | `status ∈ {queued,claimed,done,failed}`, `payload`, `screenshot_path`, `result`, `claimed_at` | worker queue |
| `landmark_misses` | `query`, `governorate` | coverage gaps to seed later |
| `handover_logs` | `reason` | human takeover audit |
| `ai_cache` | `key` PK, `namespace`, `value jsonb` | reserved; unused (cassettes are files) |
| `fd_clone_parcels` | `fields jsonb`, `state`, `barcode` | the mock First Delivery portal's storage |

Design notes / sharp edges:

- `products.stock` is a single integer, while `product_variants` holds the real size matrix and
  `seed-catalog.ts` only writes `products.stock`. Until the Day-3/4 code chooses one, size-level
  stock ("taille L: 4") has no single source of truth.
- `delivery_fees` uniqueness with a `NULL` delegation does not prevent duplicates (Postgres treats
  NULLs as distinct) — governorate-wide fees need a partial unique index or a sentinel.
- `orders` has no unique constraint on `conversation_id`, so nothing at the DB level prevents two
  orders for one conversation; the pipeline must gate it.
- `pin_token` is not indexed/unique — lookups will scan; add a unique partial index.
- `unmatched_demands.embedding` has no index (fine at demo scale).

### 8.3 RPCs

**`match_products(p_merchant uuid, p_embedding vector(1024), p_k int default 5)`**

```sql
select pi.id, pi.product_id, (pi.embedding <=> p_embedding)::float8 as distance
from product_images pi
join products p on p.id = pi.product_id and p.active
where pi.merchant_id = p_merchant and pi.embedding is not null
order by pi.embedding <=> p_embedding
limit greatest(p_k, 1);
```

Returns **cosine distance** (lower = closer). The app's confidence gate compares similarity, so
it must convert (`similarity ≈ 1 − distance` for normalized vectors) or compare distances
directly with inverted thresholds.

**`search_landmarks(p_query text, p_governorate text default null, p_k int default 5)`**

Ranks `landmarks` by `greatest(similarity(unaccent(name), unaccent(query)),
max similarity over unaccented aliases)`, filtered by governorate when provided. No minimum
score: an unknown landmark still returns the 5 nearest-by-trgm names. The resolver must apply a
threshold and log a miss below it.
Performance note: `similarity(unaccent(name), …)` is not indexable as written (the GIN trgm index
helps `%`/`LIKE`, not this expression). Fine for ~150 landmarks.

**`claim_courier_job()`** — `UPDATE … WHERE id = (SELECT … WHERE status='queued' ORDER BY
created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`. Safe multi-worker claim.

### 8.4 RLS, storage, realtime

- `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on **all 21 tables** via a `DO` loop.
- `landmarks`: public `SELECT` (reference data).
- `products`, `product_images`, `orders`: seller `SELECT` where
  `merchant_id = nullif(auth.jwt() ->> 'merchant_id','')::uuid`.
- Everything else: no policy → only the **secret key** (server/worker) can touch it until Day-6
  auth exists. This is deliberate: fail closed.
- Private buckets: `product-media`, `crops`, `buyer-media`, `waybills`. Media is served via
  signed URLs (Day 3+); never public.
- Realtime publication: `orders`, `messages`, `agent_events`, `courier_jobs` — powers the live
  dashboard queue and the trace panel.
- `alter publication … add table …` is **not idempotent**: re-running the migration will error on
  those four tables. Apply once, or guard it.

---

## 9. Supabase clients

| File | Key | Bypasses RLS | Use |
|---|---|---|---|
| `admin.ts` | `SUPABASE_SECRET_KEY` (or legacy service-role) | yes | routes, scripts, worker; **caller must scope by merchant** |
| `server.ts` | publishable + request cookies via `@supabase/ssr` | no | Server Components / Route Handlers acting as the seller |
| `client.ts` | publishable browser client | no | simulator + dashboard UI, realtime subscriptions |

`hasAdminConfig()` lets scripts/trace degrade to local-only behaviour when Supabase is not set up.
No `middleware.ts` yet, so SSR session refresh is not implemented — a Day-6 concern when auth
lands.

---

## 10. UI shell (built)

- `src/app/layout.tsx`: `<html lang="fr">`, Geist + Geist Mono variables, metadata title
  "Wassalha", body flex column, min-h-full. Uses the Next 16 typed `LayoutProps<"/">`.
- `src/app/page.tsx`: an async Server Component. `StatusSection` does `await connection()` (Next 16
  `cacheComponents` opt-out) and renders two cards:
  1. **Fournisseurs** — Meta Model API, Baseten Spark Open, Perception Encoder (Modal CPU),
     Supabase public, Supabase secret. Each is a badge `Configuré` / `À configurer` based on
     presence booleans only.
  2. **Réglages actifs** — outline badges for `LLM_PROVIDER`, `ASR_PROVIDER`, `MATCHER`,
     `AI_MODE`.
  Wrapped in `<Suspense>`; copy is French per the UI rule. This page is the Day-1 operator
  dashboard: it answers "are my keys wired?" without printing them.
- `globals.css`: Tailwind 4 import + `tw-animate-css` + `shadcn/tailwind.css`; OKLCH design tokens
  for light/dark, charts and sidebar; radius scale derived from `--radius: 0.625rem`.
  **Bug:** `--font-sans: var(--font-sans)` is self-referential in `@theme inline`; it should be
  `var(--font-geist-sans)`, so the Geist Sans variable set by `layout.tsx` never reaches
  `font-sans` (the body falls back to a default sans).
- `src/components/ui/*`: shadcn **base-nova** primitives built on `@base-ui/react`
  (`useRender` + `mergeProps`), `class-variance-authority`, and `cn` imported straight from the
  `cn` npm package (`src/lib/utils.ts` only re-exports it). `components.json` pins
  style `base-nova`, base colour neutral, lucide icons, RSC true.
- Packaging nit: `shadcn` (the CLI) is a **runtime** dependency; it belongs in devDependencies.
  `@base-ui/react`, `cva`, `clsx`, `tailwind-merge` and `cn` are all installed simultaneously.

---

## 11. Scripts (built)

### 11.1 `scripts/load-env.ts`

Loads `.env.local` then `.env` with dotenv. Every `tsx` script imports it first, because scripts
run outside Next and Next's env loading does not apply.

### 11.2 `scripts/smoke.ts` — the Day-1 gate

Runs 7 checks in sequence. Each catches its error; a message matching
`/Missing required env|not set|ENOENT|no such file/` becomes **SKIP**, anything else **FAIL**.
Each check also records wall-clock ms. Exit code 1 only if any FAIL.

| # | Check | Calls | Pass criteria | Skips when |
|---|---|---|---|---|
| 1 | Spark JSON-schema | `sparkJson` with `smoke_echo` schema | valid JSON, `ok===true` | `MODEL_API_KEY` missing and provider=meta |
| 2 | SAM crop | `segmentImage` + `cropToBox` on first `demo-pack/products/*` | crop written to `demo-pack/out/smoke-crop.png` (zero objects is reported as a hint, not a failure) | no key / no photo |
| 3 | WAV transcription | `transcribeWithMeta` on first `demo-pack/voice/*.wav`, keywords `["robe","hamra"]` | non-empty transcript | no key / no wav |
| 4 | PE image+text | `embedImages([photo])`, `embedTexts(["dress"])`, `embedTexts(["leather motorcycle helmet"])` | `cos(photo,"dress") > cos(photo,"helmet")` | `PE_EMBED_URL` missing / no photo |
| 5 | Spark Open vision | Baseten chat completion with a data-URL image | zod-valid `{category,color}` | `BASETEN_API_KEY` / no photo |
| 6 | Muse Image | `generateImage("Plain soft beige studio background…")` | b64 or URL returned | `MODEL_API_KEY` |
| 7 | Supabase round trip | `select id from merchants limit 1` | no error (proves migration applied) | admin config missing |

`nounPhrase` for check 2 is read from `demo-pack/products.json` for the chosen file, falling back
to `"hoodie"`. Note check 3's keywords (`robe`, `hamra`) do not match the current demo catalog
(hoodies/sweatshirts) — harmless for a smoke test, but worth aligning.

### 11.3 `scripts/bakeoff.ts`

For every `demo-pack/voice/*.wav`: call Meta ASR and Spark Open audio, print both, and write a
Markdown table to `docs/bakeoff-results.md`. **Bug:** only `|` is escaped, not newlines — the
current file shows the Spark Open multi-line refusal spilling out of the table.

Result so far (1 of 6 notes): Muse Voice Transcribe transcribed; Spark Open answered "no audio
was attached". `ASR_PROVIDER` stays `transcribe`.

### 11.4 `scripts/seed-catalog.ts`

Input `demo-pack/products.json`, schema `[{file, name, categoryPhrase, priceMillimes,
floorMillimes, stock}]`. Flow per item:

1. Read photo → data URL.
2. `segmentImage(categoryPhrase)` → take `objects[0]` (or the original photo if SAM finds none).
3. `cropWithMask` → PNG on white.
4. `embedImages([crop])` → 1024-dim vector.
5. Upload crop to `crops/`, original to `product-media/` (upsert).
6. Insert `products` row, then `product_images` row with `embedding`, `is_primary=true`.

Sharp edges:

- It **inserts a new merchant every run** ("Demo Shop (pilot seller)") — re-running duplicates
  the merchant and the whole catalog. Needs a "find or create" upsert keyed by name.
- `products.json` currently has `priceMillimes/floorMillimes/stock` all `0` for 16 items. The
  schema permits it, but seeding now would create a catalog where every product is free and
  out of stock. Fill real values first.
- Size variants are never written, so `product_variants` stays empty.
- SAM crop index `[0]` is arbitrary; with multi-object photos it can crop the wrong garment.

---

## 12. Model servers (Python)

### 12.1 Modal — primary PE host (`modal/pe_embed.py`)

- App `wassalha-pe-embed`; volume `pe-hf-cache` caches HuggingFace weights.
- `model_image`: `torch`, `open_clip_torch`, `timm`, `pillow` on `debian_slim` py3.11.
- `PerceptionEncoder` class: `@modal.enter()` loads
  `open_clip.create_model_and_transforms("hf-hub:timm/PE-Core-L-14-336")`, picks CUDA when
  available (else CPU), `@modal.method() embed(payload)` returns
  `{embeddings: [[1024 floats]]}` normalized.
- `predict` FastAPI endpoint (POST): pops `_secret`, compares to `PE_SHARED_SECRET` from Modal
  secret `wassalha-pe`, 401 on mismatch, else `PerceptionEncoder().embed.remote(payload)`.
- `health` GET returns `{ok, model}` with **no auth**.
- GPU switch: `PE_USE_GPU=1` by default (L4, cpu 2, 8 GiB, `scaledown_window=300`, `timeout=900`);
  `PE_USE_GPU=0` deploys CPU-only (cpu 8) because Modal requires a card for GPU functions. Per
  `docs/PLAN.md` it was deployed on CPU.
- Secret handling: the shared secret doubles as the Bearer token and the body `_secret`; the
  client sends both.

### 12.2 Baseten Truss — fallback (`baseten/pe-embed/`)

- `config.yaml`: `wassalha-pe-embed`, py3.11, torch/open_clip/timm/pillow, `accelerator: L4`,
  cpu 2, 8 Gi, `predict_concurrency_per_worker: 4`; autoscaling set in the console (min 0 in dev,
  1 for rehearsals/demo).
- `model/model.py`: `Model.load()` loads the same checkpoint, `.eval().cuda()`;
  `predict({"images"|"texts"})` returns normalized embeddings.
- Identical request/response contract to Modal, so `pePredict()` can point at either with one env
  change. It does **not** check `_secret`; auth is Baseten's Bearer key.
- Cost note: L4 ≈ $0.85/h; scale-to-zero dev, 2×2 h rehearsals ≈ $3.50, demo day warm ≈ $8.50,
  expected PE total ≈ $12 of the $100 credit.

---

## 13. Tests (built)

| File | Asserts |
|---|---|
| `tests/unit/firewall.test.ts` | `171DT` → `[171000]`; `171,500 DT` → `[171500]`; `170 alf` → `[170000]`; allow-list accepts 171000, rejects 150000, ignores amount-free text |
| `tests/unit/cassette.test.ts` | key is independent of object key order; key changes with namespace and with input |
| `tests/e2e/acceptance.spec.ts` | `/` renders the "Wassalha" heading (app-shell smoke only) |

`vitest.config.mts`: node environment, `tests/unit/**/*.test.ts`, `@` → `src`.
`playwright.config.ts`: `tests/e2e`, 60 s timeout, baseURL from `APP_BASE_URL`, reuses an existing
dev server, boots `npm run dev` if absent.

The **five acceptance tests** that define "done" are not written yet (they arrive day by day, all
in replay mode by Day 7):

1. 3-person screenshot + voice → correct crop (or the ladder resolves it), real crop shown.
2. Bargaining stops exactly at the floor; firewall blocks invented amounts; unit tests green.
3. Landmark resolves, pin confirmed on `/pin/[token]`; no summary before confirmation.
4. Bad buyer gets a red badge with reasons; order exists only after Akked.
5. Approve → portal filled and read back → seller confirms → waybill PDF → buyer confirmation,
   full flow < 3 min.

---

## 14. Environment variables and switches

| Var | Default | Effect |
|---|---|---|
| `MODEL_API_KEY` | — | Meta Model API auth (Spark, SAM, ASR, Image) |
| `META_SPARK_MODEL` | `muse-spark-1.3` | chat model id |
| `SAM_MODEL` | `sam-3.1` | segmentation model id |
| `ASR_MODEL` | `muse-voice-transcribe-1.0` | ASR model id sent in the multipart `request` |
| `IMAGE_MODEL` | `muse-image-1.0` | image generation |
| `BASETEN_API_KEY` | — | Spark Open + PE fallback auth |
| `BASETEN_SPARK_OPEN_MODEL` | `meta-models/muse-spark-open-1026` | open-weights model slug |
| `PE_EMBED_URL` (or `BASETEN_PE_URL`) | — | PE `/predict` endpoint (Modal or Truss) |
| `PE_EMBED_API_KEY` (or `BASETEN_API_KEY`) | — | PE shared secret / Baseten key |
| `LLM_PROVIDER` | `meta` | `meta` \| `baseten` — Spark brain switch and outage fallback |
| `ASR_PROVIDER` | `transcribe` | `transcribe` \| `spark-open` — bake-off result |
| `MATCHER` | `vector` | `vector` (PE+pgvector) \| `all` (Spark ranks whole catalog) |
| `AI_MODE` | `live` | `live` \| `record` \| `replay` — cassette behaviour |
| `CASSETTE_DIR` | `.ai-cassettes` | cassette root (gitignored) |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | — | browser key (legacy `…ANON_KEY` accepted) |
| `SUPABASE_SECRET_KEY` | — | server/worker key (legacy service-role accepted) |
| `APP_BASE_URL` | `http://localhost:3000` | links in messages (pin page, waybill) |
| `SIMULATOR_PUBLIC` | `true` | kill switch for the public simulator |
| `FD_API_BASE_URL` / `FD_API_TOKEN` | — | First Delivery API (Day 6, mock by default) |

Current `.env.local` (values never printed): every var set except `BASETEN_PE_URL`,
`FD_API_BASE_URL`, `FD_API_TOKEN`; `AI_MODE=live`, so no cassettes exist yet.

**Fallback matrix from `docs/PLAN.md`:** Meta outage → `LLM_PROVIDER=baseten`; weak Derja ASR →
bake-off + keyword biasing + Spark normalisation; Baseten cold start → warm replica or
`MATCHER=all`; venue network → `AI_MODE=replay` + backup video; browser agent breakage → API
adapter or manually prefilled values.

---

## 15. Commands and deployment

| Command | What happens |
|---|---|
| `npm run dev` | Next dev on :3000; `/` shows provider status |
| `npm run build` / `start` | production build/serve (Vercel runs this) |
| `npm run lint` | ESLint flat config (`eslint-config-next`) |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright, boots/reuses dev server |
| `npm run smoke` | 7 provider checks; non-zero exit on FAIL |
| `npm run bakeoff` | ASR comparison → `docs/bakeoff-results.md` |
| `npm run seed:catalog` | crop + embed + insert the demo catalog |

Deployment shape: Vercel for Next (same env vars, secrets server-side only), Supabase us-east-1
(migration applied via SQL editor or `supabase db push`), Modal for PE (CPU today), Baseten for
Spark Open. The Playwright courier worker cannot run on Vercel — it is a local/headed process
(empty `worker/` for now).

`next.config.ts` sets `cacheComponents: true`, `partialPrefetching: true`, and a Turbopack rule
routing `*.css` through `@tailwindcss/turbopack`.

---

## 16. How a judge sees it (target demo, 3 min)

| Minute | Screen | What proves what |
|---|---|---|
| 0:00–0:40 | `/simulator` chat | screenshot + Derja voice in, natural Derja out; "Behind the scenes" trace shows ASR → Spark → SAM with provider + ms |
| 0:40–1:30 | bargaining | offers step 50 → 80 → 100% and stop exactly at the floor; a crafted "invent a discount" reply is blocked by the firewall |
| 1:30–2:10 | `/pin/[token]` | vague landmark → map pin → buyer confirms; no summary before confirmation |
| 2:10–2:40 | `/dashboard` | risk badge with readable reasons → seller approves |
| 2:40–3:00 | courier | portal filled, read back, waybill PDF/QR, buyer confirmation |

What exists today supports only the trace skeleton (provider + latency rows) and the model calls
behind steps 2–3. The rest is the Day 2–6 build.

---

## 17. Known gaps, bugs and risks (prioritised)

**Correctness / demo risk**

1. `demo-pack/products.json` prices, floors and stock are all `0` — seeding now yields a free,
   out-of-stock catalog. Fill real millimes first. (`seed-catalog` also re-inserts the merchant
   every run → duplicates.)
2. Cassette keys for images use **lengths only** (`spark.ts` `imageHashes: u.length`,
   `embeddings.ts` `sizes`) — two different images of equal byte length collide, so replay can
   return the wrong crop's embedding/extraction. Hash the bytes (first N KiB) instead.
3. `ASR_PROVIDER=spark-open` is a dead path: Baseten ignored `input_audio`. Keep `transcribe`, or
   implement a real fallback before relying on it.
4. `bakeoff.ts` does not strip newlines, so its Markdown table breaks on multi-line transcripts
   (already visible in `docs/bakeoff-results.md`).
5. SAM bounds are treated as original-image pixels. Size/coordinate-space mismatch would silently
   mis-crop; `extract()` throws only when the box exceeds the image. Clamp + verify on Day 3.
6. `match_products` returns cosine **distance**; the 0.85/0.60 gates in the spec are
   **similarities**. Convert before comparing.
7. `search_landmarks` has no minimum score, so an unknown landmark returns the 5 closest strings;
   the resolver must threshold and log `landmark_misses`.

**Schema / infra**

8. `delivery_fees` uniqueness does not cover `delegation IS NULL` (Postgres NULLs are distinct).
9. `orders` has no uniqueness on `conversation_id`; `pin_token` has no index.
10. Realtime `alter publication … add table` is not idempotent; re-applying the migration errors.
11. `ai_cache` exists but is unused — either wire it or drop it from the story.
12. RLS only covers `products`, `product_images`, `orders` (+ public `landmarks`); everything else
    needs the secret key, so the Day-6 dashboard must go through server routes or new policies.

**Frontend / packaging**

13. `globals.css` `--font-sans: var(--font-sans)` is self-referential → Geist Sans never applies
    to `font-sans`.
14. `shadcn` CLI is a runtime dependency; `cn` (npm) coexists with `clsx` + `tailwind-merge`, and
    `src/lib/utils.ts` only re-exports `cn` while components import `cn` directly.
15. No `middleware.ts` → no SSR session refresh yet.
16. `worker/` is empty; the entire courier path is unbuilt, so acceptance test 5 has no foundation.

**Product rules already at risk**

17. The firewall only catches explicit `DT`/`dinar`/`alf` forms; bare numbers and Arabic-script
    amounts pass. Day 4 must extend it before any model-generated reply ships.
18. Trace labels every PE call as provider `baseten` even when served by Modal — cosmetic but
    misleading in the panel judges read.

---

## 18. Day 2 build order (next session)

1. Fix the seed data (`products.json` millimes + stock) and make seeding idempotent.
2. Hash image bytes into cassette keys (2-line fix, protects replay).
3. `src/lib/channels/types.ts` + `simulator.ts`; `ChannelAdapter` contract from the spec.
4. `/api/messages`: zod input, insert `messages` with `external_id` dedupe, 2.5 s debounce,
   `run_token` CAS, `after()` for background work.
5. `transcribe()` wiring (already built) + `understand()` `sparkJson` schema + `derja.ts` parsers.
6. Capability check: transcript + structured JSON visible in the trace panel in < ~6 s, and the
   same turn reproduces offline with `AI_MODE=replay`.

Done-when for Day 2 (from `docs/PLAN.md`): transcript + JSON in the trace under ~6 s and replay
reproduces the turn offline.
