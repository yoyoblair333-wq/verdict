# VERDICT — Analytics Event Schema, Metrics and Experiment Register

| Field | Value |
|---|---|
| Document | `docs/ANALYTICS_EVENTS.md` |
| Version | v1.2.1 |
| Date | 2026-10-31 |
| Owner | Specifications lead (events); Blair (experiments and decisions) |
| Status | Approved baseline. New events need a new version and a change-log line. |
| Implements | `docs/SPEC.md` V-PRIV-10, V-RF-13 (v1.1), V-PUB-14, V-PL-15 and §2b (v1.2); sources `marketing/security-games-playbook.md` §6 KPIs (v1.1), `marketing/viral-playbook.md` §1 and §7, the assumption register of the private underwriting model (not in this repository) |

**Rules.** (1) Every event below and nothing else. (2) The pipeline validates each event against this schema and drops anything that fails. (3) PII class is never above **P1**. (4) Data class is CONFIDENTIAL (`docs/DATA_CLASSIFICATION.md` §4.7); retention 13 months, then aggregates only.

---

## 1. PII classes

| Class | Meaning | Allowed in analytics? |
|---|---|---|
| **P0** | No personal data (counts, enums, booleans, timings). | Yes |
| **P1** | Pseudonymous: random `user_id`, `session_id`, HMAC'd `case_key`, `ref_user_id`. Cannot identify a person without the relayer DB. | Yes |
| **P2** | Personal or linkable to public text: take text, handles, emails, phone, IP, side tokens, API keys, on-chain case ID, packageDigest, Twitch channel name; *(v1.1)* Red Flag message text at any stage, redacted items, juror lines, Jailbreak attempt text, matched patterns, `VR-` receipts of re-runs; *(v1.2)* pattern summaries (candidate or stored), pattern ids, `request_key`, Pattern Ledger tx hashes, receipts of published cases, preview votes or scores. | **No. Never.** |

## 2. Common envelope (every event)

| Property | Type | PII | Notes |
|---|---|---|---|
| `event` | enum (names in §3) | P0 | |
| `event_id` | UUID v4 | P0 | Dedup key. |
| `schema_version` | `"1.0"` \| `"1.1"` \| `"1.2"` | P0 | `"1.1"` adds `game` and `venue`. `"1.2"` adds the §3.11 and §3.12 events; the envelope is unchanged. |
| `ts` | ISO 8601 UTC, ms | P0 | Server time when the server emits; client time otherwise, plus `client_skew_ms`. |
| `user_id` | random 128-bit, base64url | P1 | Not the account ID, not an email. Anonymous visitors get a device-scoped random ID. |
| `session_id` | random | P1 | |
| `surface` | `settle` \| `live` \| `api` \| `web_other` | P0 | |
| `mode` | `shadow` \| `live` | P0 | SPEC §6.6. On-chain surfaces only; null when `venue ≠ chain`. |
| `game` | `red_flag` \| `jailbreak`, nullable | P0 | v1.1. Null outside the games. |
| `venue` | `chain` \| `quick_verdict` \| `practice_court`, nullable | P0 | v1.1. Where the result was computed (SPEC §3). |
| `app_version` | semver string | P0 | |
| `src` | enum: `opp_invite`, `card_link`, `tiktok_bio`, `reels`, `shorts`, `x`, `reddit`, `genlayer`, `streamer`, `direct`, `other` | P0 | From `?src=` (playbook §4 rule 5). |
| `src_detail` | string ≤ 32, `[a-z0-9_-]` | P0 | e.g. a streamer slug chosen by VERDICT, not the channel name. |
| `ref_user_id` | as `user_id`, nullable | P1 | From `ref=`. |
| `case_key` | HMAC-SHA256(case ID, analytics secret), hex, nullable | P1 | Never the on-chain ID or digest (V-PRIV-10). |
| `experiment` | map of `EXP-id` → arm, nullable | P0 | §6. |

## 3. Events

Trigger = the exact moment the event fires. "Server" events are emitted by the relayer after the state change is committed; they are authoritative for metrics. "Client" events are best-effort.

### 3.1 Acquisition and identity

