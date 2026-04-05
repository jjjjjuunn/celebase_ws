#!/usr/bin/env python3
"""spec.md 계약 테스트.

spec.md의 SQL 코드펜스 내부만 파싱하여 계약 준수를 검증한다.
grep과 역할 분리: grep=빠른 pass/fail, pytest=실패 시 디버깅 컨텍스트 제공.

사용법:
  pytest tests/contract/test_spec_contracts.py -v
"""

import re

SPEC_PATH = "spec.md"


def _read_spec() -> str:
    with open(SPEC_PATH, encoding="utf-8") as f:
        return f.read()


def _extract_sql_blocks(content: str) -> list[str]:
    """spec.md에서 ```sql ... ``` 코드펜스 내부만 추출."""
    return re.findall(r"```sql\s*\n(.*?)```", content, re.DOTALL)


def _extract_json_blocks(content: str) -> list[str]:
    """spec.md에서 ```json ... ``` 코드펜스 내부만 추출."""
    return re.findall(r"```json\s*\n(.*?)```", content, re.DOTALL)


class TestUuidContract:
    """UUID v7 계약: SQL 블록에서 gen_random_uuid() 사용 금지."""

    def test_no_gen_random_uuid_in_sql(self) -> None:
        content = _read_spec()
        sql_blocks = _extract_sql_blocks(content)
        assert sql_blocks, "spec.md에 SQL 코드펜스가 없습니다"

        violations: list[str] = []
        for i, block in enumerate(sql_blocks, 1):
            matches = re.findall(r"gen_random_uuid\(\)", block)
            if matches:
                # 주변 컨텍스트 제공
                for match_obj in re.finditer(r"gen_random_uuid\(\)", block):
                    start = max(0, match_obj.start() - 40)
                    end = min(len(block), match_obj.end() + 40)
                    context = block[start:end].strip()
                    violations.append(f"SQL block #{i}: ...{context}...")

        assert not violations, (
            f"gen_random_uuid() 발견 ({len(violations)}건). "
            f"uuid_generate_v7()을 사용하세요:\n"
            + "\n".join(f"  - {v}" for v in violations)
        )

    def test_uuid_v7_function_defined(self) -> None:
        """pg_uuidv7 확장 또는 uuid_generate_v7 함수가 정의되어 있는지 확인."""
        content = _read_spec()
        sql_blocks = _extract_sql_blocks(content)
        all_sql = "\n".join(sql_blocks)

        assert "pg_uuidv7" in all_sql or "uuid_generate_v7" in all_sql, (
            "spec.md SQL에 pg_uuidv7 확장 또는 uuid_generate_v7 함수 정의가 없습니다"
        )


class TestErrorFormatContract:
    """에러 포맷 계약: requestId 필드 포함."""

    def test_error_format_has_request_id(self) -> None:
        content = _read_spec()
        json_blocks = _extract_json_blocks(content)

        # 에러 포맷 예시를 포함하는 JSON 블록 찾기
        error_blocks = [b for b in json_blocks if '"error"' in b]
        assert error_blocks, "spec.md에 에러 포맷 JSON 예시가 없습니다"

        has_request_id = any("requestId" in b for b in error_blocks)
        assert has_request_id, (
            "spec.md 에러 포맷 예시에 requestId 필드가 없습니다. "
            "API 계약에 따라 requestId를 포함해야 합니다."
        )


class TestSqlSafetyContract:
    """SQL 안전 계약: 위험 패턴 부재 확인."""

    def test_no_cascade_delete_on_users(self) -> None:
        """users 테이블 참조 FK에 ON DELETE CASCADE 금지 (soft delete 정책)."""
        content = _read_spec()
        sql_blocks = _extract_sql_blocks(content)
        all_sql = "\n".join(sql_blocks)

        # REFERENCES users(id) ON DELETE CASCADE 패턴
        violations = re.findall(
            r"REFERENCES\s+users\(id\)\s+ON\s+DELETE\s+CASCADE",
            all_sql,
            re.IGNORECASE,
        )
        assert not violations, (
            f"users(id) FK에 ON DELETE CASCADE 발견 ({len(violations)}건). "
            f"ON DELETE RESTRICT를 사용하세요 (soft delete 정책)."
        )
