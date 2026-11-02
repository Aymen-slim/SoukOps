# Wassalha — Instagram Connection & Personalized AI Plan

Seller connects his Instagram account → AI imports his products → AI personalizes
its selling style per product type (clothes, food, phones…) and per sales angles
the seller chooses → AI recommends products, makes seller-approved offers, and
reminds buyers when an out-of-stock product returns.

Instagram first. Facebook Page later reuses the same adapter and tables.

## Decisions (locked)

- Instagram only for v1. Facebook Page is a later phase on the same code.
- Product can have more than one image (Instagram carousel + manual upload).
- Seller selects the language his AI speaks.
- Seller can also add products manually in the dashboard.
- Seller must approve every imported product before the AI can sell it.
- AI can recommend products and make offers, inside seller-defined rules.
- Out-of-stock: AI collects a waitlist and reminds subscribed buyers on restock.
- Reminders only to buyers who tapped "Notify me" — no spam.

## Current state (gaps)

- Only the simulator channel exists: `src/lib/channels/types.ts` defines
  `ChannelAdapter`, only `src/lib/channels/simulator.ts` implements it, and
  `src/lib/pipeline/handleTurn.ts` hardcodes `simulatorAdapter` everywhere.
- Catalog is single-image manual upload: `src/app/dashboard/catalog/catalog-client.tsx`.
- `merchants` and `products` (`supabase/migrations/0001_init.sql`) have no social,
  language, or personalization fields.
- Reusable as-is: `product_images` already supports multiple images per product
  with per-image PE embeddings; out-of-stock alternative logic already exists in
  `handleTurn.ts`; `merchants.free_delivery_threshold_millimes` supports
  free-delivery offers.

## Non-negotiable rules (from AGENTS.md, unchanged)

- Model proposes, code decides. State machine, money, stock, address, and order
  decisions stay in TypeScript (`src/lib/domain/`, `src/lib/pipeline/`).
- Money only from `src/lib/domain/pricing.ts`, integer millimes. Every AI reply
  passes the price firewall. Offers never go below the product floor price.
- No order without phone, confirmed pin, and explicit buyer Akked.
- Zod validation on every route input and every model output; retry once, then
  fixed template fallback.
- Every AI call via `src/lib/ai/cassette.ts` + `src/lib/ai/trace.ts`;
  respect `AI_MODE=live|record|replay`.
- Secrets server-only. Instagram access tokens encrypted at rest, never sent
  to the browser.
- Buyer text is untrusted. Only the policy engine writes to the database.

---

## Phase 0 — Meta app spike (0.5 day)

- Create Meta App (Business type), add Instagram product, set OAuth redirect
  to the Vercel domain.
- Verify with 1 test Instagram **Business/Creator** account linked to a
  Facebook Page. Personal Instagram accounts cannot be connected — hard
  platform limit, seller-facing copy must say this.
- Requested scopes (final list confirmed at App Review): login/config,
  `instagram_manage_messages` for DMs.

**Done when:** test account OAuth succeeds; Graph API returns IG username,
profile, and the last 10 media posts (including carousel children).

## Phase 1 — Instagram connection (1 day)

New migration `supabase/migrations/0002_social.sql`:

- `social_connections`: `merchant_id`, `platform` (`instagram` in v1),
  `ig_user_id`, `username`, `page_name`, `access_token_encrypted`,
  `scopes`, `status` (`connected` | `expired` | `disconnected`),
  `token_expires_at`, `last_sync_at`. Unique per `(merchant_id, ig_user_id)`.
- Routes:
  - `GET /api/meta/instagram/connect` — start OAuth (seller session required).
  - `GET /api/meta/instagram/callback` — exchange code, store encrypted token.
  - `POST /api/meta/instagram/disconnect` — revoke + mark disconnected.
  - `POST /api/meta/instagram/resync` — re-pull media (Phase 2).
- Env additions in `src/lib/env.ts` (server-only): `META_APP_ID`,
  `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`.
- UI: `/dashboard/settings` gains "Connecter Instagram" card — connect button,
  connected username/avatar, token status, Resynchroniser / Déconnecter.

**Done when:** seller connects and sees his username in settings; token never
appears in any client response; disconnect revokes and blocks further sync;
expired token shows a reconnect banner instead of failing silently.

## Phase 2 — Multi-image products: import + manual (1 day)

### Instagram import

- Fetch seller media via Graph API. A carousel post becomes **one draft
  product** with all its images (max 10). Single-image posts become one draft
  with one image.
- Drafts land in `social_imports`: `merchant_id`, `external_media_id`,
  `caption`, `media_urls`, `status` (`draft` | `confirmed` | `ignored`),
  `product_id` (set on confirm). Dedup by `external_media_id` + image hash;
  resync only adds new media.
- Import queue in dashboard catalog: photo(s) + caption; Muse Spark
  **proposes** name + category phrase from caption/image (zod-validated,
  cassette + trace). Seller must confirm name, price, floor, stock, variants
  before anything is sellable — same gate as manual products.
