# Verify log

`scripts/verify.sh` run from a **fresh copy** of the repository (no `node_modules`, no `.venv`, no build output, no `data/`, no `.env*`) with an **empty `HOME`**, so the pip, npm, GenVM SDK (`~/.cache/gltest-direct`) and genvm-linter caches were all cold. Copy made with `tar --exclude=node_modules --exclude=.venv --exclude=data --exclude=dist* --exclude=__pycache__ --exclude=.env*`.

Two such runs were made on 2026-10-31: one mid-way (all PASS) and this final one on the finished tree. Machine: Linux, Python 3.13.18, Node 22.23.4, npm 10.9.9, behind an HTTPS proxy. CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs the same script on ubuntu-latest with Python 3.12 and Node 20. Only change to the raw output: the GenVM download progress bar and gltest's `INFO:` config banner are elided.

## Final run

```
VERDICT verify: 2026-10-31T17:52:46Z
python: Python 3.13.18  node: v22.23.4  npm: 10.9.9

==> setup: python venv + pinned requirements
    $ bash -c python3 -m venv contracts/.venv && contracts/.venv/bin/python -m pip install -q --upgrade pip && contracts/.venv/bin/python -m pip install -q -r contracts/requirements.txt

==> setup: relayer npm ci (package-lock.json)
    $ bash -c cd relayer && npm ci --no-audit --no-fund --loglevel=error

added 304 packages in 7s

==> contract tests (pytest)
    $ bash -c cd contracts && ../contracts/.venv/bin/python -m pytest -q
WARNING: File `gltest.config.yaml` not found in the current directory, using default config, create a `gltest.config.yaml` file to manage multiple networks
........................................................................ [ 44%]
........................................................................ [ 88%]
........s..........                                                      [100%]
162 passed, 1 skipped in 58.58s

==> genvm-lint check
    $ bash -c cd contracts && .venv/bin/genvm-lint check judge_router.py
Warning: could not resolve latest GenVM version (HTTP Error 403: Forbidden); falling back to v0.2.16

Downloading: [progress elided] 206.6/206.6 MB (100%)
✓ Lint passed (3 checks)
✓ Validation passed
  Contract: JudgeRouter
  Methods: 17 (6 view, 11 write)

==> genvm-lint typecheck
    $ bash -c cd contracts && .venv/bin/genvm-lint typecheck judge_router.py
Type checking judge_router.py...

✓ No type errors found

==> relayer typecheck (tsc --noEmit)
    $ bash -c cd relayer && npm run --silent typecheck

==> relayer tests (node --test)
    $ bash -c cd relayer && npm test 2>&1 | grep -E '^# (tests|pass|fail|skipped)|^not ok'; exit ${PIPESTATUS[0]}
# tests 70
# pass 69
# fail 0
# skipped 1

==> offline demo (make demo)
    $ bash -c cd relayer && npm run --silent demo
VERDICT offline demo (stand-in chain; NOT GenLayer - see docs/LIVE_EVIDENCE.md for real runs)

1. POST /cases            -> 201 case #1, finality ACCEPTED
   receipt number        c55d835a6d6c75a83e307b9ca721b5b146591d3910aeb19b70324784ad88be40
   provenance            All takes relayed by the stream host; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct.
2. POST /judge            -> 202 finality ACCEPTED, verdict_final=false (no card yet)
3. after FINALIZED+SUCCESS -> winner entry 1, split 4-1, card=issued, confirmed_tier=1
4. winner tries to appeal -> 403 (losing side only)
   winner tries to revoke -> 409 (closed after Tier 1 is final)
5. loser appeals          -> 202 paid_with free, finality ACCEPTED
6. Appeals Court (7)      -> winner entry 0, split 4-3, status appealed
7. Supreme Court appeal   -> 202 paid_with credit
8. Supreme Court (9)      -> winner entry 0, split 6-3, status final
   Twitch calls          create:2, lock:pred1, resolve:pred1:o0
9. inbox                  3 hash-chained receipts, chain VALID
   webhooks              case.opened, case.judged, case.appealed, case.appealed

DEMO: PASS

================ SUMMARY ================
PASS  setup: python venv + pinned requirements (22s)
PASS  setup: relayer npm ci (package-lock.json) (7s)
PASS  contract tests (pytest) (63s)
PASS  genvm-lint check (93s)
PASS  genvm-lint typecheck (5s)
PASS  relayer typecheck (tsc --noEmit) (21s)
PASS  relayer tests (node --test) (12s)
PASS  offline demo (make demo) (9s)
=========================================
VERIFY: PASS
exit=0
```

## Guard mutation sweep (`python3 scripts/mutation_check.py`)

Each line deletes one safety guard, re-runs the relevant suite, and restores the file. KILLED means the suite failed without the guard, so a test depends on it.

```
consent: KILLED (tests fail)
18+: KILLED (tests fail)
losing-side: KILLED (tests fail)
max-appeals: KILLED (tests fail)
finalized-gate: KILLED (tests fail)
execution-success: KILLED (tests fail)
appeal-needs-final: KILLED (tests fail)
digest-match: KILLED (tests fail)
expiry: KILLED (tests fail)
revocation: KILLED (tests fail)
shadow: KILLED (tests fail)
no-pii: KILLED (tests fail)
credit-debit: KILLED (tests fail)
pin: KILLED (tests fail)
pkg-digest-ts: KILLED (tests fail)
consent-py: KILLED (tests fail)
digest-py: KILLED (tests fail)
judge-digest-py: KILLED (tests fail)
expiry-py: KILLED (tests fail)
revoked-py: KILLED (tests fail)
score-range-py: KILLED (tests fail)
from-tier-py: KILLED (tests fail)
closed-keys-py: KILLED (tests fail)
revoke-after-confirm-py: KILLED (tests fail)
appeal-needs-confirm-py: KILLED (tests fail)
revoke-window: KILLED (tests fail)
reread-judge: KILLED (tests fail)
draft-deadline: KILLED (tests fail)
provider-fail-closed: KILLED (tests fail)
durable-credits-default: KILLED (tests fail)
durable-state: KILLED (tests fail)
```

## Earlier run (same procedure, mid-way through the upgrade)

Summary only; the full transcript matched the final run except for test counts (relayer 68 passed then, 69 now).

```
================ SUMMARY ================
PASS  setup: python venv + pinned requirements (123s)
PASS  setup: relayer npm ci (package-lock.json) (7s)
PASS  contract tests (pytest) (59s)
PASS  genvm-lint check (85s)
PASS  genvm-lint typecheck (2s)
PASS  relayer typecheck (tsc --noEmit) (12s)
PASS  relayer tests (node --test) (7s)
PASS  offline demo (make demo) (6s)
=========================================
VERIFY: PASS
exit=0
```
