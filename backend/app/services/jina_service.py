from __future__ import annotations

import numpy as np
import torch
from sentence_transformers import SentenceTransformer


class JinaService:
    EXPECTED_DIMENSION = 1024

    def __init__(self, embeddings_path, model_name: str, device: str, query_max_length: int, expected_rows: int):
        if not embeddings_path.exists():
            raise FileNotFoundError(f"Jina embeddings not found: {embeddings_path}")

        self.document_embeddings = np.load(embeddings_path, allow_pickle=False).astype(np.float32, copy=False)
        if self.document_embeddings.ndim != 2:
            raise ValueError("Jina document embeddings must be a 2D array.")
        if self.document_embeddings.shape != (expected_rows, self.EXPECTED_DIMENSION):
            raise ValueError(
                f"Unexpected Jina embeddings shape {self.document_embeddings.shape}; "
                f"expected ({expected_rows}, {self.EXPECTED_DIMENSION})."
            )

        norms = np.linalg.norm(self.document_embeddings, axis=1)
        if not np.allclose(norms, 1.0, atol=5e-3, rtol=0.0):
            raise ValueError("Saved Jina embeddings are not normalized as expected.")

        model_kwargs = {}
        if device.startswith("cuda") and torch.cuda.is_available():
            model_kwargs["dtype"] = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

        self.model = SentenceTransformer(
            model_name,
            trust_remote_code=True,
            device=device,
            model_kwargs=model_kwargs,
        )
        self.model.max_seq_length = query_max_length

    @staticmethod
    def _top_indices(scores: np.ndarray, top_k: int) -> np.ndarray:
        top_k = min(int(top_k), len(scores))
        if top_k <= 0:
            return np.empty(0, dtype=np.int64)
        if top_k == len(scores):
            idx = np.arange(len(scores), dtype=np.int64)
        else:
            idx = np.argpartition(scores, -top_k)[-top_k:]
        return idx[np.argsort(scores[idx])[::-1]]

    def search(
        self,
        query: str,
        top_k: int,
        allowed_indices: np.ndarray | list[int] | None = None,
    ) -> list[dict]:
        with torch.inference_mode():
            q = self.model.encode(
                inputs=query,
                task="retrieval",
                prompt_name="query",
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )

        q = np.asarray(q, dtype=np.float32).reshape(-1)
        if q.shape[0] != self.EXPECTED_DIMENSION:
            raise ValueError(f"Unexpected Jina query dimension: {q.shape[0]}")

        scores = self.document_embeddings @ q

        if allowed_indices is None:
            pool_indices = np.arange(len(scores), dtype=np.int64)
        else:
            pool_indices = np.asarray(allowed_indices, dtype=np.int64).reshape(-1)
            if pool_indices.size == 0:
                return []
            if np.any(pool_indices < 0) or np.any(pool_indices >= len(scores)):
                raise ValueError("allowed_indices contains an out-of-range candidate index.")

        pool_scores = scores[pool_indices]
        local_idx = self._top_indices(pool_scores, top_k)
        idx = pool_indices[local_idx]

        return [
            {
                "candidate_id": str(int(i)),
                "dataset_index": int(i),
                "rank": rank,
                "score": float(scores[i]),
            }
            for rank, i in enumerate(idx, start=1)
        ]
