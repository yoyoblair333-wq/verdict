# VERDICT

**Five AI jurors. Checked by a network nobody controls. Appeal to a higher court.** VERDICT is a consumer app on [GenLayer](https://docs.genlayer.com/) where one Intelligent Contract, `JudgeRouter`, judges subjective text contests such as "Who's right?", "Better roast", "Pettiest text" and "Better comeback". Rubrics judge takes, never people.

> Entertainment only. No money, tokens or value are ever attached to a verdict: the contract has no payable methods and the relayer always sends `value: 0`. VERDICT is not arbitration and not a wagering product. 18+ only. Text only.

---

## Verify in 5 minutes (for GenLayer stewards)

Everything below runs from a fresh clone with no keys and no network writes.

```bash
git clone https://github.com/yoyoblair333-wq/verdict.git verdict && cd verdict
bash scripts/verify.sh          # or: make verify
```

Needs Python 3.12+, Node 20+ and npm. The first run downloads pinned Python and npm packages and two GenVM release bundles (about 500 MB in all: one for `genlayer-test` direct mode, one for `genvm-lint`, pinned to GenVM v0.2.16). Expected ending (full log of a clean-machine run: [docs/VERIFY_LOG.md](docs/VERIFY_LOG.md)):

```
================ SUMMARY ================
PASS  setup: python venv + pinned requirements
PASS  setup: relayer npm ci (package-lock.json)
PASS  contract tests (pytest)
PASS  genvm-lint check
PASS  genvm-lint typecheck
PASS  relayer typecheck (tsc --noEmit)
PASS  relayer tests (node --test)
PASS  offline demo (make demo)
=========================================
VERIFY: PASS
```

Individual targets: `make setup`, `make test`, `make lint`, `make demo` (one full case through the real relayer against the stand-in chain). CI runs the same script on `ubuntu-24.04` with Python 3.12 and Node 22: [.github/workflows/ci.yml](.github/workflows/ci.yml). Each step prints `[verify] START / PASS / FAIL` on stderr; on GitHub a failing step also posts an error annotation with the failing command and the last lines of its output.

`GENVM_VERSION` (default `v0.2.16`) pins the GenVM release for **both** `genvm-lint` and the direct-mode contract tests (`contracts/tests/direct/conftest.py`). Without that pin, `genlayer-test` direct mode asks GitHub for the *latest* GenVM release whenever its cache is empty, which is every fresh CI runner; a machine whose request for "latest" is blocked silently falls back to v0.2.12 instead. That difference is why CI failed while local runs passed (2026-10-31).

### Deployment and demo evidence

Deployed and exercised on **GenLayer studionet** on 2026-10-31 with a throwaway key, by the real relayer in live mode. Full transcript, every tx hash, status transitions, validator votes and timings: [docs/LIVE_EVIDENCE.md](docs/LIVE_EVIDENCE.md). This is the second deployment: the contract changed after the independent audit (`judge` is creator/owner-only, legacy `open_case` is owner-only), so it has a new address and pin. The earlier deployment's evidence is kept on the same page.

| Item | Value |
|---|---|
| Network | studionet (`https://studio.genlayer.com/api`), GenVM v0.2 SDK accepted as written |
| Contract address | `0x7DBc10d8922A5Ba498007D212F2088872F2aCe06` |
| Deploy tx | `0xf98a974976d949581eb6ec534a3e97598c95fab630e878aa7e2c4bbf07ed4bbd` (FINALIZED, SUCCESS, 5 validators agree) |
| Contract code digest (pinned) | `3ef39cc8a02f7c2bdbf3f3b7d19340622439a381192ced7cbcd799232139ea25` (matches `gen_getContractCode`; also pre-filled in `relayer/.env.example`) |
| Example case txs | case 1 (Who's right? (Settle It)): open_case_package `0x5731c408ec152f013ef03fbaa2d31b43c197cb6650a021548a65e252e6383de8`; judge `0xaab8cbbe1e2ea3082db1d766e8fa3e53394801c4ce84bcefbe1f2583404fa82d`; appeal `0xb178e4c51d9cd397cc7d41db0004618ad0a1da609799d3d843444f1cdf8ee07e`; appeal `0x3c9dac7e2633bb0d05e0b25db5c9fa8547199848bc53e93ba5c62a9c2308573f`<br/>case 2 (Better roast (Live Court)): open_case_package `0xfa0971613d26caf5ddd4c50e12844ef0728890c03bf49301b661864396174705`; judge `0x545e262e755a9904cbc951111db4c27033e69cb6f94886931dc5e7b61d76f60c`; appeal `0x58655463f7ae48d6a2d804d338d1658719795215ac03a015ef13dc7eaa3df6d4`; finalize `0xce7e10f252a3d95da9959394d3bd60bb88f44a04083879f1599f9bc7b114d3c0`<br/>case 3 (Pettiest text (API)): open_case_package `0xc13b0a46b46c1fb91d6304ec28a7764fddd01f7401e115203cc97b975ae2739c`; judge `0x46bcd808c823d635140dda27570b10eed483bced4ff29a9409c85cf61ebd2ef9`; revoke (negative test, reverts) `0x3ff5be06c9e2be6a601c8abdc78e89491841cc45bfbfe42926ee4ea711acfb4e` |
| Earlier deployment (superseded) | `0xcBAD3fcee2CF1c59c6041518AE91b75CaBB0C29a`, digest `0bde6944…cc81`; see docs/LIVE_EVIDENCE.md |
| Bradbury testnet | **TO FILL AFTER DEPLOY**: contract address, deploy tx hash |
| Demo video | **TO FILL AFTER DEPLOY**: link (record `deploy/STUDIO_DEPLOY.md` steps 3–6) |
| Scam Pattern Ledger | `contracts/pattern_ledger.py` on studionet at `0x8af622094205440f120F4096151F0aaBBcf14fDF` (synthetic records only; the relayer runs it in SHADOW until counsel signs off). Run record: [docs/live/pattern-ledger-run.json](docs/live/pattern-ledger-run.json) |
| Final owner deploy | **TO DO**: both contracts get redeployed from the owner's own wallet (the creator earns the fee share) with the relayer key as the `relayer` role: [deploy/OWNER_DEPLOY.md](deploy/OWNER_DEPLOY.md). The addresses above are throwaway-key deployments of earlier code |
| Web app | Not deployed. `app/` is a **static, simulated prototype** (jury simulated in the browser, not wired to the relayer or the contract) |

To reproduce by hand in the Studio web UI: [deploy/STUDIO_DEPLOY.md](deploy/STUDIO_DEPLOY.md) with the ready-to-paste cases in [examples/](examples/). Scripted: `deploy/deploy.ts` (`cd relayer && npm run deploy`).

---

## Where VERDICT fits on GenLayer

**Internet Court is for AI agents. VERDICT is the people's court.** It is a consumer app built on GenLayer by an independent developer: free private play stays off-chain and cheap, and every verdict that circulates in public is decided on GenLayer. VERDICT is not affiliated with or endorsed by GenLayer.

Each of these is a GenLayer decision that VERDICT creates:

* **each published case**: a Settle It preview re-heard as an on-chain Tier 1 case (5 jurors, validator agreement)
* **each appeal**: Tier 2 (7 jurors) and the Supreme Court (9 jurors)
* **each Hall of Contempt testnet re-run** of a Jailbreak the Jury attempt
* **each self-chosen Jailbreak re-check**
* **each Scam Pattern Ledger record or dedup sighting**: validators agree a summary is free of identifying data and describes a coherent scam pattern

The number to watch is **on-chain decisions per week**.

---

## Architecture

```mermaid
flowchart LR
  subgraph Clients
    A1[Settle It web app (prototype)<br/>consent + 18+ checkbox]
    A2[Live Court<br/>Twitch host]
    A3[Dev API / MCP / n8n]
  end
  subgraph Relayer["Relayer (Node/TS) - VERDICT_MODE=shadow by default"]
    R1[Validate input<br/>consent === true, adult === true]
    R2[Moderation + PII screen<br/>fail closed]
    R3[Build case package<br/>canonical JSON + sha256 = receipt number]
    R4[(Outbox JSONL<br/>intent fsync'd BEFORE broadcast)]
    R5[Contract pin check<br/>sha256 of deployed code]
    R6[Finality tracker<br/>PENDING / ACCEPTED / FINALIZED_SUCCESS /<br/>FINALIZED_ERROR / STALE]
    R7[(Inbox JSONL<br/>hash-chained receipts)]
    R8[Reconcile<br/>by requestKey, never double-submit]
  end
  subgraph GenLayer
    C1[JudgeRouter contract<br/>verifies package + digest + lifetime<br/>5 / 7 / 9 juror personas]
    C2[Validators re-run the panel<br/>custom equivalence check]
  end
  OUT1[Verdict card + webhook]
  OUT2[Twitch Prediction resolve]

  A1 & A2 & A3 --> R1 --> R2 --> R3 --> R5 --> R4 --> C1
  C1 <--> C2
  C1 -- tx status --> R6
  R6 -- FINALIZED_SUCCESS only --> R7
  R7 --> OUT1
  R7 --> OUT2
  R6 -- FINALIZED_SUCCESS --> C3[confirm_verdict on-chain<br/>closes revocation, opens appeal]
  R4 -. crash / timeout .-> R8 -.-> C1
```

Design sheets (topology, lifecycle, appeal ladder, data boundary): [diagrams/](diagrams/README.md).

| Path | What it is |
|---|---|
| `contracts/judge_router.py` | The Intelligent Contract (GenVM Python SDK v0.2) |
| `contracts/tests/direct/` | Contract tests against the real GenVM SDK in direct mode (LLM mocked) |
| `contracts/tests/static/` | JSON Schema checks (no GenVM) |
| `contracts/tests/live/` | Read-only network checks, skipped unless `GENLAYER_LIVE=1` |
| `schemas/case-package.v1.json`, `schemas/verdict-receipt.v1.json` | Canonical case package and inbox receipt |
| `fixtures/*.json` | Cross-runtime fixtures used by BOTH the Python and the Node tests (`fixtures/generate.py` rebuilds them) |
| `relayer/src/app.ts` | HTTP routes, check ordering, appeals, revoke/takedown, drafts, Twitch, webhooks |
| `relayer/src/lib/package.ts` | Sanitiser, package builder, `verifyPackage` (same checks and order as the contract) |
| `relayer/src/lib/canonical.ts` | Canonical JSON (RFC 8785 subset) + sha256 |
| `relayer/src/lib/finality.ts` | Two-step finality classification and polling |
| `relayer/src/lib/pipeline.ts` | Pin check → outbox → broadcast → accept → finality; `reconcile()` |
| `relayer/src/lib/journal.ts` | Outbox and hash-chained inbox (JSONL) |
| `relayer/src/lib/state.ts`, `credits.ts` | Durable case/draft state and credit ledger (JSONL, owner-only files) |
| `relayer/src/lib/pinning.ts` | Contract code pinning |
| `relayer/src/lib/verdict.ts` | Verdict validation (mirror of the contract validator) |
| `relayer/src/lib/moderation.ts` | Local pre-check mirroring the contract's patterns; provider hook that fails closed |
| `relayer/src/tools/liveRun.ts`, `makePackage.ts` | Live evidence run; package builder for Studio |
| `deploy/deploy.ts`, `deploy/STUDIO_DEPLOY.md` | Scripted deploy; Studio web-UI walkthrough |
| `examples/` | Three ready-to-paste demo cases |
| `relayer/src/quick.ts`, `lib/jury.ts`, `lib/redflag.ts`, `lib/redact.ts`, `lib/practice.ts` | Quick Verdict (off-chain jury), Red Flag Court, Jailbreak the Jury practice court; see "Quick Verdict and the games" |
| `relayer/config/practice-rules.v1.json`, `schemas/practice-rules.v1.json` | Reviewed secret-rule list for the practice court |
| `app/index.html`, `app/artifact.html`, `app/overlay.html` | **Static, simulated prototype.** Every vote is simulated in the browser; nothing is sent to the relayer or the contract. Tabs: Settle It, Red Flag Court, Jailbreak the Jury |
| `scripts/verify.sh`, `Makefile` | Fresh-clone verification |
| `scripts/mutation_check.py` | Guard mutation sweep: deletes each guard in turn and checks the tests fail |

### Test tiers

| Tier | Where | What is real | What is a stand-in | Count | Runs by default |
|---|---|---|---|---|---|
| **direct** | `contracts/tests/direct/` | Real GenVM v0.2 Python SDK (storage, calldata, `run_nondet_unsafe`, validator replay) via `genlayer-test` direct mode | LLM replies (regex mocks); single process, no network | 155 | yes |
| **static** | `contracts/tests/static/` | JSON Schema validation of `schemas/` against `fixtures/` and the practice-rule list | nothing | 15 | yes |
| **unit** | `relayer/test/unit/` | Pure relayer logic: canonicalisation, fixtures, finality classification, journals, pinning; Quick Verdict jury port (checked against the contract source), redaction and Red Flag rules (shared fixtures), practice-court rules and clocks; the browser copy of those rules in `app/*.html` | nothing (no network) | 69 | yes |
| **stand-in** | `relayer/test/standin/` | The real relayer HTTP app, outbox, inbox, finality tracker | **`FakeChain`** (an in-memory imitation of the contract and tx lifecycle) and a fake Twitch; a deterministic **`StubProvider`** for the Quick Verdict jury (no LLM, no key) | 70 | yes |
| **live** | `contracts/tests/live/`, `relayer/test/live/` | A real GenLayer network, read-only (code pin + views) | nothing | 2 | only with `GENLAYER_LIVE=1` + RPC env |

Write-path behaviour on a real network is covered by the recorded evidence run ([docs/LIVE_EVIDENCE.md](docs/LIVE_EVIDENCE.md)), not by an automatic test.

### Case lifecycle

| Contract status | Meaning |
|---|---|
| `pending` | Opened, not judged yet |
| `judged` | Tier 1 verdict recorded |
| `appealed` | Tier 2 verdict recorded; appealable once more |
| `final` | Tier 3 "Supreme Court" verdict, or `finalize()` closed the appeal window |
| `revoked` | A side withdrew consent before the Tier 1 verdict was final; texts cleared from contract state |
| `stale` | Lifetime ran out before judging (`expire()`) |

| Relayer finality (per transaction) | Meaning |
|---|---|
| `PENDING` | Not decided yet (also: unknown status values, RPC errors) |
| `ACCEPTED` | Decided but not final: a GenLayer appeal can still change it. Nothing is shown as a verdict. |
| `FINALIZED_SUCCESS` | FINALIZED **and** execution SUCCESS. The only state that drives a card, an inbox receipt, a Twitch resolution or the next appeal. |
| `FINALIZED_ERROR` | FINALIZED with ERROR or unknown execution, or CANCELED / UNDETERMINED / timeouts. Technical refund; Twitch cancelled. |
| `STALE` | The poll budget ran out; `reconcile()` decides. Case-level `REVOKED` and `STALE` are recorded in the inbox. |

| Tier | Juror personas | Name | How you get there |
|---|---|---|---|
| 1 | 5: Marlowe, Dahlia, Frank, Tiff, Theo | Verdict | `judge()` |
| 2 | 7: + Augustine (Chief Justice), Juno (Wildcard) | Appeals Court | first appeal (losing side only) |
| 3 | 9: + Ines (Historian), Rook (Contrarian) | Supreme Court (final) | second appeal (losing side only) |

Each juror is a persona prompt pass with its own judging lens (`JUROR_PERSONAS`), and each pass rotates the order entries are shown in. Odd panel sizes mean a two-entry case can never tie.

> **Honest framing.** The jurors are persona prompt passes inside one non-deterministic block, run by the current leader's model. They are not separate models and not separate validators. What makes the result trustworthy is that GenLayer's independent validators, each running its own AI model, re-run the whole panel and must agree before the verdict stands. Copy says "five AI jurors, checked by a network nobody controls", never "five different AI models vote". The operator writes the prompts, owns the contract (pause) and runs the relayer. Never name model vendors.

### Consensus design

`judge()` and `appeal()` call `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`. The leader runs N prompts through `gl.nondet.exec_prompt(..., response_format="json")`; every reply must be `{winner_index, scores[], reason}` with an in-range winner and exactly one score per entry in 0..10. **Out-of-range, non-finite or wrong-shape replies fail the juror (`[LLM_ERROR]`) and are never clamped into a verdict.** The validator rejects leader errors, checks the payload (split and winner must follow from the votes), re-runs the panel and accepts when every mean is within ±2.0 points and the winner matches (or is within 1.0 point: a close call). `reason` is never compared.

### Case package, receipt number and idempotency

Every relayer case is opened with `open_case_package(package_json, package_digest)`. The package ([schema](schemas/case-package.v1.json)) holds: schema id, `requestKey`, identity (clientRef, caseId=null, tier, attempt), rubric, surface, entries (sanitised text + sha256 + provenance), moderation result + policy version, disclosure (consent, adultConfirmed, notice version), destination (network, contract address, contract code digest) and lifetime (submission deadline, appeal-window expiry). Key sets are closed, so nothing else can ride along.

* The relayer canonicalises it (sorted keys, UTF-8, no whitespace, integers only) and hashes it. That **packageDigest is the case's receipt number**: the contract stores it, every later write (`judge`, `appeal`, `confirm_verdict`, `revoke`, `expire`, `finalize`) must pass the same digest, every history record references it, and the relayer re-reads it from the chain after every write. Any mismatch stops the flow.
* The contract re-derives everything: canonical bytes, digest, consent (exactly `true`), schema, entry digests, sanitised form, its own address as destination, the submission deadline, and the injection screen.
* Resubmitting the same `requestKey` with the same package returns the same case; with a different package it reverts. Appeals carry `from_tier`, so a retried appeal can never escalate twice.

### Outbox, finality, inbox, reconcile

1. The relayer writes an `intent` (requestKey, packageDigest, the exact call) to `relayer/data/outbox.jsonl` and fsyncs it **before** broadcasting; the tx hash is recorded right after (genlayer-js 1.1.8 signs and sends in one call, so the hash cannot exist earlier).
2. It polls until ACCEPTED (request path), then in the background until FINALIZED. Only FINALIZED + SUCCESS imports a receipt into `relayer/data/inbox.jsonl` (hash-chained: each record carries `prevHash`), renders the card webhook, resolves Twitch and calls `confirm_verdict` on-chain.
3. `reconcile()` (run at startup in live mode) settles unfinished ops: it looks the case up on-chain by requestKey (or checks status/tier) and only resubmits the identical bytes when the effect is absent and the deadline has not passed.

### Consent, privacy and provenance

**Everything sent on-chain is public and permanent.** The app must show, next to the submit button, an unticked checkbox: *"I agree my take is published on a public blockchain and cannot be erased, and I am 18+."* The relayer refuses (HTTP 422, before any gas) unless `disclosure.consent === true` and `disclosure.adult_confirmed === true` (exact booleans; `"true"`, `1` or missing are refused).

* No IPs, API keys, side tokens, emails or webhook URLs ever go on-chain or into the outbox/inbox (tested). The local PII screen blocks emails, phone numbers, ID/card numbers and street addresses.
* **Revocation:** either side may withdraw before the Tier 1 verdict is FINALIZED_SUCCESS. The case becomes REVOKED, no card, the Twitch Prediction is cancelled, and the contract clears the stored texts from its current state. **Transaction history keeps them; on-chain data cannot be erased.** After Tier 1 is final (`confirm_verdict`), revoke reverts on-chain and the relayer refuses it, so a winner can never kill the loser's appeal.
* **Takedown:** after that, either side can hide the case from VERDICT's gallery, cards and API (off-chain flag). The text remains in the chain's history.
* **Provenance labels.** A matching digest proves **which takes were judged**, not that a verdict is "correct" and not who wrote an entry. Each entry records `entrySource` (fixed by surface: `participant_submitted` for Settle It, `host_submitted` for Live Court, `api_client_submitted` for the API) and `assurance` (`self_asserted` by default; `verified_participant` only when that side submitted its own take with its side token through the draft flow). `verified_participant` is the relayer's claim; the chain cannot check it. Cards and API responses carry `provenance` and a `provenance_label`, e.g. *"All takes relayed by the stream host; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."*

### Operator safety

* `VERDICT_MODE=shadow` (the default; any unknown value also means shadow) validates, builds and logs what would be submitted, with no gas, no Twitch calls and no credit debits. `VERDICT_MODE=live` submits.
* `EXPECTED_CONTRACT_CODE_DIGEST` is required. At startup and before every submit the relayer hashes the deployed code (`gen_getContractCode`) and refuses on mismatch. If an RPC cannot return code, live mode refuses unless `ALLOW_UNVERIFIED_CONTRACT=true`.
* Moderation fails closed: with a provider wired, its errors return 503; without one, both modes refuse to open cases unless `MODERATION_ACK_LOCAL_ONLY=true`.
* Shadow mode needs no key: an unset or all-zero `RELAYER_PRIVATE_KEY` is replaced by a throwaway in-memory key (shadow never signs). Live mode refuses the placeholder.

### Prompt-injection hardening

Entries and rubric are capped (280 / 200 characters), NFKC-normalised and stripped of zero-width, bidi and control characters. The contract rejects control phrases ("ignore previous instructions", "system prompt", `winner_index`, delimiter tokens, code fences, …) and the relayer runs the same patterns first, so a rejected entry never costs gas; ordinary words like "ignore" pass. The prompt states fixed rules before any user text and wraps entries as UNTRUSTED DATA. Best-effort, not a guarantee: never market it as "injection-proof".

### Appeal pricing (one policy, everywhere)

1 free appeal per payer per Los Angeles day (it resets at 00:00 America/Los_Angeles, like every consumer allowance, and covers either Tier 2 or Tier 3); further appeals spend prepaid credit: $1.99 for Tier 2, $4.99 for Tier 3 (`POST /credits/grant` from the payment webhook; 402 when short). Only the losing side may appeal, at most twice, and only against a FINALIZED_SUCCESS verdict. **No money ever depends on an outcome**; the only refund is technical (the appeal transaction failed).

### Quick Verdict and the games (off-chain)

* **Quick Verdict** is the same five juror personas, rubric presets, fixed-rules prompt and strict JSON rules as the contract, run once by the relayer through a `JudgeProvider` (an LLM call behind an interface). There are no validators and no chain write, so a Quick Verdict is labelled "Quick Verdict · Not network-checked", its rail is **Submitted → Jury scoring → Done**, and it never carries a receipt number. **No provider is wired in this repo** (no API keys): the routes answer 503 until one is passed to `buildApp`; tests use `StubProvider`.
* **Publish = network check** (Settle It only; ADR-019, which replaced the old "appeal onto the chain"). A Settle It case starts as a private Quick Verdict, the *preview*, shared only by private link with its two sides. Either side may tap **Publish**; it goes ahead only after **both** sides accept notice `publish-onchain-v1` ("Your takes become public and permanent"); until then it waits, and a request the other side never accepts lapses after 72 hours ("The other side didn't agree to go public."). Either side can withdraw its consent before submission. Publishing is **free** (VERDICT pays the fee), capped at 3 per user per Los Angeles day, and is **not** an appeal: the relayer opens a fresh on-chain Tier 1 case (5 jurors, validator agreement) through the normal package path. The network's Tier 1 ruling replaces the preview; if its winner differs, the card carries `overruled_preview: true` and "The network overruled the preview." After that the normal ladder applies (losing side only, max 2): Tier 2 (daily free appeal or $1.99), then the Supreme Court ($4.99, or the free appeal if unused). An unpublished preview can never be appealed (`409 publish_first`). A Tier 1 that ends without a ruling gives the publish back.
* **Publish budget and queue** (ADR-022). Free publishes draw on one global monthly fee budget (`PUBLISH_BUDGET_CENTS_MONTH`, default $500, hard ceiling $1,000: the relayer refuses to start above it). Each publish reserves an estimated fee (`PUBLISH_FEE_ESTIMATE_CENTS`, 90¢) until real fees are measured. When the month's budget is spent, publishes wait in a first-in, first-out queue that is kept in the durable state store and rolls over to the next Los Angeles month: "You're in line to be checked by the network. Your preview stays private until then." plus the place in line. Either side can cancel (`POST /quick/:id/publish/cancel`; withdrawing consent also leaves the line). Nothing says "Checked by GenLayer" before FINALIZED_SUCCESS. Paid appeals and API calls never touch the budget and never queue. The relayer journals the measured fee of every terminal on-chain transaction (`relayer/data/fees.jsonl`; `fee: null, fee_source: "unavailable"` when the transaction reports none) and serves an admin summary at `GET /ops/fees`.
* **"Checked by GenLayer · Finalized"** is the `footer` on every on-chain card whose verdict reached FINALIZED_SUCCESS, and never on a Quick Verdict, practice-court card or SHADOW result. SHADOW results say "Test run · Not public yet".
* **Red Flag Court**: one pasted message, redacted twice (browser, then `relayer/src/lib/redact.ts`; links removed whole and never opened), ruled SCAM / SUS / LOOKS LEGIT. LOOKS LEGIT only if no juror voted Scam; any money, investment or crypto offer is at least SUS. No appeals, nothing stored, ≤ 1,000 code points.
* **Scam Pattern Ledger** (`contracts/pattern_ledger.py`, ADR-020): after a SCAM or SUS ruling the user may opt in to "Help warn others". The browser re-sends its own redacted text; the relayer redacts it twice more, has the LLM write an abstract ≤ 200-character pattern summary, screens it, and submits only flag codes, a category and that summary (never the message, sender or user). Validators store it only if they agree it carries no identifying data and is a coherent scam pattern. 5 per user per LA day. SHADOW unless `PATTERN_LEDGER_MODE=live` **and** `VERDICT_MODE=live`.
* **Jailbreak the Jury** (practice court): a reviewed secret rule (`relayer/config/practice-rules.v1.json`), a fixed house take, 10 attempts a day. A blocklist hit is "Stopped at the door" (no vote, no split); a jury catch shows the real split; anything that wins or moves a juror is sealed in a private patch queue. For now it runs on the Quick Verdict engine and is labelled "Practice court · Not a public record"; the planned home is a private localnet.

---

## Contract API

| Method | Kind | Notes |
|---|---|---|
| `__init__(daily_limit: int = 0, relayer: str = "")` | deploy | 0 = no on-chain per-sender limit. The deployer is the **owner** (and the contract's creator); `relayer` is the hot key that runs cases (empty = the deployer). See [deploy/OWNER_DEPLOY.md](deploy/OWNER_DEPLOY.md) |
| `open_case_package(package_json, package_digest) -> int` | write | relayer path; full verification; idempotent per requestKey |
| `open_case(rubric, entries, surface, client_ref="") -> int` | write | legacy / Studio path (no package, digest `""`). **Owner only**: it carries no consent booleans, and the relayer never shows these cases |
| `judge(case_id, package_digest="") -> dict` | write | case creator, owner or relayer; pending → judged; reverts after the appeal-window expiry |
| `confirm_verdict(case_id, package_digest, tier)` | write | creator/owner/relayer attests FINALIZED_SUCCESS; closes revocation, unlocks the next appeal (package cases) |
| `appeal(case_id, package_digest="", from_tier=0) -> dict` | write | creator, owner or relayer; tier + 1 and re-judge; tier 3 → final |
| `finalize(case_id, package_digest="")` | write | creator, owner or relayer; close the appeal window |
| `revoke(case_id, package_digest, side)` | write | case creator or owner (not the relayer role); before Tier 1 is confirmed final only; clears texts from state |
| `expire(case_id, package_digest)` | write | pending case past its lifetime → stale |
| `get_case`, `get_verdict`, `list_recent`, `get_case_by_ref`, `get_case_by_request_key`, `get_config` | view | `get_verdict` includes `package_digest` and `provenance` |
| `set_daily_limit`, `set_paused`, `transfer_ownership`, `set_relayer` | write | owner only |

`contracts/pattern_ledger.py` (`PatternLedger`) has the same owner / relayer split: `submit_pattern(flag_codes, category, summary, request_key)` (relayer or owner), views `get_pattern`, `list_recent`, `top_patterns_since`, `get_by_request_key`, `get_config`, and owner-only admin.

Errors are `gl.vm.UserError("[EXPECTED] …")` for deterministic business errors and `"[LLM_ERROR] …"` for model failures; the relayer maps `[EXPECTED]` to HTTP 422.

## Relayer REST API

| Endpoint | Body / headers | Returns |
|---|---|---|
| `POST /cases` | `{rubric, entries[], surface, disclosure: {consent: true, adult_confirmed: true}, callback_url?, twitch?}`; a `null` entry makes a Settle It draft | `201 {id, tx, finality, request_key, package_digest, provenance, provenance_label, side_tokens[]}`; shadow: `202 {mode, would_submit}`; draft: `201 {draft_id, expires_at, side_tokens}` |
| `POST /drafts/:draft/entries` | `x-side-token`; `{text, disclosure}` | fills that side's slot (`verified_participant`); opens the case when complete; `410` after the opponent deadline |
| `POST /cases/:id/judge` | `x-side-token` (either side) | `202 {tx, finality, final: false, receipt_number}` |
| `POST /cases/:id/appeal` | `x-side-token` (losing side) | `202 {tx, finality, final: false, paid_with, credit_balance_cents}`; `402` / `403` / `409` / `429` |
| `POST /cases/:id/revoke` | `x-side-token` | `202 {revoked, tx, note}`; `409` once Tier 1 is final |
| `POST /cases/:id/takedown` | `x-side-token` | `200 {hidden, note}` |
| `GET /cases/:id` | – | `{case, verdict_final, finality, card, provenance_label}`. Only cases this relayer opened through a consented package (`404` otherwise). Until the verdict is FINALIZED_SUCCESS the case carries `rail_step: "Network checking"` and **no** winner, scores, votes, split or reason. `410` if revoked or taken down |
| `GET /cases?limit=&surface=` | – | gallery: relayer-opened package cases with a FINALIZED_SUCCESS verdict only (revoked and hidden excluded) |
| `POST /quick` | `{rubric (preset), entries[2], disclosure: {consent: true, adult_confirmed: true}}` | Quick Verdict preview (off-chain). `201 {mode: "quick_verdict", label, network_checked: false, rail, quick_id, side_tokens, verdict, bench, footer, appealable: false, share: "Publish to share", publish}`. Never a receipt number |
| `GET /quick/:id` | `x-side-token` | the preview's private link: its two sides only (`404` otherwise). After Publish it returns `published: true, case_id` and no preview verdict |
| `POST /quick/:id/consent` | `x-side-token`; `{disclosure: {consent, adult_confirmed, notice_version: "publish-onchain-v1"}}` | that side accepts publishing; `{status: "waiting" \| "ready", awaiting_sides, publish_requested}`. Nothing is published |
| `POST /quick/:id/consent/withdraw` | `x-side-token` | withdraws that side's own consent (any time before submission; `409` after) |
| `POST /quick/:id/publish` | `x-side-token` (either side); optional same disclosure | when the month's budget is spent: `202 {status: "queued", position, message}`; otherwise `202 {published: true, id, tx, package_digest, tier: 1, appeals_used: 0, appeals_left: 2, price_cents: 0, publishes_left_today, judge}`. `409 waiting_for_other_side` until both consent; `409 publish_request_expired` after 72 h; `409 already_published`; `410` expired preview; `429 publish_cap` (3 per LA day). SHADOW: `202 {mode: "shadow", label: "Test run · Not public yet"}` |
| `GET /quick/:id/publish` | `x-side-token` | publish state for that side: `private` / `waiting` / `ready` / `expired` / `queued` (with `position`) / `published` |
| `POST /quick/:id/publish/cancel` | `x-side-token` (either side) | leaves the publish queue; nothing was sent; `409 not_queued` otherwise |
| `GET /ops/fees?last=20` | `Authorization: Bearer ADMIN_TOKEN` | measured fee per on-chain tx (totals per op, latest rows) and the publish budget (month, spent, cap, queued) |
| `POST /quick/:id/appeal` | `x-side-token` | always `409`: `publish_first` on a preview, `already_published` (with `appeal_path`) after Publish |
| `POST /quick/:id/revoke`, `/takedown` | `x-side-token` | revoke after Done → `409`; takedown hides the card and never blocks publishing |
| `POST /redflag` | `{message, disclosure: {adult_confirmed: true}, redaction: {user_approved: true}}` | Red Flag Court ruling (SCAM / SUS / LOOKS LEGIT). Redacted again in the relayer, ≤ 1,000 code points, no appeals, nothing stored |
| `POST /redflag/warn` | `{optIn: true, ruling, flags[], text}` (the browser's own redacted text) | opt-in pattern record. `202 shadow` (`would_submit`) or `202 submitted` (`tx`); `422` not opted in / not SCAM or SUS / no flags / failed the privacy screen; `429` (5 per LA day); `502` summary or submit failed |
| `GET /redflag/digest?days=7&n=10` | – | "Scams going around": `top_patterns_since` read from the ledger (`503` when no ledger address is set) |
| `GET /practice/today` | – | practice-court case: topic only, never the rule text or house take |
| `POST /practice/attempts` | `{take, disclosure: {consent: true, adult_confirmed: true}}` | Jailbreak the Jury attempt: `stopped_at_door` / `caught_by_bench` / `overruled` / `mistrial` / sealed (`got_through`, `moved_a_juror`) |
| `POST /credits/grant` | `Authorization: Bearer ADMIN_TOKEN`; `{payer, cents}` | payment-webhook hook |
| `POST /judge` | `{rubric, entries[], disclosure}` | one-shot open + judge that waits for finality (n8n / MCP) |
| `GET /healthz` | – | mode, network, contract, relayer address |

Webhooks (`case.opened | case.judged | case.appealed | case.failed | case.revoked | case.stale`) go to `callback_url` (https only; private and loopback IP literals refused, but there is no DNS re-check yet, so DNS rebinding to a private address is not blocked), signed `hex(HMAC_SHA256(WEBHOOK_SIGNING_SECRET, "${timestamp}.${rawBody}"))`. `case.judged` / `case.appealed` carry the card: receipt number, verdict, provenance and label, inbox record hash.

### Live Court (Twitch)

`POST /cases` with `surface: "live"` and a `twitch` object creates a Prediction (one outcome per entry). Judging locks it. It resolves exactly once, on a FINALIZED_SUCCESS verdict, after the appeal window (`TWITCH_APPEAL_WINDOW_SEC`, default 300) or at once when final; it is cancelled (Channel Points refunded) on failure, expiry or revocation. Needs a broadcaster token with `channel:manage:predictions` on a Partner/Affiliate channel. Channel Points have no cash value.

### Developer tool: MCP and n8n

* **MCP:** `npm run build && node dist/mcp.js`: one tool, `judge(rubric, entries, consent_public: true, adult_confirmed: true)`, calling `POST /judge`.
* **n8n:** import `relayer/integrations/n8n/verdict-judge.workflow.json`; pass `consent_public` and `adult_confirmed` as `true` in the input item.

---

## Running it

```bash
make setup && make test && make lint && make demo
```

### Relayer

```bash
cd relayer
cp .env.example .env      # never commit .env or .env.local
npm ci && npm run build
node --env-file=.env dist/index.js     # starts in shadow mode as shipped
```

`.env.example` works as shipped for shadow mode: it is pre-filled with the studionet contract address and pinned digest from the evidence run, and shadow mode never signs. To go live, fill in exactly three values in `.env`:

| Value | Where it comes from |
|---|---|
| `JUDGE_ROUTER_ADDRESS` | your deployment's address (`npm run deploy` prints it), or keep the studionet one |
| `EXPECTED_CONTRACT_CODE_DIGEST` | `npm run contract-digest` (sha256 of `contracts/judge_router.py` as deployed) |
| `RELAYER_PRIVATE_KEY` | a fresh key: `node -e "import('genlayer-js').then(m=>console.log(m.generatePrivateKey()))"` |

Then set `VERDICT_MODE=live` (and `MODERATION_ACK_LOCAL_ONLY=true` until a moderation provider is wired).

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `VERDICT_MODE` | `shadow` | `live` submits; anything else is shadow |
| `GENLAYER_NETWORK` | `studionet` | `localnet` \| `studionet` \| `testnetBradbury` \| `testnetAsimov` |
| `GENLAYER_RPC_URL` | chain default | RPC override |
| `JUDGE_ROUTER_ADDRESS` | – (required) | deployed contract |
| `EXPECTED_CONTRACT_CODE_DIGEST` | – (required) | sha256 of the reviewed contract source |
| `ALLOW_UNVERIFIED_CONTRACT` | false | exactly `true` to submit when the RPC cannot return code |
| `RELAYER_PRIVATE_KEY` | – (required in live mode) | gas-paying wallet; secret manager. Shadow mode swaps an unset or all-zero value for a throwaway key |
| `VERDICT_OUTBOX_PATH` / `_INBOX_PATH` / `_STATE_PATH` / `_CREDITS_PATH` | `relayer/data/*.jsonl` | durable journals and state |
| `VERDICT_SUBMISSION_TTL_SEC` | 900 | package submission deadline |
| `VERDICT_CASE_LIFETIME_SEC` | 86400 | judge/appeal window after the deadline (max 30 days) |
| `VERDICT_DRAFT_TTL_SEC` | 86400 | opponent submission deadline for drafts |
| `GENLAYER_ACCEPT_TIMEOUT_MS` / `_FINALITY_TIMEOUT_MS` / `_POLL_INTERVAL_MS` | 600000 / 3600000 / 5000 | finality polling |
| `MODERATION_ACK_LOCAL_ONLY` | false | exactly `true` to run with the local screen only |
| `PORT`, `TRUST_PROXY` | 8787, false | |
| `PER_IP_DAILY_CAP`, `API_KEYS`, `PER_KEY_DAILY_CAP`, `PER_KEY_DAILY_ACTION_CAP` | 20, –, 1000, 1000 | abuse caps |
| `MAX_APPEALS_PER_CASE`, `FREE_APPEALS_PER_DAY`, `APPEAL_PRICE_TIER2_CENTS`, `_TIER3_CENTS` | 2, 1, 199, 499 | appeal policy |
| `ADMIN_TOKEN`, `WEBHOOK_SIGNING_SECRET`, `WEBHOOK_TIMEOUT_MS` | –, –, 5000 | |
| `TWITCH_CLIENT_ID` / `_BROADCASTER_ID` / `_USER_ACCESS_TOKEN`, `TWITCH_PREDICTION_WINDOW_SEC`, `TWITCH_APPEAL_WINDOW_SEC` | –, 120, 300 | Live Court |
| `QUICK_DAILY_CAP`, `PRACTICE_DAILY_CAP`, `QUICK_TTL_SEC` | 10, 10, 86400 | Quick Verdict / Red Flag / practice-court caps; how long a preview can still be published |
| `PUBLISH_DAILY_CAP` | 3 | free publishes per user per LA day |
| `PUBLISH_BUDGET_CENTS_MONTH`, `PUBLISH_FEE_ESTIMATE_CENTS` | 50000, 90 | global monthly publish fee budget (max 100000: refuses to start above it); fee reserved per publish |
| `VERDICT_FEES_PATH` | `relayer/data/fees.jsonl` | measured fee per on-chain transaction |
| `PATTERN_LEDGER_MODE`, `PATTERN_LEDGER_ADDRESS`, `PATTERN_DAILY_CAP` | shadow, studionet address, 5 | Scam Pattern Ledger; live only when this and `VERDICT_MODE` are both `live` |
| `PRACTICE_RULES_PATH`, `QUICK_STORE_PATH`, `REDTEAM_STORE_PATH`, `SEALED_STORE_PATH`, `ACCOUNT_KEY_SECRET` | `relayer/config/…`, `relayer/data/*.jsonl`, random | reviewed rule list; private stores (owner-only files); HMAC key for per-account counters |

---

## Cost and latency caveats

* Every validator repeats the work: Tier 1 is 5 LLM calls × (leader + validators); Tier 2 is 7 and the Supreme Court 9. Each verdict also costs one cheap deterministic `confirm_verdict` transaction.
* Waiting for FINALIZED adds GenLayer's finality window to every card. Measured on studionet: see [docs/LIVE_EVIDENCE.md](docs/LIVE_EVIDENCE.md).
* Gas is on the relayer. Keep anonymous caps low.
* Relayer state is file-backed JSONL for a single instance; use a transactional database before running more than one instance or taking real payments.

## Verify before deploy (still open)

1. **Bradbury.** Studionet accepted the v0.2 SDK header as written; Bradbury is not yet exercised (needs faucet GEN). Re-run `deploy/deploy.ts` and `liveRun.ts` there.
2. **UNDETERMINED / timeouts.** Classified as FINALIZED_ERROR (fail closed for cards). Confirm whether a GenLayer appeal can later turn them into ACCEPTED.
3. **genlayer-js drift.** Written against the published 1.1.8 typings; `2.0.0-rc.x` changes receipt helpers.
4. **Fees on Bradbury.** The relayer sends no explicit `fees`; check whether Bradbury requires them.
5. **Twitch limits** (title 45, outcome 25, window 30–1800 s) and PATCH body format.
6. **Per-sender on-chain limit.** All cases come from one relayer address, so `daily_limit` is a global breaker.

---

## Earning GenLayer Builder points

| Contribution | What VERDICT provides | Evidence |
|---|---|---|
| **Contract Deployed** | Custom validator, 5/7/9 persona juries, 3-tier appeals, case packages with on-chain digest verification, lifetime and revocation | studionet address and txs above ([LIVE_EVIDENCE](docs/LIVE_EVIDENCE.md)); Bradbury to follow |
| **GitHub Repository** | Standalone repo that builds from a fresh clone, tiered tests, CI, verify log | `scripts/verify.sh`, [docs/VERIFY_LOG.md](docs/VERIFY_LOG.md) |
| **Developer Tool** | REST/webhook API, MCP `judge` tool, n8n workflow | this README; publish `verdict-mcp` to npm next |

## Sources used

* <https://docs.genlayer.com/developers/intelligent-contracts/introduction>, `/storage`, `/equivalence-principle`, `/deploying`
* <https://sdk.genlayer.com/main/_static/ai/api.txt>
* <https://github.com/genlayerlabs/genlayer-project-boilerplate>, <https://github.com/genlayerlabs/genlayer-studio>, <https://github.com/genlayerlabs/genlayer-js> and the npm `genlayer-js@1.1.8` typings and JS (receipt fields, `waitForTransactionReceipt`, `getContractCode`)
* GenVM v0.2.16 `py-lib-genlayer-std` sources
* RFC 8785 (JSON Canonicalization Scheme), used as a subset
* <https://dev.twitch.tv/docs/api/predictions/>
