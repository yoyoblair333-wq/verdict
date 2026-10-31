# VERDICT — Product and System Specification

| Field | Value |
|---|---|
| Document | `docs/SPEC.md` |
| Version | **v1.3** |
| Date | 2026-10-31 |
| Owner | Specifications lead (for Blair White, founder) |
| Status | **Approved baseline.** Changes need a new version and a line in §14. |
| Normative companions | `schemas/case-package.v1.json`, `schemas/verdict-receipt.v1.json` (field-level truth), `docs/THREAT_MODEL.md`, `docs/DATA_CLASSIFICATION.md`, `docs/ANALYTICS_EVENTS.md`, `docs/DECISIONS.md` |
| Informative companions | `README.md` (how to run), `REVIEW.md` (findings), `brand/brand-guide.md`, `marketing/viral-playbook.md`, `business/monetization.md`, `business/model.xlsx` |

**How to read this.** §2 is the product in one page. §3 defines every term. §6 enumerates every state. §9 lists every requirement with an ID, a test and an owner. If two documents disagree, this order wins: this spec → the JSON schemas → contract code → everything else. A disagreement is a bug: file it against the lower-ranked document.

**Normative words.** MUST / MUST NOT = required for conformance. SHOULD / SHOULD NOT = required unless a written exception is logged in `docs/DECISIONS.md`. MAY = optional. (RFC 2119 meanings.)

**Status column in §9.** What the reference code did when read on 2026-10-31: **Y** implemented, **P** partly, **N** not yet, **—** a process or copy rule checked by review, not code. `contracts/` and `relayer/` were being changed that day, so engineering owns keeping this column current.

---

## 1. Scope

In scope: the three product surfaces (Settle It, Live Court, Developer API), the `JudgeRouter` Intelligent Contract, the relayer, the credit ledger, the Twitch and payment integrations, and the copy rules that make product claims.

Also in scope (v1.2): the off-chain **Quick Verdict** engine (ADR-013) and the two security games, **Red Flag Court** (ADR-014) and **Jailbreak the Jury** (ADR-015), including the private practice court. These are games, not new values of `surface` (§2a).

Also in scope (v1.3): **Publish** (ADR-019), the step that re-hears a private Settle It preview on-chain, and the **Scam Pattern Ledger** (ADR-020), the `PatternLedger` Intelligent Contract (`contracts/pattern_ledger.py`) with its relayer path and weekly digest.

Out of scope: TikTok content production (see the playbook), native mobile apps (roadmap), the paid off-chain "Quick judgment" API product (`business/monetization.md`; roadmap, not built, same engine as Quick Verdict), Kick (roadmap), any token, staking or on-chain payment.

---

## 2. Canonical product (fixed; do not change without a new major version)

1. **Surfaces.** Exactly three: **Settle It** (two people, web), **Live Court** (Twitch streamers), **Developer API** (REST, webhooks, MCP tool, n8n workflow).
2. **Jury.** A jury is a set of AI **juror personas**, each a prompt pass with its own judging lens. Tier 1 has 5: Marlowe (the Judge), Dahlia (the Romantic), Frank (the Realist), Tiff (the Petty One), Theo (the Philosopher). The Appeals Court adds Augustine (the Chief Justice) and Juno (the Wildcard) = 7. The Supreme Court adds Ines (the Historian) and Rook (the Contrarian) = 9.
3. **Where the verdict comes from.** The verdict is computed inside a GenLayer Intelligent Contract. It stands only if GenLayer's validators, each running its own AI model, re-run the panel and agree within fixed tolerances.
4. **Appeals.** Only a losing side of the standing verdict may appeal. At most 2 appeals per case (Tier 2, then Tier 3, which is final). Side tokens enforce who may act.
5. **Price.** 1 free appeal per payer per UTC day. After that, prepaid credit: **$1.99** for a Tier 2 appeal, **$4.99** for a Tier 3 appeal. No money, credit, refund or reward ever depends on a verdict's outcome. No refund for winning.
6. **Prizes.** Fixed, sponsor-funded, free to enter. Users never fund a prize.
7. **Text only.** Entries and rubrics are text. Nothing else is judged.
8. **18+.** Every participant, on every surface.
9. **People.** Handles only. Rubrics judge takes, never people.
10. **Public record.** Entries become public, permanent on-chain data. Each side gives explicit consent first.
11. **Shadow mode is the default** operating mode on every surface (§6.6).
12. **Finality.** A verdict is final only at GenLayer status **FINALIZED** with execution result **SUCCESS**.

### 2a. Games and Quick Verdict (additive scoping, v1.2)

This section scopes §2. It does not change any item of it.
- Items 3 (the verdict comes from the contract), 10 (public record) and 12 (finality) describe **on-chain** verdicts.
- A **Quick Verdict** (ADR-013) is judged off-chain. It proves none of §8 and is labelled as such.
- Free Settle It Tier 1 cases default to Quick Verdict. ~~A losing side may appeal one onto the chain, and from that point every §2 item applies.~~ *(Superseded in v1.3 by ADR-019.)* The Quick Verdict is a private **preview**. When both sides consent, **Publish** re-hears the case as a fresh on-chain Tier 1. From that point every §2 item applies, including the full appeal ladder (item 4). Unpublished cases can't be appealed.
- **Red Flag Court** and **Jailbreak the Jury** are games inside the web app, not surfaces. `surface` stays `settle | live | api` (V-FUN-01).
- Neither game has appeals, prices, prizes at launch or public on-chain records. The exceptions are the opt-in testnet re-run for Jailbreak finalists (V-JB-06) and, from v1.3, the opt-in Red Flag **pattern record** (ADR-020, V-PL). A pattern record holds no message text and needs counsel sign-off before any public-network write.
- The 18+ rule (item 8), text only (item 7, with the Red Flag limit in §5) and handles only (item 9) apply to both games.
- SHADOW (item 11, §6.6) remains an operating mode of on-chain surfaces. It never means "private" or "off-chain".

### 2b. The on-chain north-star companion metric (v1.3)

**On-chain decisions per week** sits next to WTV (the north star) as its companion metric. It is the count, per ISO week, of GenLayer transactions VERDICT caused that reached FINALIZED with SUCCESS. Sources:
- published cases (Tier 1);
- appeals (Tier 2 and 3);
- Jailbreak testnet re-runs;
- pattern records and dedup sightings;
- Live Court and API verdicts.

Agreed `[REJECTED]` pattern submissions are reported next to it, not inside it. It is reported by source and by `mode`. The definition lives in `docs/ANALYTICS_EVENTS.md` §4. The design brief (§4) names it as the key metric to report to GenLayer.

---

## 3. Glossary

The four "jury words" are different things. Never swap them in copy or code.

| Term | Means | Is NOT |
|---|---|---|
| **Juror persona** | One named prompt pass (e.g. Tiff) inside the contract's non-deterministic block. It casts one vote and scores each entry 0–10. All personas in a panel run on the *current leader's* model. | A separate AI model, a validator, or a separate machine. |
| **Panel** | The set of personas for one tier: 5, 7 or 9. | — |
| **Validator** | A GenLayer network node, running its own AI model, that re-runs the whole panel and votes to accept or reject the leader's result (§9 V-FUN-07). Validators do not cast displayed juror votes. | A juror persona. VERDICT does not choose or operate validators. |
| **Leader** | The validator GenLayer selects to propose a result for a transaction. | — |
| **VERDICT appeal tier** | A product appeal: a new contract transaction that re-hears the case with a bigger panel (5 → 7 → 9). Paid or free per §2.5. | A protocol appeal. |
| **Protocol appeal** | GenLayer's own dispute mechanism inside Optimistic Democracy: during the finality window a protocol appeal adds N + 2 fresh validators (e.g. 5 → 7) and needs a bond. VERDICT does not file or price these. It is one reason a verdict is not final at ACCEPTED. | A VERDICT appeal tier. |
| ACCEPTED | GenLayer transaction status: validators accepted the leader's result. It can still change through a protocol appeal. | Final. |
| FINALIZED | GenLayer transaction status: the finality window has closed; the result can no longer change. | Successful (check execution result too). |
| Execution result | `FINISHED_WITH_RETURN` (SUCCESS) or `FINISHED_WITH_ERROR` (ERROR) for the contract call. | — |
| **Case** | One dispute: a rubric plus 2–10 entries, on one surface. Has one product state (§6.1). | — |
| **Side** | One entry's party, identified by entry index (0 = first). | A person's identity. |
| **Side token** | A random secret, one per side, returned once. Only its SHA-256 hash is stored. Holding it is the only proof of being that side. | An account or login. |
| **Standing verdict** | The latest tier's verdict that reached FINALIZED_SUCCESS. Cards, the public record view and Twitch use only this. | A provisional (ACCEPTED) result. |
| **Losing side** | Any side whose index ≠ the standing verdict's `winner_index`. After an overturn, the former winner becomes a losing side and may appeal. | — |
| **Closed** | No further appeal is possible: Tier 3 standing, or appeal window expired, or 2 appeals used. A takedown does **not** close a case. | Revoked. |
| **Case package** | The canonical JSON object a case is opened from (`schemas/case-package.v1.json`). All of it is published on-chain. | — |
| **packageDigest** | Lowercase hex SHA-256 of the package's canonical bytes. It is the case's **receipt number**. Stored on-chain; every judge, appeal, revoke and expire call and every receipt record carries it. | Proof that a verdict is correct (§8). |
| **Receipt record** | One hash-chained line of the relayer's inbox (`schemas/verdict-receipt.v1.json`) importing a chain outcome. | — |
| **Provenance** | Per entry: `entrySource` (who relayed it) and `assurance` (what the relayer checked). §7.3. | Authorship proof. |
| **Payer** | The identity a free appeal or credit is charged to. Reference code: API key, else client IP. Target: signed-in account (V-FUN-21). | — |
| **Credit** | Prepaid appeal balance in US cents. No cash value. | Money owed to the user. |
| **Technical refund** | Returning a free appeal or credit because the service was not delivered: the transaction failed or went STALE. Never conditional on who won. | A refund for winning or losing. |
| **Revocation** | A side withdraws consent **before the Tier 1 verdict reaches FINALIZED_SUCCESS**. Case → REVOKED. After that point revocation is not available. | Erasure. On-chain text stays. Not a way to end a case or block an appeal. |
| **Takedown** | Hiding a case from VERDICT's public surfaces (cards, gallery, record-view text, public API listings). Available to either side at any time from PENDING on; the only option once the Tier 1 verdict is final. Off-chain only. Does not end the case or block an appeal; the sides keep a private view. | Erasure, revocation or closure. |
| **Operating mode** | Per surface: SHADOW (default) or LIVE. §6.6. | — |
| **Surface** | `settle`, `live` or `api`. Fixed per case. | — |
| **UTC day** | 00:00:00–23:59:59 UTC. Case caps and the free appeal roll over at 00:00 UTC. *(v1.3)* Game clocks, the publish cap and the pattern cap use the **LA day** instead (ADR-018 item 3). | Local midnight. |
| **Quick Verdict** | Off-chain judging (ADR-013): the same personas, sanitiser, fenced prompt and strict JSON as the contract, run once by the relayer against an LLM processor (C9). Rail: Submitted → Jury scoring → Done. | Network-checked, final in the §6.2 sense, a receipt, or "shadow mode". |
| **Practice court** | The private, multi-validator localnet VERDICT runs (C10), with the same contract and `contractCodeDigest`. It is where Jailbreak the Jury is played. It follows Quick Verdict claim rules. | A public network, a testnet, or "shadow mode". |
| **Venue** | Where a result was computed: `chain` (target network), `quick_verdict` or `practice_court`. Recorded on every result and analytics event. | A surface or an operating mode. |
| **Red Flag ruling** | SCAM, SUS or LOOKS LEGIT on one pasted message, with fixed flag codes (ADR-014). | A verdict on a person, a safety check, or a case with sides. |
| **Door catch / bench catch** | Jailbreak results. A door catch is a relayer blocklist hit, and the jury never read it. A bench catch means the practice-court jury scored the attempt and caught it. | Interchangeable. Only a bench catch has a split. |
| **Sealed attempt** | A Jailbreak attempt that got through or moved at least one juror. It is held in the private patch queue until the fix ships. | Hall content. |
| **Testnet re-run** | A bench-caught, replayed, separately opted-in Jailbreak finalist judged on GenLayer testnet with a `VR-` receipt (V-JB-06). | An appeal. |
| **Preview** *(v1.3)* | The private Quick Verdict of a Settle It case (ADR-019). Seen by the two sides only: no public URL, no gallery, no receipt, no network claim. | A SHADOW card, a published card, or anything to do with Live Court. |
| **Publish** *(v1.3)* | The step that re-hears a preview on GenLayer as a fresh on-chain Tier 1 case (5 jurors, validator agreement), after both sides accept notice `publish-onchain-v1`. Free to the user, capped at 3 per user per LA day, once per case. Afterwards the network's ruling is the result. | An appeal, a share, or the LIVE operating mode. |
| **Published case** *(v1.3)* | A Settle It case whose Tier 1 was dispatched through Publish. Only published cases can be appealed. | Public: in SHADOW its card is still private to the sides (§6.6). |
| **Overruled preview** *(v1.3)* | A published case whose network Tier 1 `winner_index` differs from the preview's. The card says "The network overruled the preview." | An appeal outcome (OVERTURNED). |
| **Pattern Ledger** *(v1.3)* | The `PatternLedger` Intelligent Contract (C11) that stores pattern records (ADR-020). | A FlagRouter, or a store of messages. |
| **Pattern record** *(v1.3)* | An on-chain entry in the Pattern Ledger: `flag_codes` (subset of the 16 codes), `category` (fixed enum), `summary` (≤ 200 characters, VERDICT-written abstract paraphrase), `sightings`, first and last seen. It holds no message text, hash of the message, sender or user id. | A Red Flag ruling, a paste, or evidence about any person or company. |
| **Sighting** *(v1.3)* | One opted-in submission that validators agree is the same pattern as an existing record. It adds 1 to `sightings`. | A new record, or a count of victims. |
| **LA day** *(v1.3)* | 00:00:00–23:59:59 America/Los_Angeles. Game clocks (ADR-018 item 3), the publish cap and the pattern cap roll over at 00:00 LA. | A UTC day. |

