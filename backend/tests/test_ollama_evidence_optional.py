from __future__ import annotations

from app.services.ollama_service import OllamaService


def test_positive_score_without_evidence_is_accepted(monkeypatch):
    service = OllamaService(
        base_url="http://127.0.0.1:11434",
        model_name="test-model",
    )

    monkeypatch.setattr(
        service,
        "_generate",
        lambda prompt: {
            "criteria": [
                {
                    "criterion_id": "law",
                    "score": 20,
                    "evidence": [],
                    "justification": "Only weak or indirect support is visible in the profile.",
                }
            ],
            "_usage": {},
        },
    )

    rows, _ = service.score_candidate(
        target_role="Legal Officer",
        criteria=[
            {
                "id": "law",
                "name": "Legal education",
                "description": "Law degree or closely related legal studies",
                "weight": 100,
            }
        ],
        candidate_id="candidate-1",
        candidate_text="Business analyst with regulatory project exposure.",
        shortlist_threshold=60,
    )

    assert rows[0]["score"] == 20
    assert rows[0]["evidence"] == []


def test_missing_criterion_is_repaired_without_losing_valid_scores(monkeypatch):
    service = OllamaService(
        base_url="http://127.0.0.1:11434",
        model_name="test-model",
    )
    responses = iter(
        [
            {
                "criteria": [
                    {"criterion_id": "law", "score": 82, "evidence": ["legal drafting"], "justification": "Strong legal evidence."}
                ],
                "_usage": {"total_duration": 10, "prompt_eval_count": 100, "eval_count": 30},
            },
            {
                "criteria": [
                    {"criterion_id": "privacy", "score": 76, "evidence": ["GDPR compliance"], "justification": "Clear privacy evidence."}
                ],
                "_usage": {"total_duration": 5, "prompt_eval_count": 80, "eval_count": 20},
            },
        ]
    )
    monkeypatch.setattr(service, "_generate", lambda prompt: next(responses))

    rows, usage = service.score_candidate(
        target_role="Legal Officer",
        criteria=[
            {"id": "law", "name": "Legal", "description": "Legal drafting", "weight": 50},
            {"id": "privacy", "name": "Privacy", "description": "GDPR", "weight": 50},
        ],
        candidate_id="candidate-2",
        candidate_text="Legal drafting and GDPR compliance experience.",
        shortlist_threshold=60,
    )

    assert [row["criterion_id"] for row in rows] == ["law", "privacy"]
    assert [row["score"] for row in rows] == [82, 76]
    assert usage == {"total_duration": 15, "prompt_eval_count": 180, "eval_count": 50}
