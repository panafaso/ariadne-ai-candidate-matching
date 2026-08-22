from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sentence_transformers import SentenceTransformer


PROJECT_ROOT = Path(__file__).resolve().parent.parent

DATA_PATH = (
    PROJECT_ROOT
    / "data"
    / "ARIADNE_candidate_profiles_20k_enriched.parquet"
)

OUTPUT_PATH = (
    PROJECT_ROOT
    / "embeddings"
    / "ariadne_jina_v5_enriched_embeddings_20k.npy"
)

MODEL_NAME = "jinaai/jina-embeddings-v5-text-small"

EXPECTED_ROWS = 20_000

MAX_SEQ_LENGTH = 3072

BATCH_SIZE = 1

TOKEN_AUDIT_BATCH_SIZE = 256

# ARIADNE safety: never generate embeddings from truncated candidate text.
FAIL_ON_TRUNCATION = True


def clean_enrichment_value(value) -> str:
    """Convert an enrichment field to clean text without adding IDs/indexes."""

    if value is None:
        return ""

    if isinstance(value, (list, tuple, set, np.ndarray)):
        parts = [
            str(item).strip()
            for item in value
            if item is not None and str(item).strip()
        ]
        return "; ".join(parts)

    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass

    value = str(value).strip()

    if value.casefold() in {"", "nan", "none", "<na>"}:
        return ""

    return value


def load_candidate_texts() -> list[str]:
    """
    Build the ARIADNE enriched retrieval representation.

    Base:
      - existing candidate_text

    Added only for ARIADNE retrieval:
      - professional_domains
      - esco_skills

    Explicitly NOT embedded:
      - id
      - index
      - __index_level_0__
      - candidate_id
      - dataset_index
    """

    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Dataset not found:\n{DATA_PATH}"
        )

    df = pd.read_parquet(DATA_PATH)

    print("Dataset:", DATA_PATH)
    print("Dataset shape:", df.shape)

    if len(df) != EXPECTED_ROWS:
        raise ValueError(
            f"Expected {EXPECTED_ROWS:,} rows, "
            f"but found {len(df):,}."
        )

    required_columns = {
        "candidate_text",
        "professional_domains",
        "esco_skills",
    }

    missing_columns = required_columns - set(df.columns)

    if missing_columns:
        raise ValueError(
            "The enriched ARIADNE dataset is missing required columns: "
            f"{sorted(missing_columns)}"
        )

    texts: list[str] = []

    empty_base_indices: list[int] = []
    domains_added = 0
    esco_added = 0

    for index, row in df.iterrows():
        base_text = clean_enrichment_value(
            row["candidate_text"]
        )

        if not base_text:
            empty_base_indices.append(int(index))
            continue

        professional_domains = clean_enrichment_value(
            row["professional_domains"]
        )

        esco_skills = clean_enrichment_value(
            row["esco_skills"]
        )

        sections = [base_text]

        if professional_domains:
            sections.append(
                "Professional Domains: "
                + professional_domains
            )
            domains_added += 1

        if esco_skills:
            sections.append(
                "ESCO Skills: "
                + esco_skills
            )
            esco_added += 1

        retrieval_text = "\n".join(sections).strip()
        texts.append(retrieval_text)

    if empty_base_indices:
        raise ValueError(
            f"Found {len(empty_base_indices)} empty candidate_text values. "
            f"First affected indices: {empty_base_indices[:10]}"
        )

    if len(texts) != EXPECTED_ROWS:
        raise ValueError(
            "Built retrieval-text count does not match dataset row count. "
            f"Texts: {len(texts):,}; dataset rows: {len(df):,}."
        )

    print(
        "Professional Domains added:",
        f"{domains_added:,}/{len(df):,}",
    )
    print(
        "ESCO Skills added:",
        f"{esco_added:,}/{len(df):,}",
    )

    print("\nExample enriched retrieval text (dataset row 0):")
    print("-" * 80)
    print(texts[0][:3000])
    print("-" * 80)

    return texts


