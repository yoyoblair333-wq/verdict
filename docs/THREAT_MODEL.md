# VERDICT — Threat Model (STRIDE)

| Field | Value |
|---|---|
| Document | `docs/THREAT_MODEL.md` |
| Version | v1.2 |
| Date | 2026-10-31 |
| Owner | Specifications lead |
| Status | Approved baseline. Review at every gate in `docs/SPEC.md` §10 and after any incident. |
| Depends on | `docs/SPEC.md` v1.2 (requirement IDs), `docs/DATA_CLASSIFICATION.md` v1.1, `docs/DECISIONS.md` ADR-013 to ADR-017 |

**Method.** STRIDE per trust boundary. Likelihood (L) and Impact (I) are High / Medium / Low, judged for the testnet-to-public-launch period. Risk = the higher of the two when either is High, otherwise Medium. "Residual" is what is left after the listed mitigations are in place, not today's state; today's state is the Status column of the cited requirements. Category **H** (v1.2) marks harm, safety and legal threats that sit outside STRIDE but matter as much (misreading, gambling exposure, reputational abuse).

---

## 1. Assets

| ID | Asset | Why it matters | Class (`DATA_CLASSIFICATION.md`) |
|---|---|---|---|
| AS1 | Integrity of verdicts and the case record | The product is "a verdict you can check". A forged or altered verdict breaks it. | PUBLIC-ON-CHAIN |
| AS2 | Entry text before it goes on-chain | Hidden-take mechanic; also it may still be withdrawn. | CONFIDENTIAL |
| AS3 | Participants' privacy (handles, accounts, IPs, consent records) | Entries are permanent; linking them to people is the main harm. | CONFIDENTIAL |
| AS4 | Side tokens | They are the only authority to judge, appeal or revoke. | SECRET |
| AS5 | Relayer wallet key and contract owner key | Gas funds; owner can pause and act on any case. | SECRET |
| AS6 | Credit ledger and payment linkage | Real money in; must never depend on outcomes. | CONFIDENTIAL |
| AS7 | Twitch broadcaster tokens and Prediction state | Wrong resolution on stream is public and immediate. | SECRET / CONFIDENTIAL |
| AS8 | Gas budget and service availability | Free tier is paid for by the relayer. | — |
| AS9 | Admin token, webhook signing secret, API keys | Grant credit; forge webhooks; spend quota. | SECRET |
| AS10 | Reputation and legal standing (no-wagering, 18+, honest claims) | One "AI court shamed my kid" story ends the product. | — |
| AS11 | Red Flag pastes: messages written by a non-participant, often holding their contact details | The sender never consented; a leak or publication can't be justified. | CONFIDENTIAL, transient (`DATA_CLASSIFICATION.md` §4.8) |
| AS12 | Unpatched Jailbreak attempts (sealed attempts, red-team store, disclosure inbox) | A working trick that leaks is an exploit against real cases. | CONFIDENTIAL, restricted (§4.9) |
| AS13 | Meaning of game rulings (LOOKS LEGIT, SCAM, CAUGHT) | A ruling misread or misused in public harms users or a third party. | — |

## 2. Actors

