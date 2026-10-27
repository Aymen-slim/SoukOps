# Demo pack (pilot seller assets)

Assets are **not on this PC yet**. When they arrive, place them here (do not rename the folders):

```
demo-pack/
  products/            20 product photos (jpg/png/webp)
  products.json        [{ "file": "robe-lina.jpg", "name": "Robe Lina", "categoryPhrase": "dress",
                          "priceMillimes": 180000, "floorMillimes": 165000, "stock": 4 }]
  screenshots/         3 story screenshots (one with 3 people) — used Day 3
  voice/               6 Derja notes as WAV mono 16-bit 16/24 kHz:
                       clean order, 2x bargaining, vague landmark,
                       address+floor+driver note, bad buyer — used by `npm run bakeoff`
  landmarks-extra.json demo aliases — used Day 5
  out/                 generated smoke-test output (gitignored)
```

Then run, in order: `npm run smoke`, `npm run bakeoff` (set `ASR_PROVIDER` to the winner), `npm run seed:catalog`.
