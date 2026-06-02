#!/usr/bin/env python3
"""CONTENT-GATE v1 — legal/copy pre-flight scanner.

Deterministic, stdlib-only static checks on a content card's *copy* text
(the 6-slide carousel copy, exported from the Notion card body).

This is the AUTOMATED half of the LEGAL/COPY gate. It does NOT make the
final legal decision — junwon is the gatekeeper. It emits a structured JSON
report on stdout; any BLOCK finding hard-fails (exit 1) to force
ESCALATE_TO_HUMAN per pipeline/templates/content-gate-criteria.yaml.

Rules enforced (see .claude/rules/domain/content-legal.md):
  CL-NAME-CTA   celebrity name must NOT appear in the CTA slide headline /
                button / sub / eyebrow. The legal disclaimer line IS allowed
                to name the celebrity (non-affiliation), so disclaimer lines
                are excluded from this scan.
  CL-FTC-GUAR   no medical / result guarantee phrasing (FTC).
  CL-DISC       non-affiliation + not-medical-advice disclaimer present.
  CL-ENGINE     no over-promise beyond calorie / macro / taste rescale
                (no fiber-gram / ramp / persona promises).

Convention: the CTA slide must be delimited by a heading line containing
"S6" or "CTA" (e.g. "### S6 · CTA — STATE A"). The region runs to the next
top-level "## " heading or "---" divider.

Usage:
  content-legal-scan.py <copy.md> --celeb "Cameron Diaz" [--health-claim]
Exit: 0 = no BLOCK findings, 1 = >=1 BLOCK finding, 2 = bad input.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# ── rule patterns ────────────────────────────────────────────────────
# FTC: result / medical guarantee phrasing. Editorial "associated with" is
# fine; these are the absolute prohibitions (CL-FTC-GUAR).
GUARANTEE_PATTERNS: list[tuple[str, str]] = [
    (r"\bguarantee(s|d)?\b", "guarantee"),
    (r"\bclinically proven\b", "clinically proven"),
    (r"\bcure(s|d)?\b", "cure"),
    (r"\bmelt(s|ed)? (away )?fat\b", "melt fat"),
    (r"\blose \d+\s?(lb|lbs|pound|pounds|kg)\b", "lose N lbs"),
    (r"\breverse(s|d)? (aging|disease|diabetes)\b", "reverse aging/disease"),
    (r"\bdetox(es|ify|ifies)?\b", "detox"),
    (r"\bmiracle\b", "miracle"),
]

# Engine-honest: promise scoped to calorie / macro / taste rescale only.
# These are §5-named over-promises (CL-ENGINE).
OVERPROMISE_PATTERNS: list[tuple[str, str]] = [
    (r"\bgrams? of fiber\b", "fiber gram promise"),
    (r"\bfiber goal\b", "fiber goal promise"),
    (r"\bramp\b", "ramp promise"),
    (r"\bpersona(s)?\b", "persona promise"),  # \b end avoids "personalized"
]

# Product self-claims: concrete factual claims about OUR OWN product (onboarding
# length, plan size, feature counts) drift when the product changes. The
# onboarding deliberately removed its "N / 3" counter to stop this drift —
# marketing copy must not reintroduce a hard number. Flag for verification
# against the source of truth (apps/mobile onboarding / spec.md) or generic
# phrasing. (CL-PRODUCT-CLAIM)
PRODUCT_CLAIM_PATTERNS: list[tuple[str, str]] = [
    (r"\banswer\s+\d+\s+questions?\b", "onboarding question count"),
    (r"\b\d+\s+questions?\b", "question count"),
    (r"\b\d+[- ]?(day|week|step)s?\s+(plan|program|onboarding)\b", "plan/program length"),
]

# Negation guard: editorial copy legitimately *disclaims* guarantees
# ("isn't a guarantee", "no cure", "won't reverse"). Such negated mentions
# are FTC-safe and must NOT be flagged. Check a small window before the match.
NEGATION_TOKENS: tuple[str, ...] = (
    "isn't", "is not", "not a", "not an", "no ", "without", "never",
    "won't", "aren't", "n't a",
)


def _negated(text: str, start: int) -> bool:
    window = text[max(0, start - 24):start].lower().replace("’", "'")
    return any(tok in window for tok in NEGATION_TOKENS)

# Disclaimer detectors (CL-DISC).
AFFILIATION_RE = re.compile(
    r"not affiliated|no affiliation|not endorsed|not sponsored", re.IGNORECASE
)
MEDICAL_RE = re.compile(r"not medical advice|educational purposes", re.IGNORECASE)
DISCLAIMER_LINE_RE = re.compile(r"disclaimer", re.IGNORECASE)
CTA_HEADING_RE = re.compile(r"^#{1,6}\s.*\b(S6|CTA)\b", re.IGNORECASE)
SECTION_BREAK_RE = re.compile(r"^(##\s|---\s*$)")


def celeb_tokens(celeb: str) -> list[str]:
    """Full name + name tokens >= 4 chars (avoid false hits on short words)."""
    toks = {celeb.strip()}
    for t in celeb.split():
        if len(t) >= 4:
            toks.add(t)
    return [re.escape(t) for t in toks if t]


def find_cta_region(lines: list[str]) -> tuple[int, int] | None:
    start = None
    for i, line in enumerate(lines):
        if CTA_HEADING_RE.match(line):
            start = i
            break
    if start is None:
        return None
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if SECTION_BREAK_RE.match(lines[j]):
            end = j
            break
    return (start, end)


def is_disclaimer_line(line: str) -> bool:
    return bool(
        DISCLAIMER_LINE_RE.search(line)
        or AFFILIATION_RE.search(line)
        or MEDICAL_RE.search(line)
    )


def scan(text: str, celeb: str, health_claim: bool) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    lines = text.splitlines()

    # CL-NAME-CTA — celeb name inside the CTA slide (excluding disclaimer line).
    region = find_cta_region(lines)
    if region is None:
        findings.append(
            {
                "severity": "MEDIUM",
                "rule": "CL-NAME-CTA",
                "evidence": "CTA slide not found (expected a heading with 'S6' or "
                "'CTA'). Generic-CTA rule could not be auto-verified — review manually.",
            }
        )
    else:
        name_re = re.compile(r"\b(" + "|".join(celeb_tokens(celeb)) + r")\b", re.IGNORECASE)
        start, end = region
        for k in range(start, end):
            line = lines[k]
            if is_disclaimer_line(line):
                continue  # disclaimer MAY name the celebrity (non-affiliation)
            if name_re.search(line):
                findings.append(
                    {
                        "severity": "BLOCK",
                        "rule": "CL-NAME-CTA",
                        "evidence": f"L{k + 1}: celebrity name in CTA region "
                        f"(non-disclaimer): {line.strip()[:160]!r}",
                    }
                )

    # CL-FTC-GUAR — medical / result guarantee phrasing (negated mentions skipped).
    for pat, label in GUARANTEE_PATTERNS:
        for m in re.finditer(pat, text, re.IGNORECASE):
            if _negated(text, m.start()):
                continue  # e.g. "isn't a guarantee" / "no cure" — FTC-safe disclaimer
            ln = text.count("\n", 0, m.start()) + 1
            findings.append(
                {
                    "severity": "BLOCK",
                    "rule": "CL-FTC-GUAR",
                    "evidence": f"L{ln}: prohibited guarantee phrasing ({label}): "
                    f"{m.group(0)!r}",
                }
            )

    # CL-ENGINE — over-promise beyond calorie/macro/taste rescale.
    for pat, label in OVERPROMISE_PATTERNS:
        for m in re.finditer(pat, text, re.IGNORECASE):
            ln = text.count("\n", 0, m.start()) + 1
            findings.append(
                {
                    "severity": "HIGH",
                    "rule": "CL-ENGINE",
                    "evidence": f"L{ln}: over-promise beyond engine scope ({label}): "
                    f"{m.group(0)!r}",
                }
            )

    # CL-PRODUCT-CLAIM — hardcoded product self-claims that drift (dedupe overlaps).
    seen_spans: set[tuple[int, int]] = set()
    for pat, label in PRODUCT_CLAIM_PATTERNS:
        for m in re.finditer(pat, text, re.IGNORECASE):
            if any(s <= m.start() < e for s, e in seen_spans):
                continue  # already reported by a more specific pattern
            seen_spans.add((m.start(), m.end()))
            ln = text.count("\n", 0, m.start()) + 1
            findings.append(
                {
                    "severity": "MEDIUM",
                    "rule": "CL-PRODUCT-CLAIM",
                    "evidence": f"L{ln}: product self-claim ({label}) — verify vs "
                    f"onboarding flow / spec.md, or use drift-proof phrasing: "
                    f"{m.group(0)!r}",
                }
            )

    # CL-DISC — disclaimer presence.
    if not AFFILIATION_RE.search(text):
        findings.append(
            {
                "severity": "BLOCK",
                "rule": "CL-DISC",
                "evidence": "Missing non-affiliation disclaimer (e.g. 'not affiliated "
                "with, endorsed by, or sponsored by <celebrity>').",
            }
        )
    if health_claim and not MEDICAL_RE.search(text):
        findings.append(
            {
                "severity": "BLOCK",
                "rule": "CL-DISC",
                "evidence": "is_health_claim=true but no 'Not medical advice / "
                "educational purposes' disclaimer found.",
            }
        )

    return findings


def main() -> int:
    ap = argparse.ArgumentParser(description="CONTENT-GATE legal/copy scanner")
    ap.add_argument("copy_file", help="path to the 6-slide copy text/markdown")
    ap.add_argument("--celeb", required=True, help='celebrity name, e.g. "Cameron Diaz"')
    ap.add_argument("--health-claim", action="store_true", help="card is a health claim")
    args = ap.parse_args()

    path = Path(args.copy_file)
    if not path.exists():
        print(f"❌ copy file not found: {path}", file=sys.stderr)
        return 2
    text = path.read_text(encoding="utf-8")

    findings = scan(text, args.celeb, args.health_claim)
    blocks = [f for f in findings if f["severity"] == "BLOCK"]
    report = {
        "gate": "content_legal_copy",
        "artifact": str(path),
        "celeb": args.celeb,
        "status": "fail" if blocks else "pass",
        "block_count": len(blocks),
        "findings": findings,
        "note": "Advisory pre-flight only. junwon is the final legal gatekeeper. "
        "Any BLOCK/HIGH finding → ESCALATE_TO_HUMAN.",
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if blocks else 0


if __name__ == "__main__":
    sys.exit(main())
