from __future__ import annotations

import re
import numpy as np
from rank_bm25 import BM25Plus


class BM25Service:
    IMPORTANT_WORDS = {"no", "not", "more", "most"}

    def __init__(self, texts: list[str], k1: float, b: float, delta: float):
        try:
            from nltk.corpus import stopwords
            stop_words = set(stopwords.words("english"))
        except LookupError as exc:
            raise RuntimeError(
                "NLTK English stopwords are missing. Run: python -m nltk.downloader stopwords"
            ) from exc

        self.stop_words = stop_words - self.IMPORTANT_WORDS
        tokenized = [self.tokenize(text) for text in texts]
        self.index = BM25Plus(tokenized, k1=k1, b=b, delta=delta)

    def tokenize(self, text: str) -> list[str]:
        text = str(text).lower()
        text = re.sub(r"[^a-z0-9+#. ]", " ", text)
        return [token for token in text.split() if token not in self.stop_words]

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
        scores = np.asarray(self.index.get_scores(self.tokenize(query)), dtype=np.float32)

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
