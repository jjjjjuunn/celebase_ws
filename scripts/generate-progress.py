#!/usr/bin/env python3
"""tasks.yaml → progress.md 자동 렌더링.

progress.md는 .gitignore에 등록되어 있으며, CI에서 자동 생성 후
PR comment로 게시된다. 직접 수정 금지.

사용법:
  python scripts/generate-progress.py
"""

import datetime
import sys

import yaml

TASKS_PATH = ".claude/tasks.yaml"
OUTPUT_PATH = "progress.md"

STATUS_EMOJI = {
    "done": "✅",
    "in-progress": "🔄",
    "pending": "⏳",
    "blocked": "🚫",
}


def main() -> int:
    try:
        with open(TASKS_PATH, encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except FileNotFoundError:
        print(f"ERROR: {TASKS_PATH} not found", file=sys.stderr)
        return 1

    tasks = data.get("tasks", [])
    if not tasks:
        print(f"WARNING: No tasks in {TASKS_PATH}", file=sys.stderr)
        return 1

    total = len(tasks)
    done_count = sum(1 for t in tasks if t["status"] == "done")
    pct = round(done_count / total * 100) if total > 0 else 0

    lines = [
        "# CelebBase Wellness — Progress",
        "",
        f"> Auto-generated from `{TASKS_PATH}` on {datetime.date.today().isoformat()}",
        "> **이 파일을 직접 수정하지 마세요.** `scripts/generate-progress.py`로 재생성됩니다.",
        "",
        f"## Summary: {done_count}/{total} ({pct}%)",
        "",
        "| Status | ID | Title | Owner | Dependencies |",
        "|--------|----|-------|-------|-------------|",
    ]

    for task in tasks:
        emoji = STATUS_EMOJI.get(task["status"], "❓")
        deps = ", ".join(task.get("dependsOn", [])) or "—"
        lines.append(
            f"| {emoji} {task['status']} "
            f"| {task['id']} "
            f"| {task['title']} "
            f"| {task['owner']} "
            f"| {deps} |"
        )

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Definition of Done (per task)")
    lines.append("")

    for task in tasks:
        emoji = STATUS_EMOJI.get(task["status"], "❓")
        lines.append(f"### {emoji} {task['id']}: {task['title']}")
        lines.append("")
        for dod_item in task.get("definitionOfDone", []):
            check = "x" if task["status"] == "done" else " "
            lines.append(f"- [{check}] {dod_item}")
        lines.append("")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"✅ Generated {OUTPUT_PATH} ({total} tasks, {pct}% done)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