def audit_token_lengths(
    model: SentenceTransformer,
    texts: list[str],
) -> list[int]:
    """
    Measure input lengths without truncation.

    This verifies how many enriched retrieval texts exceed the selected
    MAX_SEQ_LENGTH before embedding generation begins.
    """

    tokenizer = model.tokenizer
    token_lengths: list[int] = []

    print("\nMeasuring Jina v5 small token lengths...")

    for start in range(
        0,
        len(texts),
        TOKEN_AUDIT_BATCH_SIZE,
    ):
        batch = texts[
            start : start + TOKEN_AUDIT_BATCH_SIZE
        ]

        encoded = tokenizer(
            batch,
            add_special_tokens=True,
            truncation=False,
            padding=False,
            return_attention_mask=False,
            return_token_type_ids=False,
        )

        token_lengths.extend(
            len(input_ids)
            for input_ids in encoded["input_ids"]
        )

        completed = min(
            start + TOKEN_AUDIT_BATCH_SIZE,
            len(texts),
        )

        print(
            f"\rAudited {completed:,}/{len(texts):,} candidates",
            end="",
            flush=True,
        )

    print()

    if len(token_lengths) != len(texts):
        raise ValueError(
            "Token-length count does not match the number of candidates."
        )

    return token_lengths


def print_token_statistics(
    token_lengths: list[int],
) -> None:
    """Print truncation statistics for the selected context length."""

    lengths = np.asarray(
        token_lengths,
        dtype=np.int32,
    )

    over_limit = lengths > MAX_SEQ_LENGTH
    over_limit_count = int(over_limit.sum())

    print("\n" + "=" * 80)
    print("TOKEN-LENGTH AUDIT")
    print("=" * 80)
    print("Minimum tokens:", int(lengths.min()))
    print("Mean tokens:", f"{lengths.mean():.2f}")
    print("Median tokens:", int(np.median(lengths)))
    print("95th percentile:", int(np.percentile(lengths, 95)))
    print("99th percentile:", int(np.percentile(lengths, 99)))
    print("Maximum tokens:", int(lengths.max()))

    print(
        f"Candidates over {MAX_SEQ_LENGTH} tokens:",
        f"{over_limit_count:,}/{len(lengths):,}",
        f"({100 * over_limit_count / len(lengths):.4f}%)",
    )

    if over_limit_count == 0:
        print(
            f"All candidate retrieval texts fit within the selected "
            f"{MAX_SEQ_LENGTH}-token limit."
        )
    else:
        longest_indices = np.argsort(lengths)[::-1][:10]

        print("\nLongest candidate indices:")
        for index in longest_indices:
            print(
                f"  Dataset index {int(index)}: "
                f"{int(lengths[index])} tokens"
            )

        print(
            "\nWARNING: some enriched candidate texts exceed the configured "
            f"{MAX_SEQ_LENGTH}-token limit."
        )

        if FAIL_ON_TRUNCATION:
            raise ValueError(
                "Embedding generation stopped to prevent truncation. "
                f"{over_limit_count:,} candidate retrieval texts exceed "
                f"{MAX_SEQ_LENGTH} tokens. Increase MAX_SEQ_LENGTH and rerun "
                "so the complete enriched text is embedded."
            )

    print("=" * 80)


