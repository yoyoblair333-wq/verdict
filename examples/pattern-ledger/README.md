# PatternLedger reuse kit

Client examples and two fork templates for `contracts/pattern_ledger.py`, the
Scam Pattern Ledger: a GenLayer Intelligent Contract that stores abstract,
privacy-screened crowd reports and uses validator consensus to decide (a) does
this report identify anyone, (b) is it a coherent report, and (c) is it a new
pattern or another sighting of a stored one.

Live deployment used below: studionet, contract
`0x59C6047571bCE66828C733330fc9B5C88afEaE4D`, owner
`0x920fbbCf2106B693A857D1995c198e341220a46A`, relayer
`0x34653Fb290480a8C99B4D92D4857123B5624c37d` (see `docs/LIVE_EVIDENCE.md`).
It holds synthetic, staff-written records only.

| File | What it is | How far it is checked |
|---|---|---|
| `read_ledger.mjs` | Read-only client, genlayer-js 1.1.8: `get_config`, `list_recent`, `get_pattern`, `top_patterns_since` | Run against the live contract, output below |
| `read_ledger.py` | The same reads in Python with genlayer-py | Run against the live contract, output below |
| `submit_pattern.mjs` | Operator write example (relayer/owner key from env only); dry run by default | Dry run and both key guards run; `--send` NOT run for this kit |
| `adapt_phishing_domain_ledger.py` | ADAPTATION TEMPLATE, not deployed: phishing-domain reports | `genvm-lint check` + `typecheck` pass; direct-mode tests, LLM mocked |
| `adapt_product_defect_ledger.py` | ADAPTATION TEMPLATE, not deployed: product-defect reports | `genvm-lint check` + `typecheck` pass; direct-mode tests, LLM mocked |
| `tests/test_templates.py` | 25 direct-mode tests for the two templates | `25 passed` (see "Template tests") |

## 1. Read the live ledger (no key)

Views run through `gen_call`. Both clients make a throwaway account in memory
only because the client API wants a `from` address; it is never funded or saved.

```bash
(cd relayer && npm ci)                       # pinned genlayer-js 1.1.8
NODE_USE_ENV_PROXY=1 node examples/pattern-ledger/read_ledger.mjs [address]
```

`NODE_USE_ENV_PROXY=1` matters only behind an HTTP(S) proxy (Node 22+).
genlayer-js returns integers as `bigint` and dicts as `Map`; the script's
`plain()` helper converts them for printing.

Real output, 2026-11-01 about 16:53 UTC (two long lists in `get_config` are
shortened where marked; nothing else is edited):

```text
get_config: {
  "categories": [ ...8 values, same as the Python run below... ],
  "dedup_candidates": 10,
  "flag_codes": [ ...16 codes, "urgency" ... "money_offer"... ],
  "history_cap": 100,
  "max_summary_chars": 200,
  "next_id": 2,
  "owner": "0x920fbbCf2106B693A857D1995c198e341220a46A",
  "paused": false,
  "relayer": "0x34653Fb290480a8C99B4D92D4857123B5624c37d",
  "schema": "verdict.pattern-ledger.v1"
}

list_recent(5): 1 pattern(s)
  #1 [delivery] x4  urgency,upfront_payment,link_pressure
      "A text claims a parcel is on hold and asks for a small redelivery fee through a link before it is sent back."

get_pattern(1): {
  "category": "delivery",
  "first_seen": "2026-11-01T01:57:04Z",
  "flag_codes": [ ...16 codes, "urgency" ... "money_offer"... ],
  "history": [
    {
      "at": "2026-11-01T01:57:04Z",
      "flag_codes": [
        "urgency",
        "upfront_payment",
        "link_pressure"
      ],
      "kind": "new"
    },
    {
      "at": "2026-11-01T01:57:26Z",
      "flag_codes": [
        "urgency",
        "link_pressure",
        "threat_of_loss"
      ],
      "kind": "sighting"
    },
    {
      "at": "2026-11-01T04:32:45Z",
      "flag_codes": [
        "urgency",
        "upfront_payment",
        "link_pressure",
        "threat_of_loss"
      ],
      "kind": "sighting"
    },
    {
      "at": "2026-11-01T16:30:15Z",
      "flag_codes": [
        "urgency",
        "upfront_payment",
        "link_pressure",
        "impersonation_claim",
        "threat_of_loss"
      ],
      "kind": "sighting"
    }
  ],
  "id": 1,
  "last_seen": "2026-11-01T16:30:15Z",
  "sightings": 4,
  "summary": "A text claims a parcel is on hold and asks for a small redelivery fee through a link before it is sent back."
}

top_patterns_since("2026-10-02T16:53:31Z", 5):
  #1 sightings_since=4 total=4 last_seen=2026-11-01T16:30:15Z
```

