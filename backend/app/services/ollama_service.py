from __future__ import annotations

import json
from urllib import error, request


class OllamaService:
    """Local Ollama client used only by ARIADNE Advanced Match.

    Quick Search does not depend on this service. Advanced Match sends one
    candidate at a time and asks the model to score all recruiter criteria in
    a single structured response.
    """

    def __init__(
        self,
        base_url: str,
        model_name: str,
        timeout_seconds: int = 180,
        num_ctx: int = 4096,
        num_predict: int = 1200,
    ):
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.timeout_seconds = int(timeout_seconds)
        self.num_ctx = int(num_ctx)
        self.num_predict = int(num_predict)

    @staticmethod
    def _output_schema() -> dict:
        return {
            "type": "object",
            "properties": {
                "criteria": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "criterion_id": {"type": "string"},
                            "score": {"type": "integer", "minimum": 0, "maximum": 100},
                            "evidence": {
                                "type": "array",
                                "items": {"type": "string"},
                                "maxItems": 2,
                            },
                            "justification": {"type": "string"},
                        },
                        "required": ["criterion_id", "score", "evidence", "justification"],
                    },
                }
            },
            "required": ["criteria"],
        }

    @staticmethod
    def _build_prompt(
        target_role: str,
        criteria: list[dict],
        candidate_id: str,
        candidate_text: str,
        shortlist_threshold: float,
    ) -> str:
        criteria_block = "\n\n".join(
            "\n".join(
                [
                    f"Criterion ID: {criterion['id']}",
                    f"Criterion name: {criterion['name']}",
                    f"Recruiter requirement: {criterion['description']}",
                    f"Weight: {float(criterion['weight']):g}%",
                ]
            )
            for criterion in criteria
        )

        return f"""You are an AI component supporting evidence-based candidate matching.

Your task is to assess ONE candidate against recruiter-defined matching criteria.

The recruiter has already defined:
- a target role;
- a set of matching criteria;
- a weight for each criterion;
- a minimum overall AI Match Score required for the final shortlist.

Your role is to evaluate how well the candidate satisfies each criterion based only on evidence contained in the candidate profile.

GENERAL RULES

1. Use only information explicitly contained in the candidate profile.

2. Do not invent, assume, or infer qualifications, degrees, skills, language levels, certifications, responsibilities, professional experience, employers, or achievements that are not supported by the profile.

3. Evaluate the candidate against the recruiter's actual requirements, not against whether the candidate appears generally strong or experienced.

4. A strong CV in an unrelated field must receive low scores for criteria that are not supported.

5. Exact terminology is not always required. Closely related or equivalent experience may receive appropriate credit when it genuinely satisfies the meaning of the criterion.

6. When the recruiter requests a specific qualification, degree, certification, language level, professional background, or domain, do not treat unrelated qualifications as equivalent.

   Example: if the recruiter asks for "Master's degree in Law", a Master's degree in Business Administration does NOT satisfy that requirement.

   If the recruiter instead asks for "Law, European Studies, or a related field", relevant related qualifications may receive appropriate credit depending on the evidence.

7. Missing evidence must reduce the score.

8. Do not compensate for weak evidence in one criterion by considering strengths from another criterion. Assess every criterion independently.

9. Criterion weights reflect the recruiter's priorities. They may help you understand which aspects matter most to the recruiter, but they MUST NOT artificially inflate or reduce the evidence-based score assigned to an individual criterion.

10. Do not calculate the final weighted AI Match Score. ARIADNE will calculate it deterministically from the criterion scores and recruiter-defined weights.

11. Do not rank this candidate against other candidates.

12. Do not make a hiring decision or hiring recommendation.

13. When identifiable supporting evidence exists, return it using wording anchored to the candidate profile. Never invent or fabricate evidence.

14. If no reliable evidence excerpt can be identified, return an empty evidence list rather than guessing. A missing excerpt must not cause the assessment to fail; score conservatively based on the information actually available.

15. Do not reward longer CVs simply because they contain more text.

16. When evidence is ambiguous, incomplete, or only indirectly relevant, score conservatively.

SCORING SCALE

Assign an integer score from 0 to 100 for each criterion.

0-19: No meaningful evidence. The profile does not demonstrate the requested requirement or contains only unrelated information.

20-39: Weak match. Some indirect or limited relevance exists, but the criterion is largely unsupported.

40-59: Partial match. Relevant evidence exists, but important parts of the requested criterion are missing.

60-74: Good match. Clear relevant evidence covers a substantial part of the criterion.

75-89: Strong match. Direct and substantial evidence supports most aspects of the criterion.

90-100: Excellent match. Direct, extensive, and highly relevant evidence covers nearly all important aspects of the criterion.

Use scores above 90 selectively. A score of 100 should be exceptional.

RECRUITER SEARCH

Target role:
{target_role}

Minimum overall AI Match Score for shortlist:
{shortlist_threshold:g}/100

MATCHING CRITERIA

{criteria_block}

CANDIDATE PROFILE

Candidate ID:
{candidate_id}

{candidate_text}

TASK

Assess the candidate against every recruiter-defined criterion.

For each criterion:
- assign one evidence-based integer score from 0 to 100;
- identify up to TWO strongest relevant evidence excerpts from the candidate profile when reliable excerpts are available;
- use short excerpts that reproduce the profile wording as closely as possible so ARIADNE can highlight them in the CV;
- if no reliable evidence excerpt can be identified, return evidence: [] and do not invent text;
- provide one concise sentence explaining the score;
- explicitly state when requested evidence is missing, weak, indirect, or only partially demonstrated;
- ensure the score reflects relevance to that specific criterion rather than the candidate's general profile quality.

The shortlist threshold is provided for context only. Do NOT alter criterion scores to make the candidate pass or fail the threshold.

Do NOT calculate the final weighted score.
Do NOT decide whether the candidate enters the shortlist.
Do NOT rank the candidate against other candidates.
Do NOT make a hiring recommendation.

Return ONLY valid JSON matching the required schema."""

    def _generate(self, prompt: str) -> dict:
        payload = {
            "model": self.model_name,
            "system": (
                "You are an evidence-grounded candidate-matching assistant. "
                "Use only candidate-profile evidence, score conservatively when evidence is missing, "
                "and return only the requested structured JSON."
            ),
            "prompt": prompt,
            "stream": False,
            "format": self._output_schema(),
            "keep_alive": "15m",
            "options": {
                "temperature": 0,
                "seed": 42,
                "num_ctx": self.num_ctx,
                "num_predict": self.num_predict,
            },
        }
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(
            f"{self.base_url}/api/generate",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                data = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            detail = ""
            try:
                raw = exc.read().decode("utf-8", errors="replace")
                parsed = json.loads(raw) if raw else {}
                detail = str(parsed.get("error") or parsed.get("message") or raw).strip()
            except Exception:
                detail = ""
            if exc.code == 404:
                raise RuntimeError(
                    f"Ollama model '{self.model_name}' was not found. Run 'ollama list' and make sure the configured model is installed."
                ) from exc
            suffix = f" Details: {detail}" if detail else ""
            raise RuntimeError(f"Ollama returned HTTP {exc.code} during candidate assessment.{suffix}") from exc
        except error.URLError as exc:
            raise RuntimeError(
                "Advanced Match could not reach Ollama at "
                f"{self.base_url}. Start the Ollama desktop app, run 'ollama list', and confirm the configured model is available."
            ) from exc
        except TimeoutError as exc:
            raise RuntimeError(
                "Ollama timed out while assessing a candidate. The current Advanced Match settings are preserved; check Ollama/GPU status and retry."
            ) from exc

        raw = data.get("response", "")
        if not isinstance(raw, str) or not raw.strip():
            raise RuntimeError("Ollama returned an empty assessment response.")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Ollama returned invalid JSON during candidate assessment.") from exc
        parsed["_usage"] = {
            "total_duration": int(data.get("total_duration", 0) or 0),
            "prompt_eval_count": int(data.get("prompt_eval_count", 0) or 0),
            "eval_count": int(data.get("eval_count", 0) or 0),
        }
        return parsed

    def score_candidate(
        self,
        target_role: str,
        criteria: list[dict],
        candidate_id: str,
        candidate_text: str,
        shortlist_threshold: float,
    ) -> tuple[list[dict], dict]:
        expected_ids = [str(criterion["id"]) for criterion in criteria]
        prompt = self._build_prompt(
            target_role=target_role,
            criteria=criteria,
            candidate_id=candidate_id,
            candidate_text=candidate_text,
            shortlist_threshold=shortlist_threshold,
        )

        def normalize_rows(rows: list, allowed_ids: set[str]) -> dict[str, dict]:
            by_id: dict[str, dict] = {}
            for row in rows:
                if not isinstance(row, dict):
                    continue
                criterion_id = str(row.get("criterion_id", "")).strip()
                if criterion_id not in allowed_ids:
                    continue
                try:
                    score = int(round(float(row.get("score", 0))))
                except (TypeError, ValueError):
                    score = 0
                evidence = row.get("evidence", [])
                if not isinstance(evidence, list):
                    evidence = [str(evidence)] if evidence else []
                cleaned_evidence = [str(item).strip() for item in evidence if str(item).strip()][:2]
                justification = str(row.get("justification", "")).strip()
                by_id[criterion_id] = {
                    "criterion_id": criterion_id,
                    "score": max(0, min(100, score)),
                    "evidence": cleaned_evidence,
                    "justification": justification,
                }
            return by_id

        usage = {"total_duration": 0, "prompt_eval_count": 0, "eval_count": 0}

        def add_usage(parsed: dict) -> None:
            current = parsed.get("_usage", {}) or {}
            for key in usage:
                usage[key] += int(current.get(key, 0) or 0)

        # Retry a malformed full response once. If the response is valid but omits
        # one or more criteria, keep the valid scores and issue a focused repair
        # request only for the missing criteria rather than discarding the candidate.
        last_error: RuntimeError | None = None
        for _ in range(2):
            try:
                parsed = self._generate(prompt)
                add_usage(parsed)
                rows = parsed.get("criteria")
                if not isinstance(rows, list):
                    raise RuntimeError("Ollama response did not contain a criteria list.")

                by_id = normalize_rows(rows, set(expected_ids))
                missing_ids = [criterion_id for criterion_id in expected_ids if criterion_id not in by_id]

                if missing_ids:
                    missing_set = set(missing_ids)
                    missing_criteria = [
                        criterion for criterion in criteria if str(criterion["id"]) in missing_set
                    ]
                    repair_prompt = self._build_prompt(
                        target_role=target_role,
                        criteria=missing_criteria,
                        candidate_id=candidate_id,
                        candidate_text=candidate_text,
                        shortlist_threshold=shortlist_threshold,
                    ) + (
                        "\n\nREPAIR REQUEST\n"
                        "The previous structured response omitted one or more criteria. "
                        "Score every criterion listed in this repair request and return each "
                        "criterion_id exactly once. Return only the required JSON."
                    )
                    try:
                        repaired = self._generate(repair_prompt)
                        add_usage(repaired)
                        repair_rows = repaired.get("criteria")
                        if isinstance(repair_rows, list):
                            by_id.update(normalize_rows(repair_rows, missing_set))
                    except RuntimeError as repair_exc:
                        last_error = repair_exc

                still_missing = [criterion_id for criterion_id in expected_ids if criterion_id not in by_id]
                if still_missing:
                    raise RuntimeError(
                        "Ollama did not score every requested criterion after a focused repair request. "
                        f"Missing criterion IDs: {', '.join(still_missing)}"
                    )

                ordered = [by_id[criterion_id] for criterion_id in expected_ids]
                return ordered, usage
            except RuntimeError as exc:
                last_error = exc

        raise last_error or RuntimeError("Ollama candidate assessment failed.")

