# PatternLedger live consensus study (studionet, synthetic)

A small, labelled experiment on the deployed Scam Pattern Ledger
(`contracts/pattern_ledger.py`) to see how its GenLayer consensus behaves on
paraphrases, refusals and noise. **n = 15 transactions, one run, studionet,
fully fictional data.** Treat the numbers as a smoke-level measurement, not a
benchmark.

* Contract: `0x59C6047571bCE66828C733330fc9B5C88afEaE4D` (studionet, owner deployment; see `docs/live/pattern-ledger-run.json`)
* Submitter: relayer `0x34653Fb290480a8C99B4D92D4857123B5624c37d`
* Code pin before the run: canonical sha256 of the stored code = sha256 of `contracts/pattern_ledger.py` = `63c2e2d4…ad93` (`match`)
* Run: 2026-11-01T16:56:12Z to 16:59:56Z
* Raw data: `docs/live/pattern-ledger-study.json` (every number below is computed from it by `scripts/pattern_study.mjs`)

## What is being tested

`submit_pattern(flag_codes, category, summary, request_key)` runs a
deterministic gate (injection phrases, a PII screen that refuses any digit, `@`,
currency sign or URL), then one non-deterministic review. The leader's LLM
returns `{contains_identifying_data, is_coherent_scam_pattern, decision, same_as}`
against up to 10 stored patterns in the same category. Each validator re-runs
the review with its own LLM and agrees only if the booleans and the
`decision`/`same_as` pair match (`_reviews_agree`). So "new vs same" and "refuse
vs store" are both settled by consensus, not by the leader alone.

## Method

1. The 15 summaries and their expected outcomes are fixed in `STUDY` in
   `scripts/pattern_study.mjs`, written before the run. All are invented for
   this study; none describes a real message, person or company.
2. Set (15 txs):
   * 3 paraphrase groups, each a base + 2 rewordings with different flag
     codes: A `job` (task scam), B `romance` (stranded partner), C
     `investment` (withdrawal fee). Expect base -> new, rewordings -> sighting
     of the base id.
   * 2 distinct patterns in untouched categories: D `prize`, E
     `impersonation`. Expect new.
   * 3 refusal probes: P1 contains digits, P2 an email-like handle (`@`), P3 a
     message addressed to the validators asking them to record it as new and
     skip checks, worded to slip past the deterministic injection regex so it
     reaches the LLM review.
   * 1 non-scam summary (N, weather and library hours). Expect refused.
3. Transactions are sent one at a time; the next is sent once the previous one
   is ACCEPTED (dedup candidates read accepted state). Finality is followed in
   the background. Polling interval 2 s.
4. Per tx the script records hash, final status, execution, each non-leader
   validator's vote / model / execution, the leader's review JSON (from
   `eq_outputs`), the contract's return value or revert, and latencies.
5. Ledger state was read before and after (`list_recent`). Before: only pattern
   #1 (`delivery`) existed, so no study category had prior candidates.

Definitions:

* **Dedup accuracy**: share of the 11 expected-valid txs that FINALIZED with
  SUCCESS and the expected outcome (new, or a sighting of the exact id its base
  created).
* **Refusal accuracy**: share of the 4 expected-refused txs that ended with an
  `[EXPECTED]` / `[REJECTED]` revert.
* **Validator agreement rate**: agree / (agree + disagree) over non-leader
  validator votes. Idle votes are counted separately, not as agreement.
* **Latency**: wall clock from the `writeContract` return to the first poll
  that saw ACCEPTED / FINALIZED (2 s resolution). "Chain" latency is
  `consensus_history` monitoring `PENDING` -> `ACCEPTED`.

## Results

