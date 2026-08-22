# ARIADNE — Candidate Matching Prototype

ARIADNE is a local-first research/demo system for candidate retrieval, reranking and evidence-based advanced matching.

## Two search modes

### Quick Search

Quick Search keeps the existing retrieval/reranking pipeline unchanged:

Employer query → BM25Plus + Jina-v5 → Reciprocal Rank Fusion (Top-50) → Jina Reranker v1 Tiny EN → existing adaptive cutoff → variable result list.

The result sidebar now uses the enriched **Professional domain** metadata instead of the legacy **Primary area** field. ESCO skills are displayed as candidate metadata in the extended profile; they are not an ESCO filter.

### Advanced Match

Advanced Match is a separate three-step recruiter workflow:

1. **Eligibility & pre-screening** — optional Professional domain filtering, structured experience/English filters, additional language requirements, and broad keyword + semantic pre-screening for education, required experience and must-have skills. Multiple Professional domains can be combined with recruiter-controlled **Any / All** logic. Minimum and maximum experience are independently optional: a minimum alone means that value or more, a maximum alone means that value or less, and both together define a range.
2. **Matching criteria & recruiter weights** — the recruiter creates/edit/removes criteria, defines the evidence to look for, assigns each criterion a weight, and selects a **Minimum overall AI Match Score** for the final shortlist. Criterion weights must total 100%.
3. **AI assessment & shortlist ranking** — the hybrid retrieval stage produces up to 50 **Matched Profiles**. A pointwise LLM then assesses one candidate at a time against all recruiter criteria in one call. It returns a 0–100 evidence-based score, supporting excerpts and a concise justification for each criterion. ARIADNE applies the recruiter weights deterministically, calculates the final 0–100 AI Match Score, sorts candidates, and keeps only candidates at or above the recruiter-defined threshold.

The Advanced Match result workspace also supports:

- stable soft colors for each recruiter criterion;
- criterion-colored evidence highlighting in the candidate CV/profile;
- one **shared Shortlist** across Quick Search and Advanced Match;
- shared recruiter notes across both modes;
- one-click **Unsave all Advanced** plus the global **Clear shortlist** action;
- discreet dataset IDs on Quick and Advanced candidate views;
- Professional domain and ESCO skill metadata in Quick and Advanced extended profiles and comparisons;
- comparing up to four Advanced Match candidates side by side with profile fields, notes, criterion assessments and full CV text;
- downloading a candidate CV/profile together with the AI assessment as an HTML report;
- preserving Quick and Advanced results when switching modes; Advanced Match also keeps its current three-step session in browser storage until the recruiter explicitly clears it;
- actionable error messages for backend, Ollama/model, timeout, GPU-memory, validation and malformed-output problems.

## Local LLM setup

The default Advanced Match model is the quantized Ollama model:

```text
ministral-3:3b
```

Default local runtime settings:

```text
context: 4096
num_predict: 1200
```

The model name is not exposed in the recruiter UI. Ollama is contacted only when Step 3 is run.

## Expected repository layout

Keep the `ariadne_v1` folder next to the thesis `embeddings/` folder. This package includes the enriched candidate dataset inside `ariadne_v1/data/`:

```text
copy new - recruitment-multistage-ranking/
├── embeddings/
│   └── cv_embeddings_jina_v5_text_small_20k_2048.npy
└── ariadne_v1/
    ├── data/
    │   └── ARIADNE_candidate_profiles_20k_enriched.parquet
    ├── backend/
    ├── frontend/
    ├── SETUP_ARIADNE.bat
    └── START_ARIADNE.bat
```

The backend prefers `ARIADNE_candidate_profiles_20k_enriched.parquet` and falls back to the legacy dataset filename only for compatibility. You can also set `ARIADNE_PROJECT_ROOT` or `ARIADNE_DATASET_PATH` explicitly. The existing Jina embeddings remain valid because the enriched dataset preserves the same 20,000-row candidate order.

## Start ARIADNE on Windows

First-time setup:

```text
SETUP_ARIADNE.bat
```

Normal start:

```text
START_ARIADNE.bat
```

`START_BACKEND.bat` explicitly selects CUDA for both Jina query embedding and Jina Tiny reranking in Quick Search, while Advanced Match uses the quantized Ollama model shown below.

Or manually:

Backend:

```powershell
C:\hermesenv\Scripts\Activate.ps1
cd "...\ariadne_v1\backend"
$env:ARIADNE_JINA_DEVICE="cuda"
$env:ARIADNE_JINA_RERANKER_DEVICE="cuda"
$env:ARIADNE_OLLAMA_MODEL="ministral-3:3b"
$env:ARIADNE_OLLAMA_NUM_CTX="4096"
python run_backend.py
```

Frontend:

```powershell
cd "...\ariadne_v1\frontend"
npm run dev
```

Open:

```text
http://localhost:5173
```

## Decision-support notice

AI Match scores reflect the system’s assessment against the requirements, criteria and weights defined for the current search. They support candidate discovery and comparison and do not constitute hiring decisions or recommendations. Supporting evidence should be reviewed by the responsible recruiter, who remains responsible for all selection decisions.


## Advanced Match robustness update

- Selecting multiple professional domains is inclusive (OR): a candidate may match any selected domain.
- The Advanced Match domain Any/All toggle is intentionally removed.
- Ollama output budget is 1200 generated tokens per assessment call.
- If a structured LLM response omits criteria, ARIADNE keeps valid criterion scores and issues a focused repair request only for the missing criteria.
