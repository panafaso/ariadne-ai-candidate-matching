export interface CandidateSummary {
  rank: number;
  candidate_id: string;
  dataset_index: number;
  position: string;
  primary_keyword: string;
  professional_domains: string;
  experience_years: string;
  english_level: string;
  looking_for: string;
  highlights: string;
  cv_snippet: string;
  reranker_score: number;
  display_relevance: number;
  original_hybrid_rank: number;
  hybrid_rrf_score: number;
  bm25_rank: number | null;
  jina_rank: number | null;
  source_mode?: 'quick' | 'advanced';
  advanced_match_score?: number;
}

export interface CandidateProfile {
  candidate_id: string;
  dataset_index: number;
  position: string;
  primary_keyword: string;
  professional_domains: string;
  esco_skills: string;
  experience_years: string;
  english_level: string;
  looking_for: string;
  highlights: string;
  full_cv: string;
  candidate_text: string;
}

export interface SearchFilters {
  min_experience?: number;
  max_experience?: number;
  english_level?: string;
  primary_keyword?: string;
  professional_domain?: string;
  profile_keywords?: string[];
}

export interface FilterOptions {
  english_levels: string[];
  primary_keywords: string[];
  professional_domains: string[];
}

export interface SearchResponse {
  query: string;
  retrieval_pool: number;
  eligible_pool: number;
  reranked_pool: number;
  reranker_name: string;
  adaptive_k: number;
  buffer: number;
  final_k: number;
  largest_gap: number;
  timings: {
    bm25_ms: number;
    jina_ms: number;
    rrf_ms: number;
    reranker_ms: number;
    adaptive_ms: number;
    total_ms: number;
  };
  candidates: CandidateSummary[];
}

export interface AdvancedEligibility {
  professional_domains: string[];
  professional_domain_match_mode: 'all' | 'any';
  min_experience?: number;
  max_experience?: number;
  min_english_level?: string;
  additional_languages: string[];
  language_match_mode: 'all' | 'any';
  education: string;
  required_experience: string;
  must_have_skills: string;
}

export interface AdvancedCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
}

export interface AdvancedEligibilityResponse {
  total_pool: number;
  strict_eligible_pool: number;
  pre_screened_pool: number;
  semantic_prescreen_applied: boolean;
  total_ms: number;
}

export interface AdvancedRetrievedCandidate {
  candidate_id: string;
  dataset_index: number;
  position: string;
  primary_keyword: string;
  professional_domains: string;
  experience_years: string;
  english_level: string;
  looking_for: string;
  highlights: string;
  cv_snippet: string;
  retrieval_rank: number;
  hybrid_rrf_score: number;
  bm25_rank: number | null;
  jina_rank: number | null;
}

export interface AdvancedRetrieveResponse {
  query: string;
  total_pool: number;
  strict_eligible_pool: number;
  pre_screened_pool: number;
  semantic_prescreen_applied: boolean;
  retrieved_pool: number;
  timings: {
    bm25_ms: number;
    jina_ms: number;
    rrf_ms: number;
    total_ms: number;
  };
  candidates: AdvancedRetrievedCandidate[];
}

export interface AdvancedCriterionScore {
  criterion_id: string;
  name: string;
  description: string;
  weight: number;
  score: number;
  weighted_contribution: number;
  evidence: string[];
  justification: string;
}

export interface AdvancedMatchedCandidate {
  rank: number;
  candidate_id: string;
  dataset_index: number;
  position: string;
  primary_keyword: string;
  professional_domains: string;
  experience_years: string;
  english_level: string;
  looking_for: string;
  highlights: string;
  cv_snippet: string;
  retrieval_rank: number;
  final_match_score: number;
  criterion_scores: AdvancedCriterionScore[];
  saved_target_role?: string;
  saved_threshold?: number;
}

export interface AdvancedScoreResponse {
  target_role: string;
  model_name: string;
  shortlist_threshold: number;
  scored_pool: number;
  shortlisted_pool: number;
  excluded_pool: number;
  total_ms: number;
  llm_total_ms: number;
  prompt_tokens: number;
  output_tokens: number;
  candidates: AdvancedMatchedCandidate[];
}