def main() -> None:
    start_time = time.perf_counter()

    OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    if OUTPUT_PATH.exists():
        raise FileExistsError(
            "The target embedding file already exists:\n"
            f"{OUTPUT_PATH}\n\n"
            "Rename or remove it before rerunning the script. "
            "This safeguard prevents accidental overwriting."
        )

    texts = load_candidate_texts()

    device = (
        "cuda"
        if torch.cuda.is_available()
        else "cpu"
    )

    print("\n" + "=" * 80)
    print("CREATING ARIADNE JINA V5 ENRICHED RETRIEVAL EMBEDDINGS")
    print("=" * 80)
    print("Model:", MODEL_NAME)
    print("Device:", device)
    print("Documents:", len(texts))
    print("Embedding batch size:", BATCH_SIZE)
    print("Requested maximum sequence length:", MAX_SEQ_LENGTH)
    print("Output:", OUTPUT_PATH)

    if device == "cuda":
        print("GPU:", torch.cuda.get_device_name(0))
        print("CUDA version:", torch.version.cuda)

        total_vram = (
            torch.cuda.get_device_properties(0).total_memory
            / 1024**3
        )
        print(f"Total GPU VRAM: {total_vram:.2f} GB")

    print("=" * 80)

    model_kwargs = {}
    if device == "cuda":

        model_kwargs["dtype"] = torch.bfloat16

    model = SentenceTransformer(
        MODEL_NAME,
        trust_remote_code=True,
        device=device,
        model_kwargs=model_kwargs,
    )

    original_max_seq_length = model.max_seq_length

    print(
        "\nOriginal SentenceTransformer max sequence length:",
        original_max_seq_length,
    )

    model.max_seq_length = MAX_SEQ_LENGTH

    print(
        "Effective max sequence length:",
        model.max_seq_length,
    )

    if model.max_seq_length != MAX_SEQ_LENGTH:
        raise ValueError(
            "The effective model sequence length does not match "
            f"the requested value. Requested: {MAX_SEQ_LENGTH}, "
            f"effective: {model.max_seq_length}."
        )

    token_lengths = audit_token_lengths(
        model=model,
        texts=texts,
    )

    print_token_statistics(token_lengths)

    print("\nStarting embedding generation...")

    try:
        with torch.inference_mode():
            embeddings = model.encode(
                sentences=texts,
                task="retrieval",
                prompt_name="document",
                batch_size=BATCH_SIZE,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=True,
            )

    except torch.cuda.OutOfMemoryError as error:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        raise RuntimeError(
            "\nCUDA ran out of memory while creating embeddings.\n"
            "Current configuration:\n"
            f"  MAX_SEQ_LENGTH = {MAX_SEQ_LENGTH}\n"
            f"  BATCH_SIZE = {BATCH_SIZE}\n\n"
            "Try one of:\n"
            "  1. Set BATCH_SIZE = 1\n"
            "  2. Set MAX_SEQ_LENGTH = 1536\n"
            "  3. Close other GPU applications and rerun.\n"
        ) from error

    embeddings = np.asarray(
        embeddings,
        dtype=np.float32,
    )

    if embeddings.ndim != 2:
        raise ValueError(
            "Expected a two-dimensional embeddings array, "
            f"but received shape {embeddings.shape}."
        )

    if embeddings.shape[0] != EXPECTED_ROWS:
        raise ValueError(
            "Embedding count does not match dataset row count. "
            f"Embeddings: {embeddings.shape[0]:,}, "
            f"dataset rows: {EXPECTED_ROWS:,}."
        )

    if not np.isfinite(embeddings).all():
        raise ValueError(
            "The embeddings contain NaN or infinite values."
        )
    vector_norms = np.linalg.norm(
        embeddings,
        axis=1,
    )

    if not np.allclose(
        vector_norms,
        1.0,
        atol=5e-3,
        rtol=0.0,
    ):
        raise ValueError(
            "Some embeddings are outside the expected normalized range. "
            f"Minimum norm: {vector_norms.min():.6f}, "
            f"maximum norm: {vector_norms.max():.6f}."
        )

    np.save(
        OUTPUT_PATH,
        embeddings,
    )

    # Reload the saved file to verify that it was written correctly.
    saved_embeddings = np.load(
        OUTPUT_PATH,
        mmap_mode="r",
    )

    if saved_embeddings.shape != embeddings.shape:
        raise ValueError(
            "Saved embedding shape does not match the generated "
            f"embedding shape. Saved: {saved_embeddings.shape}, "
            f"generated: {embeddings.shape}."
        )

    elapsed = time.perf_counter() - start_time

    print("\n" + "=" * 80)
    print("ARIADNE JINA V5 ENRICHED RETRIEVAL EMBEDDINGS COMPLETED")
    print("=" * 80)
    print("Shape:", embeddings.shape)
    print("Data type:", embeddings.dtype)
    print(
        "Minimum vector norm:",
        f"{vector_norms.min():.6f}",
    )
    print(
        "Maximum vector norm:",
        f"{vector_norms.max():.6f}",
    )
    print("Saved to:", OUTPUT_PATH)
    print(f"Elapsed time: {elapsed / 60:.2f} minutes")
    print("=" * 80)


if __name__ == "__main__":
    main()