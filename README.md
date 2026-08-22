# ARIADNE — Candidate Matching Prototype

ARIADNE is a local-first research/demo system for candidate retrieval, reranking and evidence-based advanced matching.

## Two search modes

### Quick Search

Quick Search keeps the existing retrieval/reranking pipeline unchanged:

Employer query → BM25Plus + Jina-v5 → Reciprocal Rank Fusion (Top-50) → Jina Reranker v1 Tiny EN → existing adaptive cutoff → variable result list.

The result sidebar now uses the enriched **Professional domain** metadata instead of the legacy **Primary area** field. ESCO skills are displayed as candidate metadata in the extended profile; they are not an ESCO filter.

### Advanced Match

Advanced Match is a separate three-step recruiter workflow:

1. **Eligibility & pre-screening** — optional Professional domain filtering, structured experience/English filters, additional language requirements, and broad keyword + semantic pre-screening for education, required experience and must-have skills. Multiple selected Professional domains are applied inclusively (**OR**): a candidate may match any selected domain. Minimum and maximum experience are independently optional: a minimum alone means that value or more, a maximum alone means that value or less, and both together define a range.
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

## Repository layout

The GitHub repository is organised directly from the project root:

```text
ariadne-ai-candidate-matching/
├── backend/
├── frontend/
├── data/
│   └── ARIADNE_candidate_profiles_20k_enriched.parquet
├── embeddings/
│   └── cv_embeddings_jina_v5_text_small_20k_2048.npy
├── ADVANCED_MATCH_DESIGN.md
├── LICENSE
├── README.md
├── SETUP_ARIADNE.bat
├── START_ARIADNE.bat
├── START_BACKEND.bat
└── START_FRONTEND.bat
```

The backend prefers `data/ARIADNE_candidate_profiles_20k_enriched.parquet` and can fall back to the legacy dataset filename for compatibility. The enriched dataset preserves the original 20,000-row candidate order, so the existing Jina candidate embedding matrix remains aligned with the dataset.

You can override the default paths with environment variables such as `ARIADNE_PROJECT_ROOT` or `ARIADNE_DATASET_PATH` when required.

### Candidate and query embeddings

ARIADNE does **not** recompute embeddings for all candidate profiles every time a recruiter performs a search.

The candidate collection has a precomputed Jina embedding matrix:

```text
embeddings/cv_embeddings_jina_v5_text_small_20k_2048.npy
```

It contains one normalized **1024-dimensional embedding per candidate profile**, aligned row-for-row with the 20,000-row dataset. The backend loads this matrix once when the search engine starts.

For every new recruiter query, Jina Embeddings v5 generates a **new normalized query embedding at runtime**. ARIADNE then compares that query vector with the stored candidate vectors using a dot product; because both sides are normalized, this acts as cosine similarity. The highest-scoring dense-retrieval candidates are then combined with the BM25Plus ranking through Reciprocal Rank Fusion before neural reranking.

Conceptually:

```text
Candidate dataset
      │
      └── precomputed once
              ↓
      20,000 candidate embeddings
              ↓
 recruiter query
      │
      └── encoded at search time
              ↓
        query embedding
              ↓
  similarity against candidate embeddings
              ↓
       Jina dense ranking
              ↓
 BM25Plus + Jina → RRF → reranker
```

The runtime query embedding is temporary and is used only to calculate retrieval similarity for the current search. ARIADNE does not need to save a new `.npy` file for every recruiter query.

> **Repository note:** the candidate embedding matrix is a generated binary research asset rather than source code. For a public GitHub repository, it is generally better to distribute it through Git LFS, a release/download asset, or provide a reproducible generation/download step instead of committing it as ordinary Git history. The application still requires the embedding matrix at runtime unless the setup process is changed to generate or download it automatically.

## Start ARIADNE on Windows

First-time setup:

```text
SETUP_ARIADNE.bat
```

Normal start:

```text
START_ARIADNE.bat
```

`START_BACKEND.bat` can select CUDA for Jina query encoding and Jina Tiny reranking in Quick Search, while Advanced Match uses the local quantized Ollama model configured above.

Or manually:

Backend:

```powershell
C:\hermesenv\Scripts\Activate.ps1
cd "...\ariadne-ai-candidate-matching\backend"
$env:ARIADNE_JINA_DEVICE="cuda"
$env:ARIADNE_JINA_RERANKER_DEVICE="cuda"
$env:ARIADNE_OLLAMA_MODEL="ministral-3:3b"
$env:ARIADNE_OLLAMA_NUM_CTX="4096"
python run_backend.py
```

Frontend:

```powershell
cd "...\ariadne-ai-candidate-matching\frontend"
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
