from __future__ import annotations

import numpy as np
import pandas as pd


class CandidateStore:
    def __init__(self, dataset_path):
        if not dataset_path.exists():
            raise FileNotFoundError(f"Candidate dataset not found: {dataset_path}")

        self.df = pd.read_parquet(dataset_path).reset_index(drop=True)
        if "candidate_text" not in self.df.columns:
            raise ValueError("Dataset must contain a 'candidate_text' column.")

        self.df["candidate_id"] = self.df.index.astype(str)
        self.df["dataset_index"] = self.df.index.astype(int)
        self.texts = self.df["candidate_text"].fillna("").astype(str).tolist()

        empty = self.df["candidate_text"].fillna("").astype(str).str.strip().eq("")
        if empty.any():
            raise ValueError(f"Dataset contains {int(empty.sum())} empty candidate_text rows.")

        # Pre-compute normalized fields once so filtering is cheap at search time.
        self._position_norm = self._normalized_series("Position")
        self._primary_keyword_norm = self._normalized_series("Primary Keyword")
        self._professional_domains_norm = self._normalized_series("professional_domains")
        self._professional_domain_sets = [
            {part.strip().casefold() for part in value.split("|") if part.strip()}
            for value in self._raw_series("professional_domains").tolist()
        ]
        self._english_norm = self._normalized_series("English Level")
        self._looking_for_norm = self._normalized_series("Looking For")
        self._experience_numeric = self._numeric_experience_series("Experience Years")
        self._candidate_text_norm = self.df["candidate_text"].fillna("").astype(str).str.casefold()

    @staticmethod
    def safe(value) -> str:
        return "" if pd.isna(value) else str(value)

    def _raw_series(self, column: str) -> pd.Series:
        if column not in self.df.columns:
            return pd.Series([""] * len(self.df), index=self.df.index, dtype="string")
        return self.df[column].fillna("").astype(str)

    def _normalized_series(self, column: str) -> pd.Series:
        return self._raw_series(column).str.strip().str.casefold()

    def _numeric_experience_series(self, column: str) -> pd.Series:
        raw = self._raw_series(column)
        extracted = raw.str.extract(r"(\d+(?:\.\d+)?)", expand=False)
        return pd.to_numeric(extracted, errors="coerce")

    @staticmethod
    def _normalized_filter_value(value) -> str:
        if value is None:
            return ""
        return str(value).strip().casefold()

    def filter_indices(self, filters: dict | None = None) -> np.ndarray:
        """Return dataset indices that satisfy all supplied hard filters.

        Filters are applied before BM25/Jina retrieval. Missing candidate values do not
        satisfy an active filter. Text fields use case-insensitive matching; Position
        and Looking For use substring matching, while English Level and Primary Keyword
        use exact normalized matching.
        """
        if not filters:
            return np.arange(len(self.df), dtype=np.int64)

        mask = np.ones(len(self.df), dtype=bool)

        min_experience = filters.get("min_experience")
        max_experience = filters.get("max_experience")
        if min_experience is not None:
            mask &= self._experience_numeric.ge(float(min_experience)).fillna(False).to_numpy()
        if max_experience is not None:
            mask &= self._experience_numeric.le(float(max_experience)).fillna(False).to_numpy()

        english_level = self._normalized_filter_value(filters.get("english_level"))
        if english_level:
            mask &= self._english_norm.eq(english_level).to_numpy()

        primary_keyword = self._normalized_filter_value(filters.get("primary_keyword"))
        if primary_keyword:
            mask &= self._primary_keyword_norm.eq(primary_keyword).to_numpy()

        professional_domain = self._normalized_filter_value(filters.get("professional_domain"))
        if professional_domain:
            mask &= np.fromiter(
                (professional_domain in domains for domains in self._professional_domain_sets),
                dtype=bool,
                count=len(self._professional_domain_sets),
            )

        position = self._normalized_filter_value(filters.get("position"))
        if position:
            mask &= self._position_norm.str.contains(position, regex=False, na=False).to_numpy()

        looking_for = self._normalized_filter_value(filters.get("looking_for"))
        if looking_for:
            mask &= self._looking_for_norm.str.contains(looking_for, regex=False, na=False).to_numpy()

        return np.flatnonzero(mask).astype(np.int64, copy=False)

    def advanced_filter_indices(self, eligibility: dict | None = None) -> np.ndarray:
        """Structured/lexical eligibility used only by Advanced Match.

        Experience is numeric. English is interpreted as a minimum level using the
        dataset's ordered categories. Additional languages are treated conservatively
        as explicit language-name mentions in candidate_text; their full requested
        phrase is still carried into the later semantic retrieval stage.
        """
        if not eligibility:
            return np.arange(len(self.df), dtype=np.int64)

        mask = np.ones(len(self.df), dtype=bool)

        selected_domains = [
            self._normalized_filter_value(value)
            for value in (eligibility.get("professional_domains") or [])
            if self._normalized_filter_value(value)
        ]
        if selected_domains:
            # Professional-domain selection is intentionally inclusive: when several
            # domains are selected, a candidate may match any one of them. This keeps
            # pre-screening broad and avoids an unnecessary Any/All control in the UI.
            domain_mask = np.fromiter(
                (any(domain in candidate_domains for domain in selected_domains) for candidate_domains in self._professional_domain_sets),
                dtype=bool,
                count=len(self._professional_domain_sets),
            )
            mask &= domain_mask

        min_experience = eligibility.get("min_experience")
        max_experience = eligibility.get("max_experience")
        if min_experience is not None:
            mask &= self._experience_numeric.ge(float(min_experience)).fillna(False).to_numpy()
        if max_experience is not None:
            mask &= self._experience_numeric.le(float(max_experience)).fillna(False).to_numpy()

        english_order = {
            "no_english": 0,
            "basic": 1,
            "pre": 2,
            "intermediate": 3,
            "upper": 4,
            "fluent": 5,
        }
        min_english = self._normalized_filter_value(eligibility.get("min_english_level"))
        if min_english:
            required_rank = english_order.get(min_english)
            if required_rank is None:
                raise ValueError(f"Unknown English level: {eligibility.get('min_english_level')}")
            english_rank = self._english_norm.map(english_order).fillna(-1).to_numpy(dtype=int)
            mask &= english_rank >= required_rank

        languages = [
            str(value).strip()
            for value in (eligibility.get("additional_languages") or [])
            if str(value).strip()
        ]
        if languages:
            language_masks: list[np.ndarray] = []
            for requirement in languages:
                # The first token is normally the language name (e.g. French C1).
                # Requiring the explicit language mention is safer than pretending a
                # semantic model has verified a formal proficiency level.
                language_name = requirement.split()[0].strip().casefold()
                if not language_name:
                    continue
                language_masks.append(
                    self._candidate_text_norm.str.contains(language_name, regex=False, na=False).to_numpy()
                )
            if language_masks:
                mode = str(eligibility.get("language_match_mode", "all") or "all").casefold()
                combined = language_masks[0]
                for current in language_masks[1:]:
                    combined = (combined | current) if mode == "any" else (combined & current)
                mask &= combined

        return np.flatnonzero(mask).astype(np.int64, copy=False)

    def filter_options(self) -> dict:
        def unique_values(column: str) -> list[str]:
            values = [self.safe(value).strip() for value in self._raw_series(column).tolist()]
            values = [value for value in values if value and value.casefold() != "nan"]
            return sorted(set(values), key=str.casefold)

        professional_domains = sorted(
            {
                part.strip()
                for value in self._raw_series("professional_domains").tolist()
                for part in value.split("|")
                if part.strip()
            },
            key=str.casefold,
        )
        return {
            "english_levels": unique_values("English Level"),
            "primary_keywords": unique_values("Primary Keyword"),
            "professional_domains": professional_domains,
        }

    def candidate_payload(self, dataset_index: int) -> dict:
        index = int(dataset_index)
        if index < 0 or index >= len(self.df):
            raise IndexError("Candidate index out of range.")
        row = self.df.iloc[index]
        cv = self.safe(row.get("CV"))
        highlights = self.safe(row.get("Highlights"))
        candidate_text = self.safe(row.get("candidate_text"))
        snippet_source = highlights.strip() or cv.strip() or candidate_text
        return {
            "candidate_id": str(row["candidate_id"]),
            "dataset_index": index,
            "position": self.safe(row.get("Position")),
            "primary_keyword": self.safe(row.get("Primary Keyword")),
            "professional_domains": self.safe(row.get("professional_domains")),
            "esco_skills": self.safe(row.get("esco_skills")),
            "experience_years": self.safe(row.get("Experience Years")),
            "english_level": self.safe(row.get("English Level")),
            "looking_for": self.safe(row.get("Looking For")),
            "highlights": highlights,
            "cv_snippet": snippet_source[:700],
            "full_cv": cv,
            "candidate_text": candidate_text,
        }

    def by_candidate_id(self, candidate_id: str) -> dict:
        try:
            index = int(candidate_id)
        except (TypeError, ValueError) as exc:
            raise KeyError(candidate_id) from exc
        if index < 0 or index >= len(self.df):
            raise KeyError(candidate_id)
        return self.candidate_payload(index)
