# ARIADNE — Candidate Matching Prototype

ARIADNE is a local-first research/demo system for candidate retrieval, reranking, recruiter-controlled matching criteria, and evidence-based candidate comparison.

The system combines lexical retrieval, semantic retrieval, neural reranking, structured recruiter filters, and a local LLM for advanced candidate assessment.

---

## Features

ARIADNE provides two complementary search modes:

- **Quick Search** for fast hybrid retrieval and reranking.
- **Advanced Match** for recruiter-defined eligibility rules, weighted matching criteria, AI-assisted evidence extraction, and shortlist ranking.

The application is designed as a **decision-support tool**. It does not make hiring decisions automatically.

---

# Quick Search

Quick Search uses a hybrid lexical + semantic retrieval pipeline:

```text
Employer query
      ↓
BM25Plus + Jina Embeddings v5
      ↓
Reciprocal Rank Fusion (Top-50)
      ↓
Jina Reranker v1 Tiny EN
      ↓
Adaptive cutoff
      ↓
Final result list
```

Both first-stage retrievers use the enriched ARIADNE candidate representation:

```text
candidate_text
+ Professional Domains
+ ESCO Skills
```

### BM25Plus

BM25Plus performs lexical retrieval over the enriched candidate representation.

It is useful when the recruiter query contains terms that also appear directly in candidate profiles, professional domains, or ESCO skills.

### Jina semantic retrieval

ARIADNE uses:

```text
jinaai/jina-embeddings-v5-text-small
```

for semantic retrieval.

A recruiter query is encoded at search time and compared with the precomputed candidate embedding matrix.

This allows ARIADNE to retrieve semantically related candidates even when the recruiter query and the CV do not use exactly the same wording.

### Reciprocal Rank Fusion

The BM25Plus and Jina dense rankings are combined using **Reciprocal Rank Fusion (RRF)**.

The fused Top-50 candidate pool is then passed to the neural reranker.

### Neural reranking

ARIADNE uses **Jina Reranker v1 Tiny EN** to rerank the hybrid candidate pool.

The existing adaptive cutoff then determines the final variable-size result list.

---

# Advanced Match

Advanced Match is a separate three-step recruiter workflow.

## 1. Eligibility & pre-screening

The recruiter can define optional eligibility and pre-screening requirements such as:

- Professional domain
- Minimum experience
- Maximum experience
- English level
- Additional language requirements
- Education requirements
- Required experience
- Must-have skills

Multiple selected Professional domains are applied inclusively:

```text
Domain A OR Domain B OR Domain C
```

A candidate may therefore match any selected domain.

Experience filters are independently optional:

```text
minimum only  → that value or more
maximum only  → that value or less
both          → experience range
```

---

## 2. Matching criteria & recruiter weights

The recruiter can:

- create criteria;
- edit criteria;
- remove criteria;
- describe the evidence to look for;
- assign a percentage weight to each criterion;
- define a minimum overall AI Match Score.

Criterion weights must total:

```text
100%
```

The recruiter remains responsible for defining the criteria and their relative importance.

---

## 3. AI assessment & shortlist ranking

The retrieval stage produces up to 50 **Matched Profiles**.

A local pointwise LLM assesses one candidate at a time against all recruiter-defined criteria.

For each criterion, the system returns:

- a 0–100 criterion score;
- supporting evidence/excerpts;
- a concise evidence-based justification.

ARIADNE then applies the recruiter-defined weights deterministically and calculates the final:

```text
AI Match Score: 0–100
```

Candidates are sorted by this score and only candidates meeting the recruiter-defined minimum threshold are retained in the final shortlist.

---

# Advanced Match workspace

The Advanced Match workspace supports:

- stable soft colors for recruiter criteria;
- criterion-colored evidence highlighting;
- one shared **Shortlist** across Quick Search and Advanced Match;
- shared recruiter notes;
- **Unsave all Advanced**;
- global **Clear shortlist**;
- discreet dataset IDs;
- Professional domain metadata;
- ESCO skill metadata;
- comparison of up to four Advanced Match candidates;
- side-by-side criterion assessments;
- full candidate CV/profile comparison;
- HTML report download containing the candidate profile and AI assessment;
- persistence of Quick and Advanced results while switching modes;
- browser storage for the current Advanced Match session until explicitly cleared;
- actionable backend, Ollama/model, timeout, GPU-memory, validation, and malformed-output errors.

If a structured LLM response omits one or more criteria, ARIADNE preserves the valid criterion assessments and sends a focused repair request only for the missing criteria.

---

# Candidate dataset

ARIADNE uses the enriched candidate dataset:

```text
data/ARIADNE_candidate_profiles_20k_enriched.parquet
```

The dataset contains:

```text
20,000 candidate profiles
```

In addition to the existing candidate profile representation, ARIADNE uses:

```text
professional_domains
esco_skills
```

for retrieval.

The enriched dataset preserves the original 20,000-row candidate order.

---

# Candidate embeddings

ARIADNE does **not** regenerate all candidate embeddings every time a recruiter searches.

The repository contains the precomputed candidate embedding matrix:

