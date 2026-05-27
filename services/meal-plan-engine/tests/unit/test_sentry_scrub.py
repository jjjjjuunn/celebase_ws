"""PHI/PII scrubbing for Sentry events (CHORE-SENTRY-PHI-REDACTION-001).

Mirrors packages/service-core/tests/unit/sentry-scrub.test.ts: a headline
"nothing leaks" assertion over a fully-populated event (PHI seeded into every
path), one targeted assertion per path, plus robustness (cycle/None/idempotent)
and the init_sentry no-op contract.
"""

from __future__ import annotations

import json

from src.sentry_config import init_sentry, scrub_event

# Sentinels that must NEVER survive scrubbing.
EMAIL = "victim@example.com"
JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTk5OSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJ1adQssw5c"
BEARER = "Bearer s3cr3ttok3nABCDEF1234567890"
OPENAI_KEY = "sk-abcdefghijklmnopqrstuvwxyz0123456789"
OPENAI_PROJ = "proj_abcdefghijklmnopqrstuvwxyz123456"
WEIGHT = "WEIGHT-KG-SENTINEL"
MEDS = "OZEMPIC-MED-SENTINEL"
GLUCOSE = "GLUCOSE-BIOMARKER-SENTINEL"
COGNITO = "COGNITO-SUB-SENTINEL"

# UUID is stripped from URLs but intentionally retained elsewhere (correlatable,
# not identifying) — so it is asserted only in the URL path test, not globally.
UUID = "11111111-2222-3333-4444-555555555555"

CREDENTIAL_AND_PHI_SENTINELS = [
    EMAIL,
    JWT,
    BEARER,
    OPENAI_KEY,
    OPENAI_PROJ,
    WEIGHT,
    MEDS,
    GLUCOSE,
    COGNITO,
]


def _full_event() -> dict:
    """A Sentry event with synthetic PHI seeded into every scrubbed path."""
    return {
        "message": f"login failed for {EMAIL} token={BEARER}",
        "transaction": f"POST /users/{EMAIL}/profile",
        "logentry": {
            "message": f"user {EMAIL} hit error",
            "params": [EMAIL, BEARER],
        },
        "exception": {
            "values": [
                {
                    "type": "ValueError",
                    "value": f"pipeline boom for {EMAIL}",
                    "stacktrace": {
                        "frames": [
                            {
                                "function": "run_pipeline",
                                "context_line": f"    auth = '{BEARER}'",
                                "pre_context": [f"    user_email = '{EMAIL}'"],
                                "post_context": ["    return auth"],
                                "vars": {
                                    "bio_profile": {
                                        "weight_kg": WEIGHT,
                                        "medications": [MEDS],
                                        "biomarkers": {"glucose": GLUCOSE},
                                        "email": EMAIL,
                                    },
                                    "token": BEARER,
                                },
                            }
                        ]
                    },
                }
            ]
        },
        "request": {
            "url": f"https://api/meal-plans/{UUID}?email={EMAIL}&t={BEARER}",
            "query_string": f"email={EMAIL}",
            "cookies": {"session": BEARER},
            "headers": {
                "Authorization": BEARER,
                "Cookie": f"sid={BEARER}",
                "User-Agent": "Expo/1.0 CelebBase",  # safe — should survive
            },
            "data": {
                "weight_kg": WEIGHT,
                "medications": [MEDS],
                "allergies": ["dairy"],
                "note": f"reach me at {EMAIL}",  # free-text email caught by regex
            },
        },
        "user": {
            "id": "user-abc-123",
            "email": EMAIL,
            "ip_address": "203.0.113.5",
            "username": EMAIL,
            "cognito_sub": COGNITO,
        },
        "breadcrumbs": {
            "values": [
                {
                    "type": "http",
                    "category": "httplib",
                    "message": f"POST openai key={OPENAI_KEY}",
                    "data": {
                        "url": f"https://api.openai.com/v1/chat?key={OPENAI_KEY}",
                        "request_body": {"weight_kg": WEIGHT},
                        "response_body": {"biomarkers": GLUCOSE},
                        "note": OPENAI_PROJ,
                    },
                }
            ]
        },
        "contexts": {
            "device": {"model": "iPhone15,2"},  # safe — should survive
            "phi": {"medications": [MEDS], "cognito_sub": COGNITO},
        },
        "tags": {"openai_api_key": OPENAI_KEY, "plan_id": UUID},
        "extra": {
            "bio": {"weight_kg": WEIGHT, "biomarkers": GLUCOSE},
            "raw": f"{EMAIL} {JWT} {OPENAI_KEY} {OPENAI_PROJ}",
        },
        # Sentry's own fields — must survive untouched.
        "event_id": "abcdef0123456789",
        "platform": "python",
        "sdk": {"name": "sentry.python", "version": "2.x"},
    }


def test_headline_no_phi_survives_any_path() -> None:
    blob = json.dumps(scrub_event(_full_event()))
    for sentinel in CREDENTIAL_AND_PHI_SENTINELS:
        assert sentinel not in blob, f"PHI sentinel leaked: {sentinel}"


def test_message_and_logentry_scrubbed() -> None:
    ev = scrub_event(
        {
            "message": f"hi {EMAIL}",
            "logentry": {"message": f"x {BEARER}", "params": [EMAIL]},
        }
    )
    assert EMAIL not in json.dumps(ev)
    assert BEARER not in json.dumps(ev)


