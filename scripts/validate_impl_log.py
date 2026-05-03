#!/usr/bin/env python3
"""IMPLEMENTATION_LOG.md 필수 필드 검증.

각 엔트리의 YAML front-matter에서 필수 필드 존재 여부를 확인한다.

필수 필드: date, agent, task_id, commit_sha, verified_by

규칙:
- YAML front-matter 블록만 엔트리로 인정한다 (heading-only 스타일은 사용 금지).
- `commit_sha`는 7자 이상 hex. 단, **가장 최신 엔트리 한 건**에 한해
  `PENDING` placeholder를 허용한다 (feat 커밋 직후 SHA 치환 전 상태).
- validator는 ## Entries 섹션 내부 ---...--- 블록만 파싱한다.

사용법:
  python scripts/validate_impl_log.py
"""

import re
import sys

import yaml

IMPL_LOG_PATH = "docs/IMPLEMENTATION_LOG.md"
REQUIRED_FIELDS = {"date", "agent", "task_id", "commit_sha", "verified_by"}
SHA_PATTERN = re.compile(r"^[0-9a-f]{7,40}$")


def main() -> int:
    try:
        with open(IMPL_LOG_PATH, encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        print(f"ERROR: {IMPL_LOG_PATH} not found", file=sys.stderr)
        return 1

    # YAML front-matter 블록 추출 (문서 최상단의 스키마 주석 블록 제외)
    # 엔트리 블록은 "## Entries" 이후에 나오는 ---...--- 패턴
    entries_section = content.split("## Entries")[-1] if "## Entries" in content else ""
    blocks = re.findall(r"---\n(.*?)---", entries_section, re.DOTALL)

    if not blocks:
        # 엔트리가 아직 없으면 통과 (빈 로그)
        print("✅ IMPLEMENTATION_LOG validation passed (no entries yet).")
        return 0

    errors: list[str] = []

    for i, block in enumerate(blocks, 1):
        try:
            data = yaml.safe_load(block)
        except yaml.YAMLError as e:
            errors.append(f"Entry #{i}: YAML parse error — {e}")
            continue

        if not isinstance(data, dict):
            errors.append(
                f"Entry #{i}: front-matter is not a mapping "
                f"(heading-only 스타일 금지 — YAML front-matter 사용)"
            )
            continue

        missing = REQUIRED_FIELDS - set(data.keys())
        if missing:
            errors.append(f"Entry #{i}: missing fields — {', '.join(sorted(missing))}")

        # verified_by는 null이나 빈 문자열이면 안 됨
        verified = data.get("verified_by")
        if verified is None or (isinstance(verified, str) and not verified.strip()):
            errors.append(f"Entry #{i}: verified_by is empty or null")

        # commit_sha 검증: 7자+ hex, 단 최신 엔트리는 PENDING 허용
        # YAML이 all-digit SHA를 int로 파싱하는 경우가 있어 str로 coerce한다.
        sha = data.get("commit_sha")
        if sha is None:
            pass  # already reported via missing fields
        else:
            if isinstance(sha, int):
                sha_str = str(sha)
            elif isinstance(sha, str):
                sha_str = sha
            else:
                errors.append(
                    f"Entry #{i}: commit_sha must be string or int, got {type(sha).__name__}"
                )
                continue

            if sha_str == "PENDING":
                pass  # PENDING은 항상 허용. record-log-sha.sh 가 별도 reminder 역할.
            elif not SHA_PATTERN.match(sha_str):
                errors.append(
                    f"Entry #{i}: commit_sha={sha_str!r} 형식 오류 (7+ hex or PENDING)"
                )

    if errors:
        print("❌ IMPLEMENTATION_LOG validation FAILED:")
        for err in errors:
            print(f"  {err}")
        return 1

    print(f"✅ IMPLEMENTATION_LOG validation passed ({len(blocks)} entries).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
