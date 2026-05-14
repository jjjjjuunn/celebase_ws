
from __future__ import annotations

import pytest

from src.engine.micronutrient_checker import (
    MIN_COMPLIANCE,
    RDA,
    check_micronutrients,
    check_weekly_avg,
)


def _scaled_totals(scale: float) -> dict[str, float]:
    return {key: value * scale for key, value in RDA.items()}


def test_all_18_compliant() -> None:
    totals = _scaled_totals(1.5)
    report = check_micronutrients(totals)
    assert report.compliant is True, report.deficient
    assert report.deficient == []


def test_vegan_b12_deficient() -> None:
    totals = _scaled_totals(1.5)
    totals["vitamin_b12_ug"] = 0.5
    report = check_micronutrients(totals)
    assert "vitamin_b12_ug" in report.deficient
    assert "Vitamin B12 supplement" in report.supplement_suggestions


def test_keto_fiber_folate_deficient() -> None:
    totals = _scaled_totals(1.5)
    totals["fiber_g"] = 5.0
    totals["folate_ug_dfe"] = 100.0
    report = check_micronutrients(totals)
    assert "fiber_g" in report.deficient
    assert "folate_ug_dfe" in report.deficient


def test_sex_iron_override() -> None:
    totals = _scaled_totals(1.5)
    totals["iron_mg"] = 10.0
    male_report = check_micronutrients(totals, sex="male")
    female_report = check_micronutrients(totals, sex="female")
    assert "iron_mg" not in male_report.deficient
    assert "iron_mg" in female_report.deficient


def test_sex_female_overrides_all() -> None:
    totals = _scaled_totals(1.2)
    totals.update(
        {
            "vitamin_a_ug_rae": 500.0,    # male 900*0.7=630 fail; female 700*0.7=490 OK
            "vitamin_c_mg": 60.0,         # male 90*0.7=63 fail; female 75*0.7=52.5 OK
            "vitamin_k_ug": 80.0,         # male 120*0.7=84 fail; female 90*0.7=63 OK
            "magnesium_mg": 250.0,        # male 420*0.7=294 fail; female 320*0.7=224 OK
            "zinc_mg": 6.0,               # male 11*0.7=7.7 fail; female 8*0.7=5.6 OK
            "omega3_g": 0.85,             # male 1.6*0.7=1.12 fail; female 1.1*0.7=0.77 OK
            "potassium_mg": 2200.0,       # male 3400*0.7=2380 fail; female 2600*0.7=1820 OK
        }
    )
    male_report = check_micronutrients(totals, sex="male")
    female_report = check_micronutrients(totals, sex="female")
    overrides = {
        "vitamin_a_ug_rae",
        "vitamin_c_mg",
        "vitamin_k_ug",
        "magnesium_mg",
        "zinc_mg",
        "omega3_g",
        "potassium_mg",
    }
    assert overrides.issubset(set(male_report.deficient)), f"male should fail all overrides: {male_report.deficient}"
    assert overrides.isdisjoint(set(female_report.deficient)), f"female should pass all overrides: {female_report.deficient}"


def test_sex_unisex_default_equals_male() -> None:
    """default sex='unisex' uses male baseline RDA (no overrides applied)."""
    totals = _scaled_totals(1.5)
    totals["iron_mg"] = 10.0  # male 8*0.7=5.6 OK; female 18*0.7=12.6 fail
    default_report = check_micronutrients(totals)
    male_report = check_micronutrients(totals, sex="male")
    assert default_report.deficient == male_report.deficient
    assert "iron_mg" not in default_report.deficient


def test_empty_totals_all_deficient() -> None:
    report = check_micronutrients({})
    assert report.compliant is False
    assert len(report.deficient) == len(RDA)
    assert len(report.supplement_suggestions) == len(RDA)


def test_weekly_avg_delegates() -> None:
    daily = _scaled_totals(1.5)
    weekly = [daily] * 7
    report = check_weekly_avg(weekly)
    assert report.compliant is True
    assert report.deficient == []


def test_weekly_avg_empty() -> None:
    report = check_weekly_avg([])
    assert report.compliant is False
    assert len(report.deficient) == len(RDA)


@pytest.mark.parametrize(
    ("scale", "expected"),
    [
        (MIN_COMPLIANCE - 0.01, False),  # 0.69 → deficient
        (MIN_COMPLIANCE + 0.01, True),   # 0.71 → compliant (부동소수 trap 회피: 1.6 * 0.7 = 1.1199... < 0.70)
    ],
)
def test_boundary_70_percent(scale: float, expected: bool) -> None:
    totals = {key: value * scale for key, value in RDA.items()}
    report = check_micronutrients(totals)
    assert report.compliant is expected, f"scale={scale} expected={expected}, got deficient={report.deficient}"