The four `history` entries are one `new` plus three dedup sightings: each later
submission carried a different flag-code set (shown per entry), and the
consensus outcome was "same as #1" each time. The second submission's wording
is in `docs/live/pattern-ledger-run.json`.
`top_patterns_since` counts from that kept history (newest 100 entries per
pattern), which is what a weekly "scams going around" digest would call.

### Python

`genlayer-py` is not pinned directly in `contracts/requirements.txt`; it comes
in as a dependency of the pinned `genlayer-test==0.29.2` (resolved to
`genlayer-py 0.16.3` here).

```bash
python3 -m venv contracts/.venv && contracts/.venv/bin/pip install -r contracts/requirements.txt
contracts/.venv/bin/python examples/pattern-ledger/read_ledger.py [address]
```

Real output, same session (the 7-day window starts at the run time minus 7 days):

```text
get_config: {
  "schema": "verdict.pattern-ledger.v1",
  "owner": "0x920fbbCf2106B693A857D1995c198e341220a46A",
  "relayer": "0x34653Fb290480a8C99B4D92D4857123B5624c37d",
  "paused": false,
  "next_id": 2,
  "dedup_candidates": 10,
  "max_summary_chars": 200
}
  16 flag codes, categories: delivery, account-lock, romance, job, prize, investment, impersonation, other

list_recent(5): 1 pattern(s)
  #1 [delivery] x4  urgency,upfront_payment,link_pressure

get_pattern(1) history:
  2026-11-01T01:57:04Z  new      urgency,upfront_payment,link_pressure
  2026-11-01T01:57:26Z  sighting urgency,link_pressure,threat_of_loss
  2026-11-01T04:32:45Z  sighting urgency,upfront_payment,link_pressure,threat_of_loss
  2026-11-01T16:30:15Z  sighting urgency,upfront_payment,link_pressure,impersonation_claim,threat_of_loss

top_patterns_since("2026-10-25T16:53:52Z", 5):
  #1 sightings_since=4 total=4
```

## 2. Submitting, for operators

Only the stored `relayer` or `owner` address may call `submit_pattern`; any
other caller reverts `[EXPECTED] only relayer or owner`. End users never sign.
In VERDICT the production path is `relayer/src/lib/pattern.ts` (opt-in, a
per-user daily cap, two redaction passes, an LLM-written abstract summary, the
same deterministic screen, SHADOW or LIVE mode, a journal). `submit_pattern.mjs`
shows only the chain call so the shape is easy to copy:

1. read `get_config` and run the contract's deterministic checks locally
   (codes, category, length, digits, `@`, currency, URLs); the contract re-runs
   them and is authoritative, the local check only saves a failed transaction;
2. pick a random `request_key` (never derived from the user or the text, it is
   stored on-chain) so a retry is idempotent;
3. `writeContract("submit_pattern", [flag_codes, category, summary, request_key])`;
4. poll `getTransaction` until a decided state, then reconcile with
   `get_by_request_key(request_key)`: `pattern_id: 0` means nothing was stored
   (`[REJECTED]`, `[EXPECTED]`, `[LLM_ERROR]`, or validators did not agree).

The key is read only from `RELAYER_PRIVATE_KEY` in the environment; it never
appears in the file, the command line or the output.

```bash
node examples/pattern-ledger/submit_pattern.mjs            # dry run, no key needed
set -a; . relayer/.env.local; set +a                       # operator machine only
NODE_USE_ENV_PROXY=1 node examples/pattern-ledger/submit_pattern.mjs --send
```

Real dry-run output:

```text
pre-check ok; call: {
  "address": "0x59C6047571bCE66828C733330fc9B5C88afEaE4D",
  "functionName": "submit_pattern",
  "args": [
    [
      "code_request",
      "impersonation_claim",
      "urgency"
    ],
    "account-lock",
    "A message poses as account support, says the account will be locked today and asks for the login code just sent by text.",
    "ex_1ab76e35f91ff1fce2e3f5ba"
  ],
  "value": "0"
}
dry run (add --send with RELAYER_PRIVATE_KEY set to broadcast)
```

Also run: `--send` with no key stops with `RELAYER_PRIVATE_KEY missing or
malformed (value not printed)`, and `--send` with a random key stops before
broadcasting with `key's address 0x… is neither relayer nor owner; the call
would revert`. A real `--send` was **not** run for this kit, to keep the live
ledger's record set unchanged; the same call shape was used for the live run in
`scripts/pattern_live.mjs` / `docs/live/pattern-ledger-run.json`.

## 3. Forking the primitive: two adaptation templates

Both templates are **examples, not deployed**. They pass `genvm-lint check`
and `genvm-lint typecheck`, and 25 direct-mode tests with a mocked LLM. They
have never run on a network, and their prompts have not been tried against a
real model, so how well a real model answers them is unknown.

### What changes per domain

