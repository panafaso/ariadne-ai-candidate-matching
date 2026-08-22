from __future__ import annotations

from dataclasses import dataclass
import numpy as np


@dataclass(frozen=True)
class AdaptiveCutoffResult:
    adaptive_k: int
    final_k: int
    largest_gap: float
    gap_after_rank: int
    cutoff_reason: str


def adaptive_k_score_floor_relative_gap(
    scores: list[float],
    *,
    score_floor: float = 0.45,
    elbow_drop: float = 0.30,
) -> AdaptiveCutoffResult:
    """Choose a query-adaptive cut-off from descending relevance scores.

    The scores passed here are expected to be normalized to [0, 1] and already
    sorted in descending reranker order.

    Two independent stopping rules are used:
      1. score floor: stop before the first score below ``score_floor``;
      2. strong elbow: stop before the first adjacent *relative* score drop
         greater than or equal to ``elbow_drop``.

    The earliest boundary wins. No safety buffer is added.
    """
    if not 0.0 <= score_floor <= 1.0:
        raise ValueError("score_floor must be between 0 and 1.")
    if not 0.0 <= elbow_drop <= 1.0:
        raise ValueError("elbow_drop must be between 0 and 1.")

    if not scores:
        return AdaptiveCutoffResult(0, 0, 0.0, 0, "empty")

    arr = np.asarray(scores, dtype=float)
    if np.any(~np.isfinite(arr)):
        raise ValueError("scores must contain only finite values.")
    if np.any(arr < 0.0) or np.any(arr > 1.0):
        raise ValueError("scores must be normalized to the [0, 1] range.")

    # Reranker output should already be sorted descending. This check prevents a
    # silent cut-off error if a caller passes an unsorted list in the future.
    if len(arr) > 1 and np.any(arr[:-1] < arr[1:]):
        raise ValueError("scores must be sorted in descending order.")

    # Score-floor boundary. Because the list is descending, every item after the
    # first score below the floor is also below the floor.
    below_floor = np.flatnonzero(arr < score_floor)
    floor_k = int(below_floor[0]) if below_floor.size else len(arr)

    if len(arr) == 1:
        final_k = 1 if arr[0] >= score_floor else 0
        reason = "all_scores_above_floor" if final_k == 1 else "score_floor"
        return AdaptiveCutoffResult(final_k, final_k, 0.0, 0, reason)

    # Relative drop between adjacent scores: (s_i - s_{i+1}) / s_i.
    # Scores are probabilities/relevance values in [0, 1], so this expresses the
    # drop as a fraction of the higher score (e.g. 0.70 -> 0.49 = 30%).
    denominators = np.maximum(arr[:-1], np.finfo(float).eps)
    relative_gaps = (arr[:-1] - arr[1:]) / denominators

    largest_gap_index = int(np.argmax(relative_gaps))
    largest_gap = float(relative_gaps[largest_gap_index])
    largest_gap_after_rank = largest_gap_index + 1

    qualifying = np.flatnonzero(relative_gaps >= elbow_drop)
    elbow_k = int(qualifying[0] + 1) if qualifying.size else len(arr)

    final_k = min(floor_k, elbow_k)

    if final_k == 0:
        reason = "score_floor"
    elif elbow_k < floor_k:
        reason = "relative_elbow"
    elif floor_k < elbow_k:
        reason = "score_floor"
    elif floor_k < len(arr):
        # Both rules point to the same boundary.
        reason = "score_floor+relative_elbow"
    elif elbow_k < len(arr):
        reason = "relative_elbow"
    else:
        reason = "no_cutoff_within_pool"

    return AdaptiveCutoffResult(
        adaptive_k=final_k,
        final_k=final_k,
        largest_gap=largest_gap,
        gap_after_rank=largest_gap_after_rank,
        cutoff_reason=reason,
    )
