# Baseten — Perception Encoder deployment

Deploys Meta's open-weight Perception Encoder (`PE-Core-L14-336`, Apache-2.0, 1024-dim image+text embeddings) as a Truss on an L4. The Meta Model API has no embeddings endpoint, so this is the vector path for `MATCHER=vector`.

## One-time setup

```powershell
pip install truss
truss login   # or set BASETEN_API_KEY
```

## Develop (unbilled dev deployment)

```powershell
cd baseten/pe-embed
truss watch .   # development deployment; Baseten billing docs list it as unbilled
```

## Deploy production (scale to zero)

```powershell
cd baseten/pe-embed
truss push . --publish
```

Then copy the predict URL into `.env.local`:

```
BASETEN_PE_URL=https://model-{model_id}.api.baseten.co/environments/production/predict
BASETEN_API_KEY=...
```

Verify with `npm run smoke` (checks 4–5). A scaled-to-zero deployment is not billed; expect a cold start on the first call — keep 1 warm replica only for rehearsals and demo day, then set it back to 0 (expected total PE cost ≈ $12 of the $100 credit).

## Contract

- Request: `{ "images": ["<base64>", ...] }` or `{ "texts": ["red long-sleeve dress", ...] }`
- Response: `{ "embeddings": [[1024 floats], ...] }` (normalized; cosine distance in pgvector)
- Text queries must stay short (32-token limit).
- Server-only: dedicated endpoints send no CORS headers.
