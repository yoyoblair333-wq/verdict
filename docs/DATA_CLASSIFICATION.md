# VERDICT — Data Classification and Handling

| Field | Value |
|---|---|
| Document | `docs/DATA_CLASSIFICATION.md` |
| Version | v1.1 |
| Date | 2026-10-31 |
| Owner | Specifications lead |
| Status | Approved baseline |
| Implements | `docs/SPEC.md` V-PRIV-01 to V-PRIV-12, V-SEC-02, -03, -07, -09, -10, -15; v1.1: V-QV-01, -05, -07, V-RF-05, -06, -09, -13, V-JB-01, -03 to -06, -11 (ADR-013 to ADR-015) |

---

## 1. The three classes

| Class | Definition | Handling rule |
|---|---|---|
| **PUBLIC-ON-CHAIN** | Written to GenLayer (contract state or transaction calldata). World-readable and **permanent**: it cannot be edited or deleted by anyone, including VERDICT. | Only after every side's consent (V-PRIV-02/03). Only fields named in this document, and only through the closed package schema or the contract's own outputs. |
| **CONFIDENTIAL** | Stored off-chain by VERDICT or a processor. Need-to-know access. May be **shown** publicly only through a consented, revocable surface (a card, the gallery), and must be removable from VERDICT's pages on takedown. | Encrypted at rest and in transit. Role-based access. Fixed retention. Never on-chain. |
| **SECRET** | A credential. Possession grants authority. | Secret manager or hash-only storage. Never logged, never in analytics, never in error bodies, never on-chain, never shown after first issue. |

## 2. The on-chain rule

**Nothing but PUBLIC-ON-CHAIN data may be written on-chain.** Enforcement:
1. The case package schema (`schemas/case-package.v1.json`) is closed at every level (`additionalProperties: false`). It is the allowlist.
2. The contract re-checks exact key sets (`_exact_keys`) and reverts on any extra field.
3. The relayer builds packages only from the fields marked PUBLIC-ON-CHAIN below and runs the PII screen first (V-PRIV-04).
4. Contract outputs (verdicts, votes, scores, reasons) are produced on-chain and are public by construction. The juror `reason` is limited to 120 characters and the prompt forbids quoting entries verbatim.

Anything an entry's author types into an entry is public once the case reaches PENDING. That is why the consent notice (SPEC §11) tells users not to include private details.

## 3. Roles used in "who can read"

| Role | Who |
|---|---|
| Public | Anyone, including chain explorers. |
| Side | The holder of that side's token or that side's signed-in account. |
| Sides | Every side of the case. |
| Relayer | The relayer service process (automated). |
| Operator | The founder or named on-call admin, with an access log. |
| Moderator | Operator or contracted moderator, for reported or flagged items only. |
| Processor | A named third party under contract (payment provider, moderation provider, host, analytics store). |
| Developer | The API key owner, for its own cases only. |
| Security reviewer | Operator or a named red-teamer under NDA, with an access log; for the red-team store, patch queue and disclosure inbox only (v1.1). |

## 4. Data inventory

### 4.1 Case content

| Element | Class | Stored where | Retention | Who can read |
|---|---|---|---|---|
| Take text, before both sides submit (AWAITING_OPPONENT) | CONFIDENTIAL | Relayer DB | Until PENDING, or deleted ≤ 24 h after STALE/REVOKED (V-PRIV-06) | Its own side; relayer; moderation processor. **Not** the other side (hidden-take). |
| Take text, from PENDING on (sanitised) | PUBLIC-ON-CHAIN | Contract state + calldata | Permanent | Public |
| Rubric (preset key or custom API text) | PUBLIC-ON-CHAIN | Contract | Permanent | Public |
| Surface, `requestKey`/`client_ref`, `identity.attempt` | PUBLIC-ON-CHAIN | Contract / calldata | Permanent | Public |
| Per-entry SHA-256, packageDigest (receipt number) | PUBLIC-ON-CHAIN | Contract, receipts, cards | Permanent | Public |
| Provenance (`entrySource`, `assurance`) | PUBLIC-ON-CHAIN | Contract | Permanent | Public |
| `moderation.result`, `moderation.policyVersion` | PUBLIC-ON-CHAIN | Calldata | Permanent | Public |
| `disclosure.consent`, `adultConfirmed`, `noticeVersion` | PUBLIC-ON-CHAIN | Calldata | Permanent | Public |
| `destination` (network, contract address, contract code digest) | PUBLIC-ON-CHAIN | Calldata | Permanent | Public |
| `lifetime` (submission deadline, appeal-window expiry) | PUBLIC-ON-CHAIN | Contract / calldata | Permanent | Public |
| Verdict: winner, scores, juror votes, juror names, split, reason, tier, history, status, `revoked_by` | PUBLIC-ON-CHAIN | Contract | Permanent | Public |
| Case creator address (relayer wallet), tx hashes, timestamps | PUBLIC-ON-CHAIN | Chain | Permanent | Public |
| Receipt inbox records (`verdict-receipt.v1`) | CONFIDENTIAL (content mirrors public chain data) | Relayer `data/inbox.jsonl` / DB | Life of service | Relayer, operator |
| Rendered card image | CONFIDENTIAL until a side shares it; then outside VERDICT's control | Object storage + CDN | Until takedown (purge ≤ 24 h, V-PRIV-07) or 1 year unused | Sides; public only in LIVE mode and only when shared or gallery-opted-in |
| Gallery and Docket opt-ins | CONFIDENTIAL | Relayer DB | Until withdrawn | Sides, relayer, operator |
| Moderation rejects (text that failed the pre-check) | CONFIDENTIAL | Relayer DB | 30 days, then delete | Moderator |
| User reports | CONFIDENTIAL | Relayer DB | 1 year after resolution | Moderator, operator |

