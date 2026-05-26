"""Sentry init + PHI/PII redaction for the meal-plan-engine (Python).

Mirrors packages/service-core/src/sentry.ts + sentry-scrub.ts so the Python
service gets the same errors-only capture and the same `beforeSend` PHI scrubbing
as the TypeScript services. The meal-plan-engine is the most PHI-dense service
(it receives minimized bio_profile fields and calls OpenAI), so the scrubber adds
the OpenAI secret patterns on top of the shared credential/JWT/email set.

A Sentry Event is a different shape from a log line: PHI can leak via request
bodies, breadcrumb data, exception-frame locals, the user object, and custom
contexts/tags/extra. `scrub_event` walks every such path. It is pure + stdlib-only
so it can be unit-tested in isolation with one synthetic-PHI assertion per path.

CHORE-SENTRY-PHI-REDACTION-001 (G2).
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

import sentry_sdk

_logger = logging.getLogger(__name__)

REDACTED = "[REDACTED]"
_MAX_DEPTH = 8

# Keys whose VALUES must never reach a third-party error tracker (case-insensitive).
# Superset of the TS SENSITIVE_KEYS + the engine's minimized bio_profile fields
# (phi_minimizer.TASK_FIELD_MAP) + this service's own secrets.
_SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        # credentials / tokens / service secrets
        "password",
        "authorization",
        "cookie",
        "set-cookie",
        "access_token",
        "refresh_token",
        "id_token",
        "token",
        "secret",
        "client_secret",
        "api_key",
        "apikey",
        "openai_api_key",
        "internal_jwt_secret",
        "dek",
        # PHI / bio-profile (encrypted set + minimized engine fields)
        "biomarkers",
        "medical_conditions",
        "medications",
        "allergies",
        "intolerances",
        "height",
        "height_cm",
        "weight",
        "weight_kg",
        "waist_cm",
        "body_fat_pct",
        "birth_year",
        "sex",
        "activity_level",
        "primary_goal",
        "goal_pace",
        "diet_type",
        "bmr_kcal",
        "tdee_kcal",
        "target_kcal",
        # direct identifiers (third-party exposure is stricter than internal logs)
        "email",
        "cognito_sub",
        "ssn",
        "phone",
    }
)

_BEARER_RE = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# OpenAI secrets — this service calls OpenAI, so keys/project ids can land in
# error messages and outbound-request breadcrumbs (mirrors the VCR redact tiers
# in tests/llm/conftest.py).
_OPENAI_KEY_RE = re.compile(r"\bsk-[A-Za-z0-9_-]{20,}")
_OPENAI_PROJ_RE = re.compile(r"\bproj_[A-Za-z0-9]{20,}")
_UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)

_STRING_SCRUBBERS = (_BEARER_RE, _JWT_RE, _EMAIL_RE, _OPENAI_KEY_RE, _OPENAI_PROJ_RE)


def _is_sensitive_key(key: str) -> bool:
    return key.lower() in _SENSITIVE_KEYS


def _scrub_string(value: str) -> str:
    """Strip embedded credentials + emails. Does NOT touch UUIDs — request/
    correlation IDs are useful and non-identifying (URL scrubbing strips them)."""
    out = value
    for rx in _STRING_SCRUBBERS:
        out = rx.sub(REDACTED, out)
    return out


def _scrub_url(url: str) -> str:
    q = url.find("?")
    path = url[:q] if q >= 0 else url  # drop query string (may carry tokens/email)
    return _UUID_RE.sub(REDACTED, _scrub_string(path))


def _scrub_value(value: Any, depth: int, seen: set[int]) -> Any:
    if isinstance(value, str):
        return _scrub_string(value)
    # bool is a subclass of int — both pass through untouched
    if value is None or isinstance(value, (int, float)):
        return value
    if depth >= _MAX_DEPTH:
        return REDACTED
    if id(value) in seen:
        return REDACTED  # cycle guard
    seen.add(id(value))
    if isinstance(value, (list, tuple)):
        return [_scrub_value(v, depth + 1, seen) for v in value]
    if isinstance(value, dict):
        out: dict[Any, Any] = {}
        for k, v in value.items():
            out[k] = (
                REDACTED
                if _is_sensitive_key(str(k))
                else _scrub_value(v, depth + 1, seen)
            )
        return out
    # Unknown object type — stringify defensively and scrub.
    return _scrub_string(str(value))


def _deep_scrub(value: Any) -> Any:
    return _scrub_value(value, 0, set())


def _hash_id(raw_id: str, salt: str) -> str:
    """Salted sha256 (8 hex) — correlatable within a service, not joinable across."""
    return hashlib.sha256(f"{salt}:{raw_id}".encode()).hexdigest()[:8]


def scrub_event(
    event: dict[str, Any], hint: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Redact PHI/PII from a Sentry event in place and return it.

    Safe on any shape; unknown paths are left untouched so Sentry's own fields
    (sdk/platform/timestamp/server_name …) survive. The caller's before_send
    wraps this in try/except and drops the event on error (fail-safe).
    """
    del hint  # unused; kept for the before_send(event, hint) signature
    if not isinstance(event, dict):
        return event
    salt = "meal-plan-engine"

    # 1. message + logentry (message + % params)
    message = event.get("message")
    if isinstance(message, str):
        event["message"] = _scrub_string(message)
    elif isinstance(message, dict):
        event["message"] = _deep_scrub(message)
    logentry = event.get("logentry")
    if isinstance(logentry, dict):
        if isinstance(logentry.get("message"), str):
            logentry["message"] = _scrub_string(logentry["message"])
        if "params" in logentry:
            logentry["params"] = _deep_scrub(logentry["params"])

    # 2. exception frame locals — drop entirely (can hold the full bio_profile)
    exception = event.get("exception")
    if isinstance(exception, dict):
        values = exception.get("values")
        if isinstance(values, list):
            for val in values:
                if not isinstance(val, dict):
                    continue
                stacktrace = val.get("stacktrace")
                if not isinstance(stacktrace, dict):
                    continue
                frames = stacktrace.get("frames")
                if not isinstance(frames, list):
                    continue
                for frame in frames:
                    if isinstance(frame, dict):
                        frame.pop("vars", None)

    # 3. request — url (drop query + user-id UUIDs), query_string, cookies,
    #    headers (authorization/cookie), data (POST/SQS body lands here)
    request = event.get("request")
    if isinstance(request, dict):
        if isinstance(request.get("url"), str):
            request["url"] = _scrub_url(request["url"])
        request.pop("query_string", None)
        request.pop("cookies", None)
        headers = request.get("headers")
        if isinstance(headers, dict):
            cleaned: dict[Any, Any] = {}
            for k, v in headers.items():
                if _is_sensitive_key(str(k)):
                    cleaned[k] = REDACTED
                elif isinstance(v, str):
                    cleaned[k] = _scrub_string(v)
                else:
                    cleaned[k] = v
            request["headers"] = cleaned
        if "data" in request:
            request["data"] = _deep_scrub(request["data"])

    # 4. user — drop PII; retain only a salted-hash id for per-user correlation
    user = event.get("user")
    if isinstance(user, dict):
        cleaned_user: dict[Any, Any] = {}
        raw_id = user.get("id")
        if isinstance(raw_id, str) and raw_id:
            cleaned_user["id"] = _hash_id(raw_id, salt)
        event["user"] = cleaned_user  # email / username / ip_address dropped

    # 5. breadcrumbs — fetch/log crumbs carry url + bodies. Python SDK nests them
    #    under {"values": [...]}; tolerate a bare list too.
    breadcrumbs = event.get("breadcrumbs")
    crumb_list = (
        breadcrumbs.get("values")
        if isinstance(breadcrumbs, dict)
        else breadcrumbs
        if isinstance(breadcrumbs, list)
        else None
    )
    if isinstance(crumb_list, list):
        for crumb in crumb_list:
            if not isinstance(crumb, dict):
                continue
            if isinstance(crumb.get("message"), str):
                crumb["message"] = _scrub_string(crumb["message"])
            data = crumb.get("data")
            if isinstance(data, dict):
                if isinstance(data.get("url"), str):
                    data["url"] = _scrub_url(data["url"])
                data.pop("request_body", None)
                data.pop("response_body", None)
                crumb["data"] = _deep_scrub(data)

    # 6/7/8. contexts / tags / extra — redact sensitive keys, keep safe context
    #        (device/os/runtime values match no sensitive key/pattern → survive).
    for field in ("contexts", "tags", "extra"):
        if isinstance(event.get(field), dict):
            event[field] = _deep_scrub(event[field])

    return event


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Scrub before send; drop the event entirely if scrubbing raises (fail-safe —
    never ship an un-scrubbed event)."""
    try:
        return scrub_event(event, hint)
    except Exception:  # noqa: BLE001 — fail-closed: drop rather than leak
        _logger.exception("Sentry beforeSend scrub failed; dropping event")
        return None


_initialized = False


def init_sentry(dsn: str, environment: str) -> bool:
    """Initialise Sentry for errors-only capture with PHI scrubbing.

    No-op (returns False) when `dsn` is empty so the service runs normally
    without Sentry configured. Idempotent across repeated calls.
    """
    global _initialized
    if _initialized:
        return True
    if not dsn:
        return False
    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        traces_sample_rate=0.0,  # errors-only — no performance tracing
        profiles_sample_rate=0.0,
        send_default_pii=False,
        include_local_variables=False,  # never capture frame locals (PHI vector)
        max_request_body_size="never",  # never capture request/SQS bodies
        before_send=_before_send,
    )
    _initialized = True
    _logger.info("Sentry initialised (errors-only, PHI scrub) env=%s", environment)
    return True
