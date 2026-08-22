from pathlib import Path

import pandas as pd

from app.services.candidate_store import CandidateStore


def _store(monkeypatch, tmp_path):
    df = pd.DataFrame(
        {
            "candidate_text": ["legal privacy", "security engineer", "mixed profile"],
            "Position": ["Lawyer", "Security Engineer", "Consultant"],
            "Primary Keyword": ["Legal", "IT", "Other"],
            "English Level": ["fluent", "upper", "intermediate"],
            "Experience Years": [5, 7, 3],
            "Looking For": ["", "", ""],
            "Highlights": ["", "", ""],
            "CV": ["", "", ""],
            "professional_domains": [
                "Legal, Compliance & Regulatory",
                "Cybersecurity & Information Security | IT, ICT & Engineering",
                "Legal, Compliance & Regulatory | IT, ICT & Engineering",
            ],
            "esco_skills": ["analyse legislation", "monitor ICT security systems", "provide legal advice | computer programming"],
        }
    )
    dataset = tmp_path / "candidates.parquet"
    dataset.touch()
    monkeypatch.setattr(pd, "read_parquet", lambda *_args, **_kwargs: df.copy())
    return CandidateStore(Path(dataset))


def test_quick_professional_domain_filter(monkeypatch, tmp_path):
    store = _store(monkeypatch, tmp_path)
    result = store.filter_indices({"professional_domain": "Legal, Compliance & Regulatory"})
    assert result.tolist() == [0, 2]


def test_advanced_professional_domains_are_always_inclusive(monkeypatch, tmp_path):
    store = _store(monkeypatch, tmp_path)
    result = store.advanced_filter_indices(
        {
            "professional_domains": ["Legal, Compliance & Regulatory", "IT, ICT & Engineering"],
            "professional_domain_match_mode": "all",  # legacy saved value must be ignored
        }
    )
    assert result.tolist() == [0, 1, 2]


def test_candidate_profile_exposes_taxonomy_fields(monkeypatch, tmp_path):
    store = _store(monkeypatch, tmp_path)
    profile = store.candidate_payload(0)
    assert profile["professional_domains"] == "Legal, Compliance & Regulatory"
    assert profile["esco_skills"] == "analyse legislation"