---

## 4. System context, authority and trust

### 4.1 Components

| ID | Component | Code | Runs where |
|---|---|---|---|
| C1 | Browser client (Settle It web app, Live Court overlay) | `app/` | User or streamer device. **Untrusted.** |
| C2 | Relayer (HTTP API, moderation pre-check, outbox/inbox, ledger, Twitch and webhook clients) | `relayer/` | Operator server. Holds the relayer wallet. |
| C3 | `JudgeRouter` Intelligent Contract | `contracts/judge_router.py` | GenLayer network (Studionet, then Bradbury testnet; mainnet later). |
| C4 | GenLayer network (leader + validators, RPC endpoints) | external | Third party. |
| C5 | Twitch Helix Predictions API | external | Third party. |
| C6 | Payment provider (Stripe checkout + webhooks) | external | Third party. Card data never leaves it. |
| C7 | Moderation provider | external, not yet wired | Third party. |
| C8 | Developer systems (API clients, webhook receivers, MCP hosts, n8n) | external | Third party. **Untrusted.** |
| C9 | LLM processor for Quick Verdict (v1.2) | external, not yet chosen | Third party under no-retention terms. Sees redacted Red Flag text and Quick Verdict takes. |
| C10 | Practice court localnet (v1.2) | same `contracts/judge_router.py`, own validators | Operator infrastructure. Private; not reachable from the public internet. |
| C11 | `PatternLedger` Intelligent Contract (v1.3) | `contracts/pattern_ledger.py` | GenLayer network, after counsel sign-off. Before that, C10 only (V-PL-13). |

### 4.2 Who is authoritative for what

| Fact | Authority | Everyone else |
|---|---|---|
| Entry text, rubric, surface, provenance, lifetime, packageDigest of an opened case | **Chain** (C3) | Must match the chain or refuse to display. |
| Verdict, votes, split, scores, tier, history, contract status | **Chain**, only at FINALIZED + SUCCESS | Relayer imports into the inbox; UI renders inbox records only. |
| Consent records, age confirmations, handles | **Relayer** DB | Chain sees only `disclosure.consent = true`, `adultConfirmed = true`, `noticeVersion`. |
| Side-token validity | **Relayer** (hash compare) | Chain trusts the relayer as case creator (V-SEC-12). |
| Product case state (§6.1), appeal state (§6.3), ledger (§6.4) | **Relayer** DB | Derived from chain + relayer events. |
| Payment succeeded | **Payment provider** (signed webhook) | Relayer grants credit only on a verified, unseen event. |
| Prediction state | **Twitch** | Relayer drives it in LIVE mode only. |
| Pattern records and sightings (v1.3) | **Chain** (C11), only at FINALIZED + SUCCESS | Digest and Proof tab render from chain reads only. |
| Publish consents, publish cap count, preview `winner_index` (v1.3) | **Relayer** DB | Chain sees only `noticeVersion = publish-onchain-v1`. |

### 4.3 Trust boundaries (detail in `docs/THREAT_MODEL.md`)

TB1 Browser ↔ Relayer · TB2 Relayer ↔ GenLayer (RPC + consensus) · TB3 Relayer ↔ Twitch · TB4 Payment provider → Relayer · TB5 Relayer → developer webhook receivers · TB6 API/MCP/n8n clients → Relayer · TB7 Operator → contract owner functions and relayer config · TB8 Relayer ↔ moderation provider · TB9 Relayer ↔ LLM processor (Quick Verdict) · TB10 Relayer ↔ practice court localnet. *(v1.3)* Writes to the Pattern Ledger (C11) cross TB2. The pattern summary is written by the processor across TB9.

---

## 5. Constants and timers

| Name | Value | Where set | Notes |
|---|---|---|---|
| `TIER_JURORS` | {1: 5, 2: 7, 3: 9} | contract | Fixed by §2. |
| `MAX_TIER` | 3 | contract | Supreme Court. |
| `MAX_APPEALS_PER_CASE` | 2 | relayer (capped at 2) | |
| Entries per case | 2–10; **exactly 2 on Settle It** | contract 2–10; relayer 2 for `settle` | |
| `MAX_ENTRY_CHARS` / `MAX_RUBRIC_CHARS` / `MAX_REASON_CHARS` | 280 / 200 / 120 | contract + relayer | Counted in Unicode code points after sanitising. |
| `SCORE_TOLERANCE` | 20 (= 2.0 points on the ×10 scale) | contract | Validator acceptance. |
| `CLOSE_CALL_MARGIN` | 10 (= 1.0 point) | contract | Validator acceptance. |
| `FREE_APPEALS_PER_DAY` | 1 per payer per UTC day | relayer | |
| Appeal price | Tier 2: 199 ¢ · Tier 3: 499 ¢ | relayer | |
| `T_submit` (opponent deadline, Settle It) | 24 h from AWAITING_OPPONENT | relayer | Countdown shown to users MUST equal this value (V-SAFE-08). |
| `T_queue` (SUBMITTED → on-chain) | 24 h | relayer → `lifetime.submissionDeadline` | Contract refuses to open after it. |
| Case lifetime (`lifetime.appealWindowExpiry`) | Settle It and API: submissionDeadline + 7 d. Live Court: + 1 d. Hard max + 30 d. | relayer; max enforced by contract | No judge or appeal after it. |
| `T_appeal` (per-tier appeal window) | Settle It 24 h · API 24 h · Live Court `TWITCH_APPEAL_WINDOW_SEC` (default 300 s, max 3600 s) | relayer | Opens when the standing verdict reaches FINALIZED_SUCCESS. Effective deadline = min(opened_at + T_appeal, lifetime.appealWindowExpiry). Paused while an appeal is IN_REVIEW. |
| `T_accept_wait` | `GENLAYER_WAIT_RETRIES` × `GENLAYER_WAIT_INTERVAL_MS` = 120 × 5 s = 10 min | relayer | After this, keep polling in the background; UI shows "still deliberating". |
| `T_final_max` | 24 h from dispatch | relayer | Not FINALIZED by then → STALE (§6.1 T9). |
| `T_reconcile` | 7 d | relayer | A STALE tx that finalizes later is adopted (§6.1 T12). |
| `T_takedown` | 24 h including CDN purge | relayer + host | |
| Webhook replay window | 300 s | receivers | Receivers reject older `x-verdict-timestamp`. |
| Twitch auto-refund | 24 h unresolved (Twitch rule) | Twitch | Relayer must resolve or cancel well before. |
| Moderation report SLA | 24 h to first action | operator | |
| `RF_MAX_CHARS` | 1,000 code points after sanitising | relayer + browser | Red Flag Court only (ADR-014 item 9, amends ADR-007). On-chain entries stay 280. |
| `RF_DAILY_CAP` | 10 checks per account or HMAC(IP) per UTC day | relayer | V-RF-15. |
| `QV_JUROR_LINE_CHARS` | 110 | relayer | Red Flag juror lines; never quote the message. |
| `JB_DAILY_ATTEMPTS` | 10 per UTC day; 3 for accounts < 7 days old | relayer | Separate from case caps; MISTRIAL refunds one (V-JB-08). |
| `JB_CASE_OPENS` | Monday 00:00 America/Los_Angeles | relayer config | Weekly case. Attempt allowance still rolls over at 00:00 UTC (see §13 item 6). |
| `PUBLISH_DAILY_CAP` (v1.3) | 3 per user per LA day | relayer | Charged to the side that tapped Publish, at T4; restored on FINALIZED_ERROR or STALE (V-PUB-06). |
| `PUBLISH_NOTICE` (v1.3) | `publish-onchain-v1` | relayer + browser | §11. Both sides required. |
| `PL_DAILY_CAP` (v1.3) | 5 submissions per user per LA day | relayer | Separate from `RF_DAILY_CAP` (V-PL-09). |
| `PL_SUMMARY_CHARS` (v1.3) | 200 code points | relayer + contract (`MAX_SUMMARY_CHARS`) | V-PL-02. |
| `PL_CATEGORIES` (v1.3) | delivery, account-lock, romance, job, prize, investment, impersonation, other | contract `CATEGORIES` + relayer | Closed enum. |
| `PL_DEDUP_CANDIDATES` (v1.3) | default 10, max 20 | contract owner setting | Candidates offered to the leader for "same as id N". |
| `PL_SIGHTING_WINDOW` (v1.3) | 30 days | relayer | One sighting per user per pattern in the window (V-PL-14). |

---

## 6. State machines

### 6.1 Case (product state, owned by the relayer)

States:

| State | Meaning | On-chain? | Terminal? |
|---|---|---|---|
| DRAFT | Side A is writing in the browser. No server record. | No | — (abandon = discard, untracked) |
| AWAITING_OPPONENT | A has submitted and consented. A's take is held off-chain (CONFIDENTIAL). B has an invite and `T_submit` to answer. Settle It only. | No | No |
| SUBMITTED | All entries and all required consents are held off-chain; package built; waiting for quota and dispatch. API and Live Court cases start here. | No | No |
| PENDING | The package is dispatched (`open_case_package`, then `judge` or `appeal`) and the transaction is not yet ACCEPTED with SUCCESS. **From this state on, the entry text is public and permanent.** | Yes | No |
| ACCEPTED | The latest transaction is ACCEPTED with SUCCESS and the on-chain digest matches. Provisional: may still change. | Yes | No |
| FINALIZED_SUCCESS | The latest tier's transaction is FINALIZED with SUCCESS and the digest matches. This is a standing verdict. Attribute `closed` (bool). | Yes | Yes for the case machine when `closed = true`; otherwise the appeal machine (§6.3) may move it back to PENDING. |
| FINALIZED_ERROR | No verdict exists: the Tier 1 transaction finalized with an error after retries, or an integrity check failed. | Yes (text) | Yes |
| STALE | A deadline passed: opponent never answered, dispatch never happened in `T_queue`, or the Tier 1 transaction did not finalize in `T_final_max`. | Only if it went stale after PENDING | Yes, except reconciliation T12 |
| REVOKED | A side (or the operator, for safety) withdrew the case before the Tier 1 verdict reached FINALIZED_SUCCESS. No verdict shown, no card, no Twitch resolution. | Only if revoked after PENDING | Yes |

Transitions (every transition not listed is forbidden; the relayer MUST reject it with HTTP 409):

| # | From → To | Trigger | Guards (all must hold) | Side effects |
|---|---|---|---|---|
| T1 | ∅ → DRAFT | A opens the composer | — | None server-side. |
| T2 | DRAFT → AWAITING_OPPONENT | A submits | 18+ confirmed; consent notice (§11) accepted; handle valid; local moderation passes | Store A's take, handle, consent record. Mint 2 side tokens; store hashes. Return A's token; put B's token in the invite link's URL fragment. Start `T_submit`. Event `take_submitted`. |
| T3 | AWAITING_OPPONENT → SUBMITTED | B submits | Valid B token; before deadline; B 18+; B consent; B handle; moderation passes for both | Build case package (both entries, provenance, `consent=true`, `adultConfirmed=true`, `noticeVersion`, lifetime). Compute packageDigest. |
| T3a | ∅ → SUBMITTED | `POST /cases` (Live Court host or API client) | Valid host session or API key; caller attestation (V-LEGAL-07, V-SAFE-01); moderation passes | Same as T3. Side tokens returned to the caller. |
| T4 | SUBMITTED → PENDING | Dispatcher | Surface quota and gas budget available; digest recomputed and equal; operating mode recorded | Write package to the outbox. Send `open_case_package(package_json, digest)`, then `judge(case_id, digest)`. Live Court in LIVE mode: lock the Prediction. |
| T5 | PENDING → ACCEPTED | Receipt poll | Status ACCEPTED; execution SUCCESS; `get_case().package_digest` = local digest | UI may show "Provisional, being checked". **No card, share, Twitch resolution or `case.finalized` webhook.** |
| T6 | ACCEPTED → FINALIZED_SUCCESS | Receipt poll | Status FINALIZED; execution SUCCESS; digest matches on re-read | Append receipt record (`finality: FINALIZED_SUCCESS`). Open appeal window (§6.3). Card may render. Webhook `case.finalized`. |
| T7 | PENDING/ACCEPTED → PENDING | Receipt poll | Tier 1 tx finalized with error or CANCELED; contract status still `pending`; retries used < 1 | Re-send `judge` once with the same digest. |
| T8 | PENDING/ACCEPTED → FINALIZED_ERROR | Receipt poll | Tier 1 tx failed after the retry, **or** any digest/destination mismatch | Technical refund of anything held. Live Court: cancel the Prediction (points refunded). Webhook `case.failed`. Digest mismatch also pages the operator (V-OPS-06). |
| T9 | PENDING/ACCEPTED → STALE | Timer | Not FINALIZED within `T_final_max` | As T8 minus the page. Call `expire()` once the on-chain lifetime has passed. |
| T10 | AWAITING_OPPONENT → STALE | Timer | `T_submit` passed | Delete A's take within 24 h. Private no-show notice to A only (V-FUN-23). Nothing on-chain. |
| T10a | SUBMITTED → STALE | Timer | `T_queue` passed without dispatch | Delete held takes within 24 h. Nothing on-chain. |
| T11 | AWAITING_OPPONENT / SUBMITTED / PENDING (Tier 1) / ACCEPTED (Tier 1) → REVOKED | Revoke request or "this isn't a game" | Valid side token for any side, or operator safety action; **no tier has ever reached FINALIZED_SUCCESS** | If not yet on-chain: delete held takes within 24 h. If on-chain: call `revoke(case_id, digest, side)`; show no verdict or card (a Tier 1 tx still in flight is ignored for display); Live Court: cancel the Prediction. Webhook `case.revoked`. No appeal hold can exist yet. |
| T12 | STALE → FINALIZED_SUCCESS | Reconciler | The STALE tx later shows FINALIZED + SUCCESS within `T_reconcile`; case not revoked | Adopt the chain result. Refunds already issued stay issued (they never depended on outcome). |
| T13 | FINALIZED_SUCCESS → PENDING | Appeal machine A4 | §6.3 guards | Standing verdict stays displayed with "Under appeal". |
| T14 | PENDING/ACCEPTED (during an appeal) → FINALIZED_SUCCESS | Receipt poll | Appeal tx FINALIZED + SUCCESS → standing tier = n + 1; **or** appeal tx failed/stale → standing tier stays n | See §6.3 A5/A6. An appeal failure never produces FINALIZED_ERROR or STALE at case level. |

Takedown is not a state. Either side may request it in any state from PENDING on; after the Tier 1 verdict reaches FINALIZED_SUCCESS it is the **only** consent-withdrawal option (ADR-012). It sets `taken_down = true` and, within `T_takedown`, hides the case from public cards, the gallery, record-view text and public API listings. It does **not** change the case state, does not set `closed`, and does not block, cancel or refund an appeal: appeals run as normal and their results stay visible to the sides in a private view. A revoke request after Tier 1 FINALIZED_SUCCESS → HTTP 409 with a pointer to takedown.

Mapping to the other two state systems:

| Product state | Contract `status` | Latest tx (GenLayer) |
|---|---|---|
| DRAFT, AWAITING_OPPONENT, SUBMITTED | (no case) | — |
| PENDING | `pending` (Tier 1) or `judged`/`appealed` (during an appeal) | PENDING, PROPOSING, COMMITTING, REVEALING, APPEAL_COMMITTING, APPEAL_REVEALING, LEADER_TIMEOUT, VALIDATORS_TIMEOUT, UNDETERMINED, or ACCEPTED with ERROR |
| ACCEPTED | as above, updated | ACCEPTED + FINISHED_WITH_RETURN |
| FINALIZED_SUCCESS | `judged`, `appealed` or `final` | FINALIZED + FINISHED_WITH_RETURN |
| FINALIZED_ERROR | `pending` | FINALIZED + FINISHED_WITH_ERROR, or CANCELED, or finalized UNDETERMINED |
| STALE | `pending` → `stale` after `expire()` | not FINALIZED in `T_final_max` |
| REVOKED | `revoked` (if on-chain) | `revoke` tx FINALIZED + SUCCESS |

How UNDETERMINED and the timeout statuses end on Bradbury is not yet confirmed (README "Verify before deploy" item 6). Until it is, they are treated as PENDING, and only FINALIZED + SUCCESS counts as success.

### 6.2 Finality rule (applies to every write)

A result is **final** if and only if the transaction status is `FINALIZED` **and** the execution result is `FINISHED_WITH_RETURN` (Studio fallback: `leader_receipt[0].execution_result == "SUCCESS"`) **and** the re-read `package_digest` equals the relayer's digest. Anything else is provisional or failed. Only final results may drive a card, a share, the public gallery, a Twitch resolution, a `case.finalized` webhook, or a ledger CAPTURE.

### 6.3 Appeal (one opportunity per standing verdict; at most 2 per case)

| State | Meaning |
|---|---|
| NOT_OPEN | Standing verdict not yet FINALIZED_SUCCESS. |
| OPEN | Window running. Only a losing side may request. |
| REQUESTED | A losing side's token was presented and all guards passed. |
| CHARGED | A free allowance or a credit amount is HELD (§6.4). |
| IN_REVIEW | Appeal tx dispatched; case is PENDING at tier n + 1. Window paused. |
| DECIDED | Appeal tx FINALIZED_SUCCESS. Outcome attribute: `UPHELD` (same `winner_index` as tier n) or `OVERTURNED`. Hold CAPTURED. |
| FAILED | Appeal tx finalized with error, or did not finalize in `T_final_max`. Hold RELEASED (technical refund). |
| STALE | Window expired with no request. Case `closed = true`; relayer calls `finalize()`. |
| CLOSED | Tier 3 standing, or 2 appeals used. (Takedown and revocation never lead here: revocation is impossible once an appeal can exist, and takedown does not stop appeals.) |

| # | From → To | Guard / trigger |
|---|---|---|
| A1 | NOT_OPEN → OPEN | Standing verdict FINALIZED_SUCCESS; tier < 3; appeals used < 2. A takedown does not prevent opening. Window = min(now + `T_appeal`, lifetime.appealWindowExpiry). |
| A2 | OPEN → REQUESTED | `POST /cases/:id/appeal` with a token whose side ≠ standing `winner_index`; contract tier = expected `from_tier`; before deadline. Winner's token → 403. |
| A3 | REQUESTED → CHARGED | Free allowance available → hold it; else credit balance ≥ price → hold price; else 402 and back to OPEN. |
| A4 | CHARGED → IN_REVIEW | `appeal(case_id, digest, from_tier)` sent. Case T13. Live Court: Prediction stays LOCKED; any pending resolve timer is cancelled. |
| A5 | IN_REVIEW → DECIDED | Appeal tx FINALIZED_SUCCESS. Capture. Receipt record appended. Then: tier 3 → CLOSED; else a new OPEN for the new losing side(s) (A1). |
| A6 | IN_REVIEW → FAILED → OPEN | Failure as defined above. Release. Appeals-used count is not incremented. Window resumes with its remaining time (minimum 10 minutes). |
| A7 | OPEN → STALE | Deadline passes. |
| A8 | DECIDED → CLOSED | Tier 3 reached, or 2 appeals used. No other event closes the appeal machine; in particular a revocation request (refused, 409) or a takedown by the winning side cannot end the losing side's appeal. |

On 3+ entry cases (API only), any losing side may request; the first valid request wins the opportunity.

### 6.4 Credit ledger

Amounts are integer US cents. The ledger is append-only; balances are derived.

**Purchase (per checkout):** CHECKOUT_CREATED → PAID (provider event signature verified) → GRANTED (ledger `+amount`, keyed by provider event ID; a repeat event is a no-op). CHECKOUT_CREATED → EXPIRED or FAILED (no ledger entry). GRANTED → REVERSED (refund required by law, or chargeback: ledger `−amount`).

**Spend (per appeal charge):** HELD → CAPTURED (appeal DECIDED) or HELD → RELEASED (appeal FAILED; technical refund). A HOLD MUST resolve within `T_final_max` + 1 h; an unresolved hold is released automatically and logged.

**Free allowance (per payer per UTC day):** AVAILABLE → HELD → CONSUMED, or HELD → RELEASED → AVAILABLE. A release after the UTC day rolled over restores one free appeal valid until the end of the current UTC day.

**Account:** ACTIVE → SPEND_LOCKED (balance below 0 after a reversal, or fraud flag; no new holds) → ACTIVE (balance restored, or flag cleared). ACTIVE → CLOSED (account deleted; unspent credit is forfeited unless law requires otherwise, per ToS and counsel).

Invariants (tested, V-FUN-22):
1. available = Σ GRANTED − Σ REVERSED − Σ CAPTURED − Σ HELD (open). Never negative except via REVERSED.
2. No ledger entry contains or depends on `winner_index`, outcome, UPHELD or OVERTURNED. Entries reference only payer, case ID, tier, tx hash, provider event ID.
3. Every HOLD ends in exactly one CAPTURE or RELEASE.
4. Hold placement is atomic with the balance check (no double spend under concurrency).

### 6.5 Live Court Prediction (LIVE mode only)

| State (Twitch) | Entered when | Next |
|---|---|---|
| ACTIVE | Case SUBMITTED via T3a; outcomes in entry-index order; outcome IDs stored | LOCKED at T4 |
| LOCKED | Case dispatched | RESOLVED or CANCELED |
| RESOLVED | Standing verdict FINALIZED_SUCCESS **and** case `closed = true` (window expired, tier 3, or 2 appeals used). `winning_outcome_id` = outcome at standing `winner_index`. Exactly once. | — |
| CANCELED | Case FINALIZED_ERROR, STALE, or REVOKED; or resolution would otherwise breach Twitch's 24 h limit | — |

In SHADOW mode the relayer makes **no** Predictions calls at all (V-FUN-20).

### 6.6 Operating mode (per surface)

| Mode | What runs | What is suppressed |
|---|---|---|
| **SHADOW** (default) | Full pipeline: moderation, package, chain writes, verdicts, receipts, analytics. | Live Court: no Predictions calls; overlay labels the result "Jury's view (test run)"; the streamer decides any Prediction by hand. Settle It: cards are visible to the case's sides only, watermarked "Test run · Not public yet", not shareable to a public URL, not in the gallery. *(v1.3: these labels used to say "preview". That word now means only the Settle It Quick Verdict, ADR-019 item 11.)* Pattern Ledger: records are written, but the digest and the "Recorded on GenLayer" line are not shown publicly (V-PL-13). API: every response and webhook carries `"mode": "shadow"`. Paid credit purchases are disabled. |
| **LIVE** | All of the above, plus authoritative effects. | Nothing beyond the normal rules. |

SHADOW → LIVE needs gate G-LIVE (§10) for that surface and a logged config change. LIVE → SHADOW is allowed at any time (it is the safe direction). Mode is recorded on every case at T4 and never changes for that case.

### 6.7 Publish (v1.3, ADR-019; Settle It previews only)

Each preview has one publish machine. The case has no on-chain record until P4.

| State | Meaning |
|---|---|
| NOT_REQUESTED | The preview is Done. Nobody has tapped Publish. |
| REQUESTED | One side tapped Publish and accepted `publish-onchain-v1`. Waiting for the other side. Nothing is sent. |
| CONSENTED | Both sides hold a current `publish-onchain-v1` consent record. |
| DISPATCHED | The case entered §6.1 at SUBMITTED (T3p) and then PENDING (T4). From here §6.1–§6.3 govern. |
| WITHDRAWN | A side withdrew its consent, or the requester cancelled, before T4. It can return to NOT_REQUESTED. |

| # | From → To | Guard / trigger |
|---|---|---|
| P1 | NOT_REQUESTED → REQUESTED | Either side's token or account; preview Done; case never published; that side ticks `publish-onchain-v1`. Event `publish_requested`, then `publish_consented`. |
| P2 | REQUESTED → CONSENTED | The **other** side's own token or account ticks `publish-onchain-v1`. A consent presented with the requester's token for the other side → 403. Event `publish_consented`. |
| P3 | REQUESTED / CONSENTED → WITHDRAWN | Either side withdraws its own consent, or the requester cancels, before T4. Event `publish_consent_withdrawn`. |
| P4 | CONSENTED → DISPATCHED | Requester's publish count < `PUBLISH_DAILY_CAP` for the current LA day (else 429 with the reset time, event `publish_cap_hit`, stays CONSENTED); moderation and PII screen pass (V-PRIV-04); package built with `noticeVersion = publish-onchain-v1` → §6.1 **T3p** (∅ → SUBMITTED), then T4 under the normal guards. The publish count is charged at T4. |
| P5 | DISPATCHED (Tier 1 → FINALIZED_ERROR or STALE) | Publish count restored (technical). The case cannot be re-published automatically; the sides may request again (back to NOT_REQUESTED). |

§6.1 gains **T3p**: ∅ → SUBMITTED, trigger P4, guards as T3 except that both consent records are on `publish-onchain-v1` and the takes are the preview's stored takes, side effects as T3. A takedown of the preview (V-QV-07) does not withdraw publish consent that a side already gave. A side that never consents keeps the case unpublished. Then no appeal is possible (ADR-019 Consequences, THREAT_MODEL T61).

### 6.8 Pattern submission (v1.3, ADR-020)

| State | Meaning |
|---|---|
| OFFERED | A SCAM or SUS ruling on a real paste is shown; "Help warn others" is visible and off. |
| OPTED_IN | The user ticked `pattern-optin-v1`; the browser re-sends its redacted text. |
| SCREENED | The relayer redacted again, generated the summary, and the summary passed the deterministic screen. The text has been discarded. |
| SUBMITTED | `submit_pattern` was sent (C11). |
| RECORDED | FINALIZED + SUCCESS; `outcome = new`. Event `pattern_recorded`. |
| SIGHTED | FINALIZED + SUCCESS; `outcome = sighting`. Event `pattern_sighting`. |
| REJECTED | Deterministic screen failed (no chain write), or validators agreed on `[REJECTED]`, or no consensus after one retry. Event `pattern_rejected`. Terminal. |

Guards: OPTED_IN needs `PL_DAILY_CAP` headroom; SUBMITTED needs the V-PL-13 stage to allow a write to that network. Before counsel sign-off the only destination is C10.

---

## 7. Case package, receipt number and provenance

### 7.1 Package
The relayer builds a case package (`schemas/case-package.v1.json`). Key sets are closed, so nothing outside the schema (no IP, token, key or email) can ride along. It is canonicalised (sorted keys, UTF-8, no insignificant whitespace, integers only; an RFC 8785 subset). Entry text is already sanitised (NFKC, zero-width, bidi and control characters removed, trimmed). Each entry carries its own SHA-256. `destination` binds the package to one network, one contract address and one pinned contract-source digest. **The whole package is published on-chain.**

### 7.2 Receipt number (packageDigest)
- packageDigest = lowercase hex SHA-256 of the canonical package bytes (64 chars).
- The relayer sends the canonical string and the digest. The contract re-derives the digest and every check and reverts on any mismatch (`digest_mismatch`, `not_canonical`, `not_sanitised`, `wrong_destination`, `expired`, `consent_required`, `adult_confirmation_required`, `moderation_not_passed`, `schema_invalid`).
- The contract stores it as `package_digest`. `judge`, `appeal`, `finalize`, `revoke` and `expire` require it and revert on mismatch.
- The relayer refuses to import a receipt record whose digest differs from the on-chain value.
- Display form: `VR-` + first 12 hex chars uppercased in groups of 4 (e.g. `VR-3F9A-C2D1-7B0E`). The short form is for people; verification always uses all 64.
- Same `requestKey` + same digest → the contract returns the existing case (idempotent retry). Same `requestKey` + different digest → revert.

### 7.3 Provenance

| `entrySource` | Fixed by surface | Meaning |
|---|---|---|
| `participant_submitted` | `settle` | The entry came through a side's own Settle It session. |
| `host_submitted` | `live` | The streamer (host) typed or relayed the entry. |
| `api_client_submitted` | `api` | A developer's system sent the entry. |

| `assurance` | Allowed with | Meaning |
|---|---|---|
| `self_asserted` (default) | any source | Nobody checked who wrote it. |
| `verified_participant` | `participant_submitted` only | The relayer saw a valid side token for that side when the entry was submitted. It is the relayer's claim; the chain cannot check it. It proves possession of an invite link, not a person's identity. |

Every card and record view MUST show a provenance label that never implies more than the recorded assurance, e.g. "Takes relayed by the host. Not verified." (Live Court) or "Each take sent from its own invite link." (Settle It, both `verified_participant`).

---

## 8. What VERDICT does and does not prove

A FINALIZED_SUCCESS verdict whose on-chain `package_digest` matches the receipt number on the card proves:
1. **Which takes were judged:** these exact (sanitised) entry texts, under this rubric, on this surface, with this provenance and lifetime.
2. **Where and how:** by the contract at this address on this network, at the recorded tier and panel size.
3. **That the network accepted it:** GenLayer's validators re-ran the panel and accepted the result within `SCORE_TOLERANCE` and `CLOSE_CALL_MARGIN`, and it could no longer change.
4. **The appeal history:** every earlier tier's votes, scores and reason, in order.
5. **That consent was asserted:** the package carried `consent = true` and `adultConfirmed = true` with a notice version.

It does **not** prove:
1. That the verdict is correct, fair or "true". It is an AI opinion for entertainment.
2. Who wrote an entry. `host_submitted` and `api_client_submitted` entries may have been written by anyone, including the host. `verified_participant` means only that the invite-link holder sent it.
3. That two sides are two different people.
4. That consent and 18+ were actually given. The chain records the relayer's assertion; the evidence is the relayer's consent record.
5. That the original wording was kept. Sanitising (NFKC, character stripping, trimming) can change characters.
6. That the prompts or presets are neutral. The operator wrote them; they are public in the contract source.
7. That the operator did not refuse, moderate out or delay other cases. The relayer decides what is submitted.
8. That validators used different AI vendors. That is how GenLayer describes its network; VERDICT does not control or check it.
9. That a screenshot of a card is genuine. Only the record view (`/r/<digest>`, V-SEC-17) or a chain explorer can show that.

Copy MUST stay inside this list (V-LEGAL-09).

---

## 9. Requirements

Owner surface codes: **CON** contract · **REL** relayer · **WEB** Settle It web app · **LIVE** Live Court overlay + Twitch integration · **API** REST/webhooks/MCP/n8n · **PAY** checkout + payment webhook · **OPS** operator runbooks and config · **COPY** brand, UI and marketing copy · **LEGAL** terms, rules, counsel.

### 9.1 Functional (V-FUN)

| ID | Requirement | Acceptance criterion | Owner | Status |
|---|---|---|---|---|
| V-FUN-01 | The system MUST support exactly the surfaces `settle`, `live`, `api`. | Contract and relayer reject any other value (contract `[EXPECTED] unknown surface`; relayer 400). Test exists for each. | CON, REL | Y |
| V-FUN-02 | Settle It and Live Court MUST offer only preset rubrics (`whos_right`, `better_roast`, `pettiest_text`, `better_comeback`) plus operator-approved limited rubrics. Custom rubric text MUST be accepted only on `api`. | `POST /cases` with custom text and `surface ≠ api` → 400. Limited rubrics come from a reviewed list in config. | REL, WEB | N |
| V-FUN-03 | A case MUST have 2–10 entries; Settle It MUST have exactly 2. Each entry and rubric MUST be 1–280 / 1–200 code points after sanitising. | Boundary tests at 1, 2, 10, 11 entries; 280/281 and 200/201 code points; Settle It with 3 entries → 400. | CON, REL | P (2-entry rule for `settle` missing) |
| V-FUN-04 | Judging MUST be text only. The contract MUST NOT fetch web content or accept non-string entries; clients MUST NOT upload images, audio or files. | No `gl.nondet.web` call in the contract (lint/grep in CI). Non-string entries → 400. No upload control in `app/`. | CON, REL, WEB | Y |
| V-FUN-05 | Tier k MUST use the first `TIER_JURORS[k]` personas of the fixed order Marlowe, Dahlia, Frank, Tiff, Theo, Augustine, Juno, Ines, Rook; `juror_names` MUST be returned with every case. | Contract tests assert names and counts per tier (5/7/9). | CON | Y |
| V-FUN-06 | Each juror output MUST be strict JSON `{winner_index, scores[], reason}`; out-of-range, non-finite or wrong-length output MUST fail that juror (`[LLM_ERROR]`), never be clamped into a verdict. Aggregation: majority vote; vote tie → highest mean; then lowest index. Means stored ×10 (0–100). Reason ≤ 120 chars. | Unit tests for each malformed case and for the tie-break order. | CON | Y |
| V-FUN-07 | A validator MUST: reject any leader error; check the leader payload's structure, that `split` equals the split of its votes and that `winner_index` follows from its votes and means; re-run the panel; accept only if every mean is within `SCORE_TOLERANCE` and (same winner, or the leader's winner within `CLOSE_CALL_MARGIN` of the validator's top). `reason` MUST NOT be compared. | Tests `test_rejects_winner_not_supported_by_votes`, `test_rejects_forged_split` and tolerance boundary tests pass. | CON | Y |
| V-FUN-08 | Each juror pass MUST rotate the order entries are shown in while keeping index labels fixed. | Prompt-builder test: juror j shows entries starting at index j mod n. | CON | Y |
| V-FUN-09 | Only a losing side of the standing verdict MAY appeal; at most 2 appeals per case; each appeal re-hears the full case at the next tier; earlier tiers MUST be kept in `history`. | Winner token → 403; third appeal → 409/429; `history` length = tier − 1. Contract `appeal` requires `from_tier` = current tier. | CON, REL | Y |
| V-FUN-10 | The appeal window MUST open only at FINALIZED_SUCCESS of the standing verdict and close at min(opened + `T_appeal`, lifetime expiry); on expiry the appeal state MUST become STALE, the case `closed`, and the relayer MUST call `finalize()`. | Clock-controlled tests for Settle It (24 h), Live Court (300 s default) and lifetime cap. | REL | P (Live Court timer exists but starts at ACCEPTED; no Settle It window; no `finalize()` call) |
| V-FUN-11 | AWAITING_OPPONENT MUST expire to STALE after `T_submit`; SUBMITTED MUST expire to STALE after `T_queue`; nothing is written on-chain in either case. | Clock tests; chain fake receives no write. | REL | N |
| V-FUN-12 | Either side MUST be able to revoke from AWAITING_OPPONENT through ACCEPTED, only while no tier has reached FINALIZED_SUCCESS (T11). After the Tier 1 verdict is FINALIZED_SUCCESS, revocation MUST be refused and MUST NOT end the case or block, cancel or refund an appeal; either side MAY request a takedown instead (V-PRIV-07). | Revoke works in each allowed state; revoke after Tier 1 FINALIZED_SUCCESS → 409 (relayer) and revert (contract, status `judged`/`appealed`/`final`); a winner's takedown during an open window leaves the loser's appeal OPEN and chargeable as normal. | REL, CON, WEB | P (contract `revoke` currently allows `judged`/`appealed`; being changed to match) |
| V-FUN-13 | Only results meeting §6.2 MAY drive a card, share, gallery entry, Twitch resolution, `case.finalized` webhook or ledger CAPTURE. Synchronous API responses before finality MUST carry `"final": false` and the product state. | Fake chain that stops at ACCEPTED: no card, no resolve, no webhook, no capture. | REL, WEB, LIVE, API | N (relayer waits for ACCEPTED only) |
| V-FUN-14 | Every case MUST be opened from a case package with a packageDigest; relayer and chain MUST agree on it at open and on every later call; consumer surfaces MUST NOT use the legacy `open_case`. | Shared fixtures (`fixtures/`) produce identical digests in Python and TypeScript; a one-byte change → `digest_mismatch`. Grep: no relayer call to `open_case` for `settle`/`live`. | CON, REL | P (contract done; relayer pending) |
| V-FUN-15 | Every entry MUST carry provenance per §7.3, and every card and record view MUST show the provenance label. | Contract rejects wrong `entrySource` for the surface and `verified_participant` outside `participant_submitted`. Card snapshot test shows the label. | CON, REL, WEB, LIVE | P |
| V-FUN-16 | A card MUST show: rubric, both takes, split, every juror's name and vote, mean scores, reason, tier name, UPHELD/OVERTURNED versus the previous tier, receipt number (short form), provenance label, and a link to the record view. | Snapshot tests for Tier 1, 2 and 3 cards. | WEB, LIVE | P |
| V-FUN-17 | Live Court in LIVE mode MUST follow §6.5: create outcomes in entry order, lock at dispatch, resolve exactly once on the closed standing verdict, cancel on FINALIZED_ERROR / STALE / REVOKED. | Fake-Twitch tests for overturn, no appeal, failure and revoke; resolve call count = 1. | LIVE, REL | P (resolves on ACCEPTED-based timer) |
| V-FUN-18 | The API MUST expose the endpoints in README §Relayer REST API plus revoke and takedown; webhooks MUST include `case.opened`, `case.accepted`, `case.finalized`, `case.appealed`, `case.revoked`, `case.stale`, `case.failed`, each signed per V-SEC-09. | Contract test of the OpenAPI listing and webhook payload schemas. | API, REL | P |
| V-FUN-19 | Writes MUST be idempotent: retries reuse the same `requestKey` and package bytes; HTTP clients MAY send `Idempotency-Key` and get the same case back. | Replay of the same package returns the same case ID; same key + different package → 409. | REL, CON | P (contract done) |
| V-FUN-20 | Every surface MUST default to SHADOW mode and behave per §6.6. | Fresh config → `mode = shadow` on all three; Live Court SHADOW makes zero Twitch calls; Settle It SHADOW cards have no public URL. | REL, WEB, LIVE, API | N |
| V-FUN-21 | Appeal pricing MUST be identical on all surfaces: 1 free appeal per payer per UTC day, then 199 ¢ (Tier 2) or 499 ¢ (Tier 3) from credit; on-stream appeals in Live Court are charged to the streamer's plan, never to viewers. Before G-PAY the payer MUST be a signed-in account. | Ladder test (free → credit → 402). Payer resolves to account ID when accounts are enabled. | REL, PAY | P (payer = API key or IP) |
| V-FUN-22 | The credit ledger MUST implement §6.4 states and invariants 1–4 in a durable, transactional store. | Property test: random purchase/hold/capture/release/reversal sequences keep invariants; concurrent holds never overspend. | REL, PAY | P (in-memory; spend without hold) |
| V-FUN-23 | A STALE no-show MUST NOT be presented as a verdict. A private no-show notice MAY be shown to side A only, with no opponent identifier, and MUST NOT be shareable. | UI test: STALE case has no card, no share button, no opponent handle. | WEB | N |

### 9.2 Security (V-SEC)