- On confirm: each image runs the existing SAM crop + PE embedding pipeline.
  Seller can disable "use for matching" per image (lifestyle/model shots stay
  display-only, stored without embedding).

### Manual add (catalog upgrade)

- `src/app/dashboard/catalog/catalog-client.tsx`: multi-file upload, drag to
  reorder, set cover image, delete image, per-image matching toggle. Each
  image still goes preview (SAM) → confirm → embed, as today.

### Buyer side

- AI sends the cover image first; buyer asking for more photos ("photos",
  "zid tasawer"…) gets the remaining gallery images.

**Done when:** one product with 4 images (2 imported from a carousel, 2 manual)
matches from any matching-enabled image, and the buyer receives the full
gallery on request. Ignored drafts never reappear on resync.

## Phase 3 — Seller language + personalization (1 day)

New table `merchant_profiles` (1 row per merchant):

- `ai_language`: `derja` | `fr` | `en` | `ar` | `auto`
- `vertical`: `clothes` | `phones` | `food` | `general`
- `tone`: short free text (e.g. "friendly, short replies")
- `angles`: jsonb array, max 3, ordered — from
  `price_value | premium_quality | authenticity | scarcity |
  fast_delivery_cod | bundle_offer | social_proof`
- `policies`: jsonb — delivery zones/fees note, returns, COD, working hours.

### Language behaviour

- Seller selects one language; `auto` mirrors the buyer's language.
- AI understands all buyer languages regardless; it **replies** in the
  selected language. Fixed fallback templates exist per language; Spark
  phrasing prompt receives the language; price firewall unchanged. Dashboard
  UI stays French, per AGENTS.md.
- `derja` = Derja in Latin script (current default behaviour); `ar` = Arabic
  script.

### Vertical packs (deterministic, in `src/lib/domain/slots.ts`)

- `clothes`: size, color, material
- `phones`: model, storage, RAM, condition, warranty
- `food`: weight, flavor, allergens, expiry, delivery zone
- `general`: current slot set

Spark proposes the vertical from the imported catalog; seller confirms or
changes it in settings.

### Angles behaviour

Angle selection is **code-decided by buyer intent**, never freely chosen by
the model:

- bargain → `price_value` (still clamped to floor by the negotiation ladder)
- hesitation → `social_proof`, then `scarcity`
- premium/quality question → `premium_quality` / `authenticity`
- delivery question → `fast_delivery_cod`
- multi-item interest → `bundle_offer`

`scarcity` may only be claimed when real stock ≤ seller threshold. Angles
change phrasing only (`src/lib/pipeline/phrasing.ts`); facts (price, stock)
come from the database.

**Done when:** the same scripted conversation produces Derja replies under
`derja` and French replies under `fr`; a clothes seller's AI asks for size
while a phone seller's AI asks for storage; a bargain reply uses the seller's
first angle and never goes below floor.

## Phase 4 — Recommendations + offers engine (1 day)

New deterministic module `src/lib/domain/offers.ts` (+ `recommender` logic in
`src/lib/pipeline/`). Model phrases the result; code decides eligibility and
amounts.

### Offer rules

New table `offer_rules`: `merchant_id`, `type`
(`percent_off` | `fixed_off` | `free_delivery` | `bundle`), `value_millimes`
or percent, `product_scope` (product ids / category / all), `starts_at`,
`ends_at`, `max_uses`, `used_count`, `active`. Every computed price passes
`pricing.ts` and is clamped at the product floor.

### Triggers (in priority order)

1. **Out of stock** → nearest in-stock alternative (extends existing
   behaviour in `handleTurn.ts`), then waitlist offer (Phase 5).
2. **Hesitation / final bargain rung** → apply the best active offer rule
   (never below floor; never stack two rules unless seller enabled stacking).
3. **Complementary recommendation** → after a match, suggest one in-stock
   complementary product of the same vertical (phone → case, clothes →
   matching item, food → bundle partner). Pairs are seller-confirmed:
   AI suggests pairs from catalog similarity, seller approves in dashboard.
   Max 1 recommendation per conversation turn.

### Guardrails

- Never recommend stock = 0, inactive, or already-ordered products.
- Recommendation/offers are off by default per merchant until rules exist.
- Every offer sent is logged in `agent_events` with rule id and final amount.

**Done when:** AI offers free delivery exactly at the seller's threshold,
bundle discount matches the rule to the millime, refuses any discount below
floor, and never recommends an out-of-stock product. Unit tests cover each
trigger + the floor clamp (property test, like negotiation).

## Phase 5 — Back-in-stock reminders + live Instagram DM (1.5 days)

### Waitlist

New table `stock_subscriptions`: `merchant_id`, `customer_id`, `product_id`,
`platform_user_id`, `consent_at`, `status`
(`pending` | `notified` | `cancelled`), `notified_at`. Unique per
`(customer_id, product_id)` while pending.

Flow:

1. Product out of stock → AI: "Kemmel fel stock. T7eb na3lemk ki yerja3?"
   (+ localized equivalent per seller language) with a Notify button.