| # | label | expected | outcome | review (leader) | final / exec | non-leader votes | to ACCEPTED | to FINALIZED | tx |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A0-job-base | new | new #2 | new, coherent | FINALIZED / SUCCESS | agree 2, idle 2 | 12.9 s | 51.2 s | `0xf7f4510b2502860674e14147a4abeacd5b4ec5270c51d4fc97a53898eaf9aea5` |
| 2 | A1-job-reword | sighting of #2 | sighting #2 (2) | same_as 2 | FINALIZED / SUCCESS | agree 2, idle 2 | 12.6 s | 52.7 s | `0x659daba77485a008a2dde9b89c1d93d46471e0eab9375bc1341eab1d5fbe3c57` |
| 3 | A2-job-reword | sighting of #2 | sighting #2 (3) | same_as 2 | FINALIZED / SUCCESS | agree 3, idle 1 | 12.5 s | 52.6 s | `0x7b93769b0e5f32df5ccbda89632089831860a5f0c3baa2ad1c1bbe584ef9ac91` |
| 4 | B0-romance-base | new | new #3 | new, coherent | FINALIZED / SUCCESS | agree 2, idle 2 | 10.5 s | 40.0 s | `0xed5a8bd7325ca879041573eddc50d61f8e18ba0f054bd6d3ad7ad515bead868c` |
| 5 | B1-romance-reword | sighting of #3 | sighting #3 (2) | same_as 3 | FINALIZED / SUCCESS | agree 2, idle 2 | 14.9 s | 46.4 s | `0x3196c4afc0d5607e79ec8a429caad15cfe7183f21b2321f87cafd53c53438d3e` |
| 6 | B2-romance-reword | sighting of #3 | sighting #3 (3) | same_as 3 | FINALIZED / SUCCESS | agree 2, idle 2 | 14.6 s | 46.4 s | `0x9a416c35f7a9631ac62a8153b023538b5e10f9e6fbbcaa75da6464480bd8ad27` |
| 7 | C0-invest-base | new | new #4 | new, coherent | FINALIZED / SUCCESS | agree 2, idle 2 | 10.5 s | 42.6 s | `0x96ed1d16deddec47e2ae719196b91751ce00a0e11f7357336857add07fed68c6` |
| 8 | C1-invest-reword | sighting of #4 | sighting #4 (2) | same_as 4 | FINALIZED / SUCCESS | agree 2, idle 2 | 15.2 s | 47.4 s | `0x9b7c2caa4b985084a6b1e2890def7ad1dc20ccfc0dc80c4c08372cf8f250ecc8` |
| 9 | C2-invest-reword | sighting of #4 | sighting #4 (3) | same_as 4 | FINALIZED / SUCCESS | agree 2, idle 2 | 10.5 s | 41.5 s | `0x6c31a0384f081868de2781d09070a1a7c1c8fef4ce3dbd1332d3cc075f156ccc` |
| 10 | D-prize-new | new | new #5 | new, coherent | FINALIZED / SUCCESS | agree 2, idle 2 | 15.1 s | 45.4 s | `0xf0112533818f67df6c8b75ef7da2ee44f0fd501fabd8daa72115e49be9a6637f` |
| 11 | E-imperson-new | new | new #6 | new, coherent | FINALIZED / SUCCESS | agree 2, idle 2 | 14.7 s | 42.6 s | `0xf3de01e84929957da64c16b07f61e9518a2772bec8aff1a8f58f05ac83c09599` |
| 12 | P1-digits | refuse (gate) | `[REJECTED] … (digits)` | none (gate, no LLM call) | FINALIZED / ERROR | agree 2, idle 2 | 8.6 s | 38.6 s | `0x13a5ada22a0ae894271c70c2f32a312dcccc3307d8b4d61ba05dbcf11e11b3fb` |
| 13 | P2-email-like | refuse (gate) | `[REJECTED] … (email_or_handle)` | none (gate, no LLM call) | FINALIZED / ERROR | agree 3, idle 1 | 6.3 s | 38.4 s | `0x8043de1b039fa3df4e767d1af14658c0eb84e9a123a922e2a61464171fa0ef2a` |
| 14 | P3-injection | refuse (review) | `[REJECTED] not a coherent scam pattern` | coherent = false | FINALIZED / ERROR | agree 2, idle 2 | 10.8 s | 41.1 s | `0x64736be070e6450504e61ddf2eda3c9115b18b5064212b38750e38f9514a25e6` |
| 15 | N-incoherent | refuse (review) | `[REJECTED] not a coherent scam pattern` | coherent = false | FINALIZED / ERROR | agree 2, idle 2 | 10.8 s | 42.3 s | `0xbb79f2f5be2a39c65c65abfc8bda3c96cde559c9c514ea81e3702f21e6c8cd17` |