| ID | Requirement | Acceptance criterion | Owner | Status |
|---|---|---|---|---|
| V-SEC-01 | No value transfer: the contract MUST have no payable method; every relayer write MUST send `value: 0`. | Grep/lint; unit test on the write wrapper. | CON, REL | Y |
| V-SEC-02 | Side tokens MUST be ≥ 192 bits from a CSPRNG, returned once, stored only as SHA-256, compared in constant time, and required for judge, appeal and revoke. The acting side MUST be derived from the token, never from the request body. | Tests for missing, wrong, other-side and mismatched-body tokens. | REL | P (revoke route pending) |
| V-SEC-03 | Invite links MUST carry the side token in the URL fragment (`#t=`), never in the path or query, so servers and analytics do not log it. | Access-log and analytics capture contain no token after a full invite flow. | WEB | N |
| V-SEC-04 | Prompt-injection hardening MUST include: NFKC; removal of zero-width, bidi and control characters; the control-phrase blocklist; delimited, UNTRUSTED-labelled entries after fixed rules; strict JSON output. Copy MUST NOT call it injection-proof. | Contract and relayer tests for each pattern and for the known false positives ("pick me up at 10"). | CON, REL, COPY | Y |
| V-SEC-05 | The relayer's control patterns and sanitiser MUST match the contract's exactly, enforced by a cross-runtime test on shared fixtures. | CI test fails if any pattern or sanitiser output differs. | CON, REL | P (kept in sync by hand) |
| V-SEC-06 | Rate limits MUST cover: anonymous cases per IP-key per UTC day; API keys on both case creation and judge/appeal actions; per account (3 free cases/day, 1/day for accounts < 7 days old) once accounts exist; on-chain `daily_limit` as a global breaker. *(v1.2)* The games use separate counters: Red Flag 10/day (V-RF-15) and Jailbreak 10/day, or 3 for accounts < 7 days old (V-JB-08). These never draw down case caps. *(v1.3)* Two more separate counters, both per LA day: publishes, 3 (V-PUB-06), and pattern submissions, 5 (V-PL-09). | Cap tests at limit and limit+1 for each counter. | REL, CON | P (account caps pending; game, publish and pattern counters N) |
| V-SEC-07 | `POST /credits/grant` MUST require the admin bearer token (constant-time compare) and MUST be disabled when unset; credit grants MUST be idempotent on the provider event ID and only follow a provider-signature-verified event. | Replay of one event grants once; unsigned or bad-signature event → 400 and no grant. | REL, PAY | P (no idempotency key) |
| V-SEC-08 | Webhooks MUST: be https only; refuse private, loopback, link-local, unspecified and IPv4-mapped addresses; resolve DNS and re-check the resolved address at send time; not follow redirects; sign `hex(HMAC_SHA256(secret, "${ts}.${rawBody}"))`. Receivers MUST reject timestamps older than 300 s. | SSRF test table incl. DNS rebinding fake; signature test vector. | REL, API | P (no DNS re-check) |
| V-SEC-09 | Secrets (relayer key, owner key, admin token, webhook secret, Twitch tokens, provider keys) MUST live in a secret manager, never in the repo, logs, analytics or error bodies. | Secret scan in CI; log redaction test. | OPS, REL | P |
| V-SEC-10 | API keys SHOULD be stored hashed and individually revocable. | Key table holds hashes only; revoked key → 401 within 60 s. | REL | N |
| V-SEC-11 | The contract owner key SHOULD be separate from the relayer hot wallet and kept offline. Owner powers MUST be limited to `set_paused`, `set_daily_limit`, `transfer_ownership`, plus creator-equivalent actions on cases; this MUST be disclosed in the README. | Deploy script takes a distinct owner address; README states owner powers. | CON, OPS | N (deploy uses relayer wallet) |
| V-SEC-12 | The relayer MUST be the creator of every consumer case and MUST be the only party that turns a side token into an on-chain action. | Contract refuses appeal/revoke/finalize from non-creator, non-owner (`[EXPECTED] only case creator`). | CON, REL | Y |
| V-SEC-13 | After every write the relayer MUST re-read the case and check `package_digest`, tier, status and contract address; any mismatch → FINALIZED_ERROR and an operator page. | Fake chain returning a wrong digest triggers T8 and the alert. | REL | N |
| V-SEC-14 | Before any LIVE-mode side effect (Twitch resolve, public card) the relayer SHOULD confirm the finalized result from two independent RPC endpoints. | Fake RPC disagreement blocks the side effect and alerts. | REL | N |
| V-SEC-15 | Twitch tokens MUST be per broadcaster, scope `channel:manage:predictions` only, encrypted at rest, refreshed before expiry, and revocable by the streamer. | Token store test; scope check on connect. | LIVE, REL | P (one env token) |
| V-SEC-16 | Cards and record views MUST be rendered only from inbox receipt records (chain data), never from client-supplied verdict data. | Render endpoint ignores any verdict fields in the request. | WEB, REL | N (prototype simulates) |
| V-SEC-17 | A public record view `/r/<packageDigest>` SHOULD show the on-chain record and an explorer link so anyone can check a card. | Page renders from chain for a known digest; unknown digest → 404. | WEB | N |
| V-SEC-18 | The web client SHOULD compute the packageDigest itself from the takes it displayed and warn if the chain's digest differs. | Browser test with a tampered relayer response shows the warning. | WEB | N |
| V-SEC-19 | Request bodies MUST be JSON and ≤ 16 kB; the canonical package ≤ 8,192 characters. | 16,385-byte body → 413; 8,193-char package → contract revert. | REL, CON | Y |

### 9.3 Privacy (V-PRIV)

| ID | Requirement | Acceptance criterion | Owner | Status |
|---|---|---|---|---|
| V-PRIV-01 | Only data classified PUBLIC-ON-CHAIN in `docs/DATA_CLASSIFICATION.md` MAY be written on-chain. The closed package schema is the allowlist. | Schema has `additionalProperties: false` everywhere; contract `_exact_keys` rejects extras; a test package with an extra field reverts. | CON, REL | Y (contract) / P (relayer) |
| V-PRIV-02 | Each side MUST give explicit consent to the §11 notice, as an unticked checkbox it ticks itself, before its take leaves the browser. The relayer MUST store per side: account or side ID, notice version, timestamp, surface. | No submit without the tick; consent row exists for every side of every PENDING case. | WEB, REL | N |
| V-PRIV-03 | The relayer MUST NOT set `disclosure.consent = true` or `adultConfirmed = true` unless every side's consent record exists (Settle It) or the host's or API client's attestation exists (Live Court, API). | Package builder test: a missing consent row blocks T3/T3a. | REL | N |
| V-PRIV-04 | A PII screen (email, phone, government ID, card number, street address) MUST run before any on-chain write; a moderation provider MUST be added and fail closed before G-LIVE. *(v1.2)* For Red Flag Court only, PII is redacted rather than rejected (V-RF-05, V-RF-06). Every other surface keeps reject-on-PII. | Pattern tests; provider-outage test blocks submission. | REL | P (local screen only; provider stub fails open) |
| V-PRIV-05 | Cards MUST show only the handle each side chose (1–24 characters, screened); handles MUST NOT go on-chain; full real names of anyone MUST NOT be shown. | Handle never appears in package fixtures; screen rejects "First Last"-shaped full names best-effort. | WEB, REL | P |
| V-PRIV-06 | Off-chain takes of cases that end STALE or REVOKED before PENDING MUST be deleted within 24 h. | Retention job test. | REL | N |
| V-PRIV-07 | Takedown MUST be available to either side from PENDING on and MUST hide the card, gallery listing, record-view text and public API listings within `T_takedown`. It MUST NOT change case or appeal state. The UI MUST say that on-chain text remains. | Takedown test incl. CDN purge call; appeal still OPEN after takedown; copy check. | WEB, REL, OPS | N |
| V-PRIV-08 | The public gallery and Sunday Docket MUST require a separate opt-in from every side, revocable at any time. | Gallery query returns only cases with all opt-ins. | WEB | N |
| V-PRIV-09 | Raw IP addresses MUST NOT be stored beyond the request, except truncated (/24 IPv4, /48 IPv6) in security logs for ≤ 30 days; rate-limit counters MUST key on HMAC(IP, daily-rotated secret). | Log and counter inspection. | REL, OPS | N (raw IP keys in memory) |
| V-PRIV-10 | Analytics MUST follow `docs/ANALYTICS_EVENTS.md`: pseudonymous IDs only; no take text, handles, IPs, tokens, emails or on-chain case IDs. | Schema validator in the event pipeline drops non-conforming events. | WEB, REL | N |
| V-PRIV-11 | Users MUST be able to export and delete their off-chain data within 30 days of a request; the response MUST explain the on-chain exception. Required before G-PUBLIC. | Runbook test on a seeded account. | OPS, LEGAL | N |
| V-PRIV-12 | Webhook payloads MUST contain only case data already public on-chain plus the case ID, state and mode. | Payload schema test. | REL, API | Y |

### 9.4 Safety (V-SAFE)

| ID | Requirement | Acceptance criterion | Owner | Status |
|---|---|---|---|---|
| V-SAFE-01 | Every participant MUST confirm 18+ before submitting; Live Court hosts MUST attest that contestants are 18+ and consented; API terms MUST require the same of clients. Accounts found to be under 18 MUST be closed. | No submit without confirmation; host attestation stored per case. | WEB, LIVE, LEGAL | P (copy only) |
| V-SAFE-02 | Rubrics MUST judge takes, never people: no rubric, stamp or label that declares a person toxic, guilty or worse. Case stamps are only WINNER, UPHELD, OVERTURNED. *(v1.2, ADR-014/015)* Game stamps are only CAUGHT, OVERRULED, MISTRIAL, SEALED (Jailbreak; they mark the attempt, never the player) and SCAM, SUS, LOOKS LEGIT (Red Flag; they mark the message, never the sender). No stamp is green. | Rubric list review; grep of `app/` and `brand/` for banned terms and for any stamp outside these lists. | COPY, WEB, CON | Y (case stamps) / N (game stamps not built) |
| V-SAFE-03 | Attacks on race, religion, gender, sexuality, disability or body MUST score 0 (contract prompt rule 5) and SHOULD be blocked before submission by moderation. | Contract prompt contains rule 5; moderation test set. | CON, REL | P |
| V-SAFE-04 | Entries about self-harm, abuse or threats MUST NOT be judged; the user MUST see plain help resources (988 in the US). | Banned-phrase tests return the help copy. | REL, WEB | P |
| V-SAFE-05 | Any side MUST be able to tap "This isn't a game". Before the Tier 1 verdict is final it revokes (T11); after, it files a takedown and a moderation report. Either way it shows a gentle message. | UI test for both cases. | WEB | N |
| V-SAFE-06 | A report button and a human moderation queue MUST exist before G-PUBLIC, with first action in ≤ 24 h. | Report creates a queue item; SLA dashboard. | WEB, OPS | N |
| V-SAFE-07 | An external moderation provider MUST be wired and fail closed before G-LIVE on any surface. | Provider outage → submission rejected with a retry message. | REL | N |
| V-SAFE-08 | No dark patterns: votes are final before the reveal animation starts; no fake "typing"; any countdown shows the real deadline; no message is sent for a user without their tap; streak freezes stay free. | Review checklist per release. | WEB, COPY | — |
| V-SAFE-09 | A case MUST NOT be about a non-participant; reports of such cases MUST lead to takedown. *(v1.3, ADR-020)* A pattern record is not a case and publishes no third-party content: no message words, sender, hash or identifying data, checked deterministically and by validators. Any change that adds such a field reopens ADR-020. | Policy text + moderation runbook. | COPY, OPS | — |
| V-SAFE-10 | Live Court contestants MUST be people present on the stream who agreed to be judged; the host MUST NOT enter chat messages or third parties as entries without consent. | Streamer terms; host attestation checkbox. | LIVE, LEGAL | N |

### 9.5 Legal and claims (V-LEGAL)

| ID | Requirement | Acceptance criterion | Owner | Status |
|---|---|---|---|---|
| V-LEGAL-01 | No money, credit, refund, reward or penalty MAY depend on a verdict's outcome. | Ledger invariant 2 test; code review of every refund path. | REL, PAY | Y |
| V-LEGAL-02 | UI and marketing copy MUST NOT use "bet", "wager", "odds", "stake" or "win money", except inside prohibitions. | Copy lint over `app/`, `brand/`, `marketing/`. | COPY | Y |
| V-LEGAL-03 | Prizes MUST be fixed in advance, sponsor-funded, free to enter, under written official rules, and delivered by the sponsor; total prize value per contest MUST stay below $5,000 unless counsel clears it; VERDICT MUST NOT hold prize funds. | Contest checklist signed before each contest. | LEGAL, OPS | — |
| V-LEGAL-04 | Live Court MUST use Channel Points only. Bits, subs or any real currency MUST NOT connect to an outcome. | Twitch integration calls only Predictions endpoints. | LIVE | Y |
| V-LEGAL-05 | Credits MUST have no cash value, be non-transferable and non-redeemable; refunds only as technical refunds or where law requires. | ToS text; no transfer or cash-out endpoint exists. | LEGAL, PAY | Y (code) / N (ToS) |
| V-LEGAL-06 | Every surface MUST state that verdicts are AI opinions for entertainment, not legal, medical or financial advice, and that VERDICT is not arbitration. | Footer/legal copy present on web, overlay and API docs. | COPY, LEGAL | P |
| V-LEGAL-07 | API terms MUST forbid consequential decisions (employment, credit, housing, legal) without human review, and require the client to attest consent and 18+ for entries it submits. | API terms published before keys are issued to third parties. | LEGAL, API | N |
| V-LEGAL-08 | ToS and privacy policy MUST be reviewed by counsel before G-PAY. | Signed-off version on file. | LEGAL | N |
| V-LEGAL-09 | Claims discipline: copy MUST NOT say "five different AI models vote", "nobody can rig it", "injection-proof", "no other app can", "the first", or name model vendors; claims MUST stay within §8. *(v1.2)* Also banned: "can't be rigged", "unhackable", "5 different AIs"; and in consumer copy, "shadow mode". Network, receipt and finality claims MUST NOT appear on Quick Verdict or practice-court results (V-QV-02). *(v1.3)* "Checked by GenLayer · Finalized" only on published FINALIZED_SUCCESS Settle It cards (V-PUB-10). "Recorded on GenLayer" only on the digest and Proof tab (V-PL-11). Banned: any claim of affiliation with or endorsement by GenLayer; "arbitration" outside the V-LEGAL-06 disclaimer; and, for the ledger, "known safe", "harmless", "not on our list" or any wording that a missing or known pattern means safe. | Copy lint list; review on each launch asset. | COPY | Y (v1.1 list) / N (v1.2 and v1.3 additions not in lint yet) |
| V-LEGAL-10 | Live Court MUST comply with the Twitch Developer Agreement and run only on Affiliate or Partner channels. | Onboarding checks channel status. | LIVE, LEGAL | P |
| V-LEGAL-11 | Before any prize contest, counsel MUST confirm the skill-versus-chance treatment of an AI-judged contest in the target states. | Written opinion on file. | LEGAL | N |
| V-LEGAL-12 | The trust page MUST be titled "Try to rig it." Every property claim on it MUST map to a requirement in §9.10 whose acceptance test passes. Claims whose test does not yet pass MUST be marked "Coming soon" / "In progress" or removed, and claims with no possible test MUST be cut or reworded (ADR-017). | §9.10 map reviewed per release; page text diffed against it; no unmapped claim. | COPY, LEGAL | N |
| V-LEGAL-13 | Any bounty MUST be a fixed, sponsor-paid amount, free to enter, judged on criteria stated in official rules before entries open, and MUST NOT depend on chance (no draws, no lottery tie-breaks). There is none before a signed sponsor and V-LEGAL-03/-11 sign-off. Working bypasses MUST go to private disclosure with no cash until a counsel-reviewed bug-bounty policy ADR exists (ADR-016). | Contest checklist; grep of `app/` and `marketing/` for prize copy before sign-off. | LEGAL, COPY, OPS | — |

