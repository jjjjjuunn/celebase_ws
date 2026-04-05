#!/usr/bin/env python3
"""tasks.yaml 상태 전이 검증 스크립트.

PR에서 tasks.yaml 변경 시 역방향 전이를 탐지하고,
done 전환 시 IMPLEMENTATION_LOG.md에 verified_by 크로스체크를 수행한다.

사용법:
  python scripts/check_task_transitions.py

diff 범위: git diff origin/main...HEAD (PR merge base 기준)
"""

import re
import subprocess
import sys

import yaml

TASKS_PATH = ".claude/tasks.yaml"
IMPL_LOG_PATH = "docs/IMPLEMENTATION_LOG.md"

# 허용 전이 (from → to). 여기에 없는 전이는 역전으로 간주.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"in-progress", "blocked"},
    "in-progress": {"done", "blocked", "pending"},
    "blocked": {"pending", "in-progress"},
    # done에서 다른 상태로의 전이는 허용하지 않음
    "done": set(),
}


def get_old_tasks() -> dict[str, str]:
    """origin/main 기준 tasks.yaml에서 task_id → status 매핑 반환."""
    try:
        result = subprocess.run(
            ["git", "show", f"origin/main:{TASKS_PATH}"],
            capture_output=True,
            text=True,
            check=True,
        )
        data = yaml.safe_load(result.stdout)
        return {t["id"]: t["status"] for t in data.get("tasks", [])}
    except (subprocess.CalledProcessError, FileNotFoundError):
        # main에 tasks.yaml이 없으면 (최초 생성) 빈 dict
        return {}


def get_new_tasks() -> list[dict]:
    """현재 HEAD의 tasks.yaml 파싱."""
    with open(TASKS_PATH, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data.get("tasks", [])


def check_impl_log_verified(task_id: str) -> bool:
    """IMPLEMENTATION_LOG.md에서 task_id에 대한 verified_by 존재 여부 확인."""
    try:
        with open(IMPL_LOG_PATH, encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        return False

    # YAML front-matter 블록에서 task_id와 verified_by를 찾음
    # 패턴: ---\n...\ntask_id: BOOT-001\n...\nverified_by: ...\n---
    blocks = re.findall(r"---\n(.*?)---", content, re.DOTALL)
    for block in blocks:
        if f"task_id: {task_id}" in block:
            for line in block.splitlines():
                if line.strip().startswith("verified_by:"):
                    value = line.split(":", 1)[1].strip()
                    if value and value != "null":
                        return True
    return False


def main() -> int:
    old_statuses = get_old_tasks()
    new_tasks = get_new_tasks()
    errors: list[str] = []

    for task in new_tasks:
        task_id = task["id"]
        new_status = task["status"]
        old_status = old_statuses.get(task_id)
        owner = task.get("owner", "")

        # 신규 태스크는 전이 검증 불필요
        if old_status is None:
            continue

        # 상태 변경 없으면 스킵
        if old_status == new_status:
            continue

        # 역전 탐지
        allowed = ALLOWED_TRANSITIONS.get(old_status, set())
        if new_status not in allowed:
            errors.append(
                f"[BLOCKED] {task_id}: {old_status} → {new_status} "
                f"(허용 전이: {old_status} → {allowed or '없음'})"
            )
            continue

        # done 전환 크로스체크 (agent-* 소유 태스크만)
        if new_status == "done" and owner.startswith("agent-"):
            if not check_impl_log_verified(task_id):
                errors.append(
                    f"[BLOCKED] {task_id}: done 전환에 "
                    f"IMPLEMENTATION_LOG.md verified_by 미발견"
                )

    if errors:
        print("❌ Task transition check FAILED:")
        for err in errors:
            print(f"  {err}")
        return 1

    print("✅ Task transition check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