| Event | Trigger | Emitter | Extra properties | PII |
|---|---|---|---|---|
| `landing_viewed` | First page view in a session | Client | `path` (route template, no IDs) | P1 |
| `signup_completed` | Account created | Server | `method` (`google`\|`discord`\|`twitch`\|`phone`), `is_opponent` (bool) | P1 |
| `age_confirmed` | 18+ box ticked and submitted | Server | `notice_version` | P1 |

### 3.2 Case lifecycle (one event per SPEC §6.1 transition)

| Event | Trigger (SPEC transition) | Emitter | Extra properties | PII |
|---|---|---|---|---|
| `case_draft_started` | T1 (composer opened) | Client | `rubric` (preset key or `custom`) | P1 |
| `case_created` | T2 (A submitted; AWAITING_OPPONENT) or T3a | Server | `rubric`, `entries_n` | P1 |
| `consent_given` | Consent record stored for a side | Server | `side` (0–9), `notice_version` | P1 |
| `invite_sent` | A taps a share target for the invite | Client | `channel` (`imessage`\|`whatsapp`\|`dm`\|`tiktok_comment`\|`copy`\|`other`) | P1 |
| `invite_opened` | B's invite page loads with a valid token | Server | `minutes_since_created` | P1 |
| `opponent_signed_up` | `signup_completed` where the session arrived via an invite | Server | `minutes_since_created` | P1 |
| `opponent_submitted` | T3 | Server | `minutes_since_created`, `opponent_is_new` (bool) | P1 |
| `case_dispatched` | T4 | Server | `queued_minutes` | P1 |
| `verdict_provisional` | T5 | Server | `tier`, `seconds_since_dispatch` | P1 |
| `verdict_finalized` | T6, or T14 success | Server | `tier`, `split`, `seconds_since_dispatch`, `overturned` (bool, tiers 2–3) | P1 |
| `verdict_failed` | T8 | Server | `tier`, `reason` (`llm_error`\|`undetermined`\|`integrity`\|`canceled`) | P1 |
| `case_stale` | T9, T10, T10a | Server | `from_state` | P1 |
| `case_revoked` | T11 | Server | `from_state`, `actor` (`side`\|`not_a_game`\|`operator`) | P1 |
| `case_reconciled` | T12 | Server | `hours_late` | P1 |
| `moderation_rejected` | Local or provider check rejects an entry or rubric | Server | `stage` (`local`\|`provider`), `code` (`length`\|`injection`\|`pii`\|`threat`\|`self_harm`\|`doxx`\|`provider_flag`\|`provider_down`) | P1 |

### 3.3 Verdict viewing and sharing

| Event | Trigger | Emitter | Extra properties | PII |
|---|---|---|---|---|
| `verdict_viewed` | Final card rendered on screen for a side (first time per side per tier) | Client | `tier`, `viewer_is_winner` (bool) | P1 |
| `reveal_completed` | The juror-by-juror reveal reaches the slam | Client | `tier`, `skipped` (bool), `reduced_motion` (bool) | P1 |
| `card_shared` | Share sheet completes, or download/copy-link tapped | Client | `tier`, `destination` (`tiktok`\|`ig_story`\|`x`\|`imessage`\|`whatsapp`\|`download`\|`copy_link`\|`other`), `sharer_is_winner` (bool), `good_sport` (bool) | P1 |
| `card_link_opened` | Someone opens a shared card URL | Server | `tier` | P1 |
| `record_view_opened` | `/r/<digest>` loads (V-SEC-17) | Server | `found` (bool) | P0 |
| `spectator_vote_cast` | 👍/👎 on a public case | Client | `agrees` (bool) | P1 |
| `gallery_opt_in` | A side opts a case into the gallery or docket | Server | `target` (`gallery`\|`docket`) | P1 |
| `takedown_requested` | Takedown submitted | Server | `actor` (`side`\|`operator`) | P1 |
| `report_filed` | Report button used | Server | `category` | P1 |
| `badge_awarded` | Good Sport or Landmark Case badge granted | Server | `badge` | P1 |
| `streak_week_completed` | First qualifying case in a new ISO week | Server | `streak_weeks`, `freeze_used` (bool) | P1 |

### 3.4 Appeals and money