### 9.6 Operations (V-OPS)

| ID | Requirement | Acceptance criterion | Owner | Status |
|---|---|---|---|---|
| V-OPS-01 | Testnet first: Studionet, then Bradbury. Mainnet only after G-MAINNET. | Config refuses a mainnet network id unless the G-MAINNET flag is set. | OPS | — |
| V-OPS-02 | `gltest --fee-profile` MUST be run for Tier 1, 2 and 3 and the results written into `business/model.xlsx` (`cpc`, `m1`, `m2`) before G-MAINNET. | Profile output committed; model updated; assumption register shows a source. | OPS | N |
| V-OPS-03 | Side-token hashes, case states, consent records, ledger and timers MUST be in a durable transactional store before more than one relayer instance, before G-PAY and before G-LIVE. | Restart test: no state lost; pending timers resume. | REL | N (in-memory) |
| V-OPS-04 | A monthly gas budget MUST act as a circuit breaker; overflow MUST queue to the next UTC day (and to an off-chain "Quick Verdict", clearly labelled, only once that ships). | Budget-exhausted test queues instead of sending. | REL, OPS | N |
| V-OPS-05 | A reconciler MUST re-poll every non-final transaction until FINALIZED or `T_reconcile`, apply T9/T12, and release stuck holds. | Clock test across restart. | REL | N |
| V-OPS-06 | Monitoring MUST alert on: any digest or destination mismatch (page immediately); FINALIZED_ERROR rate > 5% per hour; STALE rate > 2% per day; validator rotation rate; gas spend > 80% of budget; moderation provider errors; webhook failure rate > 10%. | Alert rules in config; fire drill once per release. | OPS | N |
| V-OPS-07 | A pause runbook MUST exist: owner `set_paused(true)`, relayer read-only, all surfaces to SHADOW, status message. | Drill completed on testnet. | OPS | N |
| V-OPS-08 | Before each deploy, README "Verify before deploy" items 1–10 MUST be checked and the result logged. | Checklist entry per deploy. | OPS | — |
| V-OPS-09 | Contract changes MUST ship as a new deployment; old addresses stay readable so old receipts still verify; `destination.contractCodeDigest` MUST equal the pinned source hash. | Package builder reads the pinned hash; old receipt fixtures verify. | OPS, REL | P |
| V-OPS-10 | The owner SHOULD be able to prune old `daily_counts` keys (REVIEW E8). | Owner-only prune method with test. | CON | N |
| V-OPS-11 | Key compromise response: pause, rotate relayer key, `transfer_ownership` if the owner key is affected, re-point config, post-incident note. | Runbook drill. | OPS | N |

### 9.7 Quick Verdict (V-QV), ADR-013

| ID | Requirement | Acceptance criterion | Owner | Status |
|---|---|---|---|---|
| V-QV-01 | Quick Verdict MUST run off-chain: the relayer runs the panel once against the LLM processor (C9). It MUST make no chain write, RPC write or testnet call. | Chain and RPC fakes record zero calls during a Quick Verdict; the processor call carries only redacted or sanitised text. | REL | N |
| V-QV-02 | A Quick Verdict and a practice-court result MUST NOT show a receipt number, `VR-` string, record-view or explorer link, "network-checked", "checked by a network", "Finalized" or ADR-002's approved line. They MUST carry the label "Quick Verdict" (or "Practice court") and "Not network-checked" / "Not a public record". | Card and result snapshot tests; copy lint over the game and Quick Verdict templates. | WEB, COPY | N |
| V-QV-03 | The status rail MUST be Submitted → Jury scoring → Done, with no network or finality step. Votes MUST be final before the reveal starts (V-SAFE-08). | UI test: no fourth step; reveal starts only after the result is stored. | WEB | N |
| V-QV-04 | Quick Verdict MUST be the default venue for free Settle It Tier 1 cases and the only venue for Red Flag Court. Live Court, API and paid appeals MUST stay on-chain. *(v1.3)* Published cases MUST be on-chain from Tier 1 (V-PUB-05). | Config and routing test per entry point; `venue` recorded on every result. | REL | N |
| V-QV-05 | **Superseded in v1.3 by V-PUB-01 to V-PUB-14 (ADR-019). Do not build.** Original: A losing side of a Settle It Quick Verdict MAY appeal it onto the chain. The appeal MUST build a normal case package and enter §6.1 at T4. It MUST be refused unless every side's consent record is on a notice version that disclosed publication on appeal. Red Flag and Jailbreak results MUST NOT be appealable. Tier and price: ADR-013 item 8 (open). | Appeal route test: winner → 403; old-notice consent → 409; Red Flag / Jailbreak appeal route absent (404). | REL, WEB | Superseded |
| V-QV-06 | Quick Verdict MUST use the contract's sanitiser, delimiters, fixed rules and strict-JSON validation. Malformed or out-of-range juror output MUST fail that juror, never be clamped. | Shared fixtures (as V-SEC-05) produce identical sanitised text and identical rejections in the relayer and contract. | REL, CON | N |
| V-QV-07 | Withdrawal MUST follow ADR-012. Before Done, either side may withdraw and held text is deleted ≤ 24 h. After Done, revocation is refused (409), takedown is available, and takedown MUST NOT block an appeal onto the chain. *(v1.3)* Read "appeal onto the chain" as "Publish". A preview takedown MUST NOT withdraw publish consent already given. Withdrawing publish consent is a separate action (V-PUB-04). | State tests for withdraw-before-Done, revoke-after-Done (409), and takedown with the appeal still OPEN. | REL, WEB | N |
| V-QV-08 | The words "shadow mode" MUST NOT describe Quick Verdict or the practice court in product, marketing or docs copy. | Copy lint over `app/`, `brand/`, `marketing/`, `docs/` (excluding ADR-006/§6.6 and prohibitions). | COPY | — |

### 9.8 Red Flag Court (V-RF), ADR-014

| ID | Requirement | Acceptance criterion | Owner | Status |
|---|---|---|---|---|
| V-RF-01 | A ruling MUST be exactly one of SCAM, SUS, LOOKS LEGIT, with the vote line in words (e.g. "3 Scam · 2 Sus"). | Output schema test; UI snapshot for each label and a mixed split. | REL, WEB | N |
| V-RF-02 | LOOKS LEGIT MUST be returned only when no juror voted Scam; otherwise the ruling MUST be at most SUS. Enforced by a deterministic post-check after the panel. | Post-check unit tests: 4 Legit + 1 Scam → SUS; 5 Legit → LOOKS LEGIT. | REL | N |
| V-RF-03 | Any message offering or asking about money, investment or crypto MUST return SUS or SCAM (prompt rule plus post-check) and show "Money offer: we never rule these legit." | Test set of money and crypto offers, including the "Crypto DM" sample: zero LOOKS LEGIT. | REL, WEB | N |
| V-RF-04 | The LOOKS LEGIT stamp MUST be ink or neutral, never green. It MUST show the subline "No red flags spotted in this text." and the standing line "Not a safety check. If money's involved, check with them directly.", plus "What still to check" chips. | Colour-token test (no green token on any Red Flag stamp); snapshot. | WEB, COPY | N |
| V-RF-05 | The browser MUST redact before anything leaves the device. It MUST show the redacted preview, let the user hide any word, and require an unticked approval box before send. The raw paste MUST NOT be sent. | Network capture during a paste-and-send flow shows only redacted text; no send without the tick. | WEB | N |
| V-RF-06 | The relayer MUST redact again (`redact.ts`) before moderation and the LLM call: whole links → `[link hidden · not opened]`; phones, emails, handles, names, companies, numbers → tags. Card, SSN-shaped and password strings MUST be removed and the user warned. It MUST redact, not reject. | Fixture table of PII shapes in, tagged text out; browser-miss fixtures caught by the second pass. | REL | N |
| V-RF-07 | No link in a paste MAY be opened, fetched, unfurled or previewed by the browser, relayer or LLM call. | Outbound-request capture during a paste with links shows zero requests to pasted hosts; no link-preview component. | WEB, REL | N |
| V-RF-08 | Red Flag Court MUST have no appeal and no paid action on a ruling. | No appeal or checkout route exists for Red Flag results. | WEB, REL | N |
| V-RF-09 | No Red Flag text, flag set or ruling MAY be written to any chain (testnet included), and no FlagRouter contract or flag-package schema MAY ship, until a further V-SAFE-09 ADR exists and counsel has signed off. *(v1.3, ADR-020)* ADR-020 is that ADR. The only permitted write is an opt-in pattern record through C11 (V-PL-02), and only after written counsel sign-off (V-PL-13). Message text, rulings and the sender stay off every chain. | Chain fake records zero writes from Red Flag flows; review of `contracts/` and `schemas/`. | REL, CON, LEGAL | — |
| V-RF-10 | Input MUST be 1–1,000 code points after sanitising (`RF_MAX_CHARS`). Images MUST be refused with the text-only message. | Boundary test at 1,000 and 1,001; image paste shows the text-only copy. | WEB, REL | N |
| V-RF-11 | Flags MUST come only from the fixed 16-code list. Juror lines MUST be ≤ 110 characters and MUST NOT quote the message (no shared run of 5+ words). | Schema rejects unknown codes; quote-overlap test on juror lines. | REL | N |
| V-RF-12 | The share card MUST NOT show the message, sender, any redacted item or a receipt. It MUST carry the Quick Verdict footer. Only staff-written samples MAY show text. | Card snapshot with a real paste shows no message text; sample card shows text. | WEB | N |
| V-RF-13 | Message text (browser-redacted and relayer-redacted) MUST NOT be stored, logged or sent to analytics after the response. Only the ruling record and flag codes are kept (DATA_CLASSIFICATION §4.8). | Grep of DB, logs and analytics after a test run for test-paste strings returns nothing. | REL, OPS | N |
| V-RF-14 | Threats, extortion, sextortion and self-harm content MUST get no ruling and no card, only the help copy with 988 (V-SAFE-04). | Test set returns the help copy and no ruling. | REL, WEB | N |
| V-RF-15 | Checks MUST be capped at 10 per UTC day per account, or per HMAC(IP) until accounts exist (V-PRIV-09). | Cap test at 10 and 11. | REL | N |
| V-RF-16 | Copy MUST NOT say "safe", "verified", "approved", "guaranteed" or "this person is a scammer", and MUST NOT name any real person, company, coin or project. | Copy lint over Red Flag templates and samples. | COPY | — |
| V-RF-17 | Real pastes MUST NOT appear in the gallery, Sunday Docket or VERDICT's social posts. Only staff-written Daily Red Flag rounds and samples may. *(v1.3)* The weekly digest MAY show pattern records (V-PL-12), which hold no paste text. | Gallery and Docket queries have no Red Flag source; content checklist. | WEB, COPY | — |
| V-RF-18 | Special juror reactions MUST be triggered by content only, never by a random roll. | Code review: no RNG in the reaction path. | REL, WEB | — |

### 9.9 Jailbreak the Jury (V-JB), ADR-015