### 4.2 Identity and consent

| Element | Class | Stored where | Retention | Who can read |
|---|---|---|---|---|
| Handle (chosen display name) | CONFIDENTIAL; shown on consented cards | Relayer DB | Life of account; removed from cards on takedown | Sides, relayer, public via cards only |
| Account ID (internal, random) | CONFIDENTIAL | Relayer DB | Life of account + 30 days | Relayer, operator |
| Sign-in identifiers (email, phone, OAuth subject) | CONFIDENTIAL | Relayer DB / auth provider | Life of account + 30 days | Relayer, operator, auth processor |
| 18+ confirmation (yes, timestamp, notice version) | CONFIDENTIAL | Relayer DB | Life of account + 3 years (evidence) | Relayer, operator |
| Consent record per side (case, side, notice version, timestamp, surface) | CONFIDENTIAL | Relayer DB | Life of case record + 3 years (evidence) | Relayer, operator |
| Live Court host attestation | CONFIDENTIAL | Relayer DB | 3 years | Relayer, operator |
| Date of birth | **Not collected** | — | — | — |
| Full legal names | **Not collected** for participants; streamer/sponsor contracts only | Contract files | Per contract | Operator |

### 4.3 Credentials and secrets

| Element | Class | Stored where | Retention | Who can read |
|---|---|---|---|---|
| Side token (plaintext) | SECRET | Returned once in the response; side B's in the invite URL **fragment** (V-SEC-03). Never stored. | Not stored | The side that holds it |
| Side-token hash (SHA-256) | CONFIDENTIAL | Relayer DB | Life of case record | Relayer |
| Developer API key (plaintext) | SECRET | Shown once at issue | Not stored (target, V-SEC-10); env list today | Key owner |
| API key hash | CONFIDENTIAL | Relayer DB | Until revoked + 1 year | Relayer, operator |
| `RELAYER_PRIVATE_KEY` | SECRET | Secret manager | Until rotated | Relayer process only |
| Contract owner key | SECRET | Offline / hardware wallet (V-SEC-11) | Until rotated | Operator |
| `ADMIN_TOKEN` | SECRET | Secret manager | Rotate every 90 days | Relayer, payment webhook handler |
| `WEBHOOK_SIGNING_SECRET` | SECRET | Secret manager | Rotate on compromise; announce to developers | Relayer |
| Twitch user access + refresh tokens (per broadcaster) | SECRET | Encrypted at rest (V-SEC-15) | Until disconnect or revoke | Relayer |
| Twitch client secret | SECRET | Secret manager | Until rotated | Relayer |
| Payment provider secret keys and webhook signing secret | SECRET | Secret manager | Until rotated | Relayer / payment handler |
| Moderation provider API key | SECRET | Secret manager | Until rotated | Relayer |

### 4.4 Network and abuse control

| Element | Class | Stored where | Retention | Who can read |
|---|---|---|---|---|
| Client IP address (raw) | CONFIDENTIAL | Memory for the request only | Request lifetime (V-PRIV-09) | Relayer |
| Rate-limit counter key = HMAC(IP, daily secret) | CONFIDENTIAL | Relayer memory/DB | 48 h | Relayer |
| Security logs with truncated IP (/24, /48) | CONFIDENTIAL | Log store | 30 days | Operator |
| User agent | CONFIDENTIAL | Log store | 30 days | Operator |
| Developer `callback_url` | CONFIDENTIAL | Relayer DB | Life of case record | Relayer, developer |
| Webhook payloads | Content is PUBLIC-ON-CHAIN data plus case ID, state, mode (V-PRIV-12) | In transit; delivery log 30 days | 30 days | Developer, relayer |

### 4.5 Money