```text
embeddings/ariadne_jina_v5_enriched_embeddings_20k.npy
```

The matrix contains:

```text
Shape:      (20000, 1024)
Data type:  float32
Vectors:    normalized
```

Each candidate vector is generated from:

```text
candidate_text
Professional Domains: ...
ESCO Skills: ...
```

The embedding generation process does **not** include dataset identifiers such as:

```text
id
index
__index_level_0__
candidate_id
dataset_index
```

The enriched candidate texts were audited before embedding generation.

```text
Candidates:                  20,000
Maximum observed length:     2667 tokens
Embedding document limit:    3072 tokens
Candidates over the limit:   0
```

Therefore the complete enriched retrieval representation fits within the configured document context without truncation.

---

# Query embeddings

Candidate embeddings are precomputed once.

Recruiter query embeddings are generated dynamically at search time.

Conceptually:

```text
Candidate dataset
      ↓
Precomputed candidate embeddings
      ↓
Stored 20,000 × 1024 matrix


Recruiter query
      ↓
Jina query embedding
      ↓
Similarity against candidate matrix
      ↓
Dense candidate ranking
      ↓
BM25Plus + Jina
      ↓
RRF
      ↓
Jina reranker
      ↓
Final Quick Search results
```

Because the vectors are normalized, the vector dot product acts as cosine similarity.

A new `.npy` file is **not** created for each recruiter query.

---

# Local LLM

Advanced Match uses a local Ollama model.

The current model is:

```text
ministral-3:3b
```

The model is called only when the recruiter runs the AI assessment stage in Advanced Match.

The Ollama context size is configurable by the backend/runtime environment and is intentionally not fixed in the public startup instructions.

---

# Repository layout

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

The candidate embedding matrix is stored using **Git LFS**.

---

# Requirements

For the Windows setup, install:

- Python
- Node.js / npm
- Git
- Git LFS
- Ollama

For GPU acceleration in Quick Search, a compatible CUDA-enabled PyTorch environment and NVIDIA GPU can be used.

CPU execution is also possible where supported, although retrieval/reranking will be slower.

---

# Clone the repository

```powershell
git clone https://github.com/panafaso/ariadne-ai-candidate-matching.git
cd ariadne-ai-candidate-matching
```

Because the candidate embeddings are tracked through Git LFS, make sure Git LFS is available:

```powershell
git lfs install
git lfs pull
```

---

# Start ARIADNE on Windows

## Recommended method

### First-time setup

Run:

```powershell
.\SETUP_ARIADNE.bat
```

### Normal start

After setup, run:

```powershell
.\START_ARIADNE.bat
```

Then open:

```text
http://localhost:5173
```

---

# Manual setup

The following is an alternative to the `.bat` scripts.

## Backend

From the repository root:

```powershell
cd backend

python -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m nltk.downloader stopwords
```

Optional GPU selection for Jina query encoding and neural reranking:

```powershell
$env:ARIADNE_JINA_DEVICE="cuda"
$env:ARIADNE_JINA_RERANKER_DEVICE="cuda"
```

Select the local Ollama model:

```powershell
$env:ARIADNE_OLLAMA_MODEL="ministral-3:3b"
```

Start the backend:

```powershell
python run_backend.py
```

Keep this terminal open.

---

## Frontend

Open a second terminal from the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Then open:

```text
http://localhost:5173
```

---

# Ollama setup

Make sure Ollama is installed and running.

Pull the model if it is not already available locally:

```powershell
ollama pull ministral-3:3b
```

You can verify the locally available models with:

```powershell
ollama list
```

Advanced Match requires the configured Ollama model to be available when AI assessment is executed.

Quick Search does not require an Ollama call.

---

# Quick Search vs Advanced Match

| Component | Quick Search | Advanced Match |
|---|---|---|
| BM25Plus | Yes | Used in retrieval/pre-screening |
| Jina semantic retrieval | Yes | Used in retrieval/pre-screening |
| RRF fusion | Yes | Used in candidate retrieval |
| Jina neural reranker | Yes | Retrieval stage |
| Recruiter filters | Limited | Yes |
| Recruiter-defined criteria | No | Yes |
| Recruiter-defined weights | No | Yes |
| Local Ollama assessment | No | Yes |
| Evidence per criterion | No | Yes |
| Final AI Match Score | No | Yes |

---

# Decision-support notice

AI Match scores reflect the system's assessment against the requirements, criteria, and weights defined for the current search.

They support:

- candidate discovery;
- evidence review;
- candidate comparison;
- recruiter-controlled prioritisation.

They do **not** constitute hiring decisions or autonomous hiring recommendations.

Supporting evidence should be reviewed by the responsible recruiter, who remains responsible for all selection decisions.

---

# Research prototype

ARIADNE is a research/demo prototype.

It is intended to demonstrate a local-first candidate matching architecture combining:

```text
lexical retrieval
+
semantic retrieval
+
rank fusion
+
neural reranking
+
structured recruiter controls
+
local LLM evidence assessment
```

The prototype should not be treated as a production recruitment system without additional security, governance, validation, monitoring, accessibility, and legal/compliance work.
