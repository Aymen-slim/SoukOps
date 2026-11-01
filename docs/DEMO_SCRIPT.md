# Wassalha — Demo script (Day 7)

3-minute live walkthrough. Demo host is the **local machine** (the Playwright
courier worker cannot run on Vercel; cassettes live in `.ai-cassettes/`).
Vercel (https://souk-ops.vercel.app) is the backup link only.

## Before the stage (checklist)

1. `npm run demo:reset` then `npm run seed:day5` (catalog/landmarks already seeded; re-run `npm run seed:catalog` / `npm run seed:landmarks` only if the catalog changed).
2. Warm the PE endpoint 15 min early: `npm run smoke` (check 4 exercises embeddings). Keep one simulator match warm during rehearsal; Modal `scaledown_window` is 300s.
3. Start the worker headed in a second terminal: `$env:COURIER_HEADED=1; npm run worker`. Demo page must show worker **online**.
4. Open three tabs: `/simulator`, `/dashboard`, `/dashboard/demo`. Courier mode = **Browser agent** (Settings) for the portal scene.
5. Record cassettes after any script/catalog change: `npm run test:e2e:record`, then verify `npm run test:e2e:replay` passes offline. Keep the backup video (below) open in a fourth tab.
6. Hardening levers on the Demo page: AI mode and simulator-public state are shown there. Kill switch: `SIMULATOR_PUBLIC=false` + restart closes the simulator (403).

## The 3 minutes

| Time | Screen | Action | Proof |
|---|---|---|---|
| 0:00–0:40 | `/simulator` | Send `demo-pack/screenshots/story-two-people-sweatshirts.jpeg` with caption `n7eb el sweat el jaune elli 3al yasar taille L` (or play the Derja voice note). | SAM crop on white, PE + Spark match, real crop shown. Trace panel: model, provider, ms per step. |
| 0:40–1:30 | simulator | `ghalia barcha, na9esli el soum` → `na3tik 85 alf` → `na3tik 85 alf, akher kelma`. | Ladder 50% → 80% → 100% stops **exactly at the floor** and never below (acceptance 2). |
| 1:30–2:10 | simulator → `/pin/[token]` | Name `esmi Aymen`, phone `numeri 22123456`, landmark `noskon fi Tunis w a9reb landmark howa Pharmacie de Nuit El Manar`. Open the pin link, confirm. | No summary before pin confirmation; summary is a fixed template with the stored total (acceptance 3). |
| 2:10–2:35 | simulator → `/dashboard` | Press **Akked**. Show the order queue: total, risk badge with reasons. (Bad-buyer persona = red badge, acceptance 4.) Optionally **Demander reconfirmation**, answer `Oui, ab3ath` in the chat, then approve is unblocked. | Order exists only after Akked; reconfirmation gates approval. |
| 2:35–3:00 | `/dashboard/orders/[id]` → courier clone | **Approve** → worker fills the First Delivery clone, read-back screenshot → **Confirm shipment** → waybill PDF (`FD…`, Code 128 + GPS QR) → buyer chat receives the barcode line. | Full flow < 3 min (acceptance 5). |

After-sale beat (if time): on the order, set the clone parcel state via
`POST /api/fd-mock/v2/parcels/{barcode}/state` (`{"state": 5}`), then
**Synchroniser FD** → order `RETURNED`, one `returned` risk event; the buyer
history now scores that customer down. Demand/Analytics pages show unmatched
asks and the return rate.

## Fallbacks (in order)

| Failure | Lever |
|---|---|
| Venue network / Meta outage | Restart dev with `AI_MODE=replay` (cassettes), or `LLM_PROVIDER=baseten`. |
| PE cold start / weak match | `MATCHER=all` (Spark ranks the whole catalog). |
| Browser worker breaks | Settings → courier mode `Mock API`: approve creates the waybill directly; or prefill the clone form manually from the order detail. |
| Everything fails | Play the backup video; narrate the same table above. |

## Backup video

Record one clean full run (simulator → bargain → pin → approve → worker →
waybill → buyer line, plus the FD-return sync beat) after the last green
rehearsal. Freeze after recording: no catalog, price, floor, or env changes.

## Verification before doors open

- `npm test` (unit, incl. floor/firewall/status-sync/reconfirm/security)
- `npm run test:e2e:replay` green offline; acceptance 5 < 3 min
- `npm run lint` and `npm run build` clean
- After the demo: scale PE back to zero (Modal console) — warm replicas are a rehearsal/demo cost only.
