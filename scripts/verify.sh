#!/usr/bin/env bash
# VERDICT fresh-clone verification. Run from anywhere:
#   bash scripts/verify.sh
# Installs pinned deps (contracts/.venv, relayer/node_modules, web/node_modules
# + Playwright's Chromium), then runs:
#   1 contract tests (pytest: direct-mode GenVM SDK + static schema tier;
#     includes the PatternLedger unit and adversarial suites in contracts/tests/direct)
#   1b PatternLedger reuse-kit template tests (examples/pattern-ledger/tests)
#   2 genvm-lint check      3 genvm-lint typecheck   (both contracts)
#   4 relayer typecheck     5 relayer tests (unit + stand-in; live tier skips)
#   6 offline demo (one full case through the relayer)
#   7 web build             8 web offline tests (node + stubbed-snapshot browser
#                             tests; the studionet RPC is blocked, no network)
# The web LIVE tier (real studionet reads) is optional: cd web && npm run test:live
# Prints a PASS/FAIL table and exits non-zero on any failure.
# Needs: python3 (3.12+), node (20+; CI runs 22), npm, network for the first install
# (PyPI, npm, GitHub for the GenVM SDK release on first pytest run, and the
# Playwright Chromium download; about 500 MB in total on a cold machine).
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
step "setup: web npm ci + Playwright Chromium" bash -c "cd web && npm ci --no-audit --no-fund --loglevel=error && npx --no-install playwright install chromium"
step "contract tests (pytest)" bash -c "cd contracts && ../contracts/.venv/bin/python -m pytest -q"
step "PatternLedger reuse-kit template tests (pytest)" bash -c "contracts/.venv/bin/python -m pytest -q -p no:cacheprovider examples/pattern-ledger/tests"
step "genvm-lint check (all contracts)" bash -c "cd contracts && .venv/bin/genvm-lint check judge_router.py && .venv/bin/genvm-lint check pattern_ledger.py && .venv/bin/genvm-lint check red_flag_court.py"
step "genvm-lint typecheck (all contracts)" bash -c "cd contracts && PATH=\"$PWD/contracts/.venv/bin:\$PATH\" .venv/bin/genvm-lint typecheck judge_router.py && PATH=\"$PWD/contracts/.venv/bin:\$PATH\" .venv/bin/genvm-lint typecheck pattern_ledger.py && PATH=\"$PWD/contracts/.venv/bin:\$PATH\" .venv/bin/genvm-lint typecheck red_flag_court.py"
step "relayer typecheck (tsc --noEmit)" bash -c "cd relayer && npm run --silent typecheck"
step "relayer tests (node --test)" bash -c "cd relayer && npm test > \"$LOGDIR/relayer-tests.raw\" 2>&1; s=\$?; grep -E '^# (tests|pass|fail|skipped)|^not ok' \"$LOGDIR/relayer-tests.raw\"; [ \$s -eq 0 ] || tail -n 80 \"$LOGDIR/relayer-tests.raw\"; exit \$s"
step "offline demo (make demo)" bash -c "cd relayer && npm run --silent demo"
step "web build (esbuild + evidence index)" bash -c "cd web && npm run --silent build"
step "web offline tests (no network)" bash -c "cd web && npm test > \"$LOGDIR/web-tests.raw\" 2>&1; s=\$?; grep -E '^# (tests|pass|fail|skipped)|^not ok' \"$LOGDIR/web-tests.raw\"; [ \$s -eq 0 ] || tail -n 80 \"$LOGDIR/web-tests.raw\"; exit \$s"

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
