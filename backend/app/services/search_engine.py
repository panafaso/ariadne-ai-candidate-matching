from __future__ import annotations

from time import perf_counter

from app.config import settings
from app.services.adaptive_cutoff import adaptive_k_score_floor_relative_gap
from app.services.bm25_service import BM25Service
from app.services.candidate_store import CandidateStore
from app.services.jina_service import JinaService
from app.services.jina_tiny_service import JinaTinyService
from app.services.rrf_service import reciprocal_rank_fusion
from app.services.advanced_matching_service import AdvancedMatchingService
from app.services.ollama_service import OllamaService


class AriadneSearchEngine:
    def __init__(self):
        print(f"[ARIADNE] Project root: {settings.project_root}")
        print("[ARIADNE] Loading candidate dataset...")
        self.store = CandidateStore(settings.dataset_path)

        print("[ARIADNE] Building BM25Plus index...")
        self.bm25 = BM25Service(
            self.store.texts,
            k1=settings.bm25_k1,
            b=settings.bm25_b,
            delta=settings.bm25_delta,
        )

        print("[ARIADNE] Loading Jina-v5 retriever and saved embeddings...")
        self.jina = JinaService(
            embeddings_path=settings.jina_embeddings_path,
            model_name=settings.jina_model_name,
            device=settings.jina_device,
            query_max_length=settings.jina_query_max_length,
            expected_rows=len(self.store.df),
        )

        print("[ARIADNE] Loading Jina v1 Tiny reranker...")
        self.reranker = JinaTinyService(
            model_name=settings.jina_reranker_model_name,
            max_length=settings.jina_reranker_max_length,
            batch_size=settings.jina_reranker_batch_size,
            device=settings.jina_reranker_device,
        )

        # Advanced Match is intentionally separate from the existing quick-search
        # pipeline. Ollama is contacted lazily only when Step 3 is executed.
        self.ollama = OllamaService(
            base_url=settings.ollama_base_url,
            model_name=settings.ollama_model_name,
            timeout_seconds=settings.ollama_timeout_seconds,
            num_ctx=settings.ollama_num_ctx,
            num_predict=settings.ollama_num_predict,
        )
        self.advanced = AdvancedMatchingService(self.store, self.bm25, self.jina, self.ollama)
        print("[ARIADNE] READY")

    def get_candidate(self, candidate_id: str) -> dict:
        return self.store.by_candidate_id(candidate_id)

    def get_filter_options(self) -> dict:
        return self.store.filter_options()

    def advanced_eligibility(self, eligibility: dict) -> dict:
        return self.advanced.eligibility(eligibility)

    def advanced_retrieve(self, eligibility: dict, target_role: str, criteria: list[dict]) -> dict:
        return self.advanced.retrieve(eligibility, target_role, criteria)

    def advanced_score(
        self,
        target_role: str,
        criteria: list[dict],
        candidates: list[dict],
        shortlist_threshold: float,
    ) -> dict:
        return self.advanced.score(target_role, criteria, candidates, shortlist_threshold)

    def _empty_response(self, query: str, eligible_pool: int, total_start: float) -> dict:
        total_ms = (perf_counter() - total_start) * 1000
        return {
            "query": query,
            "retrieval_pool": settings.retrieval_pool,
            "eligible_pool": eligible_pool,
            "reranked_pool": 0,
            "reranker_name": settings.jina_reranker_model_name,
            "adaptive_k": 0,
            "buffer": settings.adaptive_buffer,
            "final_k": 0,
            "largest_gap": 0.0,
            "timings": {
                "bm25_ms": 0.0,
                "jina_ms": 0.0,
                "rrf_ms": 0.0,
                "reranker_ms": 0.0,
                "adaptive_ms": 0.0,
                "total_ms": round(total_ms, 2),
            },
            "candidates": [],
        }

    def search(self, query: str, filters: dict | None = None) -> dict:
        query = query.strip()
        if not query:
            raise ValueError("Query cannot be empty.")

        total_start = perf_counter()

        # Hard filters are applied to the full candidate dataset BEFORE retrieval.
        allowed_indices = self.store.filter_indices(filters)
        eligible_pool = int(len(allowed_indices))
        if eligible_pool == 0:
            return self._empty_response(query, eligible_pool, total_start)

        retrieval_k = min(settings.retrieval_pool, eligible_pool)

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

        if not hybrid:
            return self._empty_response(query, eligible_pool, total_start)

        rerank_input = []
        for row in hybrid:
            candidate = self.store.candidate_payload(row["dataset_index"])
            rerank_input.append(
                {
                    **row,
                    **candidate,
                    "original_hybrid_rank": row["rank"],
                    "hybrid_rrf_score": row["rrf_score"],
                }
            )

        t = perf_counter()
        reranked = self.reranker.rerank(query, rerank_input)
        reranker_ms = (perf_counter() - t) * 1000

        t = perf_counter()
        # JinaTinyService keeps the raw CrossEncoder logit in reranker_score and
        # exposes its sigmoid transformation as display_relevance (0..100).
        # The agreed 0.45 floor therefore applies to the normalized sigmoid score,
        # i.e. display_relevance / 100, not to the raw logit.
        cutoff_scores = [row["display_relevance"] / 100.0 for row in reranked]
        cutoff = adaptive_k_score_floor_relative_gap(
            cutoff_scores,
            score_floor=settings.cutoff_score_floor,
            elbow_drop=settings.cutoff_elbow_drop,
        )
        selected = reranked[: cutoff.final_k]
        adaptive_ms = (perf_counter() - t) * 1000

        candidates = []
        for rank, row in enumerate(selected, start=1):
            candidates.append(
                {
                    "rank": rank,
                    "candidate_id": row["candidate_id"],
                    "dataset_index": row["dataset_index"],
                    "position": row["position"],
                    "primary_keyword": row["primary_keyword"],
                    "professional_domains": row["professional_domains"],
                    "experience_years": row["experience_years"],
                    "english_level": row["english_level"],
                    "looking_for": row["looking_for"],
                    "highlights": row["highlights"],
                    "cv_snippet": row["cv_snippet"],
                    "reranker_score": row["reranker_score"],
                    "display_relevance": row["display_relevance"],
                    "original_hybrid_rank": row["original_hybrid_rank"],
                    "hybrid_rrf_score": row["hybrid_rrf_score"],
                    "bm25_rank": row["bm25_rank"],
                    "jina_rank": row["jina_rank"],
                }
            )

        total_ms = (perf_counter() - total_start) * 1000
        return {
            "query": query,
            "retrieval_pool": settings.retrieval_pool,
            "eligible_pool": eligible_pool,
            "reranked_pool": len(reranked),
            "reranker_name": settings.jina_reranker_model_name,
            "adaptive_k": cutoff.adaptive_k,
            "buffer": settings.adaptive_buffer,
            "final_k": cutoff.final_k,
            "largest_gap": cutoff.largest_gap,
            "timings": {
                "bm25_ms": round(bm25_ms, 2),
                "jina_ms": round(jina_ms, 2),
                "rrf_ms": round(rrf_ms, 2),
                "reranker_ms": round(reranker_ms, 2),
                "adaptive_ms": round(adaptive_ms, 4),
                "total_ms": round(total_ms, 2),
            },
            "candidates": candidates,
        }
