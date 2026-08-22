import pytest

from app.services.adaptive_cutoff import adaptive_k_score_floor_relative_gap


def test_relative_elbow_cuts_before_large_drop():
    # 0.68 -> 0.46 is a 32.35% relative drop, so keep ranks 1..6.
    result = adaptive_k_score_floor_relative_gap(
        [0.91, 0.87, 0.82, 0.76, 0.71, 0.68, 0.46, 0.43],
        score_floor=0.45,
        elbow_drop=0.30,
    )
    assert result.final_k == 6
    assert result.adaptive_k == 6
    assert result.cutoff_reason == "relative_elbow"


def test_score_floor_is_used_when_no_strong_elbow_exists():
    result = adaptive_k_score_floor_relative_gap(
        [0.88, 0.82, 0.76, 0.70, 0.64, 0.58, 0.52, 0.47, 0.44],
        score_floor=0.45,
        elbow_drop=0.30,
    )
    assert result.final_k == 8
    assert result.cutoff_reason == "score_floor"


def test_exact_30_percent_drop_counts_as_elbow():
    result = adaptive_k_score_floor_relative_gap(
        [0.80, 0.56, 0.54, 0.50],
        score_floor=0.45,
        elbow_drop=0.30,
    )
    assert result.final_k == 1
    assert result.cutoff_reason == "relative_elbow"


def test_no_buffer_is_added():
    result = adaptive_k_score_floor_relative_gap(
        [0.90, 0.80, 0.70, 0.60, 0.50, 0.46, 0.44],
        score_floor=0.45,
        elbow_drop=0.30,
    )
    # No qualifying 30% elbow; 0.44 is below the 0.45 floor.
    # No +1/+2 candidates are added after the boundary.
    assert result.final_k == 6


def test_can_return_zero_when_every_score_is_below_floor():
    result = adaptive_k_score_floor_relative_gap(
        [0.44, 0.40, 0.35],
        score_floor=0.45,
        elbow_drop=0.30,
    )
    assert result.final_k == 0
    assert result.cutoff_reason == "score_floor"


def test_rejects_unsorted_scores():
    with pytest.raises(ValueError, match="descending"):
        adaptive_k_score_floor_relative_gap([0.8, 0.6, 0.7])
