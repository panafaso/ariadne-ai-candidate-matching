from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env(primary: str, legacy: str | None, default: str) -> str:
    value = os.getenv(primary)
    if value is not None:
        return value
    if legacy:
        legacy_value = os.getenv(legacy)
        if legacy_value is not None:
            return legacy_value
    return default


ENRICHED_DATASET_NAME = "ARIADNE_candidate_profiles_20k_enriched.parquet"
LEGACY_DATASET_NAME = "candidate_profiles_english_clean_20k_with_text.parquet"
ENRICHED_EMBEDDINGS_NAME = "ariadne_jina_v5_enriched_embeddings_20k.npy"
APP_ROOT = Path(__file__).resolve().parents[2]


def _has_required_assets(root: Path) -> bool:
    has_dataset = any(
        path.is_file()
        for path in (
            APP_ROOT / "data" / ENRICHED_DATASET_NAME,
            root / "data" / ENRICHED_DATASET_NAME,
            APP_ROOT / "data" / LEGACY_DATASET_NAME,
            root / "data" / LEGACY_DATASET_NAME,
        )
    )
    return has_dataset and (root / "embeddings" / ENRICHED_EMBEDDINGS_NAME).is_file()


def _resolve_dataset_path(root: Path) -> Path:
    explicit = os.getenv("ARIADNE_DATASET_PATH")
    if explicit:
        path = Path(explicit).expanduser().resolve()
        if not path.is_file():
            raise FileNotFoundError(f"ARIADNE_DATASET_PATH does not exist: {path}")
        return path

    # Prefer the enriched dataset bundled with the ARIADNE app, then an enriched
    # dataset in the thesis repository. Legacy data remains a compatibility fallback.
    for candidate in (
        APP_ROOT / "data" / ENRICHED_DATASET_NAME,
        root / "data" / ENRICHED_DATASET_NAME,
        APP_ROOT / "data" / LEGACY_DATASET_NAME,
        root / "data" / LEGACY_DATASET_NAME,
    ):
        if candidate.is_file():
            return candidate

    raise FileNotFoundError(
        "ARIADNE candidate dataset not found. Expected one of:\n"
        f"  data/{ENRICHED_DATASET_NAME}\n"
        f"  data/{LEGACY_DATASET_NAME}"
    )


def find_project_root() -> Path:
    explicit = os.getenv("ARIADNE_PROJECT_ROOT") or os.getenv("HERMES_PROJECT_ROOT")
    if explicit:
        root = Path(explicit).expanduser().resolve()
        if not _has_required_assets(root):
            raise FileNotFoundError(
                "ARIADNE_PROJECT_ROOT does not contain the expected data/ and embeddings/ files: "
                f"{root}"
            )
        return root

    here = Path(__file__).resolve()
    candidates = list(here.parents) + [Path.cwd().resolve(), *Path.cwd().resolve().parents]
    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if _has_required_assets(candidate):
            return candidate

    raise FileNotFoundError(
        "ARIADNE could not find the thesis repository root. Put the ARIADNE folder next to "
        "data/ and embeddings/, or set ARIADNE_PROJECT_ROOT. Expected files:\n"
        f"  data/{ENRICHED_DATASET_NAME} (preferred) or data/{LEGACY_DATASET_NAME}\n"
        f"  embeddings/{ENRICHED_EMBEDDINGS_NAME}"
    )


PROJECT_ROOT = find_project_root()


@dataclass(frozen=True)
class Settings:
    project_root: Path = PROJECT_ROOT
    dataset_path: Path = _resolve_dataset_path(PROJECT_ROOT)
    jina_embeddings_path: Path = PROJECT_ROOT / "embeddings" / ENRICHED_EMBEDDINGS_NAME

    jina_model_name: str = "jinaai/jina-embeddings-v5-text-small"
    jina_reranker_model_name: str = "jinaai/jina-reranker-v1-tiny-en"

    # Quick Search. ARIADNE_* names are preferred; legacy HERMES_* aliases remain
    # accepted so existing local launch commands keep working.
    retrieval_pool: int = int(_env("ARIADNE_RETRIEVAL_POOL", "HERMES_RETRIEVAL_POOL", "50"))
    rrf_k: int = int(_env("ARIADNE_RRF_K", "HERMES_RRF_K", "60"))
    cutoff_score_floor: float = float(_env("ARIADNE_CUTOFF_SCORE_FLOOR", "HERMES_CUTOFF_SCORE_FLOOR", "0.45"))
    cutoff_elbow_drop: float = float(_env("ARIADNE_CUTOFF_ELBOW_DROP", "HERMES_CUTOFF_ELBOW_DROP", "0.30"))
    adaptive_buffer: int = 0

    bm25_k1: float = float(_env("ARIADNE_BM25_K1", "HERMES_BM25_K1", "1.5"))
    bm25_b: float = float(_env("ARIADNE_BM25_B", "HERMES_BM25_B", "0.60"))
    bm25_delta: float = float(_env("ARIADNE_BM25_DELTA", "HERMES_BM25_DELTA", "1.0"))

    jina_query_max_length: int = int(_env("ARIADNE_JINA_QUERY_MAX_LENGTH", "HERMES_JINA_QUERY_MAX_LENGTH", "512"))
    jina_device: str = _env("ARIADNE_JINA_DEVICE", "HERMES_JINA_DEVICE", "cpu")

    jina_reranker_max_length: int = int(_env("ARIADNE_JINA_RERANKER_MAX_LENGTH", "HERMES_JINA_RERANKER_MAX_LENGTH", "2048"))
    jina_reranker_batch_size: int = int(_env("ARIADNE_JINA_RERANKER_BATCH_SIZE", "HERMES_JINA_RERANKER_BATCH_SIZE", "4"))
    jina_reranker_device: str = _env("ARIADNE_JINA_RERANKER_DEVICE", "HERMES_JINA_RERANKER_DEVICE", "cpu")

    # Advanced Match.
    advanced_prescreen_pool: int = int(os.getenv("ARIADNE_ADVANCED_PRESCREEN_POOL", "6000"))
    advanced_retrieval_pool: int = int(os.getenv("ARIADNE_ADVANCED_RETRIEVAL_POOL", "50"))
    advanced_llm_max_chars: int = int(os.getenv("ARIADNE_ADVANCED_LLM_MAX_CHARS", "12000"))

    ollama_base_url: str = os.getenv("ARIADNE_OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    ollama_model_name: str = os.getenv("ARIADNE_OLLAMA_MODEL", "ministral-3:3b")
    ollama_timeout_seconds: int = int(os.getenv("ARIADNE_OLLAMA_TIMEOUT_SECONDS", "180"))
    ollama_num_ctx: int = int(os.getenv("ARIADNE_OLLAMA_NUM_CTX", "4096"))
    ollama_num_predict: int = int(os.getenv("ARIADNE_OLLAMA_NUM_PREDICT", "1200"))


settings = Settings()