def test_exception_frame_vars_dropped() -> None:
    ev = _full_event()
    scrub_event(ev)
    frame = ev["exception"]["values"][0]["stacktrace"]["frames"][0]
    assert "vars" not in frame
    assert frame["function"] == "run_pipeline"  # non-PHI frame data survives


def test_exception_value_and_context_lines_scrubbed() -> None:
    # The SDK puts the exception message in value (NOT event["message"]); the
    # ContextLines integration fills context_line/pre_context/post_context. This
    # is the path the real-SDK verification harness caught leaking.
    ev = {
        "exception": {
            "values": [
                {
                    "value": f"generate failed for {EMAIL}",
                    "stacktrace": {
                        "frames": [
                            {
                                "context_line": f"    headers['authorization'] = '{BEARER}'",
                                "pre_context": [f"    email = '{EMAIL}'"],
                                "post_context": ["    return headers"],
                                "vars": {"weight_kg": WEIGHT},
                            }
                        ]
                    },
                }
            ]
        }
    }
    scrub_event(ev)
    val = ev["exception"]["values"][0]
    frame = val["stacktrace"]["frames"][0]
    assert val["value"] == "generate failed for [REDACTED]"
    assert "vars" not in frame
    assert EMAIL not in json.dumps(ev)
    assert BEARER not in json.dumps(ev)


def test_thread_frame_vars_dropped() -> None:
    # ThreadingIntegration can populate event["threads"] for the MPE's concurrent
    # FastAPI app + SQS consumer + WebSocket router.
    ev = {
        "threads": {
            "values": [
                {
                    "stacktrace": {
                        "frames": [
                            {
                                "function": "consume",
                                "vars": {"bio": {"weight_kg": WEIGHT}},
                            }
                        ]
                    }
                }
            ]
        }
    }
    scrub_event(ev)
    frame = ev["threads"]["values"][0]["stacktrace"]["frames"][0]
    assert "vars" not in frame
    assert WEIGHT not in json.dumps(ev)


def test_request_headers_and_data() -> None:
    ev = _full_event()
    scrub_event(ev)
    req = ev["request"]
    assert "query_string" not in req
    assert "cookies" not in req
    assert req["headers"]["Authorization"] == "[REDACTED]"
    assert req["headers"]["Cookie"] == "[REDACTED]"
    assert req["headers"]["User-Agent"] == "Expo/1.0 CelebBase"  # safe survives
    assert req["data"]["weight_kg"] == "[REDACTED]"
    assert req["data"]["medications"] == "[REDACTED]"
    assert EMAIL not in json.dumps(req["data"])


def test_url_strips_query_and_uuid() -> None:
    ev = scrub_event({"request": {"url": f"https://api/x/{UUID}?email={EMAIL}"}})
    url = ev["request"]["url"]
    assert UUID not in url
    assert EMAIL not in url
    assert "?" not in url


def test_user_reduced_to_salted_hash() -> None:
    ev = _full_event()
    scrub_event(ev)
    user = ev["user"]
    assert set(user.keys()) == {"id"}  # email/ip/username/cognito_sub dropped
    assert user["id"] != "user-abc-123"  # raw id replaced with hash
    assert len(user["id"]) == 8


def test_breadcrumb_bodies_dropped_and_scrubbed() -> None:
    ev = _full_event()
    scrub_event(ev)
    crumb = ev["breadcrumbs"]["values"][0]
    assert "request_body" not in crumb["data"]
    assert "response_body" not in crumb["data"]
    assert "?" not in crumb["data"]["url"]
    assert OPENAI_KEY not in json.dumps(crumb)


def test_contexts_tags_extra_scrubbed_but_safe_survives() -> None:
    ev = _full_event()
    scrub_event(ev)
    assert ev["contexts"]["device"]["model"] == "iPhone15,2"  # safe survives
    assert ev["contexts"]["phi"]["medications"] == "[REDACTED]"
    assert ev["tags"]["openai_api_key"] == "[REDACTED]"
    assert ev["tags"]["plan_id"] == UUID  # plan id (uuid) intentionally retained


def test_sentry_own_fields_survive() -> None:
    ev = _full_event()
    scrub_event(ev)
    assert ev["platform"] == "python"
    assert ev["sdk"]["name"] == "sentry.python"
    assert ev["event_id"] == "abcdef0123456789"


def test_handles_none_and_non_dict() -> None:
    assert scrub_event({}) == {}
    assert scrub_event(None) is None  # type: ignore[arg-type]
    assert scrub_event("not-a-dict") == "not-a-dict"  # type: ignore[arg-type]


def test_cycle_safe() -> None:
    loop: dict = {"a": 1}
    loop["self"] = loop
    # Must not raise RecursionError.
    scrub_event({"extra": {"loop": loop}})


def test_idempotent_no_releak() -> None:
    ev = _full_event()
    scrub_event(ev)
    scrub_event(ev)  # second pass must not re-expose PHI
    blob = json.dumps(ev)
    for sentinel in CREDENTIAL_AND_PHI_SENTINELS:
        assert sentinel not in blob


def test_init_sentry_noop_without_dsn() -> None:
    assert init_sentry("", "test") is False  # empty DSN → no-op, never raises
