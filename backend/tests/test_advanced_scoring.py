from __future__ import annotations

from types import SimpleNamespace

from app.services.advanced_matching_service import AdvancedMatchingService


class FakeStore:
    def __init__(self):
        self.rows = {
            "1": {
                "candidate_id": "1",
                "dataset_index": 1,
                "position": "Lawyer",
                "primary_keyword": "Legal",
                "experience_years": "4",
                "english_level": "fluent",
                "looking_for": "Legal roles",
                "highlights": "LLM in Law",
                "cv_snippet": "LLM in Law",
                "candidate_text": "Master of Laws. Legal drafting experience.",
            },
            "2": {
                "candidate_id": "2",
                "dataset_index": 2,
                "position": "Business Analyst",
                "primary_keyword": "Business",
                "experience_years": "6",
                "english_level": "fluent",
                "looking_for": "Business roles",
                "highlights": "MBA",
                "cv_snippet": "MBA",
                "candidate_text": "MBA. Business analysis experience.",
            },
        }

    def by_candidate_id(self, candidate_id: str):
        return self.rows[candidate_id]


class FakeOllama:
    model_name = "test-model"

    def score_candidate(self, *, target_role, criteria, candidate_id, candidate_text, shortlist_threshold):
        assert target_role == "Legal Officer"
        assert shortlist_threshold == 70
        if candidate_id == "1":
            scores = [90, 80]
        else:
            scores = [20, 95]
        return [
            {
                "criterion_id": criterion["id"],
                "score": score,
                "evidence": ["evidence"] if score >= 20 else [],
                "justification": "test",
            }
            for criterion, score in zip(criteria, scores)
        ], {"total_duration": 1_000_000, "prompt_eval_count": 10, "eval_count": 5}


def test_weighted_threshold_shortlist(monkeypatch):
    from app.services import advanced_matching_service as module

    monkeypatch.setattr(module, "settings", SimpleNamespace(advanced_retrieval_pool=50, advanced_llm_max_chars=10000))
    service = AdvancedMatchingService(FakeStore(), None, None, FakeOllama())
    criteria = [
        {"id": "law", "name": "Law degree", "description": "Master of Laws", "weight": 60},
        {"id": "exp", "name": "Experience", "description": "Relevant professional experience", "weight": 40},
    ]
    response = service.score(
        "Legal Officer",
        criteria,
        [{"candidate_id": "1", "retrieval_rank": 1}, {"candidate_id": "2", "retrieval_rank": 2}],
        70,
    )

    assert response["scored_pool"] == 2
    assert response["shortlisted_pool"] == 1
    assert response["excluded_pool"] == 1
    assert response["shortlist_threshold"] == 70
    assert response["candidates"][0]["candidate_id"] == "1"
    assert response["candidates"][0]["final_match_score"] == 86.0
    assert response["candidates"][0]["rank"] == 1
