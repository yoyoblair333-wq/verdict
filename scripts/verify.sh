#!/usr/bin/env bash
# VERDICT fresh-clone verification. Run from anywhere:
#   bash scripts/verify.sh
# Installs pinned deps (contracts/.venv, relayer/node_modules), then runs:
#   1 contract tests (pytest: direct-mode GenVM SDK + static schema tier)
#   2 genvm-lint check      3 genvm-lint typecheck
#   4 relayer typecheck     5 relayer tests (unit + stand-in; live tier skips)
#   6 offline demo (one full case through the relayer)
# Prints a PASS/FAIL table and exits non-zero on any failure.
# Needs: python3 (3.12+), node (20+), npm, network for the first install
# (PyPI, npm, and GitHub for the ~200 MB GenVM SDK release on first pytest run).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="${PYTHON:-python3}"
# Pin the GenVM release genvm-lint validates against (audit P2-4). Without it the
# linter asks GitHub for the latest release and may lint against a newer GenVM
# than the v0.2 SDK this contract targets.
export GENVM_VERSION="${GENVM_VERSION:-v0.2.16}"
declare -a NAMES=() RESULTS=()
step() { # name, command...
  local name="$1"; shift
  echo; echo "==> $name"; echo "    \$ $*"
  local t0=$SECONDS
  if "$@"; then RESULTS+=("PASS"); else RESULTS+=("FAIL"); fi
  NAMES+=("$name ($((SECONDS - t0))s)")
}
echo "VERDICT verify: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "python: $($PY --version 2>&1)  node: $(node --version 2>&1)  npm: $(npm --version 2>&1)"

step "setup: python venv + pinned requirements" bash -c "$PY -m venv contracts/.venv && contracts/.venv/bin/python -m pip install -q --upgrade pip && contracts/.venv/bin/python -m pip install -q -r contracts/requirements.txt"
step "setup: relayer npm ci (package-lock.json)" bash -c "cd relayer && npm ci --no-audit --no-fund --loglevel=error"
step "contract tests (pytest)" bash -c "cd contracts && ../contracts/.venv/bin/python -m pytest -q"
step "genvm-lint check" bash -c "cd contracts && .venv/bin/genvm-lint check judge_router.py"
step "genvm-lint typecheck" bash -c "cd contracts && .venv/bin/genvm-lint typecheck judge_router.py"
step "relayer typecheck (tsc --noEmit)" bash -c "cd relayer && npm run --silent typecheck"
step "relayer tests (node --test)" bash -c "cd relayer && npm test 2>&1 | grep -E '^# (tests|pass|fail|skipped)|^not ok'; exit \${PIPESTATUS[0]}"
step "offline demo (make demo)" bash -c "cd relayer && npm run --silent demo"

echo; echo "================ SUMMARY ================"
fail=0
for i in "${!NAMES[@]}"; do
  printf '%-4s  %s\n' "${RESULTS[$i]}" "${NAMES[$i]}"
  [ "${RESULTS[$i]}" = "PASS" ] || fail=1
done
echo "========================================="
if [ $fail -eq 0 ]; then echo "VERIFY: PASS"; else echo "VERIFY: FAIL"; fi
exit $fail
