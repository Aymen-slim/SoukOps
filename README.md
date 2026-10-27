# Wassalha

WhatsApp commerce agent for Tunisian sellers: screenshot + Derja voice note -> product matched -> bargaining at the floor price -> landmark to confirmed GPS pin -> risk badge -> seller approval -> courier waybill.

Stack: Next.js 16 + Supabase + Vercel, Meta models only (Meta Model API + Baseten). Rules: `AGENTS.md`. Spec: `docs/SPEC.md`. Plan: `docs/PLAN.md`.

## Day 1 setup

```powershell
npm install
Copy-Item .env.example .env.local   # then fill in your keys (never commit this file)
npm run dev                          # http://localhost:3000 shows provider status
```

1. **Supabase**: create the project (us-east-1), apply `supabase/migrations/0001_init.sql` (SQL editor or `supabase db push`).
2. **Baseten PE**: deploy `baseten/pe-embed/` (see `baseten/README.md`), put the predict URL in `.env.local`.
3. **Smoke**: add pilot assets to `demo-pack/` (see `demo-pack/README.md`), then `npm run smoke` — all 7 checks must PASS.
4. **Bake-off**: `npm run bakeoff`, score `docs/bakeoff-results.md`, set `ASR_PROVIDER` to the winner in `.env.local`.
5. **Seed**: fill `demo-pack/products.json`, then `npm run seed:catalog` (20 products cropped + embedded).
6. **Deploy**: link Vercel to this repo, set the same env vars in Vercel, deploy.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `lint` | Next.js app |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright tests |
| `npm run smoke` | Day 1 provider verification (Spark, SAM, ASR, PE, Spark Open, Image, Supabase) |
| `npm run bakeoff` | Derja ASR bake-off -> `docs/bakeoff-results.md` |
| `npm run seed:catalog` | SAM crop + PE embedding seed for the catalog |
