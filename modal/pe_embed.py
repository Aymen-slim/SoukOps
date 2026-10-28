"""Perception Encoder (PE-Core-L14-336) embeddings on Modal.

Meta's open-weight PE model served on an L4, scale-to-zero. Same contract as
the Baseten Truss in baseten/pe-embed/:
  POST {"images": ["<base64>", ...]}  or  {"texts": ["...", ...]}
  ->  {"embeddings": [[1024 floats], ...]}   (normalized)

Deploy:  modal deploy modal/pe_embed.py
Auth:    Authorization: Bearer <PE_SHARED_SECRET> (Modal secret "wassalha-pe")
"""

import base64
import io
import os

import modal

MODEL_ID = "hf-hub:timm/PE-Core-L-14-336"

app = modal.App("wassalha-pe-embed")

hf_cache = modal.Volume.from_name("pe-hf-cache", create_if_missing=True)

model_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch", "open_clip_torch", "timm", "pillow")
)

web_image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "fastapi[standard]"
)


@app.cls(
    image=model_image,
    gpu="L4",
    scaledown_window=300,
    timeout=900,
    volumes={"/root/.cache/huggingface": hf_cache},
)
class PerceptionEncoder:
    @modal.enter()
    def load(self):
        import open_clip
        import torch

        self.torch = torch
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(MODEL_ID)
        self.tokenizer = open_clip.get_tokenizer(MODEL_ID)
        self.model = self.model.eval().cuda()

    @modal.method()
    def embed(self, request: dict) -> dict:
        import torch
        from PIL import Image

        with torch.no_grad(), torch.autocast("cuda"):
            if request.get("images"):
                batch = torch.stack(
                    [
                        self.preprocess(
                            Image.open(io.BytesIO(base64.b64decode(b))).convert("RGB")
                        )
                        for b in request["images"]
                    ]
                ).cuda()
                vectors = self.model.encode_image(batch, normalize=True)
            else:
                tokens = self.tokenizer(
                    request["texts"], context_length=self.model.context_length
                ).cuda()
                vectors = self.model.encode_text(tokens, normalize=True)
        return {"embeddings": vectors.float().cpu().tolist()}


@app.function(
    image=web_image,
    secrets=[modal.Secret.from_name("wassalha-pe")],
)
@modal.fastapi_endpoint(method="POST")
def predict(payload: dict) -> dict:
    from fastapi import HTTPException

    expected = os.environ.get("PE_SHARED_SECRET", "")
    provided = payload.pop("_secret", None)
    if not expected or provided != expected:
        raise HTTPException(status_code=401, detail="unauthorized")
    return PerceptionEncoder().embed.remote(payload)


@app.function(
    image=web_image,
    secrets=[modal.Secret.from_name("wassalha-pe")],
)
@modal.fastapi_endpoint(method="GET")
def health() -> dict:
    return {"ok": True, "model": MODEL_ID}
