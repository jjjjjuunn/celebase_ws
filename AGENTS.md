# AGENTS.md — CelebBase Codex Agent Instructions

> OpenAI Codex CLI는 프로젝트 루트의 AGENTS.md를 자동으로 로드한다.
> 이 파일은 CODEX-INSTRUCTIONS.md의 핵심 규칙을 포함한다.
> 전체 규칙은 CODEX-INSTRUCTIONS.md를 참조한다.

---

## CRITICAL: File Writing Rules

**`apply_patch`를 bash/shell exec으로 절대 실행하지 않는다.**

다음 패턴은 Python 코드의 `"""`, `"string"` 리터럴이 외부 zsh 이중따옴표와 충돌하여 shell 파싱 오류를 일으킨다:

```
# 금지 — shell quoting 버그 유발
/bin/zsh -lc "bash -lc 'apply_patch <<\"PATCH\"\n+\"content\"\nPATCH'"
```

**파일 생성/수정은 반드시 Python 단일따옴표 heredoc을 사용한다:**

```bash
python3 << 'PYEOF'
content = """\
# 파일 내용 — "이중따옴표"도 안전
def foo():
    logger.warning("This string is safe inside Python triple-quotes")
"""
with open('services/meal-plan-engine/src/engine/foo.py', 'w') as f:
    f.write(content)
print("Created foo.py")
PYEOF
```

- 외부 `<< 'PYEOF'`(단일따옴표)가 shell 해석을 완전 차단
- Python `"""..."""` 안에서 어떤 문자도 안전

**절대 금지:**
- `bash -lc "apply_patch <<"` — Python `"` 리터럴이 outer zsh `"` 를 닫아버림
- `cat > file << EOF` — 중첩 heredoc 오류
- 어떤 형태로든 bash를 통한 apply_patch 호출

---

## Project Identity

- **Name**: CelebBase Wellness — B2C 프리미엄 웰니스 플랫폼
- **Monorepo**: pnpm workspaces + Turborepo
- **Languages**: TypeScript (services, clients), Python (AI engine only)

## Absolute Rules

1. 시크릿/토큰/API 키를 코드에 하드코딩하지 않는다.
2. SQL 문자열 결합 금지. parameterized query만 사용.
3. 모든 외부 입력은 Zod(TS) / Pydantic(Python)으로 검증.
4. PHI(건강 데이터)는 AES-256 암호화 + 감사 로그 필수.
5. `any` 타입, 빈 `catch {}`, `console.log` 금지.
6. 서비스 경계 엄수: 다른 서비스의 DB 테이블을 직접 쿼리하지 않는다.
7. `--no-verify`, `rm -rf`, `git push --force` 금지.

## Python (AI Engine) — Key Conventions

- Type hints 필수
- `ruff check` 통과 필수
- `print()` 금지 — `logging` 모듈만 사용
- `import numpy`, `import scipy` 금지 (순수 stdlib only, IMPL-004-b 기준)
- `pytest` + `pytest-asyncio`

## DO NOT Modify

- `CLAUDE.md`, `.claude/rules/`, `.claude/settings.json`, `.claude/tasks.yaml`
- `.github/workflows/`, `docs/IMPLEMENTATION_LOG.md`

## Full Rules

전체 규칙: `CODEX-INSTRUCTIONS.md` 참조.
