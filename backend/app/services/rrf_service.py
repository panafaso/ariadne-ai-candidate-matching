from __future__ import annotations

from collections import defaultdict


def reciprocal_rank_fusion(
    bm25_results: list[dict],
    jina_results: list[dict],
    *,
    rrf_k: int = 60,
    top_k: int = 50,
) -> list[dict]:
    fused: dict[str, float] = defaultdict(float)
    meta: dict[str, dict] = {}

    for source, results in (("bm25", bm25_results), ("jina", jina_results)):
        for item in results:
            cid = item["candidate_id"]
            fused[cid] += 1.0 / (rrf_k + item["rank"])
            row = meta.setdefault(
                cid,
                {
                    "candidate_id": cid,
                    "dataset_index": item["dataset_index"],
                    "bm25_rank": None,
                    "bm25_score": None,
                    "jina_rank": None,
                    "jina_score": None,
                },
            )
            row[f"{source}_rank"] = item["rank"]
            row[f"{source}_score"] = item["score"]

    ordered = sorted(fused.items(), key=lambda x: x[1], reverse=True)[:top_k]
    output = []
    for rank, (cid, score) in enumerate(ordered, start=1):
        row = dict(meta[cid])
        row["rank"] = rank
        row["rrf_score"] = float(score)
        output.append(row)
    return output
