# Modal — Perception Encoder deployment (primary)

Serves Meta's open-weight Perception Encoder (`PE-Core-L14-336`, 1024-dim image+text embeddings) on an L4 with scale-to-zero, using the hackathon's $100 Modal credit. The Baseten account has $0 credit and its hackathon key is inference-only, so the Truss in `baseten/pe-embed/` is kept as a fallback with the same request/response contract.

## Setup (once)

```powershell
pip install modal
modal token new          # browser login; pick the workspace with the $100 hackathon credit
modal secret create wassalha-pe PE_SHARED_SECRET=<random-long-value>
```

Put the same value in `.env.local` as `PE_EMBED_API_KEY`.

## Deploy

```powershell
modal deploy modal/pe_embed.py
```

Copy the `predict` endpoint URL into `.env.local`:

```
PE_EMBED_URL=https://{workspace}--wassalha-pe-embed-predict.modal.run
PE_EMBED_API_KEY=<same random value>
```

Verify with `npm run smoke` (check 4). First call after idle pays a cold start (model download is cached in the `pe-hf-cache` volume); keep default scale-to-zero outside rehearsals/demo.

## Contract

- `POST {"images": ["<base64>", ...], "_secret": "..."}` or `{"texts": [...], "_secret": "..."}`
- Response: `{"embeddings": [[1024 floats], ...]}` (normalized; cosine distance in pgvector)
- `GET` on the `health` endpoint returns `{"ok": true}` without auth.
- Text queries must stay short (32-token limit).
