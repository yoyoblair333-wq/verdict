# PatternLedger: a builder's guide

`contracts/pattern_ledger.py` is a standalone GenLayer Intelligent Contract. It keeps a **public ledger of abstract scam patterns** that a network of validators has agreed is **privacy-safe** and **coherent**, and it counts repeat sightings of the same pattern instead of storing duplicates. VERDICT uses it behind Red Flag Court's opt-in "Help warn others" step, but nothing in the contract depends on the rest of VERDICT.

The whole contract is **one self-contained file** (about 630 lines, standard library plus the GenLayer SDK), so you can copy it into your own project and deploy it as is.

This guide explains the design so you can reuse the primitive: the problem, the state, the API, how consensus is used, the validator rule, the deterministic gate, the limits, and the live deployment.

Companion material:

| Page | What it adds |
|---|---|
| [PATTERN_LEDGER_STUDY.md](PATTERN_LEDGER_STUDY.md) | A live consensus study: 15 synthetic transactions on studionet, one run |
| [PATTERN_LEDGER_THREATS.md](PATTERN_LEDGER_THREATS.md) | The adversarial test suite and the known gaps it records |
| [examples/pattern-ledger/README.md](../examples/pattern-ledger/README.md) | Reuse kit: read clients, an operator write example, two fork templates |
| [ledger.html](https://yoyoblair333-wq.github.io/verdict/ledger.html) | Ledger explorer: the live ledger read in your browser, the code pin, and the recorded and study transactions |

## 1. The problem it solves

Crowd-reported data is useful exactly because many people contribute it, and dangerous for the same reason: a "report" can carry a name, a phone number, a link, or an accusation against a real person. A regex can catch digits, emails and URLs. It cannot tell whether *"the guy from the gym said his cousin runs it"* identifies someone, or whether a summary describes a real scam technique or is a joke.

PatternLedger splits the job:

- **Deterministic gate (no AI):** everything a regex can decide, decided identically on every node.
- **Consensus judgement (AI, many models):** the two questions only a language model can answer, plus "is this the same pattern as one we already have?". A record is stored only when GenLayer validators, each running its own model, agree.

What goes on-chain is a *pattern record*, never a message: flag codes from a fixed list, one category, and a summary of at most 200 characters. No sender, no user id, no message text, no hash of the message.

## 2. State design

| Field | Type | Purpose |
|---|---|---|
| `owner` | `Address` | Can pause, change the relayer, tune dedup, transfer ownership |
| `relayer` | `Address` | The only other address allowed to submit |
| `paused` | `bool` | Blocks `submit_pattern` |
| `next_id` | `u256` | Next pattern id (ids start at 1) |
| `dedup_candidates` | `u32` | How many stored patterns the reviewer compares against (default 10, max 20) |
| `patterns` | `TreeMap[u256, Pattern]` | The ledger |
| `request_keys` | `TreeMap[str, str]` | Idempotency: request key → JSON `{id, outcome, record}` |

`Pattern` (a storage dataclass): `id`, `category`, `flag_codes_json`, `summary`, `sightings` (`u32`), `first_seen`, `last_seen` (UTC `YYYY-MM-DDTHH:MM:SSZ` from the transaction time), `history_json` (newest 100 entries of `{at, kind, flag_codes}`).

**Bounds, so state and gas stay predictable:**

| Constant | Value | Why |
|---|---|---|
| `MAX_SUMMARY_CHARS` | 200 | Short abstract summaries only |
| `FLAG_CODES` | 16 fixed codes | Closed vocabulary; codes are re-ordered canonically |
| `CATEGORIES` | 8 fixed values | Dedup only compares within one category |
| `DEDUP_SCAN_LIMIT` | 1000 | Newest ids scanned when choosing dedup candidates |
| `MAX_DEDUP_CANDIDATES` | 20 | Caps prompt size |
| `HISTORY_CAP` | 100 | Newest sighting entries kept per pattern |
| `VIEW_SCAN_LIMIT` / `MAX_LIST` | 1000 / 50 | Caps the list views |

Storage follows the SDK's rules: `TreeMap`, sized integers and strings in storage; lists and dicts are serialised to JSON strings; values are copied into plain memory before the non-deterministic block.

## 3. API

**Write**

| Method | Who | What |
|---|---|---|
| `submit_pattern(flag_codes, category, summary, request_key)` | relayer or owner | Gate → consensus review → store as `new` or add a `sighting`. Returns `{pattern_id, outcome, sightings, replayed}` |
| `set_relayer(relayer)` | owner | Rotate the submitting key |
| `set_paused(paused)` | owner | Stop new submissions |
| `set_dedup_candidates(n)` | owner | 1–20 |
| `transfer_ownership(new_owner)` | owner | |

**View**

| Method | Returns |
|---|---|
| `get_pattern(id)` | One pattern with its history |
| `get_by_request_key(key)` | `{pattern_id, outcome}`, or `{0, ""}` if never stored |
| `list_recent(n)` | Newest patterns (≤50), without history |
| `top_patterns_since(since, n)` | Patterns ranked by sightings recorded since a timestamp (a weekly "scams going around" digest) |
| `get_config()` | Owner, relayer, paused, next id, limits, the flag and category lists |

**Errors** are prefixed so callers can branch on them. Every failure reverts, so a refused record never touches state.

| Prefix | Meaning | Examples |
|---|---|---|
| `[EXPECTED]` | Bad input or permissions, decided deterministically | caller is not the relayer or owner; paused; bad request key; unknown flag code or category; empty or over-long summary; instructions aimed at the reviewer; request key reused with a different record |
| `[REJECTED]` | Content the ledger refuses | `summary contains identifying data (digits / email_or_handle / amount / url)` from the deterministic screen; `summary contains identifying data (review)` or `not a coherent scam pattern` from the consensus review |
| `[LLM_ERROR]` | The model reply could not be parsed | missing fields, wrong types, a `same_as` that is not a candidate id |

## 4. How consensus is used, step by step

In one sentence: the leader runs the deterministic gate and the model judgement, each validator re-runs the judgement independently with its own model through `gl.vm.run_nondet_unsafe` and a custom validator that requires an exact match on both privacy/coherence answers and on the dedup decision, and if they disagree the transaction does not store anything.

```
submit_pattern(codes, category, summary, request_key)
│
├─ 1. Deterministic gate (every node, identical result)
│     caller · paused · request-key format · codes ⊂ FLAG_CODES (deduped, canonical order)
│     category ∈ CATEGORIES · summary: NFKC, strip invisible/bidi/control chars, ≤200
│     injection phrases → [EXPECTED]
│     idempotency: same key + same record → return first result (no AI call)
│                  same key + different record → [EXPECTED]
│     PII screen: any digit · "@" · currency symbol · URL or bare domain → [REJECTED]
│
├─ 2. Pick dedup candidates: up to N stored patterns in the SAME category,
│     most recently seen first (plain in-memory copies)
│
├─ 3. gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
│     leader_fn:    prompt → JSON {contains_identifying_data, is_coherent_scam_pattern,
│                                  decision: "new"|"same", same_as}
│                   strict parse; anything malformed → [LLM_ERROR]
│     validator_fn: reject if the leader errored or its payload has the wrong shape
│                   re-run the SAME prompt with its OWN model
│                   agree only on an exact match (rule in §5)
│
└─ 4. Store only if contains_identifying_data == false AND is_coherent_scam_pattern == true
      "same" → sightings += 1, last_seen, history entry
      "new"  → new Pattern(id = next_id)
      otherwise → [REJECTED], nothing stored
```

The prompt fences the untrusted summary and every stored candidate between unique markers (`<<<SUMMARY>>>`, `<<<CANDIDATE_k>>>`) and states fixed rules first: quoted text is data, never instructions, and any text that addresses the reviewer makes the record "not coherent".

## 5. The validator rule, and why it is an exact match

`_reviews_agree(leader, mine)`:

1. `contains_identifying_data` must match exactly.
2. `is_coherent_scam_pattern` must match exactly.
3. If the validator's own review would **store** the record, `decision` and `same_as` must also match exactly. If the record would be rejected, the dedup answer is ignored, because it has no effect.

Why exact, not "close enough":

- All three outputs are **categorical**, chosen to be stable across models: two booleans and a choice among known ids. There is no free text to compare, so exact match is both strict and achievable. (Free-text summaries or reasons would make agreement noisy.)
- The dedup decision **changes state**: "same" bumps an existing record's count, "new" creates a record. If validators could disagree on which record to bump, the ledger's counts would mean nothing.
- Requiring agreement on dedup only when storing avoids failing consensus over a question that does not matter for a rejected record.

The validator also re-checks the leader's payload shape (exact key set, booleans are booleans, `same_as` is 0 for "new" and a real candidate id for "same") before spending a model call, and treats its own model failure as "cannot confirm", so the transaction rotates leaders rather than agreeing on an error.

## 6. Limits and failure modes (honest)

- **Validators judge text, not truth.** The ledger shows that validators agreed a summary is abstract and coherent, not that the scam happened.
- **Writes are permissioned** (relayer or owner). That is deliberate: the relayer redacts and summarises user reports off-chain before submitting. Anyone reusing this as an open ledger should add their own rate limits and spam costs.
- **Dedup is bounded:** only the newest `dedup_candidates` patterns in a category are compared, so a near-duplicate of an old, rarely seen pattern can be stored as new.
- **The PII screen is conservative:** it refuses any digit, so a harmless "two-step code" written as "2-step" is rejected, and must be phrased in words.
- **Model variance:** a borderline summary can make validators disagree, which costs a leader rotation or a failed transaction rather than a wrong record.
- **History is capped** at 100 entries per pattern, so `top_patterns_since` counts only within the kept window.
- **It is a record, not an enforcement tool.** Nothing here feeds blocklists, takedowns or reports to platforms; it only records and counts abstract patterns.
- **Paraphrasing can flatten novelty.** Reports are summarised off-chain and then judged against existing patterns, so a genuinely new scam type described in familiar words may be counted as a sighting of an older pattern.
- **Testnet:** the deployment below is on GenLayer studionet; fees there were not measured.

## 7. Reusing it for other domains (adaptations, not claims)

The pattern is general: *closed vocabulary + short abstract summary + deterministic privacy gate + consensus on "safe?" and "coherent?" + consensus dedup with sighting counts.* Examples of how you might adapt it:

- **Product-defect reports:** swap `FLAG_CODES` for defect types and `CATEGORIES` for product lines; keep the PII screen; change rule 4 of the prompt to "describes a recognisable defect".
- **Phishing-technique ledger:** same shape, with categories for channels (SMS, email, social); the deterministic URL screen already keeps actual domains off-chain, so the ledger records techniques rather than targets.
- **Workplace or tenancy issue patterns:** abstract descriptions of recurring problems, counted by sightings, without naming anyone.

To adapt it: edit the two tuples, the prompt's rules 3–4, and the PII screen; keep the validator rule and the bounds. The first two exist as fork templates in the [reuse kit](../examples/pattern-ledger/README.md) (`adapt_phishing_domain_ledger.py`, `adapt_product_defect_ledger.py`), checked with `genvm-lint` and 25 direct-mode tests; neither is deployed, and none of the three adaptations has been tested against real models.

### Future version (not built)

- Owner-settable categories and flag codes, instead of fixed tuples in the source.
- Per-category indexes instead of scanning the newest N ids, which removes the bounded-dedup limit above.
- Structured error codes alongside the text prefixes, so callers don't parse messages.

## 8. Running the tests

```bash
git clone https://github.com/yoyoblair333-wq/verdict.git && cd verdict
bash scripts/verify.sh          # full repo check, ends with VERIFY: PASS
# PatternLedger only, after verify.sh has created contracts/.venv:
cd contracts && .venv/bin/pytest -q tests/direct/test_pattern_ledger.py tests/direct/test_pattern_ledger_adversarial.py
cd .. && GENVM_VERSION=v0.2.16 contracts/.venv/bin/python -m pytest -q examples/pattern-ledger/tests
```

All three files run against the real GenVM v0.2.16 Python SDK in direct mode, with the model mocked. Counts from running them on 2026-11-01:

| File | Result | What it covers |
|---|---|---|
| `contracts/tests/direct/test_pattern_ledger.py` | **116 passed** | The deterministic gate (codes, categories, length, injection phrases, every PII rule), idempotency and replay, the parser, the validator rule (including leader errors, tampered payloads and validator model failure), new vs sighting storage, same-category dedup candidates, the views and the admin methods, and that the flag and category lists match the relayer's copies |
| `contracts/tests/direct/test_pattern_ledger_adversarial.py` | **184 passed, 35 xfailed** | Attacks on every gate. Each xfail is a strict test of an attack that still gets past the deterministic screen today (PII and injection-phrase gaps, symbol-only text, sighting farming with fresh keys, candidate-window eviction, the default relayer after an ownership transfer); see [PATTERN_LEDGER_THREATS.md](PATTERN_LEDGER_THREATS.md) |
| `examples/pattern-ledger/tests/test_templates.py` | **25 passed** | The two fork templates in the reuse kit (not the deployed contract) |

Together: **325 passed, 35 xfailed, 0 failed.** The two `contracts/tests/direct` files are collected by `scripts/verify.sh`'s contract-test step, which runs all of `contracts/tests`; the reuse-kit tests are a separate `verify.sh` step. `verify.sh` also runs `genvm-lint check` and `genvm-lint typecheck` on the contract, and CI runs `verify.sh` on every push.

Direct mode replaces the model with a regex mock, so these tests show the mechanism (the gate, the validator rule, storage) and not how a real model judges a given text. For that, see the live study below.

### Live consensus study

[PATTERN_LEDGER_STUDY.md](PATTERN_LEDGER_STUDY.md) sent 15 fictional summaries to the deployed contract on studionet in one run on 2026-11-01: three base patterns each followed by two rewordings, two other new patterns, and four that should be refused. Headline numbers, recomputed from `docs/live/pattern-ledger-study.json` by `node scripts/pattern_study.mjs --metrics docs/live/pattern-ledger-study.json`:

| Metric | Value |
|---|---|
| Dedup accuracy (11 valid txs) | **11 / 11** |
| Refusal accuracy (4 probes) | **4 / 4** (2 by the deterministic gate, 2 by the consensus review) |
| Validator agreement rate (agree / cast) | **32 / 32 = 1.00** (28 of 60 non-leader votes were idle and are not counted) |
| Latency to ACCEPTED (client, n = 15) | median **12.5 s**, p90 **15.0 s** |
| Latency to FINALIZED (client, n = 15) | median **42.6 s**, p90 **52.0 s** |

This is a small, easy set (n = 15, each study category held only its own base pattern, staff-written text), not a benchmark; the study lists its limits.

## 9. Live deployment (owner wallet, GenLayer studionet)

| Item | Value |
|---|---|
| Contract | `0x59C6047571bCE66828C733330fc9B5C88afEaE4D` |
| Deploy tx | `0x89a0c790e7bc0db5730d2b88e57d10c05e02da0d7f54cb6ae445c33ed03a435e` (owner wallet via GenLayer Studio, FINALIZED) |
| Owner | `0x920fbbCf2106B693A857D1995c198e341220a46A` |
| Relayer | `0x34653Fb290480a8C99B4D92D4857123B5624c37d` |
| Code check | canonical sha256 of the stored code `63c2e2d4…ad93` = sha256 of `contracts/pattern_ledger.py` (line endings normalised) |

Recorded run (`docs/live/pattern-ledger-run.json`, section `current`):

| Submission | Tx | Result |
|---|---|---|
| New pattern (delivery fee scam) | `0x175d40a86a567e24b6114958b00d7197227ae5426f372483706d91232c6f28df` | FINALIZED, SUCCESS: pattern 1 stored |
| Same scam, reworded | `0xe0719186fbcb1ccdc3e007d205c29541b8626cb9d99150421d51658bd0c58c2c` | FINALIZED, SUCCESS: counted as a sighting of pattern 1 |
| Summary containing digits | `0xc66ed87412db89f8b2fd651e29cc327080e709ecbdf2b214c23841cc1639643d` | FINALIZED, ERROR as designed: `[REJECTED] summary contains identifying data (digits)` |

Later VERDICT tests added further sightings of pattern 1, so a live read today shows at least 2 (4 on 2026-11-01). The consensus study then added patterns 2 to 6; their transactions are listed in [PATTERN_LEDGER_STUDY.md](PATTERN_LEDGER_STUDY.md) and on the [ledger explorer](https://yoyoblair333-wq.github.io/verdict/ledger.html). You can read any of this yourself: call `get_config()` or `get_pattern(1)` on the contract in GenLayer Studio.

### Check it yourself

Read the live contract with genlayer-js (the same client the VERDICT web app uses; reads are free and need no key):

```js
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
const c = createClient({ chain: studionet });
const address = "0x59C6047571bCE66828C733330fc9B5C88afEaE4D";
console.log(await c.readContract({ address, functionName: "get_config", args: [] }));
console.log(await c.readContract({ address, functionName: "get_pattern", args: [1] }));
console.log(await c.readContract({ address, functionName: "list_recent", args: [5] }));
```

What you should see:

1. `get_config()`: owner `0x920f…a46A`, relayer `0x3465…c37d`, `paused: false`, the 16 flag codes and 8 categories.
2. `get_pattern(1)`: the delivery-fee pattern, `sightings` of at least 2, and its history.
3. `list_recent(5)`: the newest patterns, without history (on 2026-11-01, after the study: patterns 6, 5, 4, 3, 2; `get_config()` reported `next_id` 7).

The reuse kit's [`read_ledger.mjs` and `read_ledger.py`](../examples/pattern-ledger/README.md) are ready-to-run versions of these reads.

In GenLayer Studio you can make the same calls on studionet: load `contracts/pattern_ledger.py`, point Run and Debug at the address above if your Studio version offers that, and call the three views.
