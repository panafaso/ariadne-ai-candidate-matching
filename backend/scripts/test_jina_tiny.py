from pathlib import Path
import time

import pandas as pd
import torch
from sentence_transformers import CrossEncoder

HERE = Path(__file__).resolve()
ENRICHED = "ARIADNE_candidate_profiles_20k_enriched.parquet"
LEGACY = "candidate_profiles_english_clean_20k_with_text.parquet"
PROJECT_ROOT = next(
    p for p in HERE.parents
    if (p / "data" / ENRICHED).is_file() or (p / "data" / LEGACY).is_file()
)
DATASET_PATH = (PROJECT_ROOT / "data" / ENRICHED) if (PROJECT_ROOT / "data" / ENRICHED).is_file() else (PROJECT_ROOT / "data" / LEGACY)
MODEL_NAME = "jinaai/jina-reranker-v1-tiny-en"
TOP_K = 50
MAX_LENGTH = 2048
BATCH_SIZE = 4
QUERY = "Cybersecurity analyst with SIEM, incident response, network security and risk management"

print("Loading dataset...")
df = pd.read_parquet(DATASET_PATH)
texts = df["candidate_text"].fillna("").astype(str).head(TOP_K).tolist()

print("Loading model...")
t0 = time.perf_counter()
model = CrossEncoder(MODEL_NAME, trust_remote_code=True, device="cpu", max_length=MAX_LENGTH)
print(f"Model loading: {time.perf_counter() - t0:.2f} sec")

pairs = [(QUERY, text) for text in texts]
times = []
for run in range(1, 4):
    t0 = time.perf_counter()
    model.predict(pairs, batch_size=BATCH_SIZE, show_progress_bar=False, activation_fn=torch.nn.Identity())
    elapsed = time.perf_counter() - t0
    times.append(elapsed)
    print(f"Run {run}: {elapsed:.3f} sec")
print(f"Warm average: {sum(times[1:]) / 2:.3f} sec / 50 CVs")
