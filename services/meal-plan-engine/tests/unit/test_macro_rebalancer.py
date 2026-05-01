"""Macro rebalancer GLP-1 protein force tests (IMPL-AI-002 Phase 1.1).

Covers ai-engine.md §3 "GLP-1 모드: 단백질 최소 체중 x 2.0g 강제" plus
boundary cases identified in IMPL-AI-002 plan v0.3 (Codex MEDIUM delta review).
"""

from __future__ import annotations

import pytest

from src.engine.macro_rebalancer import rebalance_macros


# ---------------------------------------------------------------------------
# Core GLP-1 force (4 base tests)
# ---------------------------------------------------------------------------


def test_glp1_force_protein_2g_per_kg() -> None:
    macros = rebalance_macros(
        target_kcal=2200,
        weight_kg=60.0,
        activity_level="sedentary",
        primary_goal="maintenance",
        fat_ratio=0.30,
        medications=["glp1"],
    )
    assert macros["protein_g"] >= 120.0, macros


def test_glp1_preserves_total_calorie_clamp() -> None:
    """Protein bump must not push macros outside calorie envelope."""
    macros = rebalance_macros(
        target_kcal=1800,
        weight_kg=80.0,
        activity_level="moderate",
        primary_goal="weight_loss",
        fat_ratio=0.30,
        medications=["semaglutide"],
    )
    kcal_sum = (
        macros["protein_g"] * 4 + macros["fat_g"] * 9 + macros["carb_g"] * 4
    )
    # Allow ±5% drift from rounding; ai-engine.md §1 hard floor 1200.
    assert 1700 <= kcal_sum <= 1900, kcal_sum
    assert macros["protein_g"] >= 160.0, macros  # 80kg × 2.0


def test_glp1_fat_carb_redistribute_non_negative() -> None:
    macros = rebalance_macros(
        target_kcal=2500,
        weight_kg=70.0,
        activity_level="moderate",
        primary_goal="maintenance",
        fat_ratio=0.35,
        medications=["ozempic"],
    )
    assert macros["fat_g"] >= 0.0, macros
    assert macros["carb_g"] >= 0.0, macros
    assert macros["protein_g"] >= 140.0, macros


def test_glp1_does_not_alter_allergen_filter_path() -> None:
    """macro_rebalancer must not emit any allergen-related keys regardless of GLP-1 branch."""
    base = rebalance_macros(
        target_kcal=2200,
        weight_kg=60.0,
        activity_level="moderate",
        primary_goal="maintenance",
        fat_ratio=0.30,
    )
    glp1 = rebalance_macros(
        target_kcal=2200,
        weight_kg=60.0,
        activity_level="moderate",
        primary_goal="maintenance",
        fat_ratio=0.30,
        medications=["glp1"],
    )
    expected_keys = {"protein_g", "fat_g", "carb_g", "protein_multiplier"}
    assert set(base.keys()) == expected_keys
    assert set(glp1.keys()) == expected_keys
    # Protein must increase (or stay equal) under GLP-1 branch.
    assert glp1["protein_g"] >= base["protein_g"]


# ---------------------------------------------------------------------------
# Boundary tests (4 v0.3 additions)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad_weight", [0.0, -0.01, -50.0])
def test_glp1_rejects_zero_or_negative_weight(bad_weight: float) -> None:
    with pytest.raises(ValueError):
        rebalance_macros(
            target_kcal=2000,
            weight_kg=bad_weight,
            activity_level="moderate",
            primary_goal="maintenance",
            fat_ratio=0.30,
            medications=["glp1"],
        )


def test_glp1_with_concurrent_medications() -> None:
    """metformin alongside glp1 must not double-rebalance — single force only."""
    only_glp1 = rebalance_macros(
        target_kcal=2200,
        weight_kg=60.0,
        activity_level="moderate",
        primary_goal="maintenance",
        fat_ratio=0.30,
        medications=["glp1"],
    )
    concurrent = rebalance_macros(
        target_kcal=2200,
        weight_kg=60.0,
        activity_level="moderate",
        primary_goal="maintenance",
        fat_ratio=0.30,
        medications=["glp1", "metformin"],
    )
    assert concurrent["protein_g"] == only_glp1["protein_g"]
    assert concurrent["protein_multiplier"] == only_glp1["protein_multiplier"]


def test_glp1_high_bmi_protein_cap() -> None:
    """Excessive target_kcal is clamped to NUTRITION_BOUNDS max (5000)."""
    macros = rebalance_macros(
        target_kcal=8000,  # outside max
        weight_kg=150.0,  # BMI > 50 case
        activity_level="moderate",
        primary_goal="maintenance",
        fat_ratio=0.30,
        medications=["mounjaro"],
    )
    kcal_sum = (
        macros["protein_g"] * 4 + macros["fat_g"] * 9 + macros["carb_g"] * 4
    )
    # Cap is 5000 ± rounding band.
    assert 4900 <= kcal_sum <= 5100, kcal_sum
    # protein_multiplier must respect upper PROTEIN_BOUNDS (3.0 g/kg) ceiling.
    assert macros["protein_multiplier"] <= 3.0


def test_glp1_lbs_to_kg_conversion_boundary() -> None:
    """132 lbs ≈ 59.87 kg → ≥ 119 g protein under GLP-1 force."""
    macros = rebalance_macros(
        target_kcal=2200,
        weight_kg=132.0,
        weight_unit="lbs",
        activity_level="sedentary",
        primary_goal="maintenance",
        fat_ratio=0.30,
        medications=["glp1"],
    )
    # 132 lbs * 0.45359237 ≈ 59.87 kg → 2.0 g/kg ≈ 119.7 g
    assert 119.0 <= macros["protein_g"] <= 121.0, macros
