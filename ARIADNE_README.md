# ARIADNE — AI-Assisted Candidate Matching

**A local-first research prototype for hybrid candidate retrieval, neural reranking, and recruiter-controlled assessment.**

## Overview

ARIADNE is a web-based research prototype for searching, assessing, and comparing candidate profiles against natural-language recruitment requirements. It combines lexical and semantic retrieval with structured filters, neural reranking, and a locally hosted language model.

The system works with **20,000 English-language candidate profiles** and offers two complementary workflows:

- **Quick Search:** fast hybrid retrieval, neural reranking, and an adaptive result cutoff.
- **Advanced Match:** eligibility screening, recruiter-defined weighted criteria, evidence-based AI assessment, and shortlist ranking.

ARIADNE is designed to **support human recruitment decisions**, not to make hiring or rejection decisions autonomously.

## Quick Search

Quick Search accepts a recruiter query and optional structured filters. Eligible profiles are retrieved and ranked using the following pipeline:

```text
Recruiter query + optional filters
               ↓
      BM25Plus + Jina Embeddings v5
               ↓
       Reciprocal Rank Fusion
               ↓
       Top-50 candidate pool
               ↓
       Jina Reranker v1 Tiny EN
               ↓
 Adaptive cutoff (score floor + elbow)
               ↓
        Final ranked results
```

