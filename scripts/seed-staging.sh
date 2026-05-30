#!/usr/bin/env bash
# seed-staging.sh — 현재 repo 의 db/seeds 를 staging DB 에 적재 (재현 가능 ops).
#
# 배경: staging content-service DB 는 한동안 lifestyle_claims 0건이라 News 데모가
# 비어 있었다(CHORE-SEEDS-STAGING-001). CD 에 seed autorun 이 없어 수동 적재가 필요하다.
# 본 스크립트가 그 수동 절차를 캡슐화한다.
#
# 동작: db/seeds(+db/package.json) 를 tar → staging EC2 로 scp → app_default network 의
# node:20 컨테이너로 `tsx seeds/run.ts` 실행. seed 파일은 컨테이너에 read-only 로 마운트하고
# deps 는 컨테이너 내부(/work)에 설치 → 호스트에 root-owned node_modules 안 남김.
# DB password 는 db 컨테이너 env 에서 런타임에 읽음(스크립트에 시크릿 하드코딩 없음).
# seed loader 는 멱등 + 트랜잭션이라 재실행/실패 안전.
#
# 전제: ~/.ssh/config 에 `Host staging-ec2` (HostName/User/IdentityFile) 설정.
#   staging DB service 명 = `db`, DB 명 = `celebbase`.
#
# 사용: bash scripts/seed-staging.sh
set -euo pipefail

SSH_HOST="${STAGING_SSH_HOST:-staging-ec2}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARBALL="$(mktemp -t celebase-seed-XXXXXX)"

echo "[seed-staging] tar db/seeds + db/package.json ..."
tar czf "$TARBALL" -C "$REPO_ROOT" db/package.json db/seeds

echo "[seed-staging] scp → ${SSH_HOST} ..."
scp -q "$TARBALL" "${SSH_HOST}:/tmp/celebase-staging-seed.tar.gz"
rm -f "$TARBALL"

echo "[seed-staging] staging 에서 seed 실행 (node:20, app_default network) ..."
# shellcheck disable=SC2087  # heredoc 변수는 의도적으로 원격에서 평가
ssh "$SSH_HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /app
WORK="$(mktemp -d /tmp/celebase-seed-XXXXXX)"
tar xzf /tmp/celebase-staging-seed.tar.gz -C "$WORK" 2>/dev/null
PW=$(sudo docker compose exec -T db printenv POSTGRES_PASSWORD | tr -d '\r\n')
# seed 파일은 read-only 마운트, deps 는 컨테이너 내부(/work)에 설치 → 호스트 깨끗 유지.
sudo docker run --rm --network app_default \
  -v "$WORK/db:/seeds:ro" \
  -e DATABASE_URL="postgresql://celebbase:${PW}@db:5432/celebbase" \
  node:20 sh -c 'cp -r /seeds /work && cd /work && npm install --no-audit --no-fund --silent pg tsx >/dev/null 2>&1 && npx tsx seeds/run.ts'
rm -r "$WORK"
rm -f /tmp/celebase-staging-seed.tar.gz
REMOTE

echo "[seed-staging] 외부 검증 ..."
COUNT=$(curl -s -m 10 "https://staging.celebase.app/api/claims/feed?limit=80" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['claims']))")
echo "[seed-staging] staging /api/claims/feed claims = ${COUNT}"
echo "[seed-staging] done."
