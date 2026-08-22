from __future__ import annotations

from time import perf_counter
import numpy as np

from app.config import settings
from app.services.rrf_service import reciprocal_rank_fusion


class AdvancedMatchingService:
    """Three-stage recruiter-controlled matching flow.

    1) Eligibility & broad pre-screening
    2) Hybrid retrieval from recruiter-defined criteria
    3) Local LLM criterion scoring + deterministic weighted aggregation
    """

    def __init__(self, store, bm25, jina, ollama):
        self.store = store
        self.bm25 = bm25
        self.jina = jina
        self.ollama = ollama

    @staticmethod
    def _semantic_prescreen_query(eligibility: dict) -> str:
        parts: list[str] = []
        if eligibility.get("education"):
            parts.append(f"Education or studies: {eligibility['education']}")
        if eligibility.get("required_experience"):
            parts.append(f"Required experience: {eligibility['required_experience']}")
        if eligibility.get("must_have_skills"):
            parts.append(f"Must-have skills: {eligibility['must_have_skills']}")
        return ". ".join(parts).strip()

    @staticmethod
    def _retrieval_query(target_role: str, criteria: list[dict], eligibility: dict) -> str:
        parts = [f"Target role: {target_role.strip()}"]
        for criterion in criteria:
            name = str(criterion.get("name", "")).strip()
            description = str(criterion.get("description", "")).strip()
            if name or description:
                parts.append(f"{name}: {description}".strip())

        semantic_must_haves = AdvancedMatchingService._semantic_prescreen_query(eligibility)
        if semantic_must_haves:
            parts.append(f"Must-have context: {semantic_must_haves}")

        languages = [str(value).strip() for value in eligibility.get("additional_languages", []) if str(value).strip()]
        if languages:
            parts.append("Required languages: " + ", ".join(languages))
        return ". ".join(parts)

    def _pre_screen(self, eligibility: dict) -> tuple[np.ndarray, int, bool]:
        strict_indices = self.store.advanced_filter_indices(eligibility)
        strict_count = int(len(strict_indices))
        if strict_count == 0:
            return strict_indices, strict_count, False

        semantic_query = self._semantic_prescreen_query(eligibility)
        if not semantic_query:
            return strict_indices, strict_count, False

        # Broad hybrid pre-screen: preserve recall by retaining up to a generous pool.
        # It is intentionally not presented as a legal/automated eligibility decision.
        top_k = min(settings.advanced_prescreen_pool, strict_count)
        if top_k >= strict_count:
            return strict_indices, strict_count, True

        bm25 = self.bm25.search(semantic_query, top_k, allowed_indices=strict_indices)
        jina = self.jina.search(semantic_query, top_k, allowed_indices=strict_indices)
        fused = reciprocal_rank_fusion(
            bm25,
            jina,
            rrf_k=settings.rrf_k,
            top_k=top_k,
        )
        indices = np.asarray([row["dataset_index"] for row in fused], dtype=np.int64)
        return indices, strict_count, True

    def eligibility(self, eligibility: dict) -> dict:
        total_start = perf_counter()
        pre_screened, strict_count, semantic_applied = self._pre_screen(eligibility)
        return {
            "total_pool": int(len(self.store.df)),
            "strict_eligible_pool": strict_count,
            "pre_screened_pool": int(len(pre_screened)),
            "semantic_prescreen_applied": semantic_applied,
            "total_ms": round((perf_counter() - total_start) * 1000, 2),
        }

    def retrieve(self, eligibility: dict, target_role: str, criteria: list[dict]) -> dict:
        total_start = perf_counter()
        allowed_indices, strict_count, semantic_applied = self._pre_screen(eligibility)
        pre_screened_pool = int(len(allowed_indices))
        if pre_screened_pool == 0:
            return {
                "query": self._retrieval_query(target_role, criteria, eligibility),
                "total_pool": int(len(self.store.df)),
                "strict_eligible_pool": strict_count,
                "pre_screened_pool": 0,
                "semantic_prescreen_applied": semantic_applied,
                "retrieved_pool": 0,
                "timings": {"bm25_ms": 0.0, "jina_ms": 0.0, "rrf_ms": 0.0, "total_ms": round((perf_counter() - total_start) * 1000, 2)},
                "candidates": [],
            }

        query = self._retrieval_query(target_role, criteria, eligibility)
        retrieval_k = min(settings.advanced_retrieval_pool, pre_screened_pool)

        t = perf_counter()
        bm25 = self.bm25.search(query, retrieval_k, allowed_indices=allowed_indices)
        bm25_ms = (perf_counter() - t) * 1000

        t = perf_counter()
        jina = self.jina.search(query, retrieval_k, allowed_indices=allowed_indices)
        jina_ms = (perf_counter() - t) * 1000

        t = perf_counter()
        hybrid = reciprocal_rank_fusion(
            bm25,
            jina,
            rrf_k=settings.rrf_k,
            top_k=retrieval_k,
        )
        rrf_ms = (perf_counter() - t) * 1000

        candidates: list[dict] = []
        for row in hybrid:
            payload = self.store.candidate_payload(row["dataset_index"])
            candidates.append(
                {
                    "candidate_id": payload["candidate_id"],
                    "dataset_index": payload["dataset_index"],
                    "position": payload["position"],
                    "primary_keyword": payload["primary_keyword"],
                    "professional_domains": payload.get("professional_domains", ""),
                    "experience_years": payload["experience_years"],
                    "english_level": payload["english_level"],
                    "looking_for": payload["looking_for"],
                    "highlights": payload["highlights"],
                    "cv_snippet": payload["cv_snippet"],
                    "retrieval_rank": int(row["rank"]),
                    "hybrid_rrf_score": float(row["rrf_score"]),
                    "bm25_rank": row["bm25_rank"],
                    "jina_rank": row["jina_rank"],
                }
            )

        return {
            "query": query,
            "total_pool": int(len(self.store.df)),
            "strict_eligible_pool": strict_count,
            "pre_screened_pool": pre_screened_pool,
            "semantic_prescreen_applied": semantic_applied,
            "retrieved_pool": len(candidates),
            "timings": {
                "bm25_ms": round(bm25_ms, 2),
                "jina_ms": round(jina_ms, 2),
                "rrf_ms": round(rrf_ms, 2),
                "total_ms": round((perf_counter() - total_start) * 1000, 2),
            },
            "candidates": candidates,
        }

    def score(
        self,
        target_role: str,
        criteria: list[dict],
        candidate_refs: list[dict],
        shortlist_threshold: float,
    ) -> dict:
        if not candidate_refs:
            raise ValueError("No retrieved candidates were supplied for AI scoring.")
        if len(candidate_refs) > settings.advanced_retrieval_pool:
            raise ValueError(f"Advanced Match can score at most {settings.advanced_retrieval_pool} candidates per run.")

        shortlist_threshold = float(shortlist_threshold)
        if shortlist_threshold < 0 or shortlist_threshold > 100:
            raise ValueError("Shortlist threshold must be between 0 and 100.")

        total_weight = sum(float(criterion["weight"]) for criterion in criteria)
        if abs(total_weight - 100.0) > 0.01:
            raise ValueError("Criterion weights must add up to 100%.")

        total_start = perf_counter()
        output: list[dict] = []
        total_llm_ns = 0
        total_prompt_tokens = 0
        total_output_tokens = 0

        for ref in candidate_refs:
            candidate_id = str(ref["candidate_id"])
            candidate = self.store.by_candidate_id(candidate_id)
            structured_text = "\n".join(
                [
                    f"Position: {candidate['position']}",
                    f"Professional domains: {candidate.get('professional_domains', '')}",
                    f"Experience years: {candidate['experience_years']}",
                    f"English level: {candidate['english_level']}",
                    f"Looking for: {candidate['looking_for']}",
                    f"Highlights: {candidate['highlights']}",
                    "Candidate text:",
                    candidate["candidate_text"],
                ]
            )
            candidate_text = structured_text[: settings.advanced_llm_max_chars]
            criterion_scores, usage = self.ollama.score_candidate(
                target_role=target_role,
                criteria=criteria,
                candidate_id=candidate_id,
                candidate_text=candidate_text,
                shortlist_threshold=shortlist_threshold,
            )

            score_by_id = {row["criterion_id"]: row for row in criterion_scores}
            enriched_scores: list[dict] = []
            final_score = 0.0
            for criterion in criteria:
                criterion_id = str(criterion["id"])
                result = score_by_id[criterion_id]
                score = float(result["score"])
                weight = float(criterion["weight"])
                contribution = score * (weight / 100.0)
                final_score += contribution
                enriched_scores.append(
                    {
                        "criterion_id": criterion_id,
                        "name": criterion["name"],
                        "description": criterion["description"],
                        "weight": weight,
                        "score": int(round(score)),
                        "weighted_contribution": round(contribution, 2),
                        "evidence": result["evidence"],
                        "justification": result["justification"],
                    }
                )

            total_llm_ns += int(usage.get("total_duration", 0) or 0)
            total_prompt_tokens += int(usage.get("prompt_eval_count", 0) or 0)
            total_output_tokens += int(usage.get("eval_count", 0) or 0)

            output.append(
                {
                    "candidate_id": candidate["candidate_id"],
                    "dataset_index": candidate["dataset_index"],
                    "position": candidate["position"],
                    "primary_keyword": candidate["primary_keyword"],
                    "professional_domains": candidate.get("professional_domains", ""),
                    "experience_years": candidate["experience_years"],
                    "english_level": candidate["english_level"],
                    "looking_for": candidate["looking_for"],
                    "highlights": candidate["highlights"],
                    "cv_snippet": candidate["cv_snippet"],
                    "retrieval_rank": int(ref["retrieval_rank"]),
                    "final_match_score": round(final_score, 2),
                    "criterion_scores": enriched_scores,
                }
            )

        output.sort(key=lambda row: (-row["final_match_score"], row["retrieval_rank"]))
        shortlisted = [
            row for row in output
            if float(row["final_match_score"]) + 1e-9 >= shortlist_threshold
        ]
        for rank, row in enumerate(shortlisted, start=1):
            row["rank"] = rank

        return {
            "target_role": target_role,
            "model_name": self.ollama.model_name,
            "shortlist_threshold": round(shortlist_threshold, 2),
            "scored_pool": len(output),
            "shortlisted_pool": len(shortlisted),
            "excluded_pool": len(output) - len(shortlisted),
            "total_ms": round((perf_counter() - total_start) * 1000, 2),
            "llm_total_ms": round(total_llm_ns / 1_000_000, 2),
            "prompt_tokens": total_prompt_tokens,
            "output_tokens": total_output_tokens,
            "candidates": shortlisted,
        }
