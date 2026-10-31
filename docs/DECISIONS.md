# VERDICT — Decision Log (ADR)

| Field | Value |
|---|---|
| Document | `docs/DECISIONS.md` |
| Version | v1.4 |
| Date | 2026-10-31 |
| Owner | Specifications lead (decisions are Blair's; this log records them) |
| Status | Living log. Append new ADRs; never edit an accepted ADR's decision, supersede it. |

Each ADR: **Context** (forces), **Decision**, **Alternatives** (and why not), **Consequences**, **Requirements** (IDs in `docs/SPEC.md`). Status values: Proposed · Accepted · Superseded by ADR-n.

| ADR | Title | Status | Date |
|---|---|---|---|
| 001 | Build VERDICT (merge Settle It + VERDICT Live) over the other finalists | Accepted | 2026-10-30 |
| 002 | Honest jury: personas are prompt passes; validators are the check | Accepted | 2026-10-30 |
| 003 | Tiers of 5 / 7 / 9 juror personas, max 2 appeals, loser only | Accepted | 2026-10-30 |
| 004 | No-wagering structure | Accepted | 2026-10-30 |
| 005 | 18+ at launch on every surface | Accepted | 2026-10-30 |
| 006 | Shadow mode is the default operating mode | Accepted | 2026-10-31 |
| 007 | Text only | Accepted | 2026-10-30 |
| 008 | Testnet first | Accepted | 2026-10-30 |
| 009 | Final only at FINALIZED + SUCCESS | Accepted | 2026-10-31 |
| 010 | packageDigest as the receipt number; provenance recorded, not proven | Accepted | 2026-10-31 |
| 011 | Revocation before close, takedown after | **Superseded by ADR-012** | 2026-10-31 |
| 012 | Revocation only before the Tier 1 verdict is final; takedown after, and it never blocks an appeal | Accepted | 2026-10-31 |
| 013 | Quick Verdict: off-chain judging for free cases and the security games | Accepted (items 5 and 8 superseded by ADR-019) | 2026-10-31 |
| 014 | Red Flag Court: three rulings, two-pass redaction, never on-chain without a further ADR | Accepted (items 8 and 15 amended by ADR-020) | 2026-10-31 |
| 015 | Jailbreak the Jury: private practice court, two caught cards, opt-in testnet re-runs | Accepted (item 9 open) | 2026-10-31 |
| 016 | Bounty policy: fixed, sponsor-paid, free to enter, judged on stated criteria, never chance | Accepted | 2026-10-31 |
| 017 | Trust page is "Try to rig it."; every claim maps to a test | Accepted | 2026-10-31 |
| 018 | Lead calls on the v1.2 open questions | Accepted (item 1 superseded by ADR-019) | 2026-10-31 |
| 019 | Publish = network check | Accepted | 2026-10-31 |
| 020 | Scam Pattern Ledger | Accepted (ships in SHADOW until counsel signs off; G-PL) | 2026-10-31 |

---

## ADR-001 Build VERDICT over the alternatives

**Context.** One flagship consumer app on GenLayer, built and sold by a solo founder with an existing social audience and an enterprise-sales background. GenLayer's distinctive capability is agreement among independent AI validators on a subjective result. GenLayer projects must stay out of hiring, credentials and paid-work escrow or verification (REVIEW.md "ok" row: no escrow, paid-work, credentials or reputation features).

**Source of the scores.** Research rounds of 2026-10-30: an earlier critic round, then the **Final judge round, 10/30/2026**. The figures below are as scored there.

**Round 1: critic round (cut for low platform usage).** Each idea got a platform-usage multiplier out of 10 (how often real users would transact through it).

| Idea | Usage multiplier /10 | Result |
|---|---|---|
| NINES (outage cover) | 4 | Cut: low usage |
| DelayPay (flight-delay pool) | 3 | Cut: low usage |
| Milestone Vault (grants) | 2 | Cut: low usage |
| Escrow-style ideas | — | Cut: out of scope |

**Round 2: Final judge round, 10/30/2026.** Six finalists, 7 criteria, each scored /10, total /70.

| Finalist | Trend | Non-crypto pull | Recurring tx | Only-on-GenLayer | 2-wk solo | Legal | Founder fit | **Total /70** |
|---|---|---|---|---|---|---|---|---|
| **SETTLE IT** | 9 | 9 | 7 | 5 | 9 | 9 | 9 | **57** |
| **VERDICT Live** (stream contests) | 8 | 7 | 8 | 8 | 5 | 7 | 7 | **50** |
| OATH (stake on habits) | 6 | 5 | 9 | 6 | 5 | 4 | 5 | 40 |
| VERIFIED READ (agent fact-checks) | 2 | 1 | 4 | 9 | 7 | 9 | 3 | 35 |
| SAVINGS CIRCLES | 4 | 6 | 5 | 7 | 3 | 2 | 6 | 33 |
| PROMISE JARS | 4 | 4 | 3 | 7 | 4 | 6 | 3 | 31 |

Reading the table: Settle It wins on reach, build speed, legal safety and founder fit, but is weaker on "only on GenLayer" (5). VERDICT Live is the reverse: strong on GenLayer necessity (8) and recurring transactions (8), slower to build solo (5). The two are complementary.

**Decision.** Merge Settle It and VERDICT Live into **VERDICT**: one engine (the `JudgeRouter` contract and relayer), three surfaces: Settle It, Live Court, Developer API.

**Alternatives.** OATH and PROMISE JARS stake value on outcomes, which conflicts with the no-wagering rule (ADR-004) and scored low on Legal (4 and 6). VERIFIED READ scored 1 on non-crypto pull. SAVINGS CIRCLES pools user money and scored 2 on Legal.

**Consequences.** Consumer revenue is small; B2B (sponsors, API) carries year one (`business/monetization.md` §3). Everything personal becomes public on-chain, so consent, moderation and takedown are first-class (ADR-012).

**Requirements.** V-FUN-01, V-LEGAL-01.

---

## ADR-002 Honest jury framing

**Context.** Early copy said "five different AI models vote, one by one" and "nobody can rig the jury". The contract runs all personas as prompt passes on the current leader's single model; GenLayer validators re-run and accept or reject, they don't cast displayed votes. The operator writes prompts, owns the contract and runs the only relayer (REVIEW C1, C7).

**Decision.** A jury is N AI juror *personas*. The verdict is computed in a GenLayer Intelligent Contract and stands only if GenLayer's validators, each on its own model, agree. Approved line: "Five AI jurors. Checked by a network nobody controls. Appeal to a higher court." Banned: "five different AI models vote", "nobody can rig it", "injection-proof", "no other app can", "the first", any model vendor name.

**Alternatives.** (a) Run each persona on a different model off-chain: loses the network check and the public record. (b) Keep the old copy: false, and a consumer-protection risk.

**Consequences.** The honesty claim moves from "many models" to "independently re-checked, public record", which is stronger and true. Glossary in SPEC §3; limits in SPEC §8.

> *Note (2026-10-31, ADR-019 item 8).* ADR-019 adds a second approved card line, **"Checked by GenLayer · Finalized"**, allowed only on a published Settle It card whose standing verdict is FINALIZED_SUCCESS. The line above is unchanged and stays scoped to on-chain verdicts.

**Requirements.** V-FUN-05, V-FUN-07, V-LEGAL-09, V-SEC-04.

---

## ADR-003 Tiers 5 / 7 / 9

**Context.** The contract once ran 1 / 3 / 5 jurors; the prototype 5 / 7; monetization 5 / 7 / 11 / max with four price points (REVIEW §4). A 1-juror Tier 1 has no real mean and high cross-model variance. Even panels allow vote ties that a leader can tip within tolerance (REVIEW E5).

**Decision.** Tier 1 Verdict = 5 (Marlowe, Dahlia, Frank, Tiff, Theo). Tier 2 Appeals Court = 7 (+ Augustine, Juno). Tier 3 Supreme Court = 9 (+ Ines, Rook), final. Max 2 appeals per case, losing side of the standing verdict only, enforced by side tokens.

**Alternatives.** 3 / 5 / 7 (cheaper, but a weaker Tier 1 card: "2–1" reads as a coin flip). Pricing tiers by protocol validator count (rejected: different mechanism, ADR-002).

**Consequences.** Tier 1 gas is 5× the old Tier 1; `cpc` must be re-profiled (V-OPS-02). Odd panels remove two-entry vote ties.

**Requirements.** V-FUN-05, V-FUN-09, V-FUN-10, V-FUN-21.

---

## ADR-004 No-wagering structure

**Context.** Paid appeals, Twitch Predictions and prizes all sit near gambling law (prize + chance + consideration). A "winner refund" was once proposed (REVIEW C3).

**Decision.**
1. Users pay only for services: appeals (1 free per UTC day, then $1.99 Tier 2 / $4.99 Tier 3 from prepaid credit), subscriptions, API calls.
2. No money, credit, refund, reward or penalty ever depends on an outcome. The only refund is a technical refund (service not delivered).
3. Prizes are fixed, sponsor-funded, free to enter, under official rules, below $5,000 per contest unless counsel clears more; VERDICT never holds prize money.
4. Live Court uses Channel Points only (no cash value). Never Bits, subs or currency.
5. Credits have no cash value and cannot be transferred or cashed out.

**Alternatives.** Entry fees with prize pools (rejected: consideration + prize). Free appeals only (rejected: no consumer revenue). Outcome-based refunds (rejected: wagering-adjacent).

**Consequences.** Appeal revenue is modest; the model treats it as a minor line. Legal review is a gate (G-PAY).

**Requirements.** V-LEGAL-01 to -05, V-LEGAL-11, V-FUN-21, V-FUN-22.

---

## ADR-005 18+ at launch

**Context.** Monetization once allowed 13–17 with parental consent; the playbook said 18+ (REVIEW C5). Entries are public and permanent; minors raise COPPA and state minor-privacy duties and reputational risk.

**Decision.** 18+ for everything: cases, appeals, purchases, Live Court contestants, API-submitted entries. Self-confirmation plus host and API attestations. Reassess under-18 only with counsel.

**Consequences.** Smaller addressable audience; simpler compliance. Marketing must not target teens.

**Requirements.** V-SAFE-01, V-PRIV-03, V-LEGAL-07.

---

## ADR-006 Shadow mode by default

**Context.** The reference relayer keeps state in memory, moderation fails open, and verdicts are acted on at ACCEPTED. Acting on a wrong or provisional verdict in public (Twitch resolution, a public card) cannot be undone.

**Decision.** Every surface starts in SHADOW: the full pipeline runs, but nothing authoritative happens (no Twitch calls, cards private to the sides and watermarked, API results flagged, no paid credit). LIVE per surface only after gate G-LIVE, by logged config change. Falling back to SHADOW is always allowed.

**Alternatives.** Launch LIVE and fix forward (rejected: irreversible public effects). Staging network only (rejected: does not measure real-network finality and failure rates).

**Consequences.** Public launch (G-PUBLIC) depends on G-LIVE for Settle It. Shadow data is the evidence for the gate.

**Requirements.** V-FUN-20, SPEC §6.6, §10.

---

## ADR-007 Text only

**Context.** Images and audio raise moderation cost, PII (faces, numbers), injection surface and gas. The jury's strength is judging takes.

**Decision.** Entries and rubrics are text: ≤ 280 and ≤ 200 code points after sanitising. No uploads, no web fetches in the contract. Screenshots appear only in marketing content, blurred by the creator, never as product input.

**Consequences.** "Pettiest text" means typed text. Smaller attack surface; predictable gas.

**Requirements.** V-FUN-03, V-FUN-04.

---

## ADR-008 Testnet first

**Context.** No published GenLayer dollar fee schedule; GEN price not set; SDK v0.2 vs v0.3 drift; receipt shapes differ between Studio and Bradbury (README "Verify before deploy").

**Decision.** Studionet, then Bradbury testnet. Mainnet only after G-MAINNET (fee profile in the model, independent contract review, separate owner key, alerts, pause drill).

**Consequences.** Months 1–3 gas is $0 in the Base and Viral scenarios (`model.xlsx` Assumptions `mainnet`). Testnet resets or changes can strand old receipts; keep old addresses readable (V-OPS-09).

**Requirements.** V-OPS-01, V-OPS-02, V-OPS-08.

---

## ADR-009 Final only at FINALIZED + SUCCESS

**Context.** The relayer waited for ACCEPTED. On GenLayer an ACCEPTED result can still change through a protocol appeal during the finality window.

**Decision.** Only FINALIZED + `FINISHED_WITH_RETURN` + matching digest drives a card, share, gallery entry, Twitch resolution, `case.finalized` webhook or ledger capture. ACCEPTED is shown as "Provisional, being checked".

**Consequences.** Users wait longer for a shareable card; how long depends on Bradbury's finality window (SPEC §13 open question 2).

**Requirements.** V-FUN-13, SPEC §6.2.

---

## ADR-010 packageDigest is the receipt number

**Context.** Relayer and chain must agree on exactly which takes were judged. A card needs a short reference anyone can check.

**Decision.** Cases open only from a closed, canonical case package. Its SHA-256 is the packageDigest, stored on-chain and required on every later call and receipt record. Provenance (`entrySource`, `assurance`) rides in the package. SPEC §8 states what this does and does not prove: it proves which takes were judged, not that the verdict is right or who wrote the entries.

**Consequences.** Cross-runtime canonicalisation must match exactly (shared fixtures). Live Court cards must say takes were relayed by the host.

**Requirements.** V-FUN-14, V-FUN-15, V-SEC-13, V-SEC-17, V-SEC-18.

---

## ADR-011 Revocation and takedown

**Status: Superseded by ADR-012 (2026-10-31).** Kept for the record; do not implement.

**Context.** Explicit consent is required, and people change their minds. On-chain text cannot be erased.

**Decision.** Nothing goes on-chain until every side has consented and submitted. Either side may revoke until the case is closed (→ REVOKED: no card, no Twitch resolution, appeal holds released). After closure, only an off-chain takedown is possible. The consent notice says this in plain words before submission (SPEC §11).

**Consequences.** A winner can end a case by revoking during an open appeal window; the appellant gets a technical refund. Accepted: consent outranks the appeal.

**Requirements.** V-FUN-11, V-FUN-12, V-PRIV-02, V-PRIV-06, V-PRIV-07, V-SAFE-05.

---

## ADR-012 Revocation only before the Tier 1 verdict is final

**Supersedes** ADR-011.

**Context.** Under ADR-011 either side could revoke until the case was closed. That let a winning side kill the loser's appeal by revoking during the appeal window (THREAT_MODEL T42). The appeal right would then depend on the other side's goodwill, which breaks "only the losing side appeals" as a real guarantee.

**Decision.**
1. Revocation (case → REVOKED) is allowed only while no tier has reached FINALIZED_SUCCESS: from AWAITING_OPPONENT through Tier 1 ACCEPTED.
2. From the moment the Tier 1 verdict is FINALIZED_SUCCESS, revocation is refused (relayer 409; contract reverts). It cannot end the case or block, cancel or refund the losing side's appeal.
3. After that point either side may request an **off-chain takedown**: the case is hidden from public cards, the gallery, record-view text and public API listings. On-chain text stays. The case state and the appeal machine are unchanged, and the sides keep a private view of every result.
4. The consent notice says this in plain words before submission (SPEC §11).

**Alternatives.** Keep ADR-011 (rejected: appeal can be blocked by the winner). No revocation at all once on-chain (rejected: someone who has second thoughts while the jury is still deliberating should be able to stop the verdict and card).

**Consequences.** The contract's `revoke` must refuse `judged`, `appealed` and `final` (engineer updating). "This isn't a game" becomes a takedown plus a moderation report after Tier 1 is final. A takedown never triggers a refund, because the appeal service is still delivered.

**Requirements.** V-FUN-12, V-PRIV-07, V-SAFE-05, SPEC §6.1 T11, §6.3 A1/A8, §11.

---

## ADR-013 Quick Verdict (off-chain judging)

**Context.** The free on-chain case loses money at the assumed fee (`business/underwriting/underwriting-memo.md` R1; `ENRICHMENT-BACKLOG.md` U1), and `business/monetization.md` already plans to serve free Tier 1 off-chain as "Quick Verdict", with on-chain kept for appeals, Live Court and the Verified API. V-OPS-04 names Quick Verdict as the gas-budget overflow. The security games cannot use the public chain for daily play: a working jailbreak would be published permanently (soak VERIFY P0-1), and Red Flag Court would publish a stranger's words (P0-2). VERIFY P0-3 found "shadow mode" used to mean "private". It does not mean that: under ADR-006, SHADOW still writes to the target network. VERIFY P0-4 found game cards claiming a network check and a receipt that would not exist.

**Decision.**
1. **What it is.** A Quick Verdict is the same juror personas, sanitiser, UNTRUSTED-fenced fixed-rules prompt and strict-JSON output rules as the contract. The relayer runs the panel once against an LLM processor, off-chain. There are no validators, no consensus and no chain write.
2. **Where it is the default.**
   - Free Settle It Tier 1 cases.
   - Red Flag Court, always (ADR-014).
   - The Jailbreak practice court follows the same claim rules (items 3 and 4). It executes on a private localnet (ADR-015), not the Quick Verdict engine, and its label is "Practice court".
   - Live Court, the API and every paid appeal stay on-chain. V-OPS-04 overflow still applies.
3. **Claims.** A Quick Verdict never shows a receipt number (`VR-…`), a record-view link or an explorer link. It never says "network-checked", "checked by a network", "Finalized" or ADR-002's approved line ("Checked by a network nobody controls"). That line describes on-chain verdicts only. Quick Verdict surfaces carry the label **Quick Verdict** and the words "Not network-checked".
4. **Status rail:** **Submitted → Jury scoring → Done.** No "Network checking" or "Finalized" step. Votes reveal only after Done (V-SAFE-08).
5. ~~**Appeal onto the chain: Settle It only.**~~ **[Superseded by ADR-019, 2026-10-31.]** A Quick Verdict is no longer appealed onto the chain. Either side taps **Publish**, both sides consent, and the case is re-heard as a fresh on-chain Tier 1 case that is not an appeal. The Red Flag and Jailbreak sentences in the third bullet below still stand. Original text, kept for the record:
   - A losing side of a Settle It Quick Verdict may appeal it onto the chain. The appeal builds a normal case package and enters SPEC §6.1 at T4. From then on, every on-chain rule applies (ADR-009, ADR-010, ADR-012).
   - It is allowed only if every side's consent record is on a notice version that said, before submission, that the takes become public and permanent if anyone appeals. `notice-v1` does not say this, so a new notice version is required.
   - Red Flag Court rulings are never appealable (ADR-014). Jailbreak results are never appealable. A testnet re-run (ADR-015) is a separate opt-in, not an appeal.
6. **Withdrawal follows ADR-012.**
   - Before Done, either side may withdraw: held text is deleted within 24 h and nothing is published.
   - After Done, revocation is refused. Either side may take down the card, and a takedown never blocks the losing side's appeal onto the chain.
   - *(ADR-019 note.)* "Appeal onto the chain" now reads "Publish". A takedown of a preview does not withdraw publish consent a side has already given. A side that never gives publish consent does stop the case being published, and so stops any appeal (ADR-019 Consequences).
7. **Words.** The phrase "shadow mode" MUST NOT describe Quick Verdict or the practice court. SHADOW keeps its ADR-006 meaning: an operating mode of an on-chain surface on the target network.
8. **[Superseded by ADR-019, 2026-10-31. Decided: neither option.]** The on-chain hearing is a free Tier 1 Publish that does not count as an appeal. The normal Tier 2 / Tier 3 ladder follows. Original text, kept for the record: **Open (Blair to decide before V-QV-05 is built):** the tier and price of the on-chain hearing. There are two options:
   - (a) An on-chain Tier 1 (5 jurors, network-checked) that counts as appeal 1 of 2 and is charged on the ADR-004 ladder.
   - (b) A contract change so the case opens directly at Tier 2.

**Alternatives.**
- Everything on-chain: rejected for cost, and because strangers' text and live exploits would be published.
- A Quick Verdict with a hash "receipt": rejected, because it implies SPEC §8 properties it does not have (monetization.md §2.2).
- Calling it shadow mode: rejected (VERIFY P0-3).

**Consequences.**
- SPEC §8 proofs apply only to on-chain verdicts.
- ADR-001's consequence that "everything personal becomes public on-chain" now holds only for on-chain and appealed cases.
- The consent notice (SPEC §11) and the trust page §6 ("Once both sides submit, the text is permanent") are wrong for free Quick Verdict cases and must be rewritten before Quick Verdict ships.
- The WTV north-star metric must count Quick Verdict Tier 1 verdicts (`ANALYTICS_EVENTS.md` v1.1).
- G-LIVE's "≥ 200 SHADOW cases on the target network" must come from appeals and test traffic.
- monetization.md calls the API product "Quick judgment". That is the same engine, but it is sold separately and stays roadmap.

**Requirements.** V-QV-01 to V-QV-08, V-OPS-04, V-PRIV-02, SPEC §11.

---

## ADR-014 Red Flag Court

**Context.** Red Flag Court (S2, `marketing/security-games-playbook.md` §2): a user pastes a sketchy message, and five juror personas rule on it and list the red flags they spot. The message was written by a non-participant, the sender, who never consented (V-SAFE-09, V-PRIV-02). Scam pastes almost always contain a phone number or a link, and the relayer rejects PII today (V-PRIV-04), so S2 would bounce them as built (soak 10, flag 4). A "legit" ruling read as "safe" is the main harm (VERIFY P1-4; playbook §10 lawyer questions 5–6).

**Decision.**
1. **Venue.** Quick Verdict only (ADR-013). The rail is Submitted → Jury scoring → Done. No receipt, no network claim.
2. **Rulings.** Exactly three: **SCAM**, **SUS**, **LOOKS LEGIT**.
   - The vote line is in words, e.g. "3 Scam · 2 Sus".
   - **LOOKS LEGIT** is allowed only when no juror votes Scam. One Scam vote makes the ruling SUS at most. This is a deterministic post-check in code, not only a prompt instruction.
   - The LOOKS LEGIT stamp is ink or neutral, **never green**. Subline: "No red flags spotted in this text." Standing line: "Not a safety check. If money's involved, check with them directly." Its chips are "What still to check", never "green flags".
3. **Money rule.** Any message that offers or asks about money, investment or crypto returns **SUS** or **SCAM**, never LOOKS LEGIT. This is a prompt rule plus a post-check, and the card adds "Money offer: we never rule these legit."
4. **Flags** come only from the fixed 16-code list (playbook §2). No free-text flags. Juror lines are ≤ 110 characters and never quote the message.
5. **Two-pass redaction.**
   - The browser redacts first, before anything leaves the device. The user sees a preview, can tap any word to hide it, and ticks an unticked approval box.
   - The relayer redacts again (`redact.ts`) before moderation and before the LLM call.
   - Links are removed whole (`[link hidden · not opened]`), and companies become `[company hidden]`. Card numbers, SSN-shaped numbers and passwords are removed, and the user is warned.
   - For Red Flag Court only, this **replaces** V-PRIV-04's reject-on-PII behaviour: PII is redacted, not rejected. Every other surface keeps reject-on-PII.
6. **Links are never opened**: not by the browser (no unfurl or preview), the relayer or the LLM call.
7. **No appeals** and no paid action on a ruling.
8. **Nothing on-chain.** There is no FlagRouter contract, no flag-package schema and no on-chain or testnet posting of any Red Flag text, flags or ruling. That waits for a further ADR on V-SAFE-09 and written counsel sign-off.
   - **[Amended by ADR-020, 2026-10-31.]** ADR-020 is that further ADR. It allows exactly one thing on-chain: an opt-in *pattern record* (flag codes, category and a summary of 200 characters or fewer that VERDICT writes) in `pattern_ledger.py`. A public-network write still waits for written counsel sign-off. Message text, the ruling, the sender and any hash of the message stay off every chain. There is still no FlagRouter and no flag-package schema.
9. **Input limit.** 1,000 Unicode code points after sanitising. This amends ADR-007 **for Red Flag Court only**. Every on-chain entry stays ≤ 280.
10. **Share card.** It never shows the message, the sender, any redacted item or a receipt. Its footer reads: "Five AI juror personas · Quick Verdict · Not network-checked · We never open links." A redacted-text toggle waits for the item-8 ADR. Staff-written samples may show their text.
11. **Retention.** Message text is not kept after the response. Only the ruling record and flag codes are kept (`DATA_CLASSIFICATION.md` v1.1 §4.8).
12. **Help-line path.** Threats, extortion, sextortion and self-harm get no ruling and no card. The user sees help copy with 988 (V-SAFE-04).
13. **Rate limit.** 10 checks per UTC day per account, or per HMAC(IP) until accounts exist.
14. **Stamps.** SCAM, SUS and LOOKS LEGIT are added to V-SAFE-02's stamp list for this surface. Brand gets amber and neutral stamp tokens, never green.
15. **Real pastes** never appear in the gallery, the Sunday Docket or social posts. Only the staff-written Daily Red Flag rounds and the samples do.
    - **[Amended by ADR-020.]** The weekly "Scams going around" digest may show pattern records (codes, category, summary, sightings). A pattern record is not a paste. It holds no words from the message.

**Interpretation of V-SAFE-09.** A Red Flag ruling judges a message, not a person, and nothing is published. On that reading it is not "a case about a non-participant". Any change that publishes message text reopens the question and needs the item-8 ADR.

**Alternatives.**
- On-chain FlagRouter at launch (soak 10 §3): rejected (VERIFY P0-2).
- Keep reject-on-PII: rejected, because most real pastes would bounce.
- A green "Legit": rejected, because it reads as "go".
- Paid second opinion: rejected, because it reads as buying a safer answer.

**Consequences.** Red Flag Court cannot launch before Quick Verdict ships (V-OPS-04 / V-QV-01 status N). A redaction miss reaches only the LLM processor and memory, never the chain.

**Requirements.** V-RF-01 to V-RF-18, V-SAFE-02 (amended), V-PRIV-04 (amended), V-SEC-06 (amended), G-RF.

---

## ADR-015 Jailbreak the Jury

**Context.** Jailbreak the Jury (S1, playbook §3): players try to sneak a hidden instruction past the jury. If attempts went to a public network at submit time, any attempt that got through would be a permanent, published exploit (VERIFY P0-1). VERIFY P1-1 found cards showing a vote that never happened, because most catches are a relayer blocklist hit. VERIFY P1-2 found that near-miss content publishes nearly working recipes.

**Decision.**
1. **Venue.** All play runs in the **practice court**: a private, multi-validator localnet that VERDICT runs. It deploys the same `judge_router.py` with the same `contractCodeDigest`, so it is a destination, not a flag, and the package schema is untouched. Nothing from daily play reaches a public network.
2. **Words.**
   - Never "shadow mode": under ADR-006 that means the target network.
   - The only name for this venue is "Practice court", never "test court", "sandbox court" or "preview court".
   - Daily cards say "Practice court · Not a public record." They make no network claim and show no receipt (ADR-013 items 3–4).
3. **Two caught card types.**
   - **Stopped at the door:** a relayer blocklist hit. The jury never read it and no chain was touched. The card has no split and no bench. Any juror line is labelled as a roast ("Tiff's take on your attempt"), not a vote.
   - **Caught by the bench:** the practice-court jury scored the attempt. The card shows the real recorded split and the real juror votes.
4. **Other results:**
   - **OVERRULED:** a fair argument, and the rule held.
   - **MISTRIAL:** the practice court's checks disagreed. It refunds the attempt.
   - **SEALED:** the attempt got through, or moved even one juror.
   - **Blocked:** the attempt breaks the rules of play. No score and no card.
5. **Got-through attempts are disclosed privately and sealed until patched.**
   - They go to a private patch queue. Their text is never shown, and they are never Hall-eligible.
   - There is no near-miss content and no "closest call" award.
   - The "credit my handle" opt-in is off by default. A PATCHED state appears only after the fix ships.
   - Real holes reported outside the game go to a private disclosure inbox.
6. **Weekly testnet re-runs.** These happen only for finalists who meet all three conditions:
   - (a) The bench caught the attempt, not the door.
   - (b) It was replayed in the practice court against the testnet config with no get-through. Anything that gets through goes to the patch queue, not the chain.
   - (c) The player gave a separate, unticked opt-in that says the text becomes public and permanent.

   Only those cards may say "Re-checked on GenLayer testnet" and show a `VR-` receipt.
7. **Rhythm and caps.**
   - The case is weekly and opens Monday 00:00 PT. The Hall drops on Fridays.
   - Each player gets 10 attempts per UTC day, or 3 for accounts under 7 days old. The counter is separate from case caps and keyed on HMAC(IP) until accounts exist.
   - Entries are ≤ 280 code points (ADR-007).
   - The rubric comes from a reviewed config list (V-FUN-02). The relayer's house take is entry 1, and the player is entry 0.
8. **Stamps.** CAUGHT, OVERRULED, MISTRIAL and SEALED are added to V-SAFE-02's stamp list for this game.
9. **Open (engineering, before V-JB-06 is built):** which `surface` and provenance a re-run package uses.
   - `settle` requires exactly 2 `participant_submitted` entries, and the house take is relayer-written, so `settle` does not fit.
   - The proposal is `api` with `api_client_submitted` / `self_asserted`, and a provenance label such as "Takes relayed by VERDICT. Not verified."

**Gate.** V-SEC-05 (relayer and contract pattern sync) must be closed first, so that players find real bypasses, not sync drift.

**Alternatives.**
- Testnet at submit: rejected (P0-1).
- A single card that always shows a split: rejected (P1-1).
- Re-running door catches: rejected, because the contract's own blocklist refuses them and there is no verdict to check.

**Consequences.** We have to run a second deployment and a red-team store. A player can still post a working trick themselves; the threat model accepts that (T45).

**Requirements.** V-JB-01 to V-JB-14, V-SAFE-02 (amended), V-SEC-06 (amended), G-JB, G-JB-RERUN.

---

## ADR-016 Bounty policy

**Context.** The soak slices described four incompatible bounties: best caught attempt, reward for a working bypass, a streamer "fixed prize" promised before any sponsor existed, and a community-voted Hall (VERIFY P1-3). Prize + chance + consideration is the gambling test (ADR-004). An AI-judged contest needs counsel on skill versus chance (V-LEGAL-11).

**Decision.**
1. **One definition.** A bounty is a **fixed amount, paid by a sponsor, free to enter, judged on stated criteria**. It **never depends on chance**: no random draws, no lottery tie-breaks, no randomised eligibility. Ties are broken by the stated criteria or the prize is split equally.
2. **What it rewards.** The best **caught** attempt. Staff judge it on criteria published in the official rules before entries open (for example creativity, comedy, playing by the rules). A community or "People's Court" vote decides nothing unless the official rules say so.
3. **Within ADR-004 item 3.**
   - The sponsor delivers the prize; VERDICT never holds prize funds.
   - The prize stays below $5,000 per contest unless counsel clears more.
   - There is no entry fee, no purchase and no paid attempt.
4. **Not at launch.** A bounty needs a signed sponsor, written official rules, V-LEGAL-03 and V-LEGAL-11 sign-off, and the contest checklist. Until then, no product screen, outreach message or stream mentions a prize.
5. **Working bypasses** go to the private disclosure path (ADR-015 item 5) with no cash, until a separate, counsel-reviewed vulnerability-disclosure and bug-bounty policy is adopted by a later ADR.

**Alternatives.**
- Cash for a working bypass now: rejected, because the outcome depends on an AI result and there is no safe harbour yet.
- A community-voted prize: rejected unless it is written into the rules.

**Consequences.** There are no prize hooks at launch, and the game sells on the card and the roast.

**Requirements.** V-LEGAL-03, V-LEGAL-11, V-LEGAL-13.

---

## ADR-017 Trust page: "Try to rig it."

**Context.** Backlog row S4 names a "Can't be rigged" trust page. That wording breaks V-LEGAL-09 ("nobody can rig it") and ADR-002. Soak 10 flag 1 and VERIFY resolution 3 settle the name as **"Try to rig it."**

**Decision.**
1. The page is named **"Try to rig it."** "Can't be rigged", "unhackable", "nobody can rig it" and "injection-proof" are banned everywhere except inside prohibitions (V-LEGAL-09, amended).
2. **Every claim on the page maps to a test.** Each sentence that asserts a property cites a SPEC requirement whose acceptance test exists and passes (SPEC §9.10 claim map). A claim whose test is not passing is either marked "Coming soon" / "In progress" or removed. A claim with no possible test is cut or reworded.
3. Network, receipt and finality claims are scoped to on-chain Settle It verdicts. The page has a section saying the games are different (ADR-013 to ADR-015).
4. The claim map is re-checked at every release that touches the page and at every gate.

**Wording check (`docs/`, 2026-10-31).** No "can't be rigged" wording appears in the five docs files; the only "rig" strings are the bans in ADR-002 and V-LEGAL-09. Backlog row S4 (`ENRICHMENT-BACKLOG.md`) still says "Can't be rigged" and needs renaming outside the docs lane.

**Requirements.** V-LEGAL-09 (amended), V-LEGAL-12.

---

## ADR-018 Lead calls on the v1.2 open questions

**Context.** The docs lane left SPEC §13 open questions 4–7 and three conflicts for the lead. Blair asked the lead to run the build autonomously. Each call below can be reversed, and Blair can overturn any of them.

**Decision.**
1. ~~**Open question 4: appeal onto the chain.**~~ **[Superseded by ADR-019, 2026-10-31.]** Publish is free and is not an appeal. A published case can reach the 9-seat Supreme Court. Kept for the record, do not implement:
   - Appealing a Settle It Quick Verdict onto the chain opens a fresh on-chain **Tier 1** case with 5 jurors.
   - It counts as that side's **first appeal**. It uses the daily free appeal if one is left; otherwise it costs $1.99 (Appeals Court price).
   - The two-appeal cap counts this as appeal 1, so the losing side gets one more on-chain appeal, to Tier 2 (7 jurors, $4.99 per `business/monetization.md`).
   - A case that starts as a Quick Verdict never reaches the 9-seat Supreme Court. Reaching it would need the contract to open at Tier 2, which is a backlog item, not part of v1.
   - (Corrected 2026-10-31. An earlier wording here said "Tier 2, then Tier 3", which broke the cap.)
   - Before submit, both sides see a new consent notice that their takes become public and permanent. This applies to the side appealing and, when the other side is a participant, to them as well.
   - If the other side never consented, the appeal is refused.
2. **Open question 5: re-run surface.** Accept the proposal: `api` surface, `api_client_submitted` / `self_asserted` provenance. REL confirms it in code.
3. **Open question 6: clocks.** All game clocks use **00:00 America/Los_Angeles**: daily allowances, the daily secret rule, and the weekly case. Appeal allowances for Settle It stay on UTC as built until a later change.
4. **Open question 7: PATCHED.** PATCHED is an approved stamp, for sealed Jailbreak cards after a fix ships, and is added to the V-SAFE-02 list. It is never green.
5. **Trust page claims with no test.** Cut "VERDICT doesn't pick or run those checkers." Mark "Steering the jury is meant to cost points" as "In progress" until its test exists.
6. **Naming.** "Quick Verdict" is the free off-chain product. The paid developer product keeps its own name, "Quick judgment API," and must not be called Quick Verdict. The underwriting memo's "no appeal is possible" line is replaced by item 1.
7. **SPEC version.** v1.2 with the §2a scoping note is enough; no v2.0.

**Requirements.** V-QV-05, V-JB-06, V-SAFE-02, V-LEGAL-12.

---

## ADR-019 Publish = network check

**Supersedes** ADR-018 item 1, and ADR-013 items 5 and 8. Source: `docs/DESIGN-genlayer-fit.md` §1 (lead, 2026-10-31), which is authoritative.

**Context.** Under ADR-013 and ADR-018 a free Settle It case was judged off-chain, and the only way onto the chain was an appeal by the losing side. That appeal counted as appeal 1 of 2 and cost money, so a case that started as a Quick Verdict could never reach the Supreme Court (ADR-018 item 1). The design goal is that every verdict that circulates in public is decided on GenLayer, while free private play stays cheap and off-chain.

**Decision.**
1. **The private preview.** A Settle It case starts as a private **Quick Verdict**, the *preview* (ADR-013 items 1–4 unchanged). The preview card is visible to the two sides only. It has no public URL, it can't go in the gallery, and it never shows a receipt or a network claim. Its share button reads "Publish to share".
2. **Publish.** After the preview reaches Done, either side may tap **Publish**. The case is then re-heard on GenLayer as a fresh on-chain **Tier 1** case (5 jurors, validator agreement). It is built as a normal case package and enters SPEC §6.1 at SUBMITTED, then T4. It uses the existing `open_case_package` and `judge` path, so the contract does not change.
3. **Two-sided consent, notice `publish-onchain-v1`.**
   - **Both** sides must tick an unticked box on notice `publish-onchain-v1`, whose key line is "Your takes become public and permanent." (SPEC §11).
   - If the other side hasn't consented, Publish **waits** and does not go ahead. It never goes ahead on one side's consent.
   - A side can withdraw its own publish consent at any time before submission (T4). After T4, ADR-012 applies: revocation until the Tier 1 verdict is FINALIZED_SUCCESS, takedown only after that.
   - The package carries `noticeVersion = publish-onchain-v1`. Each consent needs that side's own side token or account (V-SEC-02). A side can never consent for the other.
4. **Free, capped.** VERDICT pays the network fee. Publishing costs the user nothing and never touches the credit ledger. Each user may publish at most **3 times per Los Angeles day** (00:00 America/Los_Angeles, ADR-018 item 3). The count is charged to the side that tapped Publish, at T4. If the Tier 1 transaction ends FINALIZED_ERROR or STALE, the count is restored (a technical refund). A case can be published once. The V-OPS-04 gas budget still applies: when it runs out, Publish queues and never falls back to the preview.
5. **Publishing is not an appeal.** After Publish, the appeals-used count is 0.
6. **The network's ruling replaces the preview.** Once the Tier 1 transaction is FINALIZED_SUCCESS (ADR-009), the published card shows the network's ruling, its receipt number (`VR-…`) and "Checked by GenLayer · Finalized". From then on the preview result is not shown as the result anywhere. Before finality the card shows "Provisional, being checked", as for any on-chain case.
7. **"The network overruled the preview."** If the network's Tier 1 `winner_index` differs from the preview's, the published card shows that line. It shows no preview votes, scores or reasons. The line is about Tier 1 only. Later tiers use UPHELD / OVERTURNED against the previous tier (V-FUN-16). We treat the mismatch as an honest and dramatic moment, not an error to hide.
8. **Approved line, scoped.** ADR-002's approved line is unchanged. This ADR adds a second approved card line, **"Checked by GenLayer · Finalized"**, allowed **only** on a published Settle It card whose standing verdict is FINALIZED_SUCCESS, including the results of its appeals. It is never allowed on a preview, an ACCEPTED result, a Red Flag or Jailbreak daily card, or a SHADOW card. It never implies affiliation with GenLayer (design brief §3).
9. **Appeals only after Publish.** The normal ladder is restored on a published case:
   - Appeal 1: Tier 2, 7 jurors. It uses the daily free appeal, or costs $1.99.
   - Appeal 2: Tier 3, the 9-seat Supreme Court. It costs $4.99.
   - Only the losing side of the standing verdict may appeal. The maximum is 2 appeals (ADR-003, ADR-004, SPEC §6.3).
10. **Unpublished cases can never be appealed.** On a preview, the "Appeal" control means "Publish first". The appeal route refuses a case that has no on-chain Tier 1 (HTTP 409, `publish_first`).
11. **Words.** "Preview" means only the private Quick Verdict of a Settle It case. The SHADOW watermark and the Live Court SHADOW overlay stop using the word "preview" (SPEC §6.6 v1.3).

**Alternatives.**
- Keep ADR-018 item 1 (appeal onto the chain as appeal 1): rejected. The publicly circulating verdict would still be the off-chain one, and the Supreme Court would be unreachable.
- Publish on one side's consent: rejected. It would publish the other side's take without their agreement (THREAT_MODEL T53, T54).
- Charge for Publish: rejected. A paid Publish reads as buying a better result, and Publish is not an appeal.
- Let the preview card circulate publicly: rejected by the design goal.

**Consequences.**
- Every public Settle It card is an on-chain verdict. K_card now depends on the publish rate (`ANALYTICS_EVENTS.md` v1.2).
- A side that never consents to Publish stops the case being published, and so stops any appeal. ADR-012's guarantee ("the winner can't block the loser's appeal") holds from Tier 1 FINALIZED_SUCCESS on, not for previews. That trade-off is deliberate: consent outranks the appeal (THREAT_MODEL T61).
- Fee exposure is bounded by 3 publishes per user per LA day plus the V-OPS-04 breaker. On testnet the fee is $0 (ADR-008).
- G-LIVE's "≥ 200 SHADOW cases on the target network" can now come from published cases.
- In SHADOW (ADR-006) a published card is still private to the sides. "Published" means on-chain, not "public URL", until G-LIVE.
- The `qv_appeal_onchain_filed` event and V-QV-05 are retired.

**Requirements.** V-PUB-01 to V-PUB-14, V-QV-05 (superseded), V-QV-07 (amended), V-LEGAL-09 (amended), V-FUN-16, G-PUB, G-QV (amended), SPEC §11 `publish-onchain-v1`.

---

## ADR-020 Scam Pattern Ledger

**Amends** ADR-014 items 8 and 15. It is the "further ADR on V-SAFE-09" that ADR-014 item 8 requires. Source: `docs/DESIGN-genlayer-fit.md` §2.

**Context.** Red Flag Court rulings are private and off-chain (ADR-014). The design brief adds an opt-in, on-chain record of scam *patterns*, so that the weekly digest is backed by GenLayer decisions and users can help warn others. Red Flag pastes are written by a non-participant who never consented (V-SAFE-09, AS11). Nothing that person wrote may be published, and anything published on-chain is permanent.

**Decision.**
1. **Opt-in only.** After a Red Flag Court **SCAM** or **SUS** ruling on a real paste, the user may tap **"Help warn others"**. The default is off. The control never appears for LOOKS LEGIT, for staff samples, for the Daily Red Flag round or on the help-line path. The opt-in is an unticked box on its own notice (`pattern-optin-v1`, SPEC §11), and its consent record is kept.
2. **The pattern record.** The relayer submits only:
   - `flag_codes`: a subset of the fixed 16-code list, taken from the server-side ruling record, never from the client;
   - `category`: one value of the fixed enum delivery, account-lock, romance, job, prize, investment, impersonation, other;
   - `summary`: 200 characters or fewer, an abstract paraphrase written by the relayer's LLM from the relayer-redacted (second-pass) text, with instructions to remove every name, number, link, brand and amount.

   It never sends message text, a hash of the message, the sender, a user id, an account id, an IP or anything derived from them. Any `request_key` is random per submission.
3. **No stored text.** V-RF-13 still holds: the message is never stored. At opt-in, the browser re-sends the redacted text it still holds. The relayer redacts it again, writes the summary within that request, and then discards the text.
4. **Deterministic PII screen first.** Before any chain write, the relayer runs a deterministic screen on the summary: no digit or numeric character, no "@", no currency symbol, no URL or bare domain, no email or phone shape, no injection phrase. The contract repeats the same screen (fixture `fixtures/pattern-screen.json` keeps the two in step). A screen failure means no chain write, and the outcome is `pattern_rejected{reason = pii_screen}`.
5. **Validator judgment: two booleans plus dedup.** Each validator independently judges (a) does the summary contain **any** personal or identifying data, brand, link, number or amount, and (b) do the summary and codes describe a coherent scam pattern. The record is stored only if validators agree on **(a) = no AND (b) = yes**. Otherwise the transaction reverts with `[REJECTED]`. Equivalence uses `run_nondet_unsafe` with a custom validator that recomputes both booleans and compares them exactly.
6. **Deduplication.** The leader proposes either "new" or "same as id N", choosing from stored patterns in the same category. Validators check that proposal. "Same" adds 1 to the existing record's `sightings` and creates nothing new. A stored summary is never rewritten.
7. **Views.** `get_pattern(id)`, `list_recent(n)` and `top_patterns_since(timestamp, n)`.
8. **Weekly digest.** "Scams going around" is built from `top_patterns_since` and gives a receipt for each pattern. Staff review each issue before it is published. The digest shows codes, category, summary and sightings, never any paste.
9. **Proof layer only.** The digest and the Proof tab may say "Recorded on GenLayer · N sightings", and only once the record's transaction is FINALIZED_SUCCESS. The Red Flag card and the ruling stay plain: a Quick Verdict, "Not network-checked" (ADR-013 item 3, ADR-014 item 10).
10. **The ledger never decides anything.** Ledger data is never an input to a Red Flag ruling, a juror prompt, the money rule or the LOOKS LEGIT check. Copy never says that a "known" pattern is harmless, or that a message missing from the ledger is safe.
11. **Rate limit.** 5 submissions per user per LA day (per account, or per HMAC(IP) until accounts exist). This counter is separate from the 10/day Red Flag cap. A validator-agreed `[REJECTED]` counts against it. A no-consensus result does not count, and it is retried at most once with a fresh summary and then dropped.
12. **Only the relayer writes.** `submit_pattern` accepts only the relayer address or the owner.
13. **Gate: SHADOW until counsel signs off** (ADR-014 stance).
    - Until written counsel sign-off, no pattern record is written to any public network, testnet included. ADR-014 item 8 and V-RF-09 still bind until then. Pre-sign-off runs use the private localnet (C10) only. We call this a "private run", never "shadow mode" (ADR-013 item 7).
    - After sign-off the ledger runs in SHADOW on the target network (ADR-006): records are written, the digest and the "Recorded on GenLayer" line are not shown publicly, and no user is told their pattern is public.
    - LIVE only after gate G-PL.

**Interpretation of V-SAFE-09.** No third-party content is published. A pattern record holds no words, names, numbers, links or brands from the message. It has no sender and no hash that could confirm a guessed message. The summary is an abstract description that VERDICT writes about a *kind* of scam, and validators check that it identifies no one before anything is stored. On that reading a pattern record is not "a case about a non-participant", and V-SAFE-09 is respected. If any field ever carries message text, a quote, a hash of the message or a sender identifier, this reasoning fails and the ADR must be reopened.

**Alternatives.**
- Store a hash of the message for dedup: rejected. A hash confirms a guessed message, so it is linkable third-party content.
- Store the redacted message: rejected. It is still the sender's words (DATA_CLASSIFICATION rule 6).
- Let the ledger feed rulings ("known scam"): rejected. It opens a poisoning path into the jury (THREAT_MODEL T58).
- Auto-submit every SCAM ruling: rejected. Opt-in only.

**Consequences.**
- Every pattern record and sighting is a GenLayer decision, and counts toward "on-chain decisions per week".
- A summary that slips past both screens and the validators is public and permanent (THREAT_MODEL T57). That is why counsel sign-off and the private-run review set come first.
- The digest becomes on-chain-backed, so its claims fall under V-LEGAL-09 and the trust-page claim map.

**Requirements.** V-PL-01 to V-PL-16, V-RF-09 (amended), V-RF-17 (amended), V-SAFE-09 (note), V-LEGAL-09 (amended), G-PL.

---

## Change log

| Version | Date | Change |
|---|---|---|
| v1.4 | 2026-10-31 | Added ADR-019 (Publish = network check; supersedes ADR-018 item 1 and ADR-013 items 5 and 8) and ADR-020 (Scam Pattern Ledger; amends ADR-014 items 8 and 15). Marked the superseded text inline, added a note to ADR-002 on the new approved line, added ADR-018 to the index, and fixed the header version (it said v1.2 after v1.3 was logged). |
| v1.3 | 2026-10-31 | Added ADR-018 (lead calls on open questions 4–7, the untested trust-page claims, and the naming conflict). |
| v1.2 | 2026-10-31 | Added ADR-013 (Quick Verdict), ADR-014 (Red Flag Court), ADR-015 (Jailbreak the Jury), ADR-016 (bounty policy) and ADR-017 (trust page "Try to rig it."). ADR-014 amends ADR-007 for Red Flag Court only (1,000 code points). ADR-014 and ADR-015 amend V-SAFE-02's stamp list. |
| v1.1 and earlier | 2026-10-30 to 2026-10-31 | Not logged here; this change log starts at v1.2. ADR-001 to ADR-012 carry their own dates in the index above. |
