from __future__ import annotations

from types import SimpleNamespace

import numpy as np

from app.schemas import AdvancedEligibility
from app.services.advanced_matching_service import AdvancedMatchingService


class FakeStore:
    def __init__(self):
        self.df = [None, None, None]
        self.payloads = {
            0: {
                "candidate_id": "0", "dataset_index": 0, "position": "Lawyer",
                "primary_keyword": "Legal", "experience_years": "5", "english_level": "fluent",
                "looking_for": "Legal roles", "highlights": "EU law", "cv_snippet": "EU law",
            },
            1: {
                "candidate_id": "1", "dataset_index": 1, "position": "Policy Officer",
                "primary_keyword": "Policy", "experience_years": "7", "english_level": "fluent",
                "looking_for": "Policy roles", "highlights": "Regulation", "cv_snippet": "Regulation",
            },
            2: {
                "candidate_id": "2", "dataset_index": 2, "position": "Analyst",
                "primary_keyword": "Analysis", "experience_years": "4", "english_level": "upper",
                "looking_for": "Analysis", "highlights": "Research", "cv_snippet": "Research",
            },
        }

    def advanced_filter_indices(self, eligibility):
        return np.asarray([0, 1, 2], dtype=np.int64)

    def candidate_payload(self, index):
        return self.payloads[index]


class RecordingSearch:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def search(self, query, top_k, allowed_indices=None):
        self.calls.append({"query": query, "top_k": top_k, "allowed_indices": list(allowed_indices)})
        return self.rows[:top_k]


def test_step2_uses_bm25_jina_and_rrf(monkeypatch):
    from app.services import advanced_matching_service as module

    monkeypatch.setattr(
        module,
        "settings",
        SimpleNamespace(advanced_prescreen_pool=6000, advanced_retrieval_pool=50, rrf_k=60),
    )

    bm25 = RecordingSearch([
        {"candidate_id": "0", "dataset_index": 0, "rank": 1, "score": 10.0},
        {"candidate_id": "1", "dataset_index": 1, "rank": 2, "score": 8.0},
        {"candidate_id": "2", "dataset_index": 2, "rank": 3, "score": 5.0},
    ])
    jina = RecordingSearch([
        {"candidate_id": "1", "dataset_index": 1, "rank": 1, "score": 0.91},
        {"candidate_id": "0", "dataset_index": 0, "rank": 2, "score": 0.88},
        {"candidate_id": "2", "dataset_index": 2, "rank": 3, "score": 0.50},
    ])

    service = AdvancedMatchingService(FakeStore(), bm25, jina, None)
    response = service.retrieve(
        eligibility={
            "additional_languages": [], "language_match_mode": "all",
            "education": "", "required_experience": "", "must_have_skills": "",
        },
        target_role="Legal and Policy Officer",
        criteria=[
            {"id": "law", "name": "Legal expertise", "description": "EU law and regulatory analysis", "weight": 100},
        ],
    )

    assert len(bm25.calls) == 1
    assert len(jina.calls) == 1
    assert bm25.calls[0]["allowed_indices"] == [0, 1, 2]
    assert jina.calls[0]["allowed_indices"] == [0, 1, 2]
    assert bm25.calls[0]["query"] == jina.calls[0]["query"]
    assert response["retrieved_pool"] == 3
    # RRF combines both ranked lists: candidate 0 and 1 receive evidence from both sources.
    assert response["candidates"][0]["candidate_id"] in {"0", "1"}
    assert response["candidates"][0]["bm25_rank"] is not None
    assert response["candidates"][0]["jina_rank"] is not None
    assert response["timings"]["rrf_ms"] >= 0


def test_advanced_experience_bounds_are_independently_optional():
    only_min = AdvancedEligibility(min_experience=10)
    only_max = AdvancedEligibility(max_experience=15)
    both = AdvancedEligibility(min_experience=10, max_experience=15)

    assert only_min.min_experience == 10
    assert only_min.max_experience is None
    assert only_max.min_experience is None
    assert only_max.max_experience == 15
    assert both.min_experience == 10 and both.max_experience == 15
