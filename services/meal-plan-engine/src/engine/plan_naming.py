"""Plan name derivation — celebrity inspiration + user personalization.

Format: "{first_name}'s {duration}-day {adjective} {noun}"
Examples:
- "Natalie's 3-day clean cut"      (Natalie Portman, weight_loss, 3 days)
- "Cristiano's 7-day power build"  (Cristiano Ronaldo, muscle_gain, 7 days)
- "Selena's 5-day steady flow"     (Selena Gomez, maintenance, 5 days)
- "3-day lean reset"               (no celebrity, weight_loss)

Adjective + noun are picked deterministically from a goal-specific vocab pool
using a stable seed (plan_id by default), so the same plan always renders the
same name.
"""

from __future__ import annotations

import hashlib

__all__ = ["derive_plan_name"]

# goal → (adjective_pool, noun_pool)
_GOAL_VOCAB: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "weight_loss":   (("lean", "clean", "fresh", "light"), ("cut", "reset", "shred")),
    "muscle_gain":   (("power", "strong", "fueled", "bold"), ("build", "bulk", "stack")),
    "recomposition": (("balanced", "smart", "tuned"), ("recomp", "rebuild", "remix")),
    "maintenance":   (("steady", "easy", "everyday"), ("flow", "rhythm", "groove")),
}
_DEFAULT_VOCAB: tuple[tuple[str, ...], tuple[str, ...]] = (
    ("daily",),
    ("plan",),
)


def _pick(seed: str, pool: tuple[str, ...]) -> str:
    if not pool:
        return ""
    digest = hashlib.sha1(seed.encode("utf-8")).digest()
    return pool[digest[0] % len(pool)]


def derive_plan_name(
    celebrity_display_name: str | None,
    duration_days: int,
    primary_goal: str | None,
    seed: str | None = None,
) -> str:
    """Build a personalized plan name combining celebrity + goal flavor.

    Falls back to "{duration}-day {flavor}" when celebrity data is missing.
    """
    adj_pool, noun_pool = _GOAL_VOCAB.get(
        (primary_goal or "").lower(), _DEFAULT_VOCAB
    )
    seed_value = seed or f"{celebrity_display_name or ''}|{duration_days}|{primary_goal or ''}"
    adjective = _pick(f"{seed_value}|adj", adj_pool)
    noun = _pick(f"{seed_value}|noun", noun_pool)
    flavor = " ".join(part for part in (adjective, noun) if part) or "plan"

    first_name_parts = (celebrity_display_name or "").strip().split()
    if not first_name_parts:
        return f"{duration_days}-day {flavor}"
    return f"{first_name_parts[0]}'s {duration_days}-day {flavor}"