| Event | Trigger (SPEC §6.3 / §6.4) | Emitter | Extra properties | PII |
|---|---|---|---|---|
| `appeal_cta_viewed` | Appeal button rendered for a losing side (A1) | Client | `to_tier` | P1 |
| `appeal_filed` | A3 → A4 (charged and dispatched) | Server | `to_tier`, `paid_with` (`free`\|`credit`\|`streamer_plan`) | P1 |
| `appeal_payment_required` | A3 returned 402 | Server | `to_tier`, `price_cents` | P1 |
| `appeal_decided` | A5 | Server | `to_tier`, `outcome` (`upheld`\|`overturned`) | P1 |
| `appeal_failed` | A6 (technical refund) | Server | `to_tier`, `reason` | P1 |
| `appeal_window_expired` | A7 | Server | `tier` | P1 |
| `card2_shared` | `card_shared` where `tier ≥ 2` (derived view, not a separate emit) | — | — | P1 |
| `credit_checkout_started` | Checkout session created | Server | `pack_cents` | P1 |
| `credit_purchased` | Ledger GRANTED | Server | `pack_cents` | P1 |
| `credit_reversed` | Ledger REVERSED | Server | `cents`, `cause` (`refund_by_law`\|`chargeback`) | P1 |
| `subscription_started` / `subscription_canceled` | Provider event verified | Server | `plan` (`court_pass_m`\|`court_pass_y`\|`group_court`\|`streamer_pro`\|`streamer_studio`\|`api_team`) | P1 |

Note: no event carries `winner_index` alongside a money amount except `appeal_decided`, which carries no money field. This keeps outcome and money analytically separable (V-LEGAL-01 audit).

### 3.5 Live Court and API