2. Buyer taps → subscription stored with consent timestamp.
3. Seller sets stock 0 → >0 in dashboard → notification jobs created
   (`stock_notify_jobs`, claimed with `FOR UPDATE SKIP LOCKED` like
   courier jobs).
4. Reminder DM: product cover photo + name + price + "order now" prompt;
   buyer can continue ordering in the same thread.
5. Dashboard product row shows pending waitlist count ("12 acheteurs en
   attente") so the seller knows what to restock first.

### Platform limit (must be respected)

Instagram allows business DMs freely only within 24h of the buyer's last
message; beyond that, only buyers with explicit opt-in may be contacted, per
current Meta messaging policy (re-verify at build time). Implementation:
send immediately when the window/opt-in allows; otherwise keep `pending`
and deliver the reminder at the buyer's next inbound message. Never message
non-consented buyers.

### Live channel

- `src/lib/channels/instagram.ts` implements `ChannelAdapter`
  (text, image, quick-reply buttons).
- Refactor `handleTurn.ts` to resolve the adapter from
  `conversation.channel` instead of the hardcoded simulator adapter.
- Webhook `src/app/api/meta/webhook/`: GET verification token; POST verifies
  `X-Hub-Signature-256`, dedups via the existing unique
  `messages.external_id`, maps IG user id → customer and IG account →
  merchant, then runs the unchanged `runTurn` pipeline.
- `conversations` gains `external_user_id`, `external_thread_id`
  (in migration 0002).

**Done when:** buyer subscribes on an out-of-stock product in the simulator →
seller restocks → buyer receives the reminder (simulator + test IG account)
→ completes an order in-thread (phone + pin + Akked gates unchanged).
Unsubscribed/cancelled buyers receive nothing.

## Phase 6 — Hardening + App Review (1 day + external wait)

- Meta data-deletion callback endpoint (required by Meta).
- Webhook retry/backoff, token-expiry alerts in dashboard, rate-limit
  handling on Graph API calls.
- App Review submission (`instagram_manage_messages` and related scopes) +
  business verification. Until approval, messaging works only for test
  users — demo uses a test account.
- Tests: unit (offers, angles, language templates, waitlist state machine),
  webhook fixture tests with recorded payloads, e2e in `AI_MODE=replay`
  so the demo never depends on live Meta.

**Done when:** full acceptance flow passes in replay mode; App Review
submitted; disconnect + data-deletion verified end to end.

---

## Data model summary (migration 0002)

| Table / column | Purpose |
|---|---|
| `social_connections` | Instagram account + encrypted token per merchant |
| `social_imports` | Draft products pulled from Instagram, pre-confirmation |
| `merchant_profiles` | AI language, vertical, tone, angles, policies |
| `offer_rules` | Seller-defined offers (percent/fixed/free-delivery/bundle) |
| `product_pairs` | Seller-approved complementary recommendations |
| `stock_subscriptions` | Back-in-stock waitlist with consent |
| `stock_notify_jobs` | Restock notification queue |
| `products.source_platform`, `products.external_media_id` | Import dedup / provenance |
| `conversations.external_user_id`, `conversations.external_thread_id` | Instagram thread mapping |

RLS enabled on all new tables, merchant-scoped, same pattern as 0001.

## New / changed files

- `supabase/migrations/0002_social.sql`
- `src/lib/env.ts` (Meta app env vars)
- `src/lib/social/instagram.ts` (Graph API client: profile, media, send DM)
- `src/lib/social/import.ts` (media → draft products)
- `src/app/api/meta/instagram/{connect,callback,disconnect,resync}/route.ts`
- `src/app/api/meta/webhook/route.ts`
- `src/lib/channels/instagram.ts`
- `src/lib/pipeline/handleTurn.ts` (adapter resolution, gallery, waitlist)
- `src/lib/domain/offers.ts`, `src/lib/domain/slots.ts` (vertical packs)
- `src/lib/pipeline/phrasing.ts` (language + angle aware)
- `src/app/dashboard/catalog/` (multi-image, import queue)
- `src/app/dashboard/settings/` (Instagram, language, vertical, angles, offers)
- `tests/unit/` + webhook fixtures, `tests/e2e/` replay coverage

## Risks and fallbacks

- **App Review delay** → ship Phases 1–4 (import + personalization +
  offers in simulator) first; live DM on test accounts.
- **Personal IG accounts** → cannot connect; onboarding copy directs seller
  to convert to Business/Creator and link a Page.
- **Incomplete captions** (no price/stock on Instagram) → drafts are never
  auto-published; seller confirmation is the gate. Manual upload remains
  available forever.
- **Token expiry** → status on `social_connections`, dashboard banner,
  one-click reconnect; sync pauses, selling continues from local catalog.
- **24h messaging window** → waitlist reminders queue to next inbound
  message when proactive send is not allowed.

## Cut list (in order)

Facebook Page connection → auto-suggested product pairs (keep manual pairs)
→ `auto` language mirroring (keep fixed languages) → analytics on
recommendations. Never cut: seller confirmation of imports, price firewall,
pin + Akked order gates, waitlist consent, replay-mode tests.

## Estimate

~5–6 dev days + Meta App Review waiting time.
