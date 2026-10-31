#!/usr/bin/env bash
# VERDICT fresh-clone verification. Run from anywhere:
#   bash scripts/verify.sh
# Installs pinned deps (contracts/.venv, relayer/node_modules), then runs:
#   1 contract tests (pytest: direct-mode GenVM SDK + static schema tier)
#   2 genvm-lint check      3 genvm-lint typecheck
#   4 relayer typecheck     5 relayer tests (unit + stand-in; live tier skips)
#   6 offline demo (one full case through the relayer)
# Prints a PASS/FAIL table and exits non-zero on any failure.
# Needs: python3 (3.12+), node (20+; CI runs 22), npm, network for the first install
# (PyPI, npm, and GitHub for the ~200 MB GenVM SDK release on first pytest run).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="${PYTHON:-python3}"
# Pin the GenVM release that genvm-lint validates against (audit P2-4) AND that
# the direct-mode contract tests load (contracts/tests/direct/conftest.py).
# Unpinned, both ask GitHub for the latest release, so a fresh machine could
# test against a newer GenVM than the v0.2 SDK this contract targets.
export GENVM_VERSION="${GENVM_VERSION:-v0.2.16}"
declare -a NAMES=() RESULTS=()
LOGDIR="$(mktemp -d "${TMPDIR:-/tmp}/verdict-verify.XXXXXX")"
in_ci() { [ "${GITHUB_ACTIONS:-}" = "true" ]; }
# Last lines of a step's output, without download progress spam.
tail_clean() { tr '\r' '\n' < "$1" | grep -vE '^\s*$|^Downloading: |^ *[0-9]+% \(' | tail -n "${2:-25}"; }
step() { # name, command...
  local name="$1"; shift
  local n=${#NAMES[@]} log
  log="$LOGDIR/step-$n.log"
  echo; echo "==> $name"; echo "    \$ $*"
  echo "[verify] START $name" >&2
  in_ci && echo "::group::$name"
  local t0=$SECONDS rc
  "$@" 2>&1 | tee "$log"
  rc=${PIPESTATUS[0]}
  in_ci && echo "::endgroup::"
  if [ "$rc" -eq 0 ]; then
    RESULTS+=("PASS")
    echo "[verify] PASS  $name ($((SECONDS - t0))s)" >&2
  else
    RESULTS+=("FAIL")
    {
      echo "[verify] FAIL  $name (exit $rc, $((SECONDS - t0))s)"
      echo "[verify] failing command: $*"
      echo "[verify] last lines of its output:"
      tail_clean "$log" 40 | sed 's/^/[verify]   | /'
    } >&2
    if in_ci; then
      # Annotations are readable without the log host:
      #   gh api repos/<owner>/<repo>/check-runs/<job id>/annotations
      local msg
      msg="$(printf 'exit %s: %s\n%s' "$rc" "$*" "$(tail_clean "$log" 25)")"
      msg="${msg//'%'/'%25'}"; msg="${msg//$'\r'/}"; msg="${msg//$'\n'/'%0A'}"
      echo "::error title=verify step failed: $name::$msg"
    fi
  fi
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
step "relayer tests (node --test)" bash -c "cd relayer && npm test > \"$LOGDIR/relayer-tests.raw\" 2>&1; s=\$?; grep -E '^# (tests|pass|fail|skipped)|^not ok' \"$LOGDIR/relayer-tests.raw\"; [ \$s -eq 0 ] || tail -n 80 \"$LOGDIR/relayer-tests.raw\"; exit \$s"
step "offline demo (make demo)" bash -c "cd relayer && npm run --silent demo"

echo; echo "================ SUMMARY ================"
fail=0
for i in "${!NAMES[@]}"; do
  printf '%-4s  %s\n' "${RESULTS[$i]}" "${NAMES[$i]}"
  [ "${RESULTS[$i]}" = "PASS" ] || fail=1
done
echo "========================================="
if [ $fail -eq 0 ]; then echo "VERIFY: PASS"; else echo "VERIFY: FAIL (failing steps are marked [verify] FAIL on stderr above)"; fi
echo "[verify] done: $([ $fail -eq 0 ] && echo PASS || echo FAIL)" >&2
exit $fail