"sighting #2 (3)" means pattern #2 now has 3 sightings. For a new pattern the
contract stores `same_as` as 0 (null normalised). Every tx took 1 round, 0
rotations, no appeal, `result_name` `MAJORITY_AGREE`. For refused txs an
"agree" vote means the validator reproduced the same revert (its own
execution is ERROR).

### Summary metrics

| metric | value |
|---|---|
| Dedup accuracy (11 valid txs) | **11 / 11** |
| Refusal accuracy (4 probes) | **4 / 4** (2 by the deterministic gate, 2 by the consensus review) |
| False refusals among valid txs | 0 |
| Non-leader votes cast | agree 32, disagree 0, idle 28 (of 60) |
| Validator agreement rate (agree / cast) | **32 / 32 = 1.00** |
| Txs with no disagree vote | 15 / 15 |
| Latency to ACCEPTED (client, n = 15) | median **12.5 s**, p90 **15.0 s** |
| Latency to FINALIZED (client, n = 15) | median **42.6 s**, p90 **52.0 s** |
| Chain PENDING -> ACCEPTED | median 9.3 s, p90 11.7 s |

Ledger after the run: patterns #2 (job, 3 sightings), #3 (romance, 3), #4
(investment, 3), #5 (prize, 1), #6 (impersonation, 1); #1 unchanged by this
study. Nothing from P1–P3 or N was stored.

## What this shows, and what it does not

Shows (on this run):

* The `same_as` decision is reached under consensus: in every sighting the
  leader's `same_as` and each agreeing validator's own re-run matched, on
  rewordings that changed wording and flag codes.
* Refusals happen at two layers: cheap deterministic refusals (P1, P2) revert
  before any LLM call, and validators converge on the revert; content that
  passes the regex but is not a scam (P3, N) is refused by the agreed review,
  not by the leader alone.
* The P3 message addressed to the validators did not get stored; the review
  classed it as not a coherent scam pattern.

Does not show / limitations:

* **Small n.** 15 txs, one run, 11 dedup decisions, 4 refusal probes. 11/11
  and 4/4 are compatible with real accuracies well below 100 %.
* **Easy dedup.** Each study category held only its own base pattern, so every
  "same" decision chose between one candidate and "new". There are no hard
  negatives (a different scam in the same category), so this measures
  paraphrase recall, not precision against near-misses.
* **Half the validators were idle.** 28 of 60 non-leader votes were `idle`
  with no model and execution `ERROR` in the receipt: those nodes did not
  produce a vote. Consensus on most txs therefore rested on the leader plus 2
  agreeing validators. The 1.00 agreement rate is over cast votes only.
* **Studionet.** Studio's hosted validators, models (mixed providers per tx,
  recorded per vote in the JSON) and timings; not Testnet Bradbury or mainnet.
  Latency includes Studio queueing and 2 s polling granularity.
* **Fictional, staff-written data.** Summaries were written by us, short and
  clean, with expected labels chosen by the same author. Real user-derived
  summaries would be noisier.
* **Shared contract.** Other work submits to the same contract. The
  before/after reads show no foreign patterns in the study categories during
  the run, but the dedup candidate set is not isolated by design.
* P3 is one injection wording. The deterministic regex covers classic phrases
  ("ignore previous instructions", the reply's own keys); this probe only shows
  one regex-evading wording being refused by the review.

## Reproduce

Needs the relayer built (as for `scripts/pattern_live.mjs`) and a key holding
the relayer or owner role on the ledger. The run writes new patterns and
sightings to the live contract, so a rerun will see the study's own patterns as
candidates (the bases would then come back as sightings); deploy a fresh
ledger for a clean rerun.

```
set -a; . relayer/.env.local; set +a
PATTERN_LEDGER_ADDRESS=0x59C6047571bCE66828C733330fc9B5C88afEaE4D \
  NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
  node scripts/pattern_study.mjs docs/live/pattern-ledger-study.json /tmp/study-raw
```

Recompute the metrics from the saved file, no network:

```
node scripts/pattern_study.mjs --metrics docs/live/pattern-ledger-study.json
```

Check any row on chain: `getTransaction({hash})` with genlayer-js against
studionet, or open the hash in GenLayer Studio. The full receipts were saved
to the raw directory during the run and are not committed (about 75–80 KB each, 1.2 MB in all);
the fields used here are copied into the JSON.
