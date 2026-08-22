from __future__ import annotations

import numpy as np
import torch
from sentence_transformers import CrossEncoder


class JinaTinyService:
    def __init__(
        self,
        model_name: str,
        max_length: int = 2048,
        batch_size: int = 4,
        device: str = "cpu",
    ):
        self.model_name = model_name
        self.max_length = int(max_length)
        self.batch_size = int(batch_size)
        self.device = device

        self.model = CrossEncoder(
            model_name,
            trust_remote_code=True,
            device=device,
            max_length=self.max_length,
        )

    @staticmethod
    def _rerank_text(row: dict) -> str:
        candidate_text = str(row.get("candidate_text", "") or "").strip()
        if candidate_text:
            return candidate_text
        full_cv = str(row.get("full_cv", "") or "").strip()
        if full_cv:
            return full_cv
        return str(row.get("cv_snippet", "") or "").strip()

    def rerank(self, query: str, candidates: list[dict]) -> list[dict]:
        if not candidates:
            return []

        pairs = [(query, self._rerank_text(row)) for row in candidates]
        with torch.inference_mode():
            scores = self.model.predict(
                pairs,
                batch_size=self.batch_size,
                show_progress_bar=False,
                activation_fn=torch.nn.Identity(),
            )

        scores = np.asarray(scores, dtype=float).reshape(-1)
        if len(scores) != len(candidates):
            raise RuntimeError("Jina Tiny score count does not match candidate count.")

        output: list[dict] = []
        for row, score in zip(candidates, scores):
            item = dict(row)
            item["reranker_score"] = float(score)
            # Display-only transformation, explicitly not a calibrated hiring probability.
            clipped = float(np.clip(score, -50.0, 50.0))
            item["display_relevance"] = float(100.0 / (1.0 + np.exp(-clipped)))
            output.append(item)

        output.sort(key=lambda x: (-x["reranker_score"], x["original_hybrid_rank"]))
        for rank, row in enumerate(output, start=1):
            row["reranker_rank"] = rank
        return output
