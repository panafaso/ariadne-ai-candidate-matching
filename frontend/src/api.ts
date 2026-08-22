import type { AdvancedCriterion, AdvancedEligibility, AdvancedEligibilityResponse, AdvancedRetrieveResponse, AdvancedScoreResponse, CandidateProfile, FilterOptions, SearchFilters, SearchResponse } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000';

function flattenApiDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        const message = typeof row.msg === 'string' ? row.msg : JSON.stringify(row);
        const location = Array.isArray(row.loc) ? row.loc.map(String).filter((part) => part !== 'body').join(' → ') : '';
        return location ? `${location}: ${message}` : message;
      }
      return String(item);
    }).filter(Boolean);
    return parts.join(' · ');
  }
  if (detail && typeof detail === 'object') {
    const row = detail as Record<string, unknown>;
    if (typeof row.message === 'string') return row.message;
    if (typeof row.msg === 'string') return row.msg;
    try { return JSON.stringify(detail); } catch { return 'The server returned an unreadable error response.'; }
  }
  return '';
}

async function readError(response: Response) {
  const body = await response.json().catch(() => ({}));
  const detail = flattenApiDetail((body as { detail?: unknown }).detail);
  return detail || `Request failed (${response.status})`;
}

export async function searchCandidates(query: string, filters?: SearchFilters): Promise<SearchResponse> {
  const response = await fetch(`${API_BASE}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      filters: filters && Object.keys(filters).length > 0 ? filters : null,
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const response = await fetch(`${API_BASE}/api/filter-options`);
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function getCandidate(candidateId: string): Promise<CandidateProfile> {
  const response = await fetch(`${API_BASE}/api/candidates/${encodeURIComponent(candidateId)}`);
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}


export async function checkAdvancedEligibility(eligibility: AdvancedEligibility): Promise<AdvancedEligibilityResponse> {
  const response = await fetch(`${API_BASE}/api/advanced/eligibility`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eligibility }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function retrieveAdvancedCandidates(
  eligibility: AdvancedEligibility,
  targetRole: string,
  criteria: AdvancedCriterion[],
): Promise<AdvancedRetrieveResponse> {
  const response = await fetch(`${API_BASE}/api/advanced/retrieve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eligibility, target_role: targetRole, criteria }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function scoreAdvancedCandidates(
  targetRole: string,
  criteria: AdvancedCriterion[],
  candidates: Array<{ candidate_id: string; retrieval_rank: number }>,
  shortlistThreshold: number,
): Promise<AdvancedScoreResponse> {
  const response = await fetch(`${API_BASE}/api/advanced/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_role: targetRole, criteria, candidates, shortlist_threshold: shortlistThreshold }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}