| ID | Requirement | Acceptance criterion | Owner | Status |
|---|---|---|---|---|
| V-JB-01 | Daily play MUST run only in the practice court (C10), on the same `contractCodeDigest` as production. Nothing from daily play MAY reach a public network. | Destination in every practice package = the localnet address; public-RPC fake records zero calls; digest equality check. | REL, OPS | N |
| V-JB-02 | A door catch MUST produce a "Stopped at the door" card with no split and no bench, and any juror line labelled as a roast ("Tiff's take on your attempt"). A bench catch MUST produce a "Caught by the bench" card showing the real recorded split and votes. | Snapshot tests for both; the bench card's split equals the stored votes; the door card renders no vote UI. | WEB, REL | N |
| V-JB-03 | Door catches MUST NOT touch any chain. The normalised text and matched pattern MUST be written to the private red-team store. | Chain fake records zero calls on a door catch; red-team row exists. | REL | N |
| V-JB-04 | Any attempt that got through or moved at least one juror MUST be SEALED. Its text MUST go to the private patch queue, MUST NOT be shown on any card or Hall, and there MUST be no near-miss content or "closest call" award. | Score-rule tests (deterministic from scores); a sealed card renders no text and no split; Hall query excludes sealed. | REL, WEB | N |
| V-JB-05 | Got-through attempts MUST be disclosed privately and sealed until patched. The "credit my handle" box MUST be off by default. PATCHED MAY show only after the fix ships. A private disclosure inbox MUST exist at `[DOMAIN]/disclosure`. | Default-state test on the box; PATCHED requires a linked fix record; inbox reachable. | WEB, OPS | N |
| V-JB-06 | A testnet re-run MUST require all of: bench catch; a practice-court replay against the testnet config with no get-through; a separate, unticked opt-in saying the text becomes public and permanent; re-moderation and the PII screen. Surface and provenance mapping: ADR-015 item 9 (open). | Pipeline test refuses each missing condition; opt-in record stored with notice version. | REL, WEB | N |
| V-JB-07 | Only re-run cards MAY say "Re-checked on GenLayer testnet" and show a `VR-` receipt, and only once the re-run is FINALIZED + SUCCESS (§6.2). Daily cards MUST say "Practice court · Not a public record." | Snapshot tests; receipt absent on all non-re-run cards. | WEB | N |
| V-JB-08 | The attempt counter MUST allow 10 per UTC day (3 for accounts < 7 days old), keyed on HMAC(IP) until accounts exist, separate from case caps. MISTRIAL MUST refund the attempt. | Cap tests; mistrial restores one attempt. | REL | N |
| V-JB-09 | Entries MUST be ≤ 280 code points (ADR-007), and the rules of play MUST be screened (hate, real people's info, malware or harmful links, sexual content or minors, real-world harm → Blocked, no score, no card). | Boundary test; blocked test set. | REL | N |
| V-JB-10 | The weekly case MUST open Monday 00:00 PT with a rubric from the reviewed config list (V-FUN-02). The relayer's house take MUST be entry 1 and the player entry 0. | Config test; package fixture shows the entry order. | REL | N |
| V-JB-11 | The Hall of Contempt MUST contain caught attempts only, each with a separate Hall opt-in (off by default), under handles, staff-picked on stated criteria. Votes MUST decide nothing. | Hall query requires `caught` + opt-in; vote has no write path into selection. | WEB, OPS | N |
| V-JB-12 | V-SEC-05 MUST be Y before Jailbreak opens to players. | Gate check. | CON, REL | — |
| V-JB-13 | The consent box MUST be unticked and read: "Your attempt is saved privately and studied to make the jury harder to fool. Nothing goes public unless you opt in. Text only, no real names." | Snapshot; no submit without the tick. | WEB, COPY | N |
| V-JB-14 | Copy MUST use "Practice court" as the only venue name, and MUST NOT say the jury "learns" or is "trained". Use "patched". | Copy lint. | COPY | — |

### 9.10 Trust page claim map (V-LEGAL-12), ADR-017

The claims are taken from `marketing/security-games-playbook.md` §7. Status is that of the requirement. **Allowed** means the claim may ship as written.

| Page claim | Requirement(s) and test | Status | Allowed? |
|---|---|---|---|
| For Settle It cases, five AI jurors vote, then the network re-runs the whole jury | V-FUN-05, V-FUN-07 | Y | Yes, scoped to on-chain Settle It |
| "VERDICT doesn't pick or run those checkers" | None possible; a GenLayer property (§8 item 8) | — | **No.** Cut, or reword as a sourced statement of how GenLayer selects validators |
| Rail Submitted → Jury scoring → Network checking → Finalized; votes reveal once the result can't change | V-FUN-13, V-SEC-16 | N | Only with "In progress" |
| Scores must land within 2 points and agree on the winner | V-FUN-07 tolerance tests | Y | Yes |
| Appeal for 7 jurors, then 9 | V-FUN-05, V-FUN-09 | Y | Yes |
| Hidden characters are cleaned out | V-SEC-04 | Y | Yes |
| Notes to the judge are refused at the door | V-SEC-04, V-SEC-05 | Y / P | Yes. The cross-runtime claim waits for V-SEC-05 |
| Takes get in only as quotes, and steering the jury is meant to cost points | V-SEC-04 (fencing). There is no test for the points penalty | Y / none | First half yes. "Costs points" needs a test or must be cut |
| A garbled AI answer is thrown out, never patched in | V-FUN-06 | Y | Yes |
| Receipt is the fingerprint of the exact takes; change one character and it changes | V-FUN-14 shared fixtures | P | After V-FUN-14 is Y |
| Proves: network accepted it and it can't change | V-FUN-13 | N | Only with "In progress" |
| Proves: appeal history; consent was recorded | V-FUN-09 / V-PRIV-02, V-PRIV-03 | Y / N | Consent half waits for V-PRIV-02/03 |
| Your take is public and permanent once both sides submit | V-PRIV-01 | Y | **Conflict:** false for free Quick Verdict cases (ADR-013). Rewrite before Quick Verdict ships. *(v1.3)* Proposed rewrite: "Your takes go public only when both of you tap Publish." |
| (v1.3) Publishing re-hears the case on GenLayer; the network's ruling is the one that counts, even when it overrules the preview | V-PUB-05, V-PUB-08, V-PUB-09 | N | After they are Y |
| (v1.3) Nobody publishes your take without your own tap | V-PUB-03 | N | After it is Y |
| (v1.3) Pattern records never hold the message, the sender or any identifying detail, and validators check each one | V-PL-02, V-PL-04, V-PL-05 | N | After they are Y and G-PL passes |
| You can cancel until the first verdict is final; after, we hide it | V-FUN-12, V-PRIV-07 | P / N | After both are Y |
| No bets, no payouts, no refunds for winning | V-LEGAL-01, V-SEC-01 | Y | Yes |
| Red Flag Court is private, off the network, no receipt | V-QV-01, V-QV-02, V-RF-09, V-RF-13 | N | After they are Y |
| Jailbreak runs in a private practice court | V-JB-01 | N | After it is Y |
| Only opted-in finalists are re-checked on testnet, and their cards say so | V-JB-06, V-JB-07 | N | After they are Y |
| We show caught attempts, never working tricks | V-JB-04, V-JB-11 | N | After they are Y |

### 9.11 Publish (V-PUB), ADR-019

| ID | Requirement | Acceptance criterion | Owner | Status |
|---|---|---|---|---|
| V-PUB-01 | A Settle It Quick Verdict MUST be a private preview: visible to its two sides only, with no public URL, no gallery or Docket entry, no receipt and no network claim. Its share control MUST read "Publish to share" and MUST NOT create a public link. | Preview card has no public route (404 when signed out); share control opens the Publish flow; snapshot shows no `VR-`. | WEB, REL | N |
| V-PUB-02 | Either side MAY tap Publish once the preview is Done. A case MUST be published at most once (except a re-request after P5). | Publish before Done → 409; second Publish on a dispatched case → 409. | WEB, REL | N |
| V-PUB-03 | Publish MUST require both sides to tick the unticked `publish-onchain-v1` box, each with its own side token or account. The relayer MUST store a consent record per side (side, notice version, timestamp). It MUST NOT dispatch on one side's consent: it waits in REQUESTED. | Requester token presenting consent for the other side → 403; one consent only → no T3p, no chain write; consent rows exist for both sides of every published case. | WEB, REL | N |
| V-PUB-04 | Either side MUST be able to withdraw its own publish consent, and the requester to cancel, at any time before T4. After T4, ADR-012 applies (T11 until Tier 1 FINALIZED_SUCCESS, then takedown only). | Withdraw in REQUESTED and CONSENTED → WITHDRAWN, no chain write; withdraw after T4 → routed to revoke or takedown per V-FUN-12. | WEB, REL | N |
| V-PUB-05 | A publish MUST build a normal case package from the preview's stored takes with `noticeVersion = publish-onchain-v1`, enter §6.1 at T3p and dispatch a Tier 1 (5 jurors) through `open_case_package` and `judge`. No contract change. | Package fixture validates against `case-package.v1`; chain fake receives `open_case_package` then `judge` with tier 1; contract source digest unchanged. | REL | N |
| V-PUB-06 | Publishing MUST be free to the user and MUST NOT create a ledger entry. It MUST be capped at 3 per user per LA day, charged to the requester at T4, and restored when the Tier 1 ends FINALIZED_ERROR or STALE. Over the cap → 429 with the next reset time. | Cap test at 3 and 4 across an LA midnight; restore test on a failed Tier 1; ledger has no row for a publish. | REL | N |
| V-PUB-07 | When the V-OPS-04 gas budget is exhausted, a consented publish MUST queue. It MUST NOT fall back to the preview or show a network claim. | Budget-exhausted test: case stays SUBMITTED/queued; card unchanged. | REL | N |
| V-PUB-08 | Once the Tier 1 is FINALIZED_SUCCESS (§6.2), the published card MUST show the network's ruling, its receipt number and "Checked by GenLayer · Finalized", rendered from inbox records (V-SEC-16). From then on the preview result MUST NOT be shown as the result. Before finality the card shows "Provisional, being checked". | Fake chain stopping at ACCEPTED: no line, no receipt; at FINALIZED_SUCCESS: line and receipt; preview votes absent from every published view. | WEB, REL | N |
| V-PUB-09 | If the network's Tier 1 `winner_index` differs from the preview's, the published card MUST show "The network overruled the preview." and MUST NOT show preview votes, scores or reasons. The line MUST NOT appear on Tier 2 or 3 results. | Snapshot for agree and overrule cases; Tier 2 card shows UPHELD/OVERTURNED only. | WEB, REL | N |
| V-PUB-10 | "Checked by GenLayer · Finalized" MUST appear only on published Settle It cards whose standing verdict is FINALIZED_SUCCESS. It MUST NOT appear on previews, ACCEPTED results, Red Flag or Jailbreak daily cards, or SHADOW cards. | Copy lint over templates; snapshot matrix of card types. | COPY, WEB | N |
| V-PUB-11 | Publishing MUST NOT count as an appeal: after Publish the appeals-used count is 0. On a published case the ladder is §6.3: Tier 2 (daily free appeal or 199 ¢), then Tier 3 (499 ¢), losing side only, at most 2. | Published case → appeal 1 to Tier 2 allowed, appeal 2 to Tier 3 allowed, third → 409; winner → 403. | REL, CON | N |
| V-PUB-12 | An unpublished case MUST NOT be appealable. The appeal route MUST return 409 `publish_first`, and the preview's Appeal control MUST lead to the Publish flow. | Appeal on a preview → 409 `publish_first`; UI test. | REL, WEB | N |
| V-PUB-13 | In SHADOW (§6.6) a published card MUST stay private to the sides with the SHADOW watermark. The words "published" and "public" MUST NOT be shown to users in SHADOW. | SHADOW config: published card has no public URL; copy check. | WEB, REL | N |
| V-PUB-14 | The relayer MUST keep the preview's `winner_index` (not its votes) for the overrule check, and emit `publish_requested`, `publish_consented`, `publish_consent_withdrawn`, `publish_cap_hit`, `publish_finalized` and `preview_overruled` per `ANALYTICS_EVENTS.md` §3.11. | Event sequence test for a full publish; DB holds no preview votes after publish beyond the retention in DATA_CLASSIFICATION §4.11. | REL | N |

### 9.12 Scam Pattern Ledger (V-PL), ADR-020

| ID | Requirement | Acceptance criterion | Owner | Status |
|---|---|---|---|---|
| V-PL-01 | "Help warn others" MUST appear only after a SCAM or SUS ruling on a real paste: never for LOOKS LEGIT, samples, Daily Red Flag or the help-line path. It MUST be off by default and need an unticked `pattern-optin-v1` box. The opt-in consent record MUST be stored without any pattern id. | UI matrix test; no submit without the tick; opt-in row has no pattern id column. | WEB, REL | N |
| V-PL-02 | A pattern record MUST contain only `flag_codes` (subset of the 16, from the server-side ruling record), `category` (closed enum) and `summary` (≤ 200 code points), plus contract-made `id`, `sightings`, timestamps and history. It MUST NOT contain message text, any hash of the message, the sender, a user or account id, an IP or anything derived from them. `request_key` MUST be random per submission. | Contract rejects extra fields and unknown codes or categories; relayer test: client-supplied codes ignored; `request_key` not derivable from user or message (code review). | CON, REL | N |
| V-PL-03 | The summary MUST be written by the relayer's LLM from the relayer-redacted (second-pass) text, with instructions to remove every name, number, link, brand and amount. The browser re-sends its redacted text at opt-in. The relayer MUST NOT store, log or send that text to analytics (V-RF-13). | Grep of DB, logs and analytics after a test run finds no test-paste string; prompt fixture contains the removal instructions. | REL | N |
| V-PL-04 | A deterministic PII screen MUST run on the summary in the relayer before any chain write, and again in the contract, with identical results on `fixtures/pattern-screen.json`: no digit or numeric character, "@", currency symbol, URL or bare domain, email or phone shape, or injection phrase. Failure → no chain write, `pattern_rejected{reason = pii_screen}`. | Cross-runtime fixture test; chain fake receives zero writes for screen failures. | REL, CON | N |
| V-PL-05 | Validators MUST each judge (a) any personal or identifying data, brand, link, number or amount, and (b) a coherent scam pattern. The record is stored only if they agree on (a) = false and (b) = true; otherwise `[REJECTED]`. Equivalence MUST use `run_nondet_unsafe` with a validator that recomputes both booleans and requires an exact match. | Contract tests: leader with a flipped boolean is rejected by the validator; (a) = true → `[REJECTED]`; (b) = false → `[REJECTED]`. | CON | N |
| V-PL-06 | Dedup: the leader MUST propose "new" or "same as id N" from stored patterns in the same category; validators MUST check the proposal. "Same" MUST add 1 to `sightings` and create nothing. A stored summary MUST never be rewritten. | Contract tests for new, same, and a wrong "same" rejected; summary bytes unchanged after a sighting. | CON | N |
| V-PL-07 | The contract MUST expose `get_pattern(id)`, `list_recent(n)` and `top_patterns_since(timestamp, n)`, with `n` capped. | View tests incl. cap. | CON | N |
| V-PL-08 | Only the relayer address or the owner MAY call `submit_pattern`. | Call from another address → `[EXPECTED] only relayer or owner`. | CON | N |
| V-PL-09 | Submissions MUST be capped at 5 per user per LA day (account, or HMAC(IP) until accounts exist), separate from `RF_DAILY_CAP`. A validator-agreed `[REJECTED]` counts. A no-consensus result does not count, and is retried at most once with a fresh summary, then dropped. | Cap tests at 5 and 6; retry-once test; agreed reject never resubmitted. | REL | N |
| V-PL-10 | Ledger data MUST NOT be an input to any Red Flag ruling, juror prompt, money rule or LOOKS LEGIT check. Copy MUST NOT state or imply that a known pattern is harmless or that an unlisted message is safe (V-LEGAL-09). | Code review: Red Flag path has no C11 read; copy lint. | REL, COPY | N |
| V-PL-11 | The Red Flag card and ruling MUST stay plain (Quick Verdict footer, V-RF-12). "Recorded on GenLayer · N sightings" MAY appear only on the digest and the Proof tab, and only for a record whose transaction is FINALIZED_SUCCESS. | Snapshot: Red Flag card unchanged after opt-in; Proof tab hides records not yet final. | WEB, COPY | N |
| V-PL-12 | The weekly "Scams going around" digest MUST be built from `top_patterns_since`, show a receipt per pattern, show only codes, category, summary and sightings, and be reviewed by staff before publication. | Digest builder test from a chain fixture; review checklist entry per issue. | WEB, OPS | N |
| V-PL-13 | Before written counsel sign-off, no pattern record MAY be written to any public network, testnet included. Pre-sign-off runs use C10 only and are called a "private run". After sign-off the ledger runs in SHADOW on the target network (no public digest, no "Recorded on GenLayer" line). LIVE only after G-PL. Engineering tests MAY submit staff-written synthetic records, derived from no user paste, to Studionet or testnet. | Destination config test per stage; synthetic-record fixtures tagged and excluded from the real-paste path; public-RPC fake records zero writes before the sign-off flag is set. | REL, OPS, LEGAL | N |
| V-PL-14 | The relayer SHOULD count at most one sighting per user per pattern in `PL_SIGHTING_WINDOW`, keyed on HMAC(user, pattern id, rotating secret), deleted after the window. | Second same-pattern submission from one user in 30 days → not submitted, `pattern_rejected{reason = duplicate_user}`. | REL | N |
| V-PL-15 | Analytics and logs MUST NOT carry the summary, the pattern id, the `request_key` or the record's transaction hash. Events carry `category`, `flag_codes` and outcome only. | Analytics grep after a test run; schema validator drops events with those fields. | REL | N |
| V-PL-16 | Monitoring MUST alert on a week-over-week jump in the `pii_screen`, validator-reject or no-consensus rates, and on any single pattern gaining more than a set share of the week's sightings. | Alert rules in config; fire drill. | OPS | N |

---

## 10. Release gates

| Gate | Unlocks | Exit criteria (all) |
|---|---|---|
| **G-LIVE** (per surface) | SHADOW → LIVE on that surface | V-SAFE-07 and V-PRIV-04 provider fail-closed · V-OPS-03 durable store · V-FUN-13 finality rule in code · V-SEC-13 re-read checks · ≥ 200 SHADOW cases on the target network with FINALIZED_SUCCESS ≥ 95%, 0 digest mismatches, STALE ≤ 2% · Live Court only: ≥ 10 SHADOW streams with no Predictions calls made · V-SAFE-06 report queue live. |
| **G-PAY** | Credit purchases, paid plans | G-LIVE on the surface · V-FUN-21 signed-in payer · V-FUN-22 ledger in durable store · V-SEC-07 idempotent signed grants · V-LEGAL-08 counsel-reviewed ToS and privacy policy. |
| **G-PUBLIC** | Public launch marketing (playbook Day 1) | G-LIVE on Settle It · V-PRIV-02/03 consent flow · V-PRIV-07 takedown · V-PRIV-11 data requests · V-SAFE-01, -05, -06. |
| **G-MAINNET** | Mainnet deployment | V-OPS-02 fee profile in the model · independent contract review · V-SEC-11 separate owner key · V-OPS-06 alerts · V-OPS-07 pause drill. |
| **G-QV** | Quick Verdict as the default for free Settle It cases | V-QV-01 to -04, -06, -07 Y · *(v1.3)* G-PUB passed, or Publish hidden with the preview labelled as such (`publish-onchain-v1` replaces the "publication on appeal" notice; ADR-013 item 8 decided by ADR-019) · C9 processor under no-retention terms · trust page §6 and consent copy rewritten. |
| **G-PUB** (v1.3) | Publish on Settle It previews | G-QV engine (V-QV-01, -02, -03, -06) · V-PUB-01 to -14 Y · V-FUN-13 and V-SEC-16 Y (finality and chain-rendered cards) · V-PRIV-02/03 consent flow Y · V-OPS-04 budget breaker Y and sized for `PUBLISH_DAILY_CAP` · `publish-onchain-v1` counsel-reviewed · overrule copy and trust-page rows (§9.10) reviewed · ≥ 50 SHADOW publishes with FINALIZED_SUCCESS ≥ 95% and the overrule rate recorded. |
| **G-PL** (v1.3) | Pattern Ledger LIVE: public digest and "Recorded on GenLayer" line | G-RF · written counsel sign-off on ADR-020 (V-SAFE-09) · V-PL-01 to -13, -15, -16 Y · `pattern-optin-v1` counsel-reviewed · private run plus SHADOW: ≥ 200 records reviewed by staff with **0** containing identifying data, a brand, a link, a number or an amount · no-consensus rate ≤ 10% over the last 100 submissions · digest review runbook drilled once. |
| **G-RF** (Red Flag Court) | Red Flag Court open to the public | G-PUBLIC · Quick Verdict engine (V-QV-01, -02, -03, -06) · V-RF-01 to -15 Y · stamp tokens in the brand guide (V-SAFE-02) · moderation and help-line path (V-RF-14, V-SAFE-04) · V-SAFE-06 report queue · counsel reply on playbook §10 questions 4–6. |
| **G-JB** (Jailbreak the Jury) | Jailbreak the Jury open to the public | G-PUBLIC · practice court (V-JB-01) · V-SEC-05 Y (V-JB-12) · V-JB-02 to -05 and -08 to -13 Y · red-team store and patch queue · disclosure inbox and patch-then-credit runbook. |
| **G-JB-RERUN** | Weekly testnet re-runs of Jailbreak finalists | G-JB · V-JB-06, V-JB-07 Y · ADR-015 item 9 decided · replay pipeline drilled once. |

---

## 11. Consent notice (notice version `notice-v1`, text revised 2026-10-31 before any use)

Shown on every surface before a take leaves the browser. Two unticked boxes; both required. Plain words, no chain jargon (brand rule). Changing any word needs a new notice version.

> **Before you submit**
> Your take will be judged by VERDICT's AI jury and saved on a public network.
> - Once both sides submit, the text of both takes is **public and permanent. Nobody, including VERDICT, can erase it.**
> - Don't include real names, contact details, or anything private.
> - If you cancel before both sides submit, nothing is published. You can still cancel until the first verdict is final: we stop the verdict and the card, but the takes stay on the public network.
> - Once the first verdict is final, you can't cancel. Either side can ask us to hide the case from VERDICT's pages, but the takes stay on the public network and the other side can still appeal.
>
> ☐ I'm 18 or older.
> ☐ I understand my take will be public and permanent.

Live Court host attestation (`notice-v1-host`): "☐ Both contestants are 18 or older, are here on stream, and agreed that their takes will be public and permanent."

### 11a. Publish notice (`publish-onchain-v1`, v1.3, ADR-019; draft for counsel review)

Shown to **each** side before its publish consent. One unticked box. Required from both sides.

> **Publish this case?**
> Your takes become public and permanent.
> - We'll re-hear the case on a public network. Its ruling is the one that counts, even if it differs from the preview.
> - Both takes and the network's ruling will be saved on that network for good. Nobody, including VERDICT, can erase them.
> - Nothing happens until both of you agree. You can change your mind until it's sent.
> - Once it's sent, you can still cancel until the first network ruling is final. After that, either side can ask us to hide the case from VERDICT's pages, but the takes stay on the public network, and the other side can still appeal.
>
> ☐ I understand our takes become public and permanent.

### 11b. Pattern opt-in notice (`pattern-optin-v1`, v1.3, ADR-020; draft for counsel review)

> **Help warn others**
> We'll write a short, general description of this kind of scam, with no names, numbers, links, brands or amounts, and add it to a public list on a network nobody can edit. The message itself is never shared or saved.
>
> ☐ Add a description of this scam pattern.

---

## 12. Traceability: who depends on which requirement

| Document | Depends on |
|---|---|
| `marketing/viral-playbook.md` | V-FUN-09, -10, -16, -17, -20, -21, -23 · V-PRIV-02, -05, -08 · V-SAFE-01–10 · V-LEGAL-02, -03, -09 · gates G-LIVE, G-PUBLIC |
| `business/monetization.md` | V-FUN-21, -22 · V-LEGAL-01, -03, -05, -07, -08, -11 · V-OPS-02, -04 · G-PAY, G-MAINNET |
| `docs/ANALYTICS_EVENTS.md` | V-PRIV-10, every state transition in §6 |
| `docs/THREAT_MODEL.md` | all V-SEC, V-PRIV, V-SAFE |
| `brand/brand-guide.md` | V-LEGAL-09, V-SAFE-02, §3 glossary, §8 |
| `marketing/security-games-playbook.md` | V-QV-01–08 · V-RF-01–18 · V-JB-01–14 · V-LEGAL-09, -12, -13 · V-SAFE-02, -04 · gates G-RF, G-JB, G-JB-RERUN |
| `business/monetization.md`, `business/underwriting/underwriting-memo.md` | V-QV-04, V-QV-05 (superseded), G-QV · *(v1.3)* V-PUB-06, V-PUB-11, G-PUB |
| `docs/DESIGN-genlayer-fit.md` (v1.3) | V-PUB-01–14 · V-PL-01–16 · §2b metric · G-PUB, G-PL |
| `contracts/pattern_ledger.py` (v1.3) | V-PL-02, -04 to -08 |

## 13. Open questions (tracked, not blocking v1.0)

1. Exact terminal behaviour of UNDETERMINED, LEADER_TIMEOUT and VALIDATORS_TIMEOUT on Bradbury (README verify item 6). Owner: OPS.
2. GenLayer finality-window length on Bradbury, which sets real-world time from ACCEPTED to FINALIZED and therefore how long a Settle It user waits for a shareable card. Owner: OPS. If it is long, `T_final_max` and the "Provisional" UX need a decision log entry.
3. Account system choice (OAuth providers, phone) for V-FUN-21. Owner: REL.
*Questions 4–7 below are decided in ADR-018 and kept here for traceability.*

4. Quick Verdict appeal onto the chain: which tier it opens at and what it costs (ADR-013 item 8). Owner: Blair. Blocks V-QV-05 and G-QV.
5. Surface and provenance for Jailbreak testnet re-runs (ADR-015 item 9; proposal `api` / `api_client_submitted` / `self_asserted`). Owner: REL. Blocks V-JB-06.
6. Jailbreak's weekly case opens at Monday 00:00 PT, but daily allowances roll over at 00:00 UTC (glossary "UTC day"). Confirm that the mixed clocks are intended, or move the case open to UTC. Owner: Blair.
7. PATCHED (playbook §5, the sealed card after a fix) is not in VERIFY's stamp list or in V-SAFE-02. Decide whether it is a stamp or a label. Owner: Blair, COPY.

*Questions 8–13 are new in v1.3 (ADR-019, ADR-020).*

8. Does the daily free appeal cover a Tier 3 appeal on a published case? ADR-004 and §2 item 5 say one free appeal per day at either tier, but the design brief prices Tier 3 at $4.99 with no free option. V-PUB-11 follows §6.3 as built until this is decided. Owner: Blair.
9. Should a REQUESTED publish expire if the other side never answers, and after how long? Owner: Blair.
10. The publish cap uses the LA day, and the free appeal uses the UTC day (ADR-018 item 3). Is that mix of clocks in one flow intended? Owner: Blair.
11. Should the digest hide patterns below a minimum sightings count? A one-sighting pattern is public on-chain anyway, but it could be traced back to one person's situation. Owner: Blair, counsel.
12. The design brief §4 lists "Hall of Contempt testnet re-runs" and "self-chosen Jailbreak re-checks" as separate GenLayer decisions. These docs define only one opt-in testnet re-run (V-JB-06). Confirm whether a second, self-chosen re-check is intended. Owner: lead.
13. `RF_DAILY_CAP` and `JB_DAILY_ATTEMPTS` in §5 still say UTC day, but ADR-018 item 3 moved all game clocks to LA. Engineering to confirm which is built. Owner: REL.

## 14. Change log

| Version | Date | Change |
|---|---|---|
| v1.3 | 2026-10-31 | Publish and the Scam Pattern Ledger (ADR-019, ADR-020; source `docs/DESIGN-genlayer-fit.md`). Added §2b (on-chain decisions per week, the north-star companion metric); glossary entries Preview, Publish, Published case, Overruled preview, Pattern Ledger, Pattern record, Sighting and LA day; C11; authority rows; constants; §6.7 Publish and §6.8 Pattern submission machines and §6.1 T3p; §9.11 V-PUB-01–14 and §9.12 V-PL-01–16 (all N); gates G-PUB and G-PL; notices `publish-onchain-v1` and `pattern-optin-v1` (drafts); open questions 8–13. V-QV-05 superseded. Amended §2a, the UTC day entry, §6.6 SHADOW labels ("preview" → "test run"), V-SEC-06, V-SAFE-09, V-LEGAL-09, V-QV-04, V-QV-07, V-RF-09, V-RF-17, G-QV and the §9.10 claim map. |
| v1.2 | 2026-10-31 | Security games and Quick Verdict (ADR-013 to ADR-017). Added §2a scoping note, glossary terms, C9/C10 and TB9/TB10, game constants, §9.7 V-QV-01–08, §9.8 V-RF-01–18, §9.9 V-JB-01–14, §9.10 trust-page claim map, V-LEGAL-12 and -13, gates G-QV, G-RF, G-JB and G-JB-RERUN, and open questions 4–7. Amended V-SAFE-02 (game stamps), V-PRIV-04 (Red Flag redacts instead of rejecting), V-SEC-06 (game counters) and V-LEGAL-09 (new banned phrases). Moved Quick Verdict from out of scope to in scope. |
| v1.1 | 2026-10-31 | Revocation narrowed (ADR-012, supersedes ADR-011): only before the Tier 1 verdict reaches FINALIZED_SUCCESS; afterwards takedown only, and takedown no longer closes a case or affects appeals. Updated glossary, §6.1 T11 and takedown note, §6.3 FAILED/CLOSED/A1/A8, V-FUN-12, V-PRIV-07, V-SAFE-05, technical-refund definition and the §11 notice. |
| v1.0 | 2026-10-31 | First baseline. Consolidates README, REVIEW second pass and the canonical product rules; adds case, appeal, ledger, Prediction and mode state machines; packageDigest, provenance, revocation, expiry; "does and does not prove"; numbered requirements and gates. |
