import base64
import io

import open_clip
import torch
from PIL import Image

MODEL_ID = "hf-hub:timm/PE-Core-L-14-336"


class Model:
    def __init__(self, **kwargs):
        self.model = None

    def load(self):
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(MODEL_ID)
        self.tokenizer = open_clip.get_tokenizer(MODEL_ID)
        self.model = self.model.eval().cuda()

    def predict(self, request: dict) -> dict:  # {"images": [base64, ...]} or {"texts": [...]}
        with torch.no_grad(), torch.autocast("cuda"):
            if request.get("images"):
                batch = torch.stack(
                    [
                        self.preprocess(Image.open(io.BytesIO(base64.b64decode(b))).convert("RGB"))
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