| Element | Class | Stored where | Retention | Who can read |
|---|---|---|---|---|
| Credit balance and ledger entries | CONFIDENTIAL | Relayer DB (transactional) | 7 years (financial records) | Account holder (own), relayer, operator |
| Free-appeal usage per payer per day | CONFIDENTIAL | Relayer DB | 48 h | Relayer |
| Payment provider customer ID, checkout/payment IDs, event IDs | CONFIDENTIAL | Relayer DB | 7 years | Relayer, operator, payment processor |
| Card number, CVC, bank details | **Never received** by VERDICT (provider-hosted checkout) | Payment provider only | Provider's policy | Payment processor |
| Subscription and plan status | CONFIDENTIAL | Relayer DB | Life of account + 7 years | Account holder, relayer, operator |
| Sponsor contracts, prize records, W-9s for $600+ prizes | CONFIDENTIAL | Operator files (sponsor issues 1099) | 7 years | Operator, counsel |

### 4.6 Live Court

| Element | Class | Stored where | Retention | Who can read |
|---|---|---|---|---|
| Broadcaster ID, channel name | CONFIDENTIAL in VERDICT's store (public on Twitch) | Relayer DB | Until disconnect + 1 year | Relayer, operator |
| Prediction ID, outcome IDs, Prediction status | CONFIDENTIAL | Relayer DB | Life of case record | Relayer, streamer |
| Channel Points totals / viewer predictions | **Not collected** | Twitch only | — | — |
| Contestant handles shown on overlay | CONFIDENTIAL; shown on stream by host attestation | Relayer DB | As handles | Public via stream |

### 4.7 Analytics

| Element | Class | Stored where | Retention | Who can read |
|---|---|---|---|---|
| Analytics events (`docs/ANALYTICS_EVENTS.md`) | CONFIDENTIAL, pseudonymous | First-party analytics store | 13 months, then aggregate only | Operator |
| `user_id` (random, not account email), `session_id` | CONFIDENTIAL | Analytics store | 13 months | Operator |
| `case_key` = HMAC(case ID, analytics secret) | CONFIDENTIAL | Analytics store | 13 months | Operator |
| Attribution `src` and `ref_user_id` | CONFIDENTIAL | Analytics store | 13 months | Operator |
| Take text, handles, IPs, tokens, emails, on-chain case IDs, packageDigest | **Forbidden** in analytics (V-PRIV-10) | — | — | — |
| Red Flag message text (any stage), redacted items, juror lines, Jailbreak attempt text, matched patterns, disclosure contents | **Forbidden** in analytics (v1.1) | — | — | — |

### 4.8 Red Flag Court (v1.1, ADR-014)

