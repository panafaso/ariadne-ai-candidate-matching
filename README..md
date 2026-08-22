# ARIADNE — Candidate Matching Prototype

ARIADNE is a local-first research/demo system for candidate retrieval, reranking and evidence-based advanced matching.

## Two search modes

### Quick Search

Quick Search uses a hybrid lexical + semantic retrieval pipeline:

**Employer query → BM25Plus + Jina Embeddings v5 → Reciprocal Rank Fusion (Top-50) → Jina Reranker v1 Tiny EN → adaptive cutoff → variable result list.**

Both first-stage retrievers use the enriched ARIADNE candidate representation:

```text
candidate_text
+ Professional Domains
+ ESCO Skills
```

- **BM25Plus** performs lexical matching over the enriched candidate text.
- **Jina Embeddings v5** performs semantic matching against precomputed enriched candidate embeddings.
- The two rankings are combined with **Reciprocal Rank Fusion (RRF)**.
- **Jina Reranker v1 Tiny EN** then reranks the hybrid candidate pool.
- The existing adaptive cutoff selects the final variable-size result list.

The result sidebar uses the enriched **Professional domain** metadata instead of the legacy **Primary area** field. ESCO skills are displayed as candidate metadata in the extended profile and also contribute to lexical and semantic retrieval; they are not exposed as a standalone ESCO filter.

### Advanced Match

Advanced Match is a separate three-step recruiter workflow:

1. **Eligibility & pre-screening** — optional Professional domain filtering, structured experience/English filters, additional language requirements, and broad keyword + semantic pre-screening for education, required experience and must-have skills. Multiple selected Professional domains are applied inclusively (**OR**): a candidate may match any selected domain. Minimum and maximum experience are independently optional: a minimum alone means that value or more, a maximum alone means that value or less, and both together define a range.
2. **Matching criteria & recruiter weights** — the recruiter creates/edits/removes criteria, defines the evidence to look for, assigns each criterion a weight, and selects a **Minimum overall AI Match Score** for the final shortlist. Criterion weights must total 100%.
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
│   └── ariadne_jina_v5_enriched_embeddings_20k.npy
├── ADVANCED_MATCH_DESIGN.md
├── LICENSE
├── README.md
├── SETUP_ARIADNE.bat
├── START_ARIADNE.bat
├── START_BACKEND.bat
└── START_FRONTEND.bat
```

The backend uses:

```text
data/ARIADNE_candidate_profiles_20k_enriched.parquet
```

together with:

```text
embeddings/ariadne_jina_v5_enriched_embeddings_20k.npy
```

The embedding matrix is aligned row-for-row with the enriched 20,000-candidate dataset.

You can override the default project/data paths with the supported ARIADNE environment variables when required.

### Candidate and query embeddings

ARIADNE does **not** recompute embeddings for all candidate profiles every time a recruiter performs a search.

The candidate collection has a precomputed Jina Embeddings v5 matrix:

```text
embeddings/ariadne_jina_v5_enriched_embeddings_20k.npy
```

The embeddings were generated with:

```text
Model: jinaai/jina-embeddings-v5-text-small
Candidates: 20,000
Embedding dimension: 1024
Maximum document sequence length: 3072 tokens
Document prompt: document
Normalization: enabled
```

Each candidate embedding is generated from the enriched retrieval representation:

```text
candidate_text
Professional Domains: ...
ESCO Skills: ...
```

The original `candidate_text` remains the base representation. `professional_domains` and `esco_skills` are appended for ARIADNE retrieval. Dataset identifiers such as `id`, `index`, `__index_level_0__`, `candidate_id` and `dataset_index` are not embedded.

Before generation, the complete enriched collection was token-audited:

```text
Candidates: 20,000
Maximum observed length: 2667 tokens
Candidates over 3072 tokens: 0
```

Therefore the selected 3072-token document limit covers the complete enriched retrieval text for all 20,000 candidates without truncation.

The resulting embedding matrix has:

```text
Shape: (20000, 1024)
Data type: float32
```

and contains one normalized 1024-dimensional vector per candidate.

For every new recruiter query, Jina Embeddings v5 generates a **new normalized query embedding at runtime**. ARIADNE compares that query vector with the stored candidate vectors using a dot product; because the vectors are normalized, this functions as cosine similarity.

The semantic ranking is then combined with the BM25Plus lexical ranking using Reciprocal Rank Fusion.

Conceptually:

```text
                    Enriched candidate representation
                candidate_text + domains + ESCO skills
                               │
                 ┌─────────────┴─────────────┐
                 ↓                           ↓
             BM25Plus                   Jina Embeddings v5
             lexical                       semantic
                 ↓                           ↓
                 └──────────── RRF ──────────┘
                               ↓
                    Jina Reranker v1 Tiny
                               ↓
                       adaptive cutoff
                               ↓
                         final results
```

The runtime query embedding is temporary and is used only to calculate retrieval similarity for the current search. ARIADNE does not save a new `.npy` file for each recruiter query.

> **Repository note:** `embeddings/ariadne_jina_v5_enriched_embeddings_20k.npy` is a generated binary retrieval asset and is tracked in the GitHub repository through **Git LFS**, rather than ordinary Git object storage.

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

- Selecting multiple professional domains is inclusive (**OR**): a candidate may match any selected domain.
- The Advanced Match domain Any/All toggle is intentionally removed.
- Ollama output budget is 1200 generated tokens per assessment call.
- If a structured LLM response omits criteria, ARIADNE keeps valid criterion scores and issues a focused repair request only for the missing criteria.
