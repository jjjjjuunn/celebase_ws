#!/usr/bin/env python3
"""IMPL-019 — Lifestyle claim seed validator.

spec.md §9.3 #7: allowlist-only. **HTTP 요청 절대 금지** (GET/HEAD 포함).
이 검증기는 URL 형식(regex) + 도메인 allowlist 매칭 + JSON Schema 만 수행한다.

CI `validate-schemas` job 에서 실행. 실패 시 머지 차단.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import jsonschema  # type: ignore[import-untyped]

# ────────────────────────────────────────────────────────────────────
# spec.md §9.3 #2 — URL allowlist (확장은 PR 로 명시적 승인)
# ────────────────────────────────────────────────────────────────────
ALLOWED_DOMAINS: frozenset[str] = frozenset(
    [
        "vogue.com",
        "elle.com",
        "harpersbazaar.com",
        "womenshealthmag.com",
        "allure.com",
        "people.com",
        "instyle.com",
        "glamour.com",
        "nytimes.com",
        "instagram.com",
        "youtube.com",
        "tiktok.com",
        "x.com",
    ]
)

# RFC 3986 subset — http/https 만 허용
URL_REGEX = re.compile(r"^https?://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$")

REPO_ROOT = Path(__file__).resolve().parent.parent
SEED_DIR = REPO_ROOT / "db" / "seeds" / "lifestyle-claims"
SCHEMA_PATH = SEED_DIR / "_schema.json"
CELEBRITY_DATA_DIR = REPO_ROOT / "db" / "seeds" / "data"


def domain_allowed(host: str) -> bool:
    """host 가 allowlist 도메인 또는 그 서브도메인이면 True."""
    host = host.lower().strip()
    if not host:
        return False
    for d in ALLOWED_DOMAINS:
        if host == d or host.endswith("." + d):
            return True
    return False


def validate_url(url: str, ctx: str, errors: list[str]) -> None:
    if not URL_REGEX.match(url):
        errors.append(f"{ctx}: URL regex 미매칭 ({url!r})")
        return
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        errors.append(f"{ctx}: scheme '{parsed.scheme}' 비허용 (http/https 만)")
        return
    if not parsed.hostname:
        errors.append(f"{ctx}: hostname 누락 ({url!r})")
        return
    if not domain_allowed(parsed.hostname):
        errors.append(
            f"{ctx}: 도메인 '{parsed.hostname}' 은 allowlist 외 (spec §9.3 #2)"
        )


def validate_html_safe(text: str | None, ctx: str, errors: list[str]) -> None:
    """§9.3 #1 — plain text only. '<' 포함 시 reject."""
    if text is None:
        return
    if "<" in text:
        errors.append(f"{ctx}: '<' 문자 포함 — HTML 태그 의심 (§9.3 #1)")


def validate_claim(
    claim: dict[str, Any], slug: str, idx: int, errors: list[str]
) -> None:
    ctx_base = f"{slug}[{idx}]"

    # §9.3 #1: plain text fields
    validate_html_safe(claim["headline"], f"{ctx_base}.headline", errors)
    validate_html_safe(claim.get("body"), f"{ctx_base}.body", errors)

    # §9.3 #2: URL allowlist
    p_url = claim.get("primary_source_url")
    if p_url is not None:
        validate_url(p_url, f"{ctx_base}.primary_source_url", errors)

    # §9.3 #5: trust_grade published gate
    status = claim["status"]
    grade = claim["trust_grade"]
    if status == "published":
        if grade == "E":
            errors.append(f"{ctx_base}: trust_grade='E' 는 published 금지 (§9.3 #5)")
        if grade == "D" and not claim.get("disclaimer_key"):
            errors.append(
                f"{ctx_base}: trust_grade='D' published 는 disclaimer_key NOT NULL 필수 (§9.3 #5)"
            )

    # §3.5.3 DDL — primary source 한 claim 당 최대 1
    sources = claim["sources"]
    primary_count = sum(1 for s in sources if s["is_primary"])
    if primary_count > 1:
        errors.append(
            f"{ctx_base}: is_primary=true 가 {primary_count}개 — 한 claim 당 최대 1개 (uq_claim_sources_primary)"
        )

    for s_idx, source in enumerate(sources):
        s_ctx = f"{ctx_base}.sources[{s_idx}]"
        validate_html_safe(source.get("excerpt"), f"{s_ctx}.excerpt", errors)
        s_url = source.get("url")
        if s_url is not None:
            validate_url(s_url, f"{s_ctx}.url", errors)
        # primary source 면 url 사실상 필수 (FE 렌더 결정성)
        if source["is_primary"] and not s_url:
            errors.append(f"{s_ctx}: is_primary=true 인 source 는 url 필수")


def validate_seed_file(path: Path, schema: dict[str, Any], errors: list[str]) -> None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        errors.append(f"{path.name}: JSON 파싱 실패 — {e}")
        return

    # JSON Schema
    try:
        jsonschema.validate(data, schema)
    except jsonschema.ValidationError as e:
        errors.append(
            f"{path.name}: schema 위반 — {e.message} @ {list(e.absolute_path)}"
        )
        return

    slug = data["celebrity_slug"]

    # 셀럽 존재 검증 — db/seeds/data/<slug>.json 매칭
    celeb_path = CELEBRITY_DATA_DIR / f"{slug}.json"
    if not celeb_path.exists():
        errors.append(
            f"{path.name}: celebrity_slug='{slug}' 에 해당하는 {celeb_path.relative_to(REPO_ROOT)} 없음"
        )

    # 파일명 = slug.json 강제 (loader 단순화 + 중복 방지)
    if path.stem != slug:
        errors.append(
            f"{path.name}: 파일명 stem 과 celebrity_slug 불일치 ('{path.stem}' vs '{slug}')"
        )

    for idx, claim in enumerate(data["claims"]):
        validate_claim(claim, slug, idx, errors)


def main() -> int:
    if not SCHEMA_PATH.exists():
        print(f"❌ schema 누락: {SCHEMA_PATH}", file=sys.stderr)
        return 2
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))

    seed_files = sorted(p for p in SEED_DIR.glob("*.json") if p.name != "_schema.json")
    if not seed_files:
        print("ℹ️  db/seeds/lifestyle-claims/ 에 seed 파일 없음 (skip)")
        return 0

    errors: list[str] = []
    for path in seed_files:
        validate_seed_file(path, schema, errors)

    if errors:
        print("❌ Lifestyle claim seed 검증 실패:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        print(
            f"\n총 {len(errors)}건 위반. spec §9.3 7원칙 위반 시 머지 차단.",
            file=sys.stderr,
        )
        return 1

    total_claims = sum(
        len(json.loads(p.read_text(encoding="utf-8"))["claims"]) for p in seed_files
    )
    print(
        f"✅ Lifestyle claim seed 검증 통과 — 셀럽 {len(seed_files)}명, claim {total_claims}건"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