| ID | Actor | Trust | Typical goal if hostile |
|---|---|---|---|
| AC1 | Participant (side A or B) | Untrusted | Appeal when not allowed, get free appeals, sway the jury, shame the other side. |
| AC2 | Opponent who never joins / an impersonator of B | Untrusted | Answer on B's behalf. |
| AC3 | Spectator / public / screenshot sharer | Untrusted | Fake a card, doxx a participant. |
| AC4 | Live Court host (streamer) | Semi-trusted (contracted, attested) | Submit fake or self-written entries; steer the outcome for content. |
| AC5 | Developer / API client | Semi-trusted (keyed, under API terms) | Attribute entries to real people; overuse quota; use verdicts for consequential decisions. |
| AC6 | Operator (founder) and relayer process | Trusted, but its power must be bounded and disclosed | Mistakes; key leakage; quiet censorship or prompt bias. |
| AC7 | GenLayer leader (any validator elected leader) | Untrusted individually | Bias the result within tolerance. |
| AC8 | GenLayer validators and RPC endpoints | Trusted as a quorum; single RPC untrusted | Return wrong reads; stall. |
| AC9 | Twitch (platform) | Trusted for its own state | Outages; token revocation. |
| AC10 | Payment provider | Trusted for payment state | Delayed or duplicated webhooks. |
| AC11 | External attacker | Untrusted | Steal keys, drain gas, forge webhooks, SSRF. |
| AC12 | Minor posing as an adult | Untrusted | Use the product. |
| AC13 | Scammer using Red Flag Court as an oracle | Untrusted | Tune a scam message until it comes back LOOKS LEGIT, then use the card as "proof". |
| AC14 | Rival or harasser ("ruling farmer") | Untrusted | Get a SCAM card about a competitor's or person's message and post it as a verdict on them. |
| AC15 | Jailbreak player or red-teamer | Untrusted (invited) | Find a real bypass; some will publish it for clout. |

## 3. Trust boundaries

| ID | Boundary | Crosses it | Authentication | Notes |
|---|---|---|---|---|
| TB1 | Browser ↔ Relayer | takes, handles, consents, side tokens, appeal and revoke requests | side token (header), account session, per-IP-key caps | Client is fully untrusted; nothing it says about a verdict is believed. |
| TB2 | Relayer ↔ GenLayer | package, digest, writes; reads of case state; receipts | relayer wallet signature; consensus | A single RPC node can lie on reads; consensus protects writes, not reads. |
| TB3 | Relayer ↔ Twitch Helix | create, lock, resolve, cancel | broadcaster user token + client ID | Only in LIVE mode. |
| TB4 | Payment provider → Relayer | payment-succeeded events | provider signature + admin bearer | Only path that adds credit. |
| TB5 | Relayer → developer webhook receivers | signed event payloads | HMAC with timestamp | Outbound to attacker-chosen URLs: SSRF risk. |
| TB6 | API / MCP / n8n clients → Relayer | cases, judge, appeal | API key | Third-party code. |
| TB7 | Operator → contract owner functions, relayer config | pause, limits, mode, keys | owner key, server access | Most powerful boundary. |
| TB8 | Relayer ↔ moderation provider | entry text (before chain) | provider API key | Third party sees pre-chain text. |
| TB9 | Relayer ↔ LLM processor (Quick Verdict, C9) | redacted Red Flag text, Quick Verdict takes, prompts | processor API key | Third party sees off-chain text; no-retention terms required. |
| TB10 | Relayer ↔ practice court localnet (C10) | Jailbreak attempts, house take, practice verdicts | localnet keys | Private network we run; must not be reachable from the internet. |

```
 [Browser C1] --TB1--> [Relayer C2] --TB2--> [GenLayer C3/C4]
                          |   ^   \--TB3--> [Twitch C5]
               TB8 <------+   |    \--TB5--> [Dev receivers C8]
     [Moderation C7]      |   +--TB4-- [Payment provider C6]
                          +<--TB6-- [API/MCP/n8n clients C8]
     [Operator] --TB7--> relayer config + contract owner
```

---

## 4. Threats

Format: ID · STRIDE (S spoofing, T tampering, R repudiation, I information disclosure, D denial of service, E elevation of privilege) · boundary · threat · L/I · mitigations (requirement IDs) · residual.

### 4.1 Authority over a case

