from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class SearchFilters(BaseModel):
    min_experience: float | None = Field(default=None, ge=0, le=100)
    max_experience: float | None = Field(default=None, ge=0, le=100)
    english_level: str | None = Field(default=None, max_length=100)
    position: str | None = Field(default=None, max_length=200)
    primary_keyword: str | None = Field(default=None, max_length=200)  # legacy API compatibility
    professional_domain: str | None = Field(default=None, max_length=200)
    looking_for: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_range(self):
        if (
            self.min_experience is not None
            and self.max_experience is not None
            and self.min_experience > self.max_experience
        ):
            raise ValueError("Minimum experience cannot be greater than maximum experience.")
        return self


class SearchRequest(BaseModel):
    query: str = Field(min_length=3, max_length=2000)
    filters: SearchFilters | None = None


class FilterOptionsResponse(BaseModel):
    english_levels: list[str]
    primary_keywords: list[str]  # legacy API compatibility
    professional_domains: list[str]


class CandidateSummary(BaseModel):
    rank: int
    candidate_id: str
    dataset_index: int
    position: str = ""
    primary_keyword: str = ""
    professional_domains: str = ""
    experience_years: str = ""
    english_level: str = ""
    looking_for: str = ""
    highlights: str = ""
    cv_snippet: str = ""
    reranker_score: float
    display_relevance: float
    original_hybrid_rank: int
    hybrid_rrf_score: float
    bm25_rank: int | None = None
    jina_rank: int | None = None


class CandidateProfile(BaseModel):
    candidate_id: str
    dataset_index: int
    position: str = ""
    primary_keyword: str = ""
    professional_domains: str = ""
    esco_skills: str = ""
    experience_years: str = ""
    english_level: str = ""
    looking_for: str = ""
    highlights: str = ""
    full_cv: str = ""
    candidate_text: str = ""


class SearchTimings(BaseModel):
    bm25_ms: float
    jina_ms: float
    rrf_ms: float
    reranker_ms: float
    adaptive_ms: float
    total_ms: float


class SearchResponse(BaseModel):
    query: str
    retrieval_pool: int
    eligible_pool: int
    reranked_pool: int
    reranker_name: str
    adaptive_k: int
    buffer: int
    final_k: int
    largest_gap: float
    timings: SearchTimings
    candidates: list[CandidateSummary]


# =========================================================
# Advanced Match schemas — separate from the existing quick-search API
# =========================================================


class AdvancedEligibility(BaseModel):
    professional_domains: list[str] = Field(default_factory=list, max_length=8)
    professional_domain_match_mode: str = Field(default="any", pattern="^(all|any)$")
    min_experience: float | None = Field(default=None, ge=0, le=100)
    max_experience: float | None = Field(default=None, ge=0, le=100)
    min_english_level: str | None = Field(default=None, max_length=50)
    additional_languages: list[str] = Field(default_factory=list, max_length=8)
    language_match_mode: str = Field(default="all", pattern="^(all|any)$")
    education: str = Field(default="", max_length=600)
    required_experience: str = Field(default="", max_length=1000)
    must_have_skills: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def validate_advanced_range(self):
        if (
            self.min_experience is not None
            and self.max_experience is not None
            and self.min_experience > self.max_experience
        ):
            raise ValueError("Minimum experience cannot be greater than maximum experience.")
        return self


class AdvancedCriterion(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=3, max_length=1200)
    weight: float = Field(ge=0, le=100)


class AdvancedEligibilityRequest(BaseModel):
    eligibility: AdvancedEligibility


class AdvancedEligibilityResponse(BaseModel):
    total_pool: int
    strict_eligible_pool: int
    pre_screened_pool: int
    semantic_prescreen_applied: bool
    total_ms: float


class AdvancedRetrieveRequest(BaseModel):
    eligibility: AdvancedEligibility
    target_role: str = Field(min_length=2, max_length=300)
    criteria: list[AdvancedCriterion] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def validate_weights(self):
        total = sum(item.weight for item in self.criteria)
        if abs(total - 100.0) > 0.01:
            raise ValueError("Criterion weights must add up to 100%.")
        return self


class AdvancedRetrievedCandidate(BaseModel):
    candidate_id: str
    dataset_index: int
    position: str = ""
    primary_keyword: str = ""
    professional_domains: str = ""
    experience_years: str = ""
    english_level: str = ""
    looking_for: str = ""
    highlights: str = ""
    cv_snippet: str = ""
    retrieval_rank: int
    hybrid_rrf_score: float
    bm25_rank: int | None = None
    jina_rank: int | None = None


class AdvancedRetrieveTimings(BaseModel):
    bm25_ms: float
    jina_ms: float
    rrf_ms: float
    total_ms: float


class AdvancedRetrieveResponse(BaseModel):
    query: str
    total_pool: int
    strict_eligible_pool: int
    pre_screened_pool: int
    semantic_prescreen_applied: bool
    retrieved_pool: int
    timings: AdvancedRetrieveTimings
    candidates: list[AdvancedRetrievedCandidate]


class AdvancedCandidateRef(BaseModel):
    candidate_id: str
    retrieval_rank: int = Field(ge=1)


class AdvancedScoreRequest(BaseModel):
    target_role: str = Field(min_length=2, max_length=300)
    criteria: list[AdvancedCriterion] = Field(min_length=1, max_length=8)
    candidates: list[AdvancedCandidateRef] = Field(min_length=1, max_length=50)
    shortlist_threshold: float = Field(ge=0, le=100)

    @model_validator(mode="after")
    def validate_score_weights(self):
        total = sum(item.weight for item in self.criteria)
        if abs(total - 100.0) > 0.01:
            raise ValueError("Criterion weights must add up to 100%.")
        return self


class AdvancedCriterionScore(BaseModel):
    criterion_id: str
    name: str
    description: str
    weight: float
    score: int = Field(ge=0, le=100)
    weighted_contribution: float
    evidence: list[str]
    justification: str


class AdvancedMatchedCandidate(BaseModel):
    rank: int
    candidate_id: str
    dataset_index: int
    position: str = ""
    primary_keyword: str = ""
    professional_domains: str = ""
    experience_years: str = ""
    english_level: str = ""
    looking_for: str = ""
    highlights: str = ""
    cv_snippet: str = ""
    retrieval_rank: int
    final_match_score: float
    criterion_scores: list[AdvancedCriterionScore]


class AdvancedScoreResponse(BaseModel):
    target_role: str
    model_name: str
    shortlist_threshold: float
    scored_pool: int
    shortlisted_pool: int
    excluded_pool: int
    total_ms: float
    llm_total_ms: float
    prompt_tokens: int
    output_tokens: int
    candidates: list[AdvancedMatchedCandidate]