| Event | Trigger | Emitter | Extra properties | PII |
|---|---|---|---|---|
| `live_case_opened` | T3a on `live` | Server | `src_detail` (streamer slug), `entries_n` | P1 |
| `prediction_resolved` | Prediction RESOLVED (LIVE only) | Server | `minutes_after_final` | P0 |
| `prediction_canceled` | Prediction CANCELED | Server | `cause` (`failed`\|`stale`\|`revoked`\|`twitch_limit`) | P0 |
| `api_judgment` | API case reaches FINALIZED_SUCCESS or FINALIZED_ERROR | Server | `success` (bool), `entries_n`, `via` (`rest`\|`mcp`\|`n8n`) | P1 (`user_id` = key owner's pseudonymous ID) |

### 3.7 Quick Verdict (v1.1, ADR-013)

| Event | Trigger | Emitter | Extra properties | PII |
|---|---|---|---|---|
| `qv_submitted` | A Quick Verdict request accepted by the relayer | Server | `context` (`settle_free`\|`red_flag`), `chars_bucket` (`≤100`\|`≤280`\|`≤600`\|`≤1000`) | P1 |
| `qv_completed` | Result stored (rail reaches Done) | Server | `context`, `seconds`, `jurors_ok` (0–5) | P1 |
| `qv_failed` | Panel failed (processor error, malformed output) | Server | `context`, `reason` (`processor_error`\|`llm_error`\|`timeout`) | P1 |
| `qv_withdrawn` | A side withdraws before Done (V-QV-07) | Server | — | P1 |
| `qv_appeal_onchain_filed` | **Retired in v1.2 (ADR-019; V-QV-05 superseded). Never emitted.** Use §3.11. Original trigger: a losing side appeals a Settle It Quick Verdict onto the chain. | — | — | P1 |

### 3.8 Red Flag Court (v1.1, ADR-014; `game = red_flag`, `venue = quick_verdict`)

| Event | Trigger | Emitter | Extra properties | PII |
|---|---|---|---|---|
| `rf_landing_viewed` | Red Flag page first view in a session | Client | `src` | P1 |
| `rf_sample_tapped` | A "Try one" sample loaded | Client | `sample_id` (`crypto_dm`\|`package`\|`romance`\|`job_offer`\|`account_locked`\|`mystery`) | P1 |
| `rf_redaction_previewed` | Browser redaction preview shown | Client | Counts only: `links`, `phones`, `emails`, `handles`, `names`, `companies`, `numbers` (ints); `sensitive_removed` (bool); `user_hid_words` (int) | P0 |
| `rf_submitted` | Approval ticked and sent | Server | `chars_bucket`, `is_sample` (bool) | P1 |
| `rf_ruling_shown` | Ruling rendered | Server | `label` (`scam`\|`sus`\|`looks_legit`), `scam_votes`, `sus_votes`, `legit_votes` (ints), `money_rule` (bool), `downgraded_by_scam_vote` (bool), `flag_codes` (array of the 16 fixed codes) | P1 |
| `rf_help_shown` | Help-line path instead of a ruling | Server | `category` (`threat`\|`extortion`\|`sextortion`\|`self_harm`) | P1 |
| `rf_card_shared` | Share sheet completes | Client | `label`, `destination` (as `card_shared`), `is_sample` | P1 |
| `rf_warn_sent` | "Warn someone" 1:1 share completes | Client | `channel` (as `invite_sent`) | P1 |
| `rf_cap_hit` | 10/day cap reached (V-RF-15) | Server | — | P1 |
| `rf_daily_played` | Daily Red Flag round answered | Server | `pick` (`scam`\|`sus`\|`looks_legit`), `flags_correct`, `flags_total` | P1 |
| `rf_sticker_unlocked` | Field Guide sticker unlocked | Server | `flag_code` | P1 |

### 3.9 Jailbreak the Jury (v1.1, ADR-015; `game = jailbreak`)

| Event | Trigger | Emitter | Extra properties | PII |
|---|---|---|---|---|
| `jb_landing_viewed` | Jailbreak page first view in a session | Client | `case_week` (e.g. `014`) | P1 |
| `jb_attempt_submitted` | Attempt accepted (consent ticked) | Server | `case_week`, `chars_bucket`, `attempts_left` | P1 |
| `jb_result` | Result stored | Server | `result` (`door_caught`\|`bench_caught`\|`overruled`\|`mistrial`\|`sealed`\|`blocked`), `category` (fixed attack-category enum), `jurors_moved` (0–5; only with `venue = practice_court`) | P1 |
| `jb_card_shared` | Contempt card shared | Client | `card_type` (`door`\|`bench`\|`sealed`\|`rerun`), `destination` | P1 |
| `jb_hall_opt_in` / `jb_credit_opt_in` / `jb_rerun_opt_in` | Opt-in ticked (each separate, each off by default) | Server | `case_week` | P1 |
| `jb_rerun_finalized` | Testnet re-run reaches FINALIZED + SUCCESS or fails (`venue = chain`) | Server | `success` (bool) | P1 |
| `jb_attempt_cap_hit` | Daily attempt cap reached | Server | `new_account` (bool) | P1 |
| `jb_disclosure_filed` | Report sent through `[DOMAIN]/disclosure` | Server | — (no content) | P0 |
| `jb_patched` | A sealed category or pattern is fixed | Server (ops) | `category`, `days_to_patch`, `credited` (bool) | P0 |
| `jb_hall_published` | Friday Hall published | Server (ops) | `entries_n`, `tries_n`, `caught_n`, `sealed_n` | P0 |

### 3.10 Trust page (v1.1, ADR-017)

| Event | Trigger | Emitter | Extra properties | PII |
|---|---|---|---|---|
| `trust_page_viewed` | "Try to rig it." page view | Client | `section` (deepest section reached, 1–7) | P1 |
| `trust_cta_tapped` | A hero button tapped | Client | `cta` (`play_jailbreak`\|`how_checked`) | P1 |

There are no bounty events until a bounty exists (ADR-016).

### 3.11 Publish (v1.2, ADR-019; `surface = settle`)

`venue = quick_verdict` until P4, then `venue = chain`. `mode` is recorded from T4.

| Event | Trigger (SPEC §6.7) | Emitter | Extra properties | PII |
|---|---|---|---|---|
| `publish_requested` | P1: a side taps Publish on a Done preview | Server | `requester_won_preview` (bool), `minutes_since_preview` | P1 |
| `publish_consented` | A side's `publish-onchain-v1` consent stored (P1 or P2) | Server | `side` (0–1), `notice_version`, `is_requester` (bool), `minutes_since_request` | P1 |
| `publish_consent_withdrawn` | P3 | Server | `side`, `from_state` (`requested`\|`consented`), `actor` (`withdraw`\|`cancel`) | P1 |
| `publish_cap_hit` | P4 refused by `PUBLISH_DAILY_CAP` | Server | `new_account` (bool) | P1 |
| `publish_finalized` | The published Tier 1 reaches FINALIZED_SUCCESS, FINALIZED_ERROR or STALE | Server | `success` (bool), `seconds_since_dispatch`, `cap_restored` (bool) | P1 |
| `preview_overruled` | With `publish_finalized{success = true}` when the network's `winner_index` ≠ the preview's | Server | — (the fact is the event) | P1 |

`case_dispatched`, `verdict_provisional` and `verdict_finalized` also fire for a published case, as for any on-chain case. `appeal_filed` on a published case keeps its §3.4 meaning.

### 3.12 Scam Pattern Ledger (v1.2, ADR-020; `game = red_flag`, `venue = chain` or `practice_court` for private runs)

No event carries the summary, the pattern id, the `request_key` or a tx hash (V-PL-15).

| Event | Trigger (SPEC §6.8) | Emitter | Extra properties | PII |
|---|---|---|---|---|
| `pattern_optin` | OPTED_IN: "Help warn others" ticked and sent | Server | `label` (`scam`\|`sus`), `notice_version` | P1 |
| `pattern_recorded` | RECORDED: FINALIZED + SUCCESS, `outcome = new` | Server | `category`, `flag_codes` (array of the 16), `retried` (bool) | P1 |
| `pattern_sighting` | SIGHTED: FINALIZED + SUCCESS, `outcome = sighting` | Server | `category`, `flag_codes`, `sightings_bucket` (`2`\|`3–9`\|`10–99`\|`100+`), `retried` (bool) | P1 |
| `pattern_rejected` | REJECTED | Server | `reason` (`pii_screen`\|`validator_reject`\|`no_consensus`\|`duplicate_user`), `category` | P1 |
| `pattern_cap_hit` | `PL_DAILY_CAP` reached | Server | — | P1 |

### 3.6 External metrics (not events)

TikTok completion rate, shares + saves per 1,000 views, average views, Twitch chat messages per minute, Prediction participation %, Twitch clip counts. Source: platform analytics, entered weekly into the tracker by hand (playbook §7 ritual). Never joined to `user_id`.

---

## 4. Metric definitions

All metrics use **server** events, by **weekly signup cohort** (ISO week of `signup_completed`) unless stated. Attribution window for viral metrics: **7 days** from the referrer's signup.

| Metric | Definition | Playbook target |
|---|---|---|
| **WTV** (north star) | Count of `verdict_finalized` with `tier = 1` on `surface = settle` where the case had `opponent_submitted`, per ISO week. *(v1.1)* Once G-QV passes, add `qv_completed{context = settle_free}` for cases with `opponent_submitted`, and report the two venues separately. *(v1.2)* A published case counts once, at its preview. Its on-chain Tier 1 counts in **On-chain decisions per week**, not again in WTV. | Playbook §7 table |
| Opponent join rate | `opponent_submitted` ÷ `case_created` (surface `settle`), cases created in the week | ≥ 45% |
| New-user share of opponents | `opponent_submitted` with `opponent_is_new = true` ÷ all `opponent_submitted` | 40–60% |
| Card share rate | Distinct (case_key, user_id) with `card_shared` and `tier = 1` ÷ `verdict_viewed` with `tier = 1` | ≥ 25% |
| Appeal rate | `appeal_filed` with `to_tier = 2` ÷ `verdict_finalized` with `tier = 1` (cases with a losing side) | 15–30% (product); model assumes 1–3% (`A-APL-01`) |
| Supreme Court rate | `appeal_filed` with `to_tier = 3` ÷ `appeal_filed` with `to_tier = 2` | 20–30% |
| Card-2 share rate | `card_shared` with `tier ≥ 2` ÷ `appeal_decided` | ≥ 35% |
| **K_opp** (cohort C) | Signups in the window with `src = opp_invite` and `ref_user_id ∈ C` ÷ \|C\| | §1 table |
| K_opp decomposition (diagnostic) | (`case_created` per member of C) × (`opponent_is_new` share) × (opponent join rate) | — |
| **K_card** (cohort C) | Signups in the window with `src = card_link` and `ref_user_id ∈ C` ÷ \|C\| | §1 table |
| K_card decomposition | (`card_shared` per member) × (signups per `card_link_opened`) × (`card_link_opened` per `card_shared`) | — |
| **K_total** | K_opp + K_card | 0.30 → 0.45 → 0.70 |
| Cycle time | Median of `opponent_submitted.minutes_since_created` for cases where the opponent was new | < 24 h (launch), < 12 h (wk 4), < 6 h (wk 8) |
| Week-2 retention | Members of C with any `case_created` or `opponent_submitted` in ISO week C+1 ÷ \|C\| | ≥ 20% |
| Safety rate | (`report_filed` + `case_revoked{actor=not_a_game}`) per 1,000 `case_dispatched` | reports < 2 / 1,000, trending down |
| Finality health (ops) | `verdict_finalized` ÷ (`verdict_finalized` + `verdict_failed` + `case_stale` after dispatch) | ≥ 95% for G-LIVE |
| Paid appeal share | `appeal_filed{paid_with=credit}` ÷ `appeal_filed` | Validates `A-APL-08`, `A-APL-09` |
| Subscriber share of MAU | Active subscriptions ÷ monthly users with any server event | Validates `A-SUB-01` |
| QV → chain appeal rate (v1.1) | **Retired in v1.2**: replaced by Publish rate. | — |
| **On-chain decisions per week** (v1.2, north-star companion, SPEC §2b) | Per ISO week, the count of: `publish_finalized{success}` + `appeal_decided` + `jb_rerun_finalized{success}` + `pattern_recorded` + `pattern_sighting` + `verdict_finalized{tier = 1}` on `surface ∈ {live, api}`. Reported in total, by source and by `mode`. Shown alongside: `pattern_rejected{reason ∈ validator_reject, no_consensus}` (network decisions that stored nothing). Private-run (`venue = practice_court`) events are excluded. | Report weekly next to WTV; design brief §4 |
| Publish rate (v1.2) | Cases with `publish_finalized{success}` ÷ `qv_completed{context = settle_free}` with `opponent_submitted`, same week | Feeds `A-APL-01` and the gas budget (V-OPS-04) |
| Publish consent completion (v1.2) | `publish_requested` that reach a second `publish_consented` within 7 days ÷ `publish_requested` | Watch. Low values mean T61 (winner withholds) |
| Overrule rate (v1.2, guardrail for T56) | `preview_overruled` ÷ `publish_finalized{success}` | Alert on a week-over-week jump > 10 pp (Quick Verdict/contract drift, V-QV-06) |
| Pattern opt-in rate (v1.2) | `pattern_optin` ÷ `rf_ruling_shown{label ∈ scam, sus}` excluding samples | Watch |
| Pattern reject and no-consensus rates (v1.2, guardrail for T57, T60) | `pattern_rejected` by `reason` ÷ `pattern_optin` | G-PL: no-consensus ≤ 10%; alert on week-over-week jumps (V-PL-16) |
| Completed plays per visitor (v1.1) | Plays reaching Done (`rf_ruling_shown`; `jb_result` excluding `blocked`) ÷ unique visitors per game, by `src` | Red Flag ≥ 0.6, Jailbreak ≥ 0.4 (security playbook §6) |
| Shares per play (v1.1) | (`rf_card_shared` + `rf_warn_sent`) ÷ `rf_ruling_shown`; `jb_card_shared` ÷ completed Jailbreak plays | Red Flag ≥ 0.25, Jailbreak ≥ 0.15 |
| Day-7 return (v1.1) | New players of a game who play it again on days 6–8 | ≥ 15% |
| Game result success (v1.1) | (`qv_completed{red_flag}` + `jb_result`) ÷ (those + `qv_failed{red_flag}`) | ≥ 95% |
| LOOKS LEGIT rate (v1.1, guardrail for T48) | `rf_ruling_shown{label = looks_legit}` ÷ `rf_ruling_shown`, excluding samples | Alert on a week-over-week jump > 5 pp |
| Hall opt-in rate · patch-queue size · reports per 1,000 plays (v1.1) | `jb_hall_opt_in` ÷ (`bench_caught` + `door_caught`); open `sealed` count; `report_filed` per 1,000 plays by `game` | Watch |
| Compulsion warning (v1.1) | Median session length per player rising for 2 weeks while `rf_sticker_unlocked` per player stays flat | Review the mechanics if triggered |

---

## 5. Instrumentation acceptance criteria

1. A full Settle It flow on testnet (create → invite → opponent → verdict → share → appeal → Supreme Court) emits, in order: `case_created`, `consent_given`×2, `invite_sent`, `invite_opened`, `opponent_submitted`, `case_dispatched`, `verdict_provisional`, `verdict_finalized`, `verdict_viewed`, `card_shared`, `appeal_filed`, `verdict_finalized{tier 2}`, `appeal_decided`, `appeal_filed`, `verdict_finalized{tier 3}`, `appeal_decided`.
2. A grep of the analytics store for any test take text, handle, side token, IP or 64-hex digest returns nothing.
3. Every server event is emitted after its state change commits (no event for a rolled-back transition).
4. (v1.1) After a test run of both games, a grep of the analytics store for any test paste string, attempt string, redacted value, juror line or `VR-` string returns nothing, and every `flag_codes` value is one of the 16 fixed codes.
5. (v1.1) Vote counts and `jurors_moved` come only from real recorded votes. Door catches emit `jurors_moved` = null.
6. (v1.2) A full publish on testnet (preview Done → Publish → second consent → Tier 1 final) emits, in order: `qv_completed`, `publish_requested`, `publish_consented`×2, `case_dispatched`, `verdict_provisional`, `verdict_finalized`, `publish_finalized`, plus `preview_overruled` when the winners differ. A run with one consent emits no `case_dispatched`.
7. (v1.2) After a pattern test run, a grep of the analytics store for any test summary, pattern id, `request_key` or 64-hex tx hash returns nothing, and every `category` value is in the fixed enum.

---

## 6. Experiment register

Rules: one primary metric per experiment; guardrails can stop an experiment early; decisions are logged in `docs/DECISIONS.md` if they change product behaviour. **Never** experiment on the canonical product rules (prices, tiers, 18+, no money on outcomes, consent copy meaning). Sample sizes are per arm for a two-sided test at α = 0.05 and 80% power. At launch volumes several tests will take weeks; the "Low-volume rule" applies until the sample is reached.

**Low-volume rule.** If the per-arm sample is not reached in 4 weeks, decide on direction only when the observed lift is at least twice the threshold and no guardrail moved the wrong way; otherwise keep the control.

### 6.1 Growth experiments (from `marketing/viral-playbook.md`)

| ID | Hypothesis | Primary metric | Threshold (MDE) | n per arm | Guardrails | Decision rule | Spec deps | Status |
|---|---|---|---|---|---|---|---|---|
| EXP-01 | Hiding A's take until B submits ("Their case is sealed") raises opponent joins versus showing a preview. | Opponent join rate | +5 pp over a 45% base | 1,562 invites | Report rate; `case_stale` share | Ship sealed if lift ≥ +5 pp and guardrails flat; else keep whichever is higher and log. | V-FUN-11, V-SAFE-08 | Planned |
| EXP-02 | A 1.5 s per-juror reveal yields more shares than 0.9 s. | Card share rate | +5 pp over 20% | 1,091 verdict views | `reveal_completed.skipped` share ≤ 30% | Keep 1.5 s if lift ≥ +5 pp; if skip rate > 30%, shorten regardless. | V-SAFE-08 | Planned |
| EXP-03 | A "Good Sport" badge and softer losing card raise loser sharing. | Card share rate where `sharer_is_winner = false` | +5 pp over 10% | 683 losing views | Report rate | Ship if lift ≥ +5 pp. | V-SAFE-02 | Planned |
| EXP-04 | Showing the dissenting juror's quote raises sharing. | Card share rate | +5 pp over 20% | 1,091 | — | Ship if lift ≥ +5 pp. | V-FUN-16 | Planned |
| EXP-05 | Appeal button copy "Appeal to a higher court" beats "Request a bigger jury". | Appeal rate | +5 pp over 15% | 903 losing views | Report rate; refund rate | Ship the winner; never test copy implying better odds (V-LEGAL-02). | V-FUN-09, V-LEGAL-02 | Planned |
| EXP-06 | A one-tap share to TikTok as the first share target raises card links opened per share. | `card_link_opened` ÷ `card_shared` | +5 pp over 30% | 1,374 shares | — | Ship if lift ≥ +5 pp. | — | Planned |
| EXP-07 | Platform-tagged links show which repost platform converts (observational, not A/B). | Signups per 1,000 views by `src` | Rank order stable 2 weeks | — | — | Shift reposting effort to the top platform by ≥ 2× signups per view. | — | Planned |
| EXP-08 | Live Court pilot is worth continuing per streamer (scorecard, playbook §5). | Count of 6 scorecard targets met | ≥ 4 of 6 | per streamer, 4 events | Report rate on stream | Continue if ≥ 4 met; stop at ≤ 2; otherwise one more month. | V-FUN-17, V-FUN-20 | Planned |
| EXP-09 | A 1-free-case-per-day cap for accounts < 7 days old cuts farming without hurting activation. | Week-2 retention | Not lower by > 2 pp | 1,248 cohort users | Gas per WTV | Keep the cap unless retention drops > 2 pp. | V-SEC-06 | Planned |

### 6.2 Assumption validation (private underwriting model)

These are measurements, not A/B tests. Each updates an assumption in the private underwriting model when the sample is reached. The assumed values themselves are kept in that model, not here.

| ID | Assumption tested | Metric | Sample before updating | Decision rule |
|---|---|---|---|---|
| VAL-01 | `A-APL-01` appeal rate | Appeal rate (§4) | 1,000 Tier 1 verdicts with a losing side | Replace the Base input with the observed rate; if > 10%, re-check gas budget (`A-CST-09`). |
| VAL-02 | `A-APL-02` Tier 2 → Tier 3 | Supreme Court rate | 200 Tier 2 appeals | Replace input. |
| VAL-03 | `A-APL-08` / `A-APL-09` free coverage | 1 − paid appeal share, by tier | 300 appeals per tier, after G-PAY | Replace inputs. If paid share < 10%, revisit pack design (not prices). |
| VAL-04 | `A-APL-07` average pack | Mean `credit_purchased.pack_cents` | 100 purchases | Replace input. |
| VAL-05 | `A-SUB-01` subscription conversion | Subscriber share of MAU | 2 months after plans launch | Replace input; below 1% → pause Group Court work. |
| VAL-06 | `A-CST-02` on-chain cost per Tier 1 case | `gltest --fee-profile` + 2 weeks of real gas per `case_dispatched` | Before G-MAINNET | Replace `cpc`, `m1`, `m2` (V-OPS-02). |
| VAL-07 | `A-GRW-04` cases per MAU | `case_created` per monthly active user | 2 months | Replace input. |

---

## 7. Change log

| Version | Date | Change |
|---|---|---|
| v1.2.1 | 2026-10-31 | Privacy (AUDIT-2 P2-4): removed the private business-file path and the modelled assumption values from the header and §6.2; they now point to the private underwriting model. No event or metric changed. Note: the §3.11 publish events are specified but not yet emitted (SPEC V-PUB-14 is P). |
| v1.2 | 2026-10-31 | ADR-019 and ADR-020. §3.11 Publish (6 events: `publish_requested`, `publish_consented`, `publish_consent_withdrawn`, `publish_cap_hit`, `publish_finalized`, `preview_overruled`) and §3.12 Pattern Ledger (5 events: `pattern_optin`, `pattern_recorded`, `pattern_sighting`, `pattern_rejected`, `pattern_cap_hit`); `schema_version` 1.2; P2 list extended; `qv_appeal_onchain_filed` and the QV → chain appeal rate retired; WTV note; 6 metric rows including **On-chain decisions per week**; acceptance criteria 6–7. |
| v1.1 | 2026-10-31 | Envelope `game` and `venue`; §3.7 Quick Verdict (5 events), §3.8 Red Flag Court (11), §3.9 Jailbreak the Jury (12, counting the three opt-ins separately), §3.10 trust page (2); P2 list extended; WTV note for Quick Verdict; 8 new metric rows; acceptance criteria 4–5. |
| v1.0 | 2026-10-31 | First baseline. Formalises the playbook's 8 events and K-factor into 40+ events, metric definitions, PII classes and an experiment and validation register. |
