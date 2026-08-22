# ARIADNE Advanced Match — implemented design

## Workflow

1. **Eligibility & pre-screening**
   - structured experience and English filters; minimum and maximum experience are independently optional and may also be combined as a range;
   - additional language requirements;
   - keyword + semantic pre-screening for education, required experience and must-have skills.

2. **Matching criteria & recruiter weights**
   - dynamic recruiter-defined criteria;
   - criterion descriptions define the evidence to look for;
   - recruiter controls every criterion weight;
   - weights must total 100%;
   - recruiter sets one **Minimum overall AI Match Score** from 0–100;
   - lexical + semantic retrieval produces up to 50 **Matched Profiles**.

3. **AI assessment & shortlist ranking**
   - pointwise: one candidate at a time;
   - all criteria are assessed together in one LLM call per candidate;
   - each criterion receives a 0–100 evidence-based score, up to two supporting excerpts and a short justification;
   - the LLM sees the recruiter weights and shortlist threshold as context, but must score every criterion independently and must not calculate the final score;
   - ARIADNE calculates the weighted score deterministically;
   - only candidates whose final weighted score is at or above the recruiter threshold enter the final shortlist;
   - final shortlist size is therefore variable rather than fixed.

## Pointwise scoring rule

For criterion scores:

- 0–19: no meaningful evidence;
- 20–39: weak match;
- 40–59: partial match;
- 60–74: good match;
- 75–89: strong match;
- 90–100: excellent match.

The prompt explicitly tells the LLM not to reward an impressive but unrelated CV and not to treat unrelated qualifications as equivalent to specific recruiter requirements.

## Final score

For criteria with scores `s_i` and recruiter weights `w_i`:

`Final AI Match Score = Σ(s_i × w_i / 100)`

Example:

- Education 95 × 40% = 38.00
- Legal experience 82 × 30% = 24.60
- EU knowledge 71 × 20% = 14.20
- Languages 88 × 10% = 8.80
- **Final = 85.60 / 100**

If the recruiter threshold is 70, this candidate enters the final shortlist. A candidate scoring 69.99 does not.

## Result workspace

- stable pastel color per criterion;
- same criterion colors in Step 2, score cards, evidence cards and CV highlighting;
- evidence excerpts are requested using profile wording so the UI can highlight them;
- a shared shortlist across Quick Search and Advanced Match;
- shared recruiter notes in both modes;
- discreet dataset IDs in candidate cards, profiles, comparisons and saved lists;
- compare up to four current shortlisted candidates side by side, including profile fields, recruiter notes and full CV text;
- download CV/profile + criterion assessment as an HTML report;
- previous assessment can be retained when navigating back; changed settings mark it as stale until re-run;
- Quick and Advanced mode state remains available when switching between modes; the current Advanced session is cleared only through an explicit confirmed reset;
- AI assessment runs in UI batches of five candidates so progress is visible, while the model still evaluates candidates pointwise;
- user-facing errors explain both what failed and what action to take.

## Local model defaults

- Ollama model: `ministral-3:3b`
- quantization: Q4_K_M (as supplied by the Ollama model)
- context: 4096
- candidate text cap: 7000 characters
- maximum generated tokens: 1200

The recruiter UI does not display the model name.


## Evidence handling

Evidence excerpts are returned when the LLM can reliably anchor them to candidate text. Missing evidence excerpts do not abort scoring; the criterion may still receive a conservative score and the UI simply omits evidence highlighting for that criterion. The model must never fabricate evidence.


## Verified Step 2 retrieval

Advanced Step 2 executes BM25Plus lexical retrieval and Jina-v5 semantic retrieval over the Step 1 pre-screened candidate indices, then merges both ranked lists with Reciprocal Rank Fusion (`k=60`) and returns up to 50 Matched Profiles. A backend regression test verifies that both retrievers are called on the same eligible pool and that RRF output contains both source ranks.