| Element | Class | Stored where | Retention | Who can read |
|---|---|---|---|---|
| Raw paste (before browser redaction) | **Never received** by VERDICT | User's browser only | Discarded when the page closes | The user |
| Browser-redacted message text (what the user approved) | CONFIDENTIAL, transient | Relayer request memory; sent to the LLM processor (C9) and the moderation processor | **Request lifetime only.** Never written to DB, logs, analytics or any chain (V-RF-09, V-RF-13) | Relayer; processors under no-retention terms |
| Relayer-redacted text (second pass) | CONFIDENTIAL, transient | Relayer request memory | Request lifetime only | Relayer; processors |
| Redaction counts (tags by type, e.g. 2 links, 1 phone; sensitive-item-removed flag) | CONFIDENTIAL, no content | Analytics (P0) | 13 months | Operator |
| Ruling record: label, vote counts, flag codes, juror lines (≤ 110 chars, no quotes), money-rule flag, timestamp, pseudonymous user ID | CONFIDENTIAL | Relayer DB | 30 days (reports and abuse review), then deleted | User (own), relayer, moderator |
| Flag-code aggregates for "You weren't the only one" (code, day, count; no text, no user ID) | CONFIDENTIAL, aggregate | Relayer DB | Rolling 35 days, then counts only | Relayer, operator; public only as a count ≥ 20 |
| Help-line path triggers (category code only, no text) | CONFIDENTIAL | Relayer DB | 30 days | Moderator |
| Red Flag reports (report category + ruling-record ID, **no message text**) | CONFIDENTIAL | Relayer DB | 1 year after resolution | Moderator, operator |
| Daily Red Flag picks (player's label and flag picks on a staff-written message) | CONFIDENTIAL | Relayer DB | Life of account (sticker progress) | User, relayer |
| Field Guide stickers, titles, weekly streak | CONFIDENTIAL | Relayer DB | Life of account | User, relayer |
| Staff-written samples and Daily Red Flag messages | Public (we wrote them) | Repo / CMS | Indefinite | Public |
| Rendered share card | CONFIDENTIAL until the user shares it | Generated client-side or short-lived object storage | ≤ 24 h server-side copy | User; public once shared. Contains no message text (V-RF-12) |

### 4.9 Jailbreak the Jury (v1.1, ADR-015)

| Element | Class | Stored where | Retention | Who can read |
|---|---|---|---|---|
| Attempt text, door catch (normalised text + matched pattern) | CONFIDENTIAL | Private red-team store | 12 months, then category and pattern counts only | Security reviewer |
| Attempt text, bench-caught / OVERRULED / MISTRIAL | CONFIDENTIAL | Red-team store; practice court localnet state (C10, private) | 12 months; localnet state wiped at each weekly reset | Security reviewer; the player (own attempts) |
| Attempt text, **SEALED** (got through or moved a juror) | CONFIDENTIAL, **restricted** | Patch queue (encrypted; separate access list) | Until patched + 90 days, then category and pattern only | Security reviewer only. Never on cards, Hall, streams or patch notes (V-JB-04) |
| Hall of Contempt entry (caught attempt slip ≤ 140 chars, handle, award label) | CONFIDENTIAL, shown publicly by opt-in | Relayer DB, CDN | Until the player withdraws the opt-in (purge ≤ 24 h) | Public via the Hall |
| Hall opt-in, credit-my-handle opt-in | CONFIDENTIAL | Relayer DB | Until withdrawn + 3 years (evidence) | Relayer, operator |
| Testnet re-run opt-in (notice version, timestamp) | CONFIDENTIAL | Relayer DB | 3 years after the re-run (evidence) | Relayer, operator |
| Testnet re-run attempt text, house take, verdict, receipt | **PUBLIC-ON-CHAIN** (testnet) | GenLayer testnet | Permanent (testnet resets may strand it; V-OPS-09) | Public |
| Attempt counter (per account or HMAC(IP)) | CONFIDENTIAL | Relayer DB / memory | 48 h | Relayer |
| Disclosure reports (`[DOMAIN]/disclosure`) | CONFIDENTIAL, restricted | Disclosure inbox | Until patched + 1 year | Security reviewer, operator, counsel |
| Patch records (category, pattern, date, credited handle if opted in) | CONFIDENTIAL; public as patch notes without payloads | Relayer DB | Life of service | Operator; public patch notes |

### 4.10 Quick Verdict Settle It cases (v1.1, ADR-013)

| Element | Class | Stored where | Retention | Who can read |
|---|---|---|---|---|
| Take text, judged by Quick Verdict (not appealed) | CONFIDENTIAL | Relayer DB; sent to the LLM processor | Life of the case record, max 1 year unused; **deleted** (not just hidden) ≤ 24 h after withdrawal or takedown | Sides; relayer; processors |
| Quick Verdict result (votes, scores, reasons, venue) | CONFIDENTIAL | Relayer DB | As the takes | Sides; public only on a shared card (no receipt) |
| Take text after an appeal onto the chain | **PUBLIC-ON-CHAIN** | Contract | Permanent | Public |
| Consent record including the notice version that discloses publication on appeal | CONFIDENTIAL | Relayer DB | Life of case record + 3 years | Relayer, operator |

## 5. Handling rules that apply to every class

1. A data element not listed here MUST NOT be collected until this document lists it (new version, change log line).
2. CONFIDENTIAL data MUST NOT be copied into a lower-trust store (analytics, logs, webhooks, third-party tools) except as listed.
3. A takedown (V-PRIV-07) deletes or hides CONFIDENTIAL copies of the case's content from VERDICT's pages. It cannot touch PUBLIC-ON-CHAIN data; the UI says so.
4. A data-deletion request (V-PRIV-11) deletes CONFIDENTIAL personal data except records kept for legal evidence (consent, financial). The response lists what stays on-chain.
5. SECRET values are rotated on any suspected exposure, and the rotation is logged.
6. (v1.1) Text that a non-participant wrote (Red Flag pastes) is never stored beyond the request and never written on-chain, whatever its redaction state.
7. (v1.1) Sealed attempts and disclosure reports are readable only by the Security reviewer role, and every access is logged.

## 6. Change log

| Version | Date | Change |
|---|---|---|
| v1.1 | 2026-10-31 | Added the Security reviewer role; §4.8 Red Flag Court (raw paste never received, message text request-only, ruling records 30 d, flag aggregates 35 d); §4.9 Jailbreak attempts (door/bench 12 months, sealed until patched + 90 d, re-runs public on testnet, disclosure inbox); §4.10 Quick Verdict Settle It cases; analytics forbidden list; handling rules 6–7. |
| v1.0 | 2026-10-31 | First baseline. Covers the package schema v1 fields, receipt inbox, side tokens, API keys, IPs, credits, payment IDs, Twitch tokens and analytics. |