- **BM25Plus:** retrieves profiles using lexical matching.
- **[Jina Embeddings v5 Text Small](https://huggingface.co/jinaai/jina-embeddings-v5-text-small):** retrieves semantically similar profiles, including matches that use different wording.
- **Reciprocal Rank Fusion (RRF):** combines the two retrieval rankings (`k = 60`) into a pool of up to **50 candidates**.
- **[Jina Reranker v1 Tiny EN](https://huggingface.co/jinaai/jina-reranker-v1-tiny-en):** reranks the retrieved profiles for the recruiter query.

### Adaptive cutoff

Quick Search does not always return a fixed number of candidates. Its final result list is determined by two configurable rules:

- **Score floor: `0.45`** — exclude results below the minimum normalized reranker score.
- **Elbow threshold: `30%`** — stop at the first substantial relative drop between consecutive reranked scores.

**The first boundary reached determines the cutoff.** Quick Search can therefore return fewer than 50 results, including an empty list. These thresholds are heuristic ranking controls, not probabilities that someone is suitable for employment.

## Advanced Match

Advanced Match provides a separate **three-step, recruiter-controlled workflow**.

### 1. Eligibility and pre-screening

The recruiter can specify requirements such as:

- Professional domains and minimum/maximum years of experience;
- English proficiency and additional languages;
- Education and required professional experience;
- Must-have skills.

Selected professional domains use **OR** matching: a candidate may belong to any of the selected domains. Experience limits can be set independently or as a range.

Structured eligibility filters are applied before retrieval. Where additional requirements call for semantic pre-screening, BM25Plus and Jina with RRF can narrow the eligible pool to **up to 6,000 profiles**.

### 2. Matching criteria and candidate retrieval

Recruiters create, edit, and remove assessment criteria, specify the evidence to consider, and assign percentage weights that must **total 100%**. They also select a minimum acceptable **AI Match Score**.

The system constructs a retrieval query from the target role and criteria, then uses **BM25Plus + Jina Embeddings v5 + RRF** to obtain up to **50 Matched Profiles**. This stage does not use the Quick Search Jina neural reranker or its adaptive cutoff.

### 3. AI assessment and shortlist

A locally hosted **[Ministral 3 3B](https://ollama.com/library/ministral-3)** model, accessed through **Ollama** (`ministral-3:3b`), assesses candidates individually against the recruiter-defined criteria.

For each criterion, the system provides:

- A score from **0 to 100**;
- Supporting profile evidence, where available;
- A short explanation of the assessment.

Criterion scores are combined using the recruiter-defined weights to produce an overall **AI Match Score (0–100)**. Candidates are then ranked by this score, and only those meeting the recruiter's **minimum AI Match Score threshold** appear in the final shortlist.

**Note:** The Advanced Match threshold is chosen by the recruiter and is **different from** the Quick Search adaptive cutoff.

## Recruiter Workspace

The interface supports a shared shortlist and recruiter notes across both search modes, candidate-profile details, Professional Domain and ESCO skill metadata, evidence highlighting by criterion, and comparison of **up to four Advanced Match candidates**. Recruiters can also export an **HTML report** containing a candidate's profile and AI assessment.

## Candidate Dataset and Enrichment

ARIADNE uses **20,000 English-language candidate profiles**, enriched with:

- **Professional Domains**, describing the candidate's occupational areas;
- **[ESCO skills](https://esco.ec.europa.eu/en)**, providing standardised skill metadata.

Both BM25Plus and Jina semantic retrieval use the enriched representation: candidate text, Professional Domains, and ESCO Skills.

The main local data assets are:

```text
data/ARIADNE_candidate_profiles_20k_enriched.parquet
embeddings/ariadne_jina_v5_enriched_embeddings_20k.npy
```

Candidate embeddings are **precomputed** and reused across searches. The matrix contains **20,000 normalized, 1,024-dimensional vectors**; only new recruiter queries are embedded at search time. The embedding file is tracked using **Git LFS**.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Lexical retrieval | BM25Plus |
| Semantic retrieval | Jina Embeddings v5 Text Small |
| Hybrid retrieval | Reciprocal Rank Fusion (RRF) |
| Quick Search reranking | Jina Reranker v1 Tiny EN |
| Advanced Match assessment | Ollama + Ministral 3 3B |
| Candidate data | Parquet, NumPy embeddings |

## Repository Structure

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

## Getting Started (Windows)

### Requirements

Install **Python**, **Node.js/npm**, **Git**, **Git LFS**, and **[Ollama](https://ollama.com/)**. A compatible NVIDIA GPU can accelerate model inference. The supplied `START_BACKEND.bat` selects CUDA by default; for CPU-only use, change `ARIADNE_JINA_DEVICE` and `ARIADNE_JINA_RERANKER_DEVICE` in that script from `cuda` to `cpu` (execution will be slower).

### Clone and download Git LFS assets

```powershell
git clone https://github.com/panafaso/ariadne-ai-candidate-matching.git
cd ariadne-ai-candidate-matching
git lfs install
git lfs pull
```

### First-time setup

From the project directory, run:

```powershell
.\SETUP_ARIADNE.bat
```

This installs the backend Python requirements, NLTK stopwords, and frontend dependencies using the Python environment selected by the script.

### Start ARIADNE

```powershell
.\START_ARIADNE.bat
```

Open **http://localhost:5173** in your browser. The backend runs locally at **http://127.0.0.1:8000**.

### Ollama for Advanced Match

Make sure Ollama is running and download the required model if necessary:

```powershell
ollama pull ministral-3:3b
ollama list
```

**Quick Search does not call Ollama.** Ollama is required when running the AI assessment in Advanced Match.

### Optional manual start

If you prefer separate terminals, install dependencies and start the backend from the `backend/` directory:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m nltk.downloader stopwords
python run_backend.py
```

In a second terminal, from `frontend/`:

```powershell
cd frontend
npm install
npm run dev
```

## Quick Search vs Advanced Match

| Capability | Quick Search | Advanced Match |
|---|---|---|
| BM25Plus + Jina retrieval and RRF | Yes | Yes |
| Jina neural reranking | Yes | No |
| Adaptive score/elbow cutoff | Yes | No |
| Structured eligibility requirements | Basic filters | Extended controls |
| Recruiter-defined weighted criteria | No | Yes |
| Local Ministral AI assessment | No | Yes |
| Criterion-level evidence and scores | No | Yes |
| Recruiter-defined AI Match Score threshold | No | Yes |
| Shared shortlist | Yes | Yes |
| Side-by-side Advanced candidate comparison | No | Yes |

## Research Context and Responsible Use

ARIADNE complements the [CV–Job Ranking Benchmark](https://github.com/panafaso/recruitment-multistage-ranking_evaluation), an experimental study of sparse, dense, hybrid, and neural ranking methods undertaken as part of an MSc thesis on AI-assisted candidate matching.

**ARIADNE is a research and demonstration prototype, not a production recruitment system.** Its ranking scores and AI-generated assessments are decision-support outputs requiring human review; they do not constitute automatic hiring or rejection decisions. Deployment in a real recruitment setting would require further validation, bias and performance assessment, security and privacy safeguards, and applicable legal compliance work.
