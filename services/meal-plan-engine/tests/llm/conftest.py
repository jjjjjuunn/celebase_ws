"""IMPL-AI-002 Phase 3 — VCR cassette config for LLM smoke tests.

기능:
- Authorization / openai-organization / openai-project 등 비밀 헤더 redact.
- request body 의 system_prompt + user_prompt 에서 PHI 패턴 마스킹.
- response body (Structured Output JSON) 에서 PHI 패턴 마스킹.
- match_on=[method, scheme, host, path] — body 매처는 before_record_request 와 충돌하므로 제외.
  cassette 파일은 테스트당 1개이므로 body 매칭 없이도 안전하다.
- 파일명: cassettes/llm_<scenario>_<model>_<prompt_hash8>.yaml (테스트가 명시 지정).

PHI patterns (LLM-DESIGN §S6 + spec §6.4):
- Brand 5종 (Ronaldo / Messi / Paltrow / Beyoncé / Ariana) — 본 테스트의 persona는 fictional 'ronaldo' alias 만 허용.
- ICD-10 (E11.x, F32.x 등) — uppercase letter + 2 digits + optional decimal.
- BMI 표기 — `BMI[:\s]*[0-9]+\.?[0-9]*`
- imperial weight — stone, lbs.

녹화 모드 결정:
- RUN_LLM_REAL_CALL=1 → record_mode='all' (강제 재녹화)
- 평소 → record_mode='none' (cassette 부재 시 fail)
"""

from __future__ import annotations

import os
import re
from typing import Any

import pytest

# Patch vcrpy httpcore stub: new cassette format stores body.string as str,
# but httpcore.Response(content=<str>) doesn't wrap in ByteStream → httpx
# 0.28's `assert isinstance(resp.stream, AsyncIterable)` fails. Coerce to bytes.
import vcr.stubs.httpcore_stubs as _vcr_httpcore  # noqa: E402

_original_deserialize = _vcr_httpcore._deserialize_response


def _patched_deserialize_response(vcr_response: Any) -> Any:
    body = vcr_response.get("body", {})
    raw = body.get("string")
    if isinstance(raw, str):
        body["string"] = raw.encode("utf-8")
    return _original_deserialize(vcr_response)


_vcr_httpcore._deserialize_response = _patched_deserialize_response


_PHI_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # Brand celebrity 풀네임 — fictional 페르소나 키 'ronaldo'/'messi' alias 만 허용.
    (re.compile(r"\bcristiano ronaldo\b", re.IGNORECASE), "[REDACTED_BRAND]"),
    (re.compile(r"\blionel messi\b", re.IGNORECASE), "[REDACTED_BRAND]"),
    (re.compile(r"\bgwyneth paltrow\b", re.IGNORECASE), "[REDACTED_BRAND]"),
    (re.compile(r"\bbeyonc[eé]\b", re.IGNORECASE), "[REDACTED_BRAND]"),
    (re.compile(r"\bariana grande\b", re.IGNORECASE), "[REDACTED_BRAND]"),
    # ICD-10 — uppercase letter + 2 digits + optional .digit(s)
    (re.compile(r"\b[A-Z][0-9]{2}\.[0-9]{1,2}\b"), "[REDACTED_ICD10]"),
    # BMI explicit
    (re.compile(r"\bBMI[:\s]*[0-9]+\.?[0-9]*"), "[REDACTED_BMI]"),
    # Imperial weights
    (re.compile(r"\b[0-9]+\s*stone\b", re.IGNORECASE), "[REDACTED_WEIGHT]"),
    (re.compile(r"\b[0-9]+\s*lbs?\b", re.IGNORECASE), "[REDACTED_WEIGHT]"),
]


def _scrub(text: str) -> str:
    out = text
    for pattern, replacement in _PHI_PATTERNS:
        out = pattern.sub(replacement, out)
    return out


def _scrub_request(request: Any) -> Any:
    if request.body is None:
        return request
    body = request.body
    if isinstance(body, bytes):
        body = body.decode("utf-8", errors="replace")
    request.body = _scrub(body).encode("utf-8")
    return request


_RESPONSE_HEADER_REDACT = (
    "openai-organization",
    "openai-project",
    "set-cookie",
    "cf-ray",
    "x-request-id",
)


def _scrub_response(response: dict[str, Any]) -> dict[str, Any]:
    headers = response.get("headers")
    if isinstance(headers, dict):
        for key in list(headers.keys()):
            if key.lower() in _RESPONSE_HEADER_REDACT:
                headers[key] = ["[REDACTED]"]
    body = response.get("body", {})
    raw = body.get("string")
    if raw is None:
        return response
    if isinstance(raw, bytes):
        try:
            raw = raw.decode("utf-8")
        except UnicodeDecodeError:
            return response
    body["string"] = _scrub(raw)
    return response


@pytest.fixture(scope="module")
def vcr_config() -> dict[str, Any]:
    record_mode = "all" if os.getenv("RUN_LLM_REAL_CALL") == "1" else "none"
    return {
        "filter_headers": [
            ("authorization", "[REDACTED]"),
            ("openai-organization", "[REDACTED]"),
            ("openai-project", "[REDACTED]"),
            ("x-stainless-arch", None),
            ("x-stainless-os", None),
            ("x-stainless-runtime", None),
            ("x-stainless-runtime-version", None),
            ("x-stainless-package-version", None),
            ("x-stainless-lang", None),
        ],
        "before_record_request": _scrub_request,
        "before_record_response": _scrub_response,
        "match_on": ("method", "scheme", "host", "path"),
        "record_mode": record_mode,
        "decode_compressed_response": True,
        "allow_playback_repeats": True,
    }


@pytest.fixture(scope="module")
def vcr_cassette_dir() -> str:
    here = os.path.dirname(__file__)
    return os.path.join(here, "..", "fixtures", "cassettes")
