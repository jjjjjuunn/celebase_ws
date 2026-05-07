"""Tests for engine/plan_naming.derive_plan_name.

Plan name vocab is a deterministic hash-based pick from a goal-specific pool,
so tests assert format + pool membership rather than fixed strings.
"""

from __future__ import annotations

from src.engine.plan_naming import derive_plan_name

_WEIGHT_LOSS_ADJ = ("lean", "clean", "fresh", "light")
_WEIGHT_LOSS_NOUN = ("cut", "reset", "shred")
_MUSCLE_GAIN_ADJ = ("power", "strong", "fueled", "bold")
_MUSCLE_GAIN_NOUN = ("build", "bulk", "stack")
_RECOMP_NOUN = ("recomp", "rebuild", "remix")
_MAINTENANCE_NOUN = ("flow", "rhythm", "groove")


def _split_celebrity(name: str) -> tuple[str, str]:
    head, _, tail = name.partition("'s ")
    return head, tail


def test_weight_loss_with_celebrity_uses_cut_pool() -> None:
    name = derive_plan_name("Natalie Portman", 3, "weight_loss", seed="abc")
    first, rest = _split_celebrity(name)
    assert first == "Natalie"
    assert rest.startswith("3-day ")
    flavor = rest[len("3-day ") :]
    adj, _, noun = flavor.partition(" ")
    assert adj in _WEIGHT_LOSS_ADJ
    assert noun in _WEIGHT_LOSS_NOUN


def test_muscle_gain_with_celebrity_uses_build_pool() -> None:
    name = derive_plan_name("Cristiano Ronaldo", 7, "muscle_gain", seed="xyz")
    first, rest = _split_celebrity(name)
    assert first == "Cristiano"
    assert rest.startswith("7-day ")
    adj, _, noun = rest[len("7-day ") :].partition(" ")
    assert adj in _MUSCLE_GAIN_ADJ
    assert noun in _MUSCLE_GAIN_NOUN


def test_recomposition_uses_recomp_pool() -> None:
    name = derive_plan_name("Selena Gomez", 5, "recomposition", seed="seed1")
    assert name.startswith("Selena's 5-day ")
    noun = name.rsplit(" ", 1)[-1]
    assert noun in _RECOMP_NOUN


def test_maintenance_uses_flow_pool() -> None:
    name = derive_plan_name("Selena Gomez", 5, "maintenance", seed="seed2")
    assert name.startswith("Selena's 5-day ")
    noun = name.rsplit(" ", 1)[-1]
    assert noun in _MAINTENANCE_NOUN


def test_unknown_goal_falls_back_to_default_vocab() -> None:
    assert derive_plan_name("Tom Brady", 4, "unknown") == "Tom's 4-day daily plan"


def test_none_goal_falls_back_to_default_vocab() -> None:
    assert derive_plan_name("Tom Brady", 4, None) == "Tom's 4-day daily plan"


def test_uses_first_name_only() -> None:
    name = derive_plan_name("Maria Del Carmen", 2, "weight_loss", seed="abc")
    assert name.startswith("Maria's 2-day ")


def test_single_name_celebrity() -> None:
    name = derive_plan_name("Madonna", 6, "muscle_gain", seed="abc")
    assert name.startswith("Madonna's 6-day ")


def test_missing_celebrity_omits_name() -> None:
    name = derive_plan_name(None, 3, "weight_loss", seed="abc")
    assert not name.startswith("'s")
    assert name.startswith("3-day ")
    adj, _, noun = name[len("3-day ") :].partition(" ")
    assert adj in _WEIGHT_LOSS_ADJ
    assert noun in _WEIGHT_LOSS_NOUN


def test_empty_celebrity_omits_name() -> None:
    name = derive_plan_name("   ", 3, "muscle_gain", seed="abc")
    assert name.startswith("3-day ")
    adj, _, noun = name[len("3-day ") :].partition(" ")
    assert adj in _MUSCLE_GAIN_ADJ
    assert noun in _MUSCLE_GAIN_NOUN


def test_case_insensitive_goal() -> None:
    upper = derive_plan_name("Natalie Portman", 3, "WEIGHT_LOSS", seed="seed3")
    lower = derive_plan_name("Natalie Portman", 3, "weight_loss", seed="seed3")
    assert upper == lower


def test_seed_is_deterministic() -> None:
    a = derive_plan_name("Natalie Portman", 3, "weight_loss", seed="plan-001")
    b = derive_plan_name("Natalie Portman", 3, "weight_loss", seed="plan-001")
    assert a == b


def test_different_seeds_can_yield_different_names() -> None:
    """Not strictly required, but smoke-checks that the vocab pool is exercised."""
    seeds = [f"seed-{i}" for i in range(20)]
    names = {
        derive_plan_name("Natalie Portman", 3, "weight_loss", seed=s) for s in seeds
    }
    assert len(names) > 1