| | PatternLedger (live) | Phishing domains (template) | Product defects (template) |
|---|---|---|---|
| Record | `flag_codes`, `category`, `summary` ≤200 | `domain` (stored, it is the subject), `lure_codes`, `sector`, `note` ≤160 | `product_line` ≤80, `defect_codes`, `category`, `summary` ≤200 |
| Codes / categories | 16 scam flags / 8 scam types | 10 lure codes / 9 sectors | 12 defect codes / 8 product categories |
| Deterministic gate | summary: no digits, `@`, currency, URL or bare domain | `domain` must be a bare hostname (no scheme, path, port, user-info, IP literal); `note` keeps the digit/`@`/currency/URL screen | `product_line` may hold digits (model numbers) but no URL or `@`; `summary` keeps the full screen (keeps out order and serial numbers, prices) |
| Judge question (a) | any identifying data, brands included | only data on a **private** person; brand names are allowed, naming the imitated brand is the point | identifies a buyer or a purchase (name, address, order or serial number, store branch, date, price) |
| Judge question (b) | coherent scam pattern | plausible phishing report; false for the brand's own real domain, jokes, grudges | coherent **physical** defect; false for reviews, delivery or service complaints, accusations about the maker |
| Dedup | LLM, against up to 10 stored patterns in the same category | **deterministic**: the normalised domain is the key, so no LLM dedup | LLM, but candidates limited to the same category **and** the same normalised product line |
| Extra | none | owner `set_status(domain, "cleared")` correction path; a cleared domain refuses new reports | none |

The phishing template drops LLM dedup on purpose: PatternLedger asks the model
"same pattern?" only because two free-text scam descriptions have no exact key.
A domain is an exact key, so the deterministic answer is cheaper and cannot
disagree. Use the LLM only where judgement is needed.

### What must stay

These parts are the consensus design. Change them and the fork stops being safe
or stops reaching agreement reliably:

1. **Deterministic gates first.** Caller, pause, request key, enums, lengths,
   the injection-phrase screen and the PII screen all run before any LLM call.
   Cheap, identical on every node, and they keep obvious personal data from
   ever reaching a prompt.
2. **`gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` with a recomputing
   validator.** The validator returns `False` if the leader errored, checks the
   leader payload's exact key set and types, runs the same prompt itself, and
   compares.
3. **Exact match on small, closed outputs.** The model answers two booleans
   (plus a `new`/`same` decision and a candidate id where dedup is semantic).
   Validators require an exact match; there is no similarity threshold. The
   dedup decision is compared only when the record would be stored, because
   when both sides reject it has no effect.
4. **Reject by reverting.** `[REJECTED]` raises, so nothing is stored and no
   idempotency entry is written; a rejected report leaves no trace on-chain
   beyond the failed transaction.
5. **Idempotency on `request_key`, checked before the LLM.** A retry with the
   same key and record returns the first result with no new model call; the
   same key with a different record reverts.
6. **Untrusted text is quoted, never obeyed.** Delimiters (`<<<SUMMARY>>>` and
   so on), fixed rules stated before the data, and the rule that text
   addressing the reviewer makes the record fail (b).
7. **Relayer-only submission.** End users do not sign, so the chain sees the
   relayer's address, not theirs.

### Template tests

Run from the repo root (direct mode loads the GenVM v0.2.16 SDK, the same pin
as `scripts/verify.sh`):

```bash
GENVM_VERSION=v0.2.16 contracts/.venv/bin/python -m pytest -q examples/pattern-ledger/tests
cd examples/pattern-ledger && ../../contracts/.venv/bin/genvm-lint check adapt_phishing_domain_ledger.py
../../contracts/.venv/bin/genvm-lint check adapt_product_defect_ledger.py
```

Result in this session: `25 passed`; `genvm-lint check` gave
`✓ Lint passed (3 checks)` and `✓ Validation passed` for both, and
`genvm-lint typecheck` gave `✓ No type errors found` for both.

The tests cover, per template: a new record and a sighting, the deterministic
gates (hostname gate; note/summary screen; model numbers allowed in
`product_line` only), both LLM rejection paths reverting with nothing stored,
validator disagreement on each boolean (and, for defects, on the dedup decision) and on a malformed reply, dedup not
compared when both sides reject, request-key replay without an LLM call and
key reuse with different content, the injection screen, the caller
restriction, and the phishing owner "cleared" path. Two hand mutations were
tried and each was caught by a failing test (removing the product-line scope
from defect dedup; making the phishing validator ignore the plausibility
boolean). These tests are not part of `scripts/verify.sh`, which only collects
`contracts/tests`.

## Scope

`contracts/pattern_ledger.py` is not modified by anything here (it must stay
byte-identical to the deployed code). The templates are teaching material for
other builders; using one for real would need its own prompt testing against
real models, a privacy review for the new domain, and (for a public phishing or
defect list) a correction and dispute process beyond the owner switch shown.