| ID | S/T/R/I/D/E | TB | Threat | L | I | Mitigations | Residual |
|---|---|---|---|---|---|---|---|
| T01 | E | TB1 | Anyone judges or appeals any case by guessing sequential case IDs. | H | H | Side tokens required, side derived from token (V-SEC-02, V-SEC-12). | **Low.** IDs stay guessable, but reads are public anyway and every action needs a token. |
| T02 | E | TB1 | The winning side appeals, or a side claims another side in the body. | M | M | Side from token; winner → 403; body/token mismatch → 400 (V-SEC-02, V-FUN-09). | **Low.** |
| T03 | S | TB1 | Side token theft: invite link forwarded, logged by a server, or captured by analytics. | M | H | Token in URL fragment (V-SEC-03); never in analytics (V-PRIV-10); hash-only storage (V-SEC-02). | **Medium.** A forwarded link still works: possession is the authority. `verified_participant` means link possession only (SPEC §7.3, §8). |
| T04 | S | TB1 | Side A writes both takes (opens B's invite themselves) to manufacture a win. | M | L | Provenance records it only as link-based (V-FUN-15); SPEC §8 says sides may be the same person; account-distinct check SHOULD come with accounts (V-FUN-21). | **Medium**, accepted: entertainment, no money on outcome (V-LEGAL-01). |
| T05 | S | TB6 | Host submits fake or self-written entries in Live Court and presents them as contestants' takes. | M | M | `entrySource = host_submitted`, `assurance = self_asserted` fixed by the contract (V-FUN-15); card and overlay show "Takes relayed by the host. Not verified." (SPEC §7.3); host attestation (V-SAFE-10, SPEC §11); streamer terms. | **Medium.** VERDICT cannot know who wrote a host-relayed entry; the label makes the limit visible. |
| T06 | S | TB6 | API client submits entries attributed to real people ("my employee said …") and uses the verdict as a decision. | M | H | `api_client_submitted` + `self_asserted` (V-FUN-15); API terms ban consequential use and require consent attestation (V-LEGAL-07); PII screen (V-PRIV-04). | **Medium.** Enforced by terms and key revocation, not by code. |

### 4.2 Verdict integrity

| ID | S/T/R/I/D/E | TB | Threat | L | I | Mitigations | Residual |
|---|---|---|---|---|---|---|---|
| T07 | T | TB2 | Malicious leader publishes a winner or split its own votes don't support. | M | H | Validator checks `split` and `winner_index` against the votes, re-runs the panel, tolerance + close-call rules (V-FUN-07). | **Low.** |
| T08 | T | TB2 | Leader shifts means by up to ±2.0 to decide a vote tie via the mean tie-break. | L | M | Odd panels: no two-entry vote ties (V-FUN-05). Only 3+ entry API cases are exposed. | **Low** (API only). |
| T09 | T | TB1→TB2 | Prompt injection in an entry or custom rubric sways jurors. | M | M | V-SEC-04, V-SEC-05; custom rubrics only on `api` (V-FUN-02); validators re-run under their own models. | **Medium.** Homoglyphs and novel phrasing get through; never marketed as injection-proof (V-LEGAL-09). |
| T10 | T | TB2 | A verdict shown at ACCEPTED is later changed by a GenLayer protocol appeal; card and Twitch already acted on it. | M | H | Finality rule: only FINALIZED + SUCCESS drives effects (V-FUN-13, SPEC §6.2). | **Low.** Cost: users wait for finality. |
| T11 | T | TB1/TB2 | Relayer (bug or compromise) changes a take between consent and chain. | L | H | Per-entry SHA-256 and packageDigest; contract re-derives (V-FUN-14); client recomputes and warns (V-SEC-18); participant sees the sanitised text before consenting. | **Low** once V-SEC-18 ships; **Medium** before. |
| T12 | T/S | TB2 | A single RPC endpoint returns a forged `get_case` read, so the relayer imports a fake verdict. | L | H | Digest and destination re-check (V-SEC-13); two-endpoint confirmation before LIVE side effects (V-SEC-14). | **Low.** |
| T13 | S | — | Forged card screenshot passed around as real. | H | M | Receipt number on every card (V-FUN-16); public record view `/r/<digest>` (V-SEC-17); cards render only from chain data (V-SEC-16). | **Medium.** Screenshots can always be faked; the record view lets anyone check. |
| T14 | T | TB7 | Operator biases prompts or presets, or quietly refuses certain cases. | L | M | Prompts and presets are public in contract source; `contractCodeDigest` in each package (V-OPS-09); honest copy says the operator writes the prompts (SPEC §8 items 6–7, V-LEGAL-09). | **Medium**, disclosed. Cannot be removed while one operator runs the only relayer. |
| T15 | T | TB2 | Replay of a package against another deployment or network. | L | M | `destination.contractAddress` checked by the contract; network recorded (V-FUN-14). | **Low.** |
| T16 | T | TB1/TB2 | Double appeal race: two appeal requests for the same tier both run. | M | M | Contract `appeal` requires `from_tier`; relayer holds before dispatch (SPEC §6.3 A2–A4). | **Low.** |
| T42 | E/D | TB1 | **Winner kills the appeal by revoking.** The winning side revokes consent (or files a takedown) during the open appeal window so the losing side can't appeal. | M | M | Revocation only before the Tier 1 verdict is FINALIZED_SUCCESS; after that, revoke → 409 and contract revert (V-FUN-12, ADR-012); takedown hides the case but never changes case or appeal state (V-PRIV-07, SPEC §6.3 A8). | **Low.** The winner can hide the public card, but the appeal and its private result go ahead. |

### 4.3 Repudiation

| ID | S/T/R/I/D/E | TB | Threat | L | I | Mitigations | Residual |
|---|---|---|---|---|---|---|---|
| T17 | R | TB1 | A participant later denies having submitted or consented. | M | M | Per-side consent record with notice version and time (V-PRIV-02); package carries `noticeVersion` on-chain (V-PRIV-03); hash-chained receipt inbox (`schemas/verdict-receipt.v1.json`). | **Low.** |
| T18 | R | TB4 | Disputed purchase or chargeback claims credits were never received. | M | L | Ledger keyed by provider event ID (V-SEC-07); REVERSED state and SPEND_LOCKED (SPEC §6.4). | **Low.** |
| T19 | R | TB7 | Operator config change (mode, caps) with no trace. | L | M | Logged config changes for mode (SPEC §6.6) and gates (SPEC §10). | **Low.** |

### 4.4 Information disclosure

| ID | S/T/R/I/D/E | TB | Threat | L | I | Mitigations | Residual |
|---|---|---|---|---|---|---|---|
| T20 | I | TB1→TB2 | PII or doxxing inside a take becomes public and permanent. | M | H | PII screen (V-PRIV-04); moderation provider fail-closed before G-LIVE (V-SAFE-07); consent notice tells users not to include private details (SPEC §11). | **Medium-High.** Irreversible once on-chain; takedown only removes VERDICT's copy (V-PRIV-07). This is the largest accepted risk. |
| T21 | I | TB1 | Shaming of a named non-participant ("my sister Jane is …"). | M | H | Handles only (V-PRIV-05); rubrics judge takes (V-SAFE-02); non-participant rule and reports (V-SAFE-09, V-SAFE-06). | **Medium.** First names inside free text can't all be caught. |
| T22 | I | TB1 | Hidden take of side A leaked to side B before B submits. | L | M | A's take stays CONFIDENTIAL off-chain until T3; not in any response to B's token before B submits. | **Low.** |
| T23 | I | — | Pseudonymous analytics joined to on-chain cases re-identifies authors. | M | M | No on-chain case IDs or digests in analytics; HMAC'd case key (V-PRIV-10, `ANALYTICS_EVENTS.md` §2). | **Low.** |
| T24 | I | TB1 | IP addresses retained and linked to cases. | M | M | HMAC'd counters, truncated logs ≤ 30 d (V-PRIV-09). | **Low.** |
| T25 | I | — | Revoked or taken-down cards remain in CDN or search caches. | M | M | Purge within `T_takedown` (V-PRIV-07); SHADOW cards have no public URL (SPEC §6.6). | **Medium.** Third-party copies (reposts) are outside VERDICT's control. |
| T26 | I | TB8 | Moderation provider sees pre-chain text, including text that is later withdrawn. | H | L | Provider chosen with no-retention terms; listed as a processor in the privacy policy (V-LEGAL-08). | **Low.** |
| T27 | I | TB7 | Secrets in logs, error bodies or the repo. | M | H | V-SEC-09; error handler returns generic 500s; secret scan in CI. | **Low.** |

### 4.5 Denial of service and cost

| ID | S/T/R/I/D/E | TB | Threat | L | I | Mitigations | Residual |
|---|---|---|---|---|---|---|---|
| T28 | D | TB1/TB6 | Gas drain: anonymous or keyed spam of cases and appeals. | H | M | Pre-gas moderation; per-IP-key, per-key and per-account caps; on-chain `daily_limit`; monthly budget breaker (V-SEC-06, V-OPS-04). | **Medium.** IP rotation remains; accounts (V-FUN-21) lower it. |
| T29 | D | TB2 | Validator non-convergence or network outage leaves cases hanging; holds never resolve. | M | M | STALE after `T_final_max`, reconciler, auto-release of holds, Twitch cancel (V-OPS-05, SPEC §6.1 T9, §6.4). | **Low.** |
| T30 | D | TB3 | Relayer crash between verdict and resolve leaves a Prediction unresolved. | M | M | Durable timers (V-OPS-03); reconciler; Twitch's own 24 h refund. | **Low.** |
| T31 | D | TB5 | Slow or hostile webhook receivers tie up the relayer. | M | L | 5 s timeout, 3 tries, no redirects (V-SEC-08). | **Low.** |
| T32 | D | — | Unbounded on-chain maps (`daily_counts`, `refs`) grow forever. | L | L | Owner prune SHOULD (V-OPS-10). | **Low.** |

### 4.6 Elevation of privilege and money

| ID | S/T/R/I/D/E | TB | Threat | L | I | Mitigations | Residual |
|---|---|---|---|---|---|---|---|
| T33 | E | TB4 | Forged payment webhook grants credit. | M | H | Admin bearer + provider signature + event-ID idempotency (V-SEC-07). | **Low.** |
| T34 | E | TB1 | Credit double spend under concurrency. | M | M | Atomic hold (SPEC §6.4 invariant 4, V-FUN-22). | **Low.** |
| T35 | E | TB1 | Free-appeal farming via many IPs or accounts. | H | L | Account payer before G-PAY (V-FUN-21); new-account limits (V-SEC-06). | **Medium**, accepted: cost is gas only. |
| T36 | E | TB5 | SSRF via `callback_url`, incl. DNS rebinding to private IPs. | M | H | https only, private-range block, DNS re-check at send, no redirects (V-SEC-08). | **Low** once DNS re-check ships; **Medium** today (REVIEW E11). |
| T37 | E | TB7 | Relayer key compromise: attacker opens, appeals, revokes or finalizes any relayer case and burns gas; if the relayer key is also the owner key, can pause or transfer ownership. | L | H | Secret manager (V-SEC-09); separate offline owner key (V-SEC-11); budget breaker (V-OPS-04); compromise runbook (V-OPS-11). | **Medium** until V-SEC-11 ships, then **Low**. |
| T38 | E | TB3 | Twitch token theft or excess scope. | L | M | Per-broadcaster, single scope, encrypted, revocable (V-SEC-15). | **Low.** |
| T39 | E | — | Wagering creep: an outcome-linked refund, reward or paid currency sneaks in. | L | H | V-LEGAL-01, V-LEGAL-04; ledger invariant 2; copy lint (V-LEGAL-02). | **Low.** Users can still settle real bets off-platform; ToS bans it. |
| T40 | E | TB1 | Minor uses the product. | M | H | 18+ confirmation, host attestation, closure on discovery (V-SAFE-01); no teen-targeted marketing (playbook). | **Medium.** Self-attestation only. |
| T41 | E | TB1 | Moderation provider outage makes moderation fail open. | M | H | Fail closed (V-SAFE-07). | **Low** once wired; **High** today (stub). |

### 4.7 Quick Verdict and the security games (v1.2)

| ID | S/T/R/I/D/E/H | TB | Threat | L | I | Mitigations | Residual |
|---|---|---|---|---|---|---|---|
| T43 | I | TB1/TB9 | **A user pastes a stranger's personal details** (phone, email, name, address, account numbers) into Red Flag Court. | H | H | Browser redaction before send and an approval tick (V-RF-05); relayer second pass (V-RF-06); card, SSN and password strings removed with a warning; text never stored, logged or sent to analytics (V-RF-13); never on any chain (V-RF-09); card never shows the message (V-RF-12); LLM processor on no-retention terms (TB9). | **Medium.** Names and odd formats slip both passes; the exposure is limited to the processor and request memory. |
| T44 | H | — | **A LOOKS LEGIT ruling is read as "safe"**, and the user sends money or a code. | M | H | Unanimous no-Scam rule (V-RF-02); money, investment and crypto offers never LOOKS LEGIT (V-RF-03); never green, with the "Not a safety check" subline (V-RF-04); "What still to check" chips; "safe", "verified" and "approved" banned (V-RF-16); counsel questions 5–6. | **Medium.** Disclaimers cannot fully stop misreading; the money rule removes the worst case. |
| T45 | I | TB1/TB10 | **Exploit publication:** a working jailbreak becomes public through the chain, a card, the Hall, a stream overlay, a patch note or the player. | M | H | Practice court only (V-JB-01); SEALED and patch queue (V-JB-04); private disclosure (V-JB-05); re-runs only bench-caught and replayed (V-JB-06); no near-miss content; patch notes name categories, never payloads. | **Medium.** A player can still post their own trick; patching against it is the response. |
| T46 | H | — | **The bounty is treated as gambling** or an illegal lottery (prize + chance + consideration), or an unregistered contest. | L | H | ADR-016: fixed, sponsor-paid, free to enter, stated criteria, no chance, no paid attempts; none at launch; V-LEGAL-03, V-LEGAL-11, V-LEGAL-13; no prize copy before sign-off. | **Low.** Eligibility still depends on an AI "caught" result, so counsel question 7 stays open. |
| T47 | H/I | TB1 | **Ruling-farming:** a rival submits, or fabricates, a competitor's message to get a SCAM card and posts it as "the court says X is a scam". | M | M | Card never shows the message, sender or companies (`[company hidden]`) (V-RF-06, V-RF-12); "judges the message, not the sender" on every card; no receipt, so the card is not proof (V-QV-02); 10/day cap (V-RF-15); no gallery of real pastes (V-RF-17); report path (V-SAFE-06); counsel question 4 (defamation). | **Medium.** A card posted next to a screenshot is outside our control. |
| T48 | T | TB1/TB9 | **Scam oracle:** a scammer iterates a message, or embeds an injection, until Red Flag Court returns LOOKS LEGIT, then shows the card to victims. | M | M | Money rule (V-RF-03) covers most scams; any Scam vote blocks LOOKS LEGIT (V-RF-02); sanitiser and blocklist (V-QV-06, V-SEC-04); 10/day cap; card shows no text, so it can't be tied to a specific message. | **Medium.** Non-money pretexts can still pass. Monitor the LOOKS LEGIT rate. |
| T49 | H | — | **False network claims:** a Quick Verdict or practice-court card says "network-checked" or shows a receipt, or "shadow mode" is read as private. | M | M | V-QV-02, V-QV-08, V-JB-07; copy lint (V-LEGAL-09); trust-page claim map (V-LEGAL-12). | **Low.** |
| T50 | I | TB2 | **A testnet re-run publishes personal data** or harmful text, permanently. | L | H | Separate unticked opt-in naming public and permanent; re-moderation and the PII screen; bench-caught finalists only (V-JB-06). | **Low-Medium.** Irreversible if both passes miss. |
| T51 | T | TB10 | **Practice court drifts from production**, so a bypass found in practice doesn't reproduce, or a real bypass is missed and works on real Settle It cases. | M | M | Same `contractCodeDigest` (V-JB-01); V-SEC-05 shared-fixture sync before launch (V-JB-12); patches ship to production and the practice court together. | **Medium** until V-SEC-05 is Y. |
| T52 | D | TB1/TB9 | **Cost abuse** of free Quick Verdicts, Red Flag checks or Jailbreak attempts (LLM spend, localnet load). | H | L | Game counters (V-RF-15, V-JB-08); HMAC(IP) keys (V-PRIV-09); V-SEC-06 case caps. | **Medium**, accepted: the LLM cost per panel is small. |
| T53 | I/E | TB1→TB2 | **An appeal onto the chain publishes the other side's take** after that side wanted out, for example after a takedown. | M | M | Appeal allowed only on a consent notice that disclosed publication on appeal (V-QV-05); withdrawal before Done (V-QV-07); the ADR-012 parity is deliberate. | **Medium.** Needs counsel review of the new notice. |

---

## 5. Residual risk summary (ordered)

| Rank | Threat | Residual | Owner | Accepted because |
|---|---|---|---|---|
| 1 | T20 PII made permanent on-chain | Medium-High | REL, OPS | Core product property; mitigated by consent, screening and fail-closed moderation. Revisit if any incident occurs. |
| 2 | T41 Moderation fails open (until V-SAFE-07) | High today | REL | Blocks G-LIVE; nothing goes LIVE until fixed. |
| 3 | T05 Host-submitted fake entries | Medium | LIVE | Labelled; entertainment only. |
| 4 | T03 Forwarded invite link | Medium | WEB | Possession model is disclosed. |
| 5 | T14 Operator influence | Medium | OPS, COPY | Disclosed; prompts public. |
| 6 | T13 Fake screenshots | Medium | WEB | Record view lets anyone check. |
| 7 | T28 / T35 Cost abuse | Medium | REL | Gas only; capped. |
| 8 | T40 Minors | Medium | WEB, LEGAL | Industry-standard self-attestation; reassess with counsel. |
| 9 | T37 Key compromise before V-SEC-11 | Medium | OPS | Testnet only until G-MAINNET. |
| 10 | T43 Stranger's details pasted into Red Flag Court | Medium | REL, WEB | Two-pass redaction; transient only; never on-chain. Blocks G-RF until V-RF-05/06/13 are Y. |
| 11 | T44 LOOKS LEGIT read as safe | Medium | COPY, REL | Money rule and no-green rule; counsel review. |
| 12 | T45 Exploit publication | Medium | REL, OPS | Practice court plus sealing; self-publication by players accepted. |
| 13 | T47 / T48 Ruling-farming and scam oracle | Medium | REL, COPY | Card carries no message; caps; monitoring. |
| 14 | T51 Practice-court drift | Medium | CON, REL | Blocks G-JB until V-SEC-05 is Y. |

## 6. Review triggers

Re-run this model when: a gate in SPEC §10 is attempted (including G-QV, G-RF, G-JB, G-JB-RERUN); a new surface, game, payment method or integration is added; any bounty or contest is proposed; Red Flag text is proposed for any chain; any SEV incident; GenLayer SDK or consensus version changes; any change to the package schema.

## 7. Change log

| Version | Date | Change |
|---|---|---|
| v1.2 | 2026-10-31 | Quick Verdict and security games (ADR-013 to ADR-017). Added category H, assets AS11–AS13, actors AC13–AC15, boundaries TB9–TB10, threats T43–T53 (§4.7), residual ranks 10–14 and new review triggers. |
| v1.1 | 2026-10-31 | Added T42 (winner blocks appeal via revocation), mitigated by ADR-012. |
| v1.0 | 2026-10-31 | First baseline. Covers REVIEW findings E1–E11 and C1–C15 where they are security-relevant, plus packageDigest, provenance, revocation and finality. |
