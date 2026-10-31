# VERDICT: Review and status

**Current state: 2026-10-31, round 3** (Quick Verdict, Red Flag Court, Jailbreak the Jury practice court, and the independent-audit fixes). This top section is current. Everything under "History" further down is kept for the record: the 2026-10-30 tables describe findings as they stood then, and the status map below says which are fixed.

## Results now

| Check | Result |
|---|---|
| `contracts: python -m pytest -q` | **170 passed, 1 skipped (155 direct-mode on the real GenVM v0.2 SDK, 15 static schema checks; 1 live test skipped without `GENLAYER_LIVE=1`)** |
| `genvm-lint check` / `typecheck` (GenVM pinned to v0.2.16) | pass / no type errors |
| `relayer: npm run typecheck` (src, tests, deploy) | clean |
| `relayer: npm test` | **139 passed, 1 skipped (69 unit, 70 stand-in, 1 live skipped)** |
| `make demo` | PASS |
| Guard mutation sweep (`scripts/mutation_check.py`) | **74 / 74 mutants killed (31 earlier + 35 for Quick Verdict, Red Flag Court and the practice court + 8 for the audit fixes)** |
| `scripts/verify.sh` on a fresh copy with an empty `HOME` (cold caches) | **VERIFY: PASS**, all 8 steps, 433 s total (python 3.13.18, cold pip / npm / GenVM / linter caches, no `.env.local` in the copy). Counts in the copy match the table above, and the offline demo prints DEMO: PASS |
| studionet redeploy + 3-case live run (contract changed: `judge` and `open_case` access) | contract `0x7DBc10d8922A5Ba498007D212F2088872F2aCe06`, pin match; see `docs/LIVE_EVIDENCE.md` |

## Round 3: what was built

1. **Quick Verdict** (`relayer/src/quick.ts`, `lib/jury.ts`). An off-chain jury: the contract's personas, rubric presets, fixed-rules prompt, strict JSON parser and aggregation, ported line for line and checked against the contract source by a test. The LLM call sits behind `JudgeProvider`; tests use a deterministic `StubProvider`, and **no real provider or API key is in the repo** (the routes answer 503 until one is passed to `buildApp`). Every body says `label: "Quick Verdict"`, `network_checked: false`, rail **Submitted → Jury scoring → Done**, and carries no receipt number, digest or tx; `assertQuickHonest` refuses to send one.
2. **Appeal onto the chain** (ADR-018 item 1, as corrected). The losing side of a Settle It Quick Verdict appeals; both sides must first accept the `appeal-onchain-v1` notice (refused with 409 if the other side hasn't), and the submit-time notice `quick-v1` already disclosed publication on appeal. It opens a normal on-chain Tier 1 case through the existing package + judge path, reusing the same side tokens. It counts as appeal 1 (daily free appeal, else $1.99); the on-chain case starts with one appeal used, so its one remaining appeal is Tier 2 at $4.99 and it never reaches the Supreme Court. Revoke after Done → 409; takedown never blocks the appeal. No contract change.
3. **Red Flag Court** (`lib/redflag.ts`, `lib/redact.ts`). Redact, don't reject: links (removed whole, never opened), emails, phones, @handles, long numbers, card/SSN-shaped numbers and passwords (with a warning), company names and likely names become labelled pills. The browser redacts first; the relayer redacts again. Rulings SCAM / SUS / LOOKS LEGIT with the vote line in words ("3 Scam · 2 Sus"). Deterministic post-checks: LOOKS LEGIT only if no juror voted Scam; any money, investment or crypto offer is at least SUS and gets the chip "Money offer: we never rule these legit." Fixed 16-code flag list, no free-text flags. Threats, extortion and self-harm get the help line with 988 and no ruling. A message that talks to the AI is stopped at the door (SUS, no tally). 1,000 code points (ADR-014), with each pill counted as one. No appeals, nothing stored, 10 a day per account.
4. **Jailbreak the Jury practice court** (`lib/practice.ts`). Secret rule from the reviewed list `relayer/config/practice-rules.v1.json` (validated at startup: unreviewed, injected or PII-bearing rules stop the relayer); only the topic reaches the browser. House take = entry 1, player = entry 0. Outcomes: **Stopped at the door** (relayer blocklist hit; no split, no bench, a labelled roast; normalised text + matched pattern to the private red-team store), **Caught by the bench** (real split), **Overruled**, **Mistrial** (attempt refunded), and **Sealed** when the take won *or moved even one juror* (ADR-015 item 4): private patch queue only, no take, split or bench in the response. 10 attempts a day per account. Game clocks reset at 00:00 America/Los_Angeles (ADR-018 item 3). Label "Practice court · Not a public record".
5. **Prototype tabs** in `app/index.html` and `app/artifact.html` (identical game blocks, checked by a test): Red Flag Court (6 samples, live redaction pills, tap-to-hide, unticked approval box, 3-step rail) and Jailbreak the Jury (one 18+ gate, sealed rule card, unticked consent box with the V-JB-13 text, attempt counter). Footer "Simulated in your browser · Not checked by the network". The browser rules are tested against the same fixtures as the relayer, plus a differential test. Settle It is unchanged.
6. **Fixtures:** `fixtures/redaction.json` (18 cases + idempotency + measure) and `fixtures/redflag-rules.json` (LOOKS LEGIT / money / tie decisions, money detector, the six samples).

## Round 3: independent audit fixes (`AUDIT-ENGINEERING.md`)

| Finding | Fix | Test |
|---|---|---|
| P1-1 README relayer start crashes | Shadow mode swaps an unset or all-zero key for a throwaway key; live refuses it. `.env.example` pre-filled with the studionet address and digest; README names the three values to fill in for live | `audit P1-1` (unit + boots `index.js` from `.env.example` and hits `/healthz`); mutant `shadow-ephemeral-key` |
| P1-2 anyone can `judge()` | `judge` requires the case creator or owner | `test_guard_only_creator_or_owner_can_judge`, `test_owner_may_judge`; mutant `judge-creator-py` |
| P1-3 reads show unconsented / unfinal verdicts | `open_case` is owner-only. `GET /cases/:id` serves only relayer-opened package cases and strips winner, scores, votes, split and reason until FINALIZED_SUCCESS (`rail_step: "Network checking"`); the gallery lists FINALIZED_SUCCESS package cases only | `test_guard_legacy_open_case_is_owner_only`, `audit P1-3` ×2; mutants `legacy-open-owner-py`, `read-strip-unfinal`, `gallery-final-only` |
| (redeploy) | New studionet deployment and 3-case run; earlier deployment kept in `docs/LIVE_EVIDENCE.md`; reproduce block can no longer overwrite `.env.local` | live RPC |
| P1-4 README evidence | `app/` labelled a static simulated prototype (path table, diagram, deployment table); only the demo-video and Bradbury rows stay TO FILL | n/a |
| P1-5 clone URL | README uses `https://github.com/yoyoblair333-wq/verdict`. Git init and push are left to the lead | n/a |
| P1-6 / P2-6 private notes, root ignore | Root `.gitignore`: `.venv`, `node_modules`, `.env*` / `*.env.local` / `relayer/.env.local`, `relayer/data/`, build output, `ENRICHMENT-BACKLOG.md`, `business/`, `marketing/soak/`, `AUDIT-*.md` | n/a |
| P2-2 untested claims | Webhook HMAC, `value: 0` on every write (and no payable method), 16 kB body limit → 413 (was a 500) | `audit P2-2` ×3; mutants `webhook-hmac`, `value-zero`, `body-limit` |
| P2-4 linter drift | `GENVM_VERSION=v0.2.16` in `verify.sh`, `Makefile` and CI; CI caches `~/.cache/genvm-linter` | verify.sh |
| P2-5 stale REVIEW top | this section | n/a |
| P2-7 / P2-8 wording | "SSRF-guarded" now says literal IPs only, no DNS re-check; credit ids are "unsalted sha256: pseudonymous, not anonymous" | n/a |

Not fixed in this round: P2-1 (free appeal per IP/key, in memory), P2-3 (per-key action cap and Twitch timer tests), P3-1…P3-7 except P3-1 (download size) and P3-3 (moderation wording) and P3-4 (reproduce block).

## Conflicts with the docs (engineering edited `docs/` only for `LIVE_EVIDENCE.md` and `docs/live/`, as asked)

1. **Practice court venue.** ADR-015 and V-JB-01 put daily play on a private multi-validator localnet running the same contract. The brief allowed Quick Verdict for now, so the practice court runs on the Quick Verdict engine and is labelled "Practice court · Not a public record". V-JB-01 stays N until the localnet exists.
2. **Daily vs weekly.** The brief says a daily secret rule; ADR-015 / V-JB-10 say a weekly case opening Monday 00:00 PT (ADR-018 lists both clocks). The rule list has `period: "daily" | "weekly"`; it ships `daily`. Flip one field for weekly.
3. **Clock.** SPEC V-RF-15 and V-JB-08 say "per UTC day"; ADR-018 item 3 says all game clocks reset at 00:00 America/Los_Angeles. The build follows ADR-018 for Red Flag Court and the practice court. Settle It Quick Verdicts stay on UTC with the rest of Settle It.
4. **Input limit.** The brief said ADR-007's 280 unless code said otherwise; ADR-014 (later) sets Red Flag Court at 1,000. The build uses 1,000 for Red Flag only; practice takes and Quick Verdict entries stay ≤ 280.
5. **"Safe" wording.** The brief bans "safe" wording, but V-RF-04 requires the exact standing line "Not a safety check. If money's involved, check with them directly." The build uses the V-RF-04 line verbatim; nothing says "safe".
6. **New-account cap.** V-JB-08 wants 3 attempts a day for accounts under 7 days old. Accounts don't exist, so every key gets 10 (keyed on HMAC(IP or API key)).
7. **Mistrial meaning.** ADR-015 defines MISTRIAL as "the practice court's checks disagreed". On the interim engine there are no validators, so MISTRIAL means a broken juror answer or provider failure (still refunded).
8. **Red Flag door.** Not in the docs: a pasted message that matches the injection blocklist is not shown to the jury and returns SUS with "Talks to the jury". No vote split is shown for it.
9. **Ruling record retention.** ADR-014 item 11 keeps "the ruling record and flag codes". The build keeps nothing at all for Red Flag Court (stricter); add a store when analytics needs it.
10. **Tier-2 free appeal.** ADR-018 (corrected) prices the remaining appeal at $4.99. The existing rule "1 free appeal per payer per day" still applies to it if that payer's free appeal is unused.

## Stubbed or not built

- **LLM provider:** interface + stub only. No vendor, no key, no network call.
- **Practice-court localnet, weekly testnet re-runs (V-JB-06), PATCHED flow, Hall of Contempt, disclosure inbox:** not built. `PATCHED` is defined as a stamp constant only. Re-runs, when built, use surface `api` with `api_client_submitted` / `self_asserted` (ADR-018 item 2).
- **Withdraw before Done (V-QV-07):** the panel runs inside the request, so there is no "before Done" window to withdraw in.
- **Share cards** for the games: the prototype copies a caption; no image card yet.

## Status map for the history below

E1 fixed (side tokens), E2 fixed (per-key action cap), E3 fixed (relayer mirror, narrowed patterns), E4 fixed (5/7/9), E5 open (design note; odd panels make two-entry ties impossible), E6 fixed (fails closed), E7 fixed (Prediction held until final), E8 open, E9 open (documented as best effort), E10 fixed (durable state), E11 open (DNS re-check). C1–C15 were addressed in the second pass ("What changed" below). The `Before` / `After` numbers in the 2026-10-30 tables are historical.

---

# History

## First review (2026-10-30)

Scope: contract, relayer, prototype, brand, playbook, monetization doc + model. Severity: **High** = breaks a hard product rule, misleads users, or is an exploitable flaw; **Med** = should fix before public launch; **Low** = polish.

## Test / tool results

| Check | Before | After fixes |
|---|---|---|
| `contracts: python -m pytest -q` | 51 passed | **53 passed** (2 new validator tests) |
| `genvm-lint check judge_router.py` | pass | pass |
| `relayer: npx tsc --noEmit` | clean | clean |
| `relayer: npm test` | 8/8 | 8/8 (assertions added to 2 tests) |
| Prototype, headless Chrome 375px + 1280px, case of the day → verdict → appeal | flow completes, no JS errors | same; 2 UI bugs fixed |

The only console error in every page is the Google Fonts request, which the sandbox blocks (network). It is not an app bug.

---

## Fixes applied

1. **Contract: the validator accepted a winner or split that the leader's own votes did not support** (judge_router.py `_leader_payload_ok`, about line 300). A malicious leader could publish `winner_index` = an entry nobody voted for, as long as the validator's scores had it within `CLOSE_CALL_MARGIN`. It could also publish any `split` string (for example "5-0" on a 1-juror panel), because `split` was never checked. The validator now requires `split == _split_string(votes)` and `winner_index == _winner_from(votes, scores)`. I factored the tie-break into `_winner_from()`, which `_aggregate` now uses as well. Tests added: `test_rejects_winner_not_supported_by_votes` and `test_rejects_forged_split`.
2. **Relayer: the SSRF guard let IPv4-mapped IPv6 and unspecified addresses through** (relayer/src/lib/webhook.ts:33). Node normalises `https://[::ffff:127.0.0.1]` to `::ffff:7f00:1`, which passed every check, and `[::]` passed too. Both are now refused, with test cases added.
3. **Relayer: the "only the loser may appeal" check could be skipped by leaving `side` out** (relayer/src/app.ts:200). `side` is now required and must be an integer within the entry range (400 otherwise), and a test was added. Note that this only stops accidental misuse. See H1 below.
4. **Prototype: the "Save card" sheet could never be closed** (app/artifact.html:759). Its inline `display:flex` overrode the `hidden` attribute, so pressing **Done** did nothing. It now toggles `style.display`. index.html uses a download link instead and was not affected.
5. **Prototype: the result title broke the score across two lines at 375px** ("Overturned. 4–" / "3."). I put word-joiners around the dash in artifact.html:731 and in the same line of index.html, so the score stays on one line.

`relayer/dist` was rebuilt.

---

## 1. Engineering findings (not fixed: larger or design-level)

| # | Sev | Where | Finding | Recommendation |
|---|---|---|---|---|
| E1 | **High** | relayer/src/app.ts:162, :195 | **Anyone can judge or appeal any case.** IDs are sequential and the routes check no ownership. `side` is self-declared, so "only the loser appeals" can't be enforced. Every appeal costs 3x or 5x the gas, and anonymous callers get 80 actions per IP per day (`perIpDailyCap*4`), which multiplies across IPs. | When a case is created, return a random per-side token (store only its hash in `meta`) and require it on `/appeal` (and on `/judge` for Settle It). Use opaque public IDs in URLs. |
| E2 | Med | relayer/src/app.ts:72-75 | Requests with an API key are never counted for `judge` or `appeal` (`bucket === "action"` returns early). A single developer key can therefore run unlimited appeals. | Add a per-key action counter. |
| E3 | Med | contracts/judge_router.py:94-108, 159; relayer | The contract's control-phrase blocklist runs **on-chain only**, so a rejected entry still costs a reverted transaction. It also has false positives: "pick me up at 10", "as AI will …", any `"scores":`. | Mirror `CONTROL_PATTERNS` in the relayer's `moderate()` so rejections happen before gas is spent. Narrow patterns 9 and 10. |
| E4 | Med | contracts/judge_router.py:56, 59 | **Tier 1 = 1 juror.** One prompt pass with integer 0–10 scores compared at ±2.0 has high variance across different validator LLMs. A 1-juror "mean" is not a mean, so expect frequent disagreement and rotations (gas) on near-ties. The split is always "1-0", so a card can never show "4–1" at Tier 1. | See the canonical spec in section 4. If Tier 1 stays small, use 3 jurors at minimum. |
| E5 | Med | contracts/judge_router.py:284-297 | The validator logic can still be nudged. A leader may shift each mean by up to ±2.0 (`SCORE_TOLERANCE`), which is enough to decide a **vote-tie** through the mean-score tie-break. That only matters on even juror counts or 3+ entries. | Use odd juror counts (no 2-way ties), or break ties by lowest index only. |
| E6 | Med | relayer/src/lib/moderation.ts:22 | Moderation **fails open** (`externalCheck` returns ok). Entries are public and permanent on-chain, so this matters before any real user touches it. Nothing enforces "no real names / no shaming" (see C6). | Wire a provider and fail closed. Add a name/handle screen for the `toxic`-style rubrics. |
| E7 | Med | relayer/src/app.ts:85-93, 195-212 | Live Court resolves the Twitch Prediction on the **Tier 1** verdict. An appeal that overturns it doesn't update the Prediction, so the stream shows two different "winners". | Either keep the Prediction LOCKED until the appeal window closes, or don't allow appeals on Live Court predictions. |
| E8 | Low | contracts/judge_router.py:375, 497 | `daily_counts` (one key per sender per day) and `refs` (one per case) grow without bound and are never pruned. With a single relayer sender the growth is small, but it never shrinks. | Acceptable for testnet. Consider letting the owner prune old day-keys. |
| E9 | Low | contracts/judge_router.py:110-111 | NFKC doesn't fold homoglyphs, so Cyrillic "іgnore previous" evades the blocklist. The impact is low because the delimiters (`<<<`/`>>>`) are blocked and the prompt frames entries as data. | Document it as best-effort. **Never market the system as "injection-proof".** |
| E10 | Low | relayer/src/app.ts:57 | Case metadata (callback URL, Twitch IDs, appeal count) lives in memory and is lost on restart. | Use a DB before more than one instance. |
| E11 | Low | relayer/src/lib/webhook.ts:17 | No DNS-resolution check, so DNS-rebinding to a private IP is still possible (already noted in the code). | Resolve and re-check the IP, or send through an egress proxy. |
| ok | — | — | No secrets are committed. `.env` is gitignored. `value: 0n` is on every write. Body limit is 16 kB. Errors map cleanly. `list_recent` is capped at 500 scans. The appeal tier cap is enforced on-chain. Integer math holds: scores are clamped ints, means are `round(x*10/k)`. | |

## 2. Claims check

| # | Sev | Where | Finding |
|---|---|---|---|
| C1 | **High** | playbook L3, L34, L103, L163, L171, X thread L338-358; brand-guide L5, L94-108; artifact.html L160 | **"5 different AI models vote, one by one"** doesn't match the contract. The stored votes are N prompt passes ("lenses") on the **leader's single model**. GenLayer validators (different models) only accept or reject that result. They do not each cast a displayed vote. The README (L58) says this itself: "These jurors are prompt passes … the card should say N-juror panel, verified by GenLayer consensus." Personas "mapped to 5 models" (brand L98, playbook L103) can't be implemented on the contract as written. Rewrite the copy as "a 5-juror AI panel, independently re-checked by validators running different AI models". |
| C2 | **High** | playbook L107 vs monetization L13-27 | Direct contradiction. The playbook says "**No payment ever unlocks an appeal at launch** … once per case", while monetization makes paid appeals ($1.99 / $4.99 / $9.99) the **core consumer revenue** with a 3-step ladder. The playbook guardrail (L143) also bans "paid appeals that buy odds". Decide which it is. Paid appeals aren't wagering in themselves (no prize, no pot), but they need to be stated consistently. |
| C3 | Med | monetization L26 | "**Winner refund flourish**: if an appeal overturns, refund one Gavel." That is a credit paid out depending on the outcome of a paid action. It is wagering-adjacent and undercuts the "no money on outcomes" line. **Drop it.** |
| C4 | Med | playbook L186 (Day 24 hook) | "chat **bet** channel points on the AI verdict and **lost everything**" frames Live Court as gambling. Channel points are allowed (no cash value), but don't use bet/lose-everything language. Example rewrite: "chat called it wrong". |
| C5 | Med | monetization L222, L240, L244 vs playbook L146 vs brand L7 | **Age policy conflicts.** Monetization says "13+ only" (in the grant draft and ToS), with 13–17 allowed with parental consent. The playbook says "18+ at launch", and the brand targets 18–40. Make it canonical: **18+ at launch** everywhere, including the grant draft and ToS. |
| C6 | **High** | artifact.html rubric "Who's the toxic one?" + GUILTY stamp; brand-guide L39 ("Use the participants' names"), L138 ("The court finds {name} toxic") | This is **real-name shaming risk**. A shareable card that declares a named person "toxic" or "GUILTY" conflicts with the playbook's "Handles, not real names" (L145) and with the no-shaming rule. Remove the toxic rubric, or make it handles-only with no GUILTY stamp, and change brand rule 3 to "use handles/display names". The contract presets don't include "toxic" either. |
| C7 | Med | playbook L338, L205, L171; brand L3; artifact.html L2, L160 | "**Nobody (including me) can rig the jury**" / "Nobody controls the jury, not even us" overclaims. The operator writes the prompt and presets, owns the contract (pause), runs the only relayer (it can refuse or moderate cases), and the leader still has limited latitude (E5). Safer: "Verdicts are re-checked by independent AI validators, and every result has a public record." |
| C8 | Med | monetization L209 | "**No other stack** gives verifiable multi-model judgment with native appeals" has no source and is a superlative. The same paragraph claims "Settlement on Arbitrum puts every verdict on…". The GenLayer–Arbitrum settlement relationship has no source anywhere in the doc. Source it or cut it. |
| C9 | Med | monetization L65, L238 | "$5,000 … to stay below the NY/FL registration and bonding thresholds **named in the brief**" is stated as fact with no source. These thresholds apply to *games of chance/sweepstakes*, so their applicability to a skill-judged contest should be checked with counsel. Mark it [A] / "verify with counsel". |
| C10 | Med | playbook L23, L324 (DAIC: "≥5 validators", "pool about **twice** as large") vs monetization L15 (GenLayer docs: appeal adds **N+2**, so 5→7, then 11) | The two docs cite different appeal sizes. The playbook uses a secondary source. Use the GenLayer docs figure in both. |
| C11 | Low | playbook L182-183 (Day 20/21) | "For the first time ever, the Supreme Court said the jury was WRONG" reads as an industry-first claim. Say "our first overturn". The "Never fake it" note is good. Also note that the prototype's simulator deliberately leans the Supreme Court toward the loser on close splits (artifact.html:390). Don't film "real" overturns with the prototype. |
| C12 | Low | playbook L111 | The example "3–2 → 2–7" is impossible. Tier sizes are 5 and 7, so 7 votes can't total 9. Example fix: "3–2 → 3–4 OVERTURNED". |
| C13 | Low | monetization L44, L215 | Kick support and an off-chain "Quick judgment, signed JSON" API are sold or promised. Neither exists in the code (the relayer is Twitch-only and fully on-chain). Mark them as roadmap. |
| C14 | Low | monetization L218 vs L123 | The grant budget has "$9,000 relayer gas (6 mo)", but the model's floor is $120/mo (= $720). The milestone "5,000 on-chain verdicts by month 2" exceeds the modeled cap of about 1,190 per month once fees start. Reconcile. |
| C15 | Low | monetization L232 | The Apple link-out fee history rests on one UK blog post dated 14 Aug 2026. Add a primary source (a court docket or Apple newsroom). |
| ok | — | — | No entry fees and no user-funded pots anywhere. Sponsor prizes are fixed and free to enter. Channel points are explicitly not money. No escrow, paid-work, credentials or reputation features. Text-only judging. No TikTok Live scraping advised. Playbook stats are mostly sourced. Gaps are disclosed in monetization L263. |

### model.xlsx spot-check
- 7 sheets. About 1,500 formula cells. Every Summary cell is a formula (72/72). Model sheets: 458 formulas each, and the only hardcoded numbers are the month indices 1–12. Unit_Economics has 2 literal zeros (the free-case price and Stripe fee, which is correct).
- Inputs are on **Assumptions** (columns C/D/E = Conservative/Base/Viral). `quick_cost` links to `LLM_Costs!F11`. The stress tests (`=(B5-D5)/Assumptions!D43`) are formulas. ✔
- I didn't recalculate it (no LibreOffice run here). The values quoted in monetization.md were not re-verified.

## 3. Prototype (app/artifact.html, app/index.html, app/overlay.html)

- 375px and 1280px: no horizontal overflow on compose, the court sequence, the result, or after the appeal. The case-of-the-day flow runs to "Overturned. 4–3." and the appeal button then disables correctly. ✔
- The two bugs fixed are listed above (Save sheet Done; split score wrapping).
- Low: at 375px the 7-seat Supreme bench wraps 4+3, which is fine. The disabled appeal button at full width is visually heavy.
- overlay.html is a fixed 1920×1080 OBS source, so clipping below 1920 is by design. Low: the "Prototype. Live version runs on GenLayer's AI jury" footer at the bottom-left is partly hidden under the left slip.
- index.html and artifact.html differ only by the doc wrapper, the "Download" vs "Save" button, and the save mechanism. Behaviour otherwise matches, and both received the title fix.

## 4. Consistency: jury spec

| Source | Tier 1 | Appeal 1 | Appeal 2 | Juror names |
|---|---|---|---|---|
| **Contract** `TIER_JURORS` (L56) + README L50-54 | 1 | 3 | 5 ("Supreme Court") | lenses: Plain reading, Steelman, Precision, Neutral crowd, Chief justice |
| **Prototype** (artifact/index, overlay) | 5 | 7 Supreme (final) | — (one appeal) | Marlowe, Dahlia, Frank, Tiff, Theo + Augustine, Juno |
| **Brand guide** §5, §7 | 5 | 7 Supreme | — | same as prototype; "5 different models" |
| **Playbook** | 5 "different AI models" | "bigger jury", once per case | — | **Auntie, Lawyer, Gen-Z Intern, Philosopher, Hater** (L103, L191) |
| **Monetization** | 5 (Tier 0, free) | 7 Appeal $1.99 | 11 Grand Jury $4.99, then "largest" Supreme $9.99 (**4 levels**) | — |
| **Relayer** | follows contract; max 2 appeals | | | — |

The sources disagree in five ways: juror counts (1/3/5 vs 5/7 vs 5/7/11/max), the number of appeals (1 vs 2 vs 3), what a "juror" is (prompt pass vs different model), three different persona sets, and Supreme Court as tier 2 vs 3 vs 4.

### Recommended canonical spec
1. **Juror = a persona prompt pass**, not a model. The copy should say: "5-juror AI panel, re-checked by independent validators running different models (GenLayer)."
2. **Ladder: 3 tiers, odd juror counts:**
   - Tier 1 **Verdict**: 5 jurors (Marlowe, Dahlia, Frank, Tiff, Theo).
   - Tier 2 **Appeal**: 7 jurors (adds Augustine and Juno).
   - Tier 3 **Supreme Court**: 7 jurors with the validator count raised by the relayer/Studio config, or 9 jurors if two more personas are added.
   - Set `TIER_JURORS = {1: 5, 2: 7, 3: 7|9}` and replace `JUROR_LENSES` with the brand personas' judging lenses so the card names match the contract.
3. Cost note: Tier 1 at 5 passes is 5x today's Tier 1 gas. Re-run `gltest --fee-profile` and update `cpc`/`m1..m3` in model.xlsx. Monetization's 7/11 "validator" numbers describe GenLayer's protocol appeals, not VERDICT tiers, so stop pricing tiers by validator count.
4. **Personas: use the brand-guide set** (already drawn as icons and colors and used in the prototype). Delete the Auntie/Lawyer/Gen-Z/Hater set from the playbook (L103, L191, L180 "The Hater").
5. **Appeals: up to 2 per case (Tier 2, Tier 3), loser only, enforced by side tokens (E1).** Decide whether they are free at launch or paid (C2), and make the playbook, monetization and the prototype copy all say the same thing.
6. **Age: 18+** everywhere. **Names: handles only**, and remove the toxic/GUILTY rubric (C6).

---

## Fixes applied (second pass, 2026-10-30): canonical spec

### Test and tool results

| Check | Result |
|---|---|
| `contracts: python -m pytest -q` | **60 passed** (was 53; tier tests rewritten for 5/7/9, plus persona-prompt, 4-1 split, `better_comeback`, narrowed-pattern and false-positive tests) |
| `genvm-lint check judge_router.py` | pass |
| `relayer: npx tsc --noEmit` | clean |
| `relayer: npm test` | **13/13** (was 8). New tests cover side tokens, the free-then-credit appeal ladder, the technical-only refund, per-key action caps, the local moderation mirror, and delayed Twitch resolution |
| `node --check` on the scripts in index.html, artifact.html and overlay.html | OK |
| Playwright, artifact.html at 375px (and index.html at 1280px): case of the day → verdict → Appeals Court (7) → Supreme Court (9) | no horizontal overflow at any step; no JS errors; button disabled after Tier 3. Overlay rendered at 1920×1080 with a 9-seat bench that fits its panel |
| `business/model.xlsx` recalculated with LibreOffice headless | 0 formula errors, 1,502 formulas |

### What changed

1. **Honest jury framing (C1, C7, E9).** Everywhere now says: a jury is five AI juror personas; the verdict is computed in a GenLayer Intelligent Contract and only stands if GenLayer's independent validators, each running its own AI model, agree; appeals escalate to bigger panels. Tagline: "Five AI jurors. Checked by a network nobody controls. Appeal to a higher court." I removed "5 different AI models vote", "nobody (including me) can rig", "five AIs nobody controls", "no other stack", "first consumer app", the model-slot column and the "five different models" sheet copy. "Injection-proof" is now explicitly banned in README and brand. No model vendors are named in consumer copy.
2. **Tiers 5 / 7 / 9 (E4, C10, C12, §4).** Contract: `TIER_JURORS = {1: 5, 2: 7, 3: 9}`. `JUROR_LENSES` became `JUROR_PERSONAS` (Marlowe, Dahlia, Frank, Tiff, Theo, Augustine, Juno, plus the new Ines the Historian and Rook the Contrarian). Each prompt names its persona, and `get_case`/`get_config` return `juror_names`. Odd panels mean no two-entry ties (E5 is mostly moot). The prototype now runs the optional second appeal to the 9-seat Supreme Court (new icons and colors, checked for contrast on `robe`). The overlay scripts 3–2 → 4–3 overturn → 6–3 upheld. The brand guide, playbook and monetization doc all use the same ladder, the brand personas (Auntie/Lawyer/Gen-Z/Hater set deleted) and the GenLayer-docs N+2 figure. The DAIC source was replaced with the GenLayer appeals docs. The impossible "3–2 → 2–7" became "3–2 → 3–4 OVERTURNED".
3. **Appeal auth (E1, E2).** `POST /cases` returns `side_tokens[]` (random 24 bytes each; only SHA-256 hashes are stored). `/judge` and `/appeal` require `x-side-token`. The appealing side comes from the token, so only the loser can appeal. API-key callers now count against `PER_KEY_DAILY_ACTION_CAP`, and the one-shot `/judge` counts as both a case and an action.
4. **Appeal pricing, one policy (C2, C3).** Each user gets 1 free appeal per day; after that, prepaid credit: $1.99 for Tier 2 and $4.99 for the Supreme Court (`relayer/src/lib/credits.ts`, `POST /credits/grant` for the payment webhook, 402 when there's no credit). The "winner refund" and the $9.99 fourth tier are gone. The only refund is technical: a failed appeal transaction returns the free appeal or credit. The playbook, monetization doc, README and model all match. The model's appeal revenue now excludes free appeals (new inputs `free_t2` and `free_t3`; old `t3`/`p3`/`m3` retired to 0), and the monetization tables were updated from the recalculated values.
5. **Age 18+ (C5).** ToS, compliance notes, grant draft, playbook bio and streamer targeting, prototype footer and overlay all say 18+. The 13+/COPPA parental-consent path was removed.
6. **No real-name shaming (C6).** I removed the "Who's the toxic one?" rubric, every toxic line bank and the GUILTY stamp from both prototypes and the brand guide, and added "Better comeback" (also as a contract preset). Brand rule 3 now says to use handles or first names the users chose and never full real names of third parties. Roasts can't target race, religion, gender, sexuality, disability or body (contract prompt rule 5, plus a "judge the takes, never the people" rule 6). The prototype's simulator no longer rewards insults in roasts.
7. **Gambling framing (C4).** Day 24 now reads "chat backed the wrong side…" with a no-cash-value note. "Bet/wager" no longer appears in any copy (it stays only as a prohibition in ToS/guardrails).
8. **Factual fixes (C8, C9, C11, C13, C14, C15).** NY/FL thresholds are now sourced (Sweeppea, secondary; NY > $5,000, FL ≥ $5,000; judged skill contests generally exempt), marked "check current rules with counsel". The Arbitrum settlement claim and "no other stack" are cut, with a note to check GenLayer docs before naming a chain. ArbiFuel now says it does **not** offset GenLayer gas. The grant gas line is reconciled: $9K = $1,500/month on top of the self-funded $120 floor, and the milestones are only reachable with the grant (halve them without it). Kick and Quick judgment are marked roadmap. The Apple link-out source is flagged secondary. "First ever overturn" became "our first overturn", with a warning never to film real overturns with the prototype. The prototype simulator no longer leans toward the loser on appeal (measured over 300 synthetic cases: 22% overturn at Tier 2, 30% at Tier 3, from more seats and noise only).
9. **Twitch (E7).** After a verdict the Prediction stays LOCKED and resolves only when the appeal window closes (`TWITCH_APPEAL_WINDOW_SEC`, default 300, max 3600) or the case is final. An appeal cancels the pending timer, so it resolves once, on the standing winner. Tested both ways.
10. **Moderation pre-check (E3, E6 partial).** `relayer/src/lib/moderation.ts` now mirrors the contract's `CONTROL_PATTERNS` and invisible-character strip, enforces length caps, and adds banned phrases (threats, self-harm, doxxing) and a street-address PII pattern, all before any gas is spent. Patterns 9 and 10 were narrowed in **both** places, so "pick me up at 10" and "as AI will…" now pass (tested). `externalCheck` is still a stub and fails open; wire a provider and fail closed before launch.

### Still open
- Brand example cards: regenerated to the 5/7/9 spec (done after this review).
- **Gas assumption.** Tier 1 is now 5 juror passes (5x the old Tier 1). `cpc` ($0.10) is still an assumption: re-run `gltest --fee-profile`.
- **State is in memory.** Side tokens, credits and case meta are in-memory (E10), and `payerId` uses API key or IP. Use signed-in accounts and a DB before taking real payments.
- E8 (unbounded `daily_counts`/`refs`) and E11 (DNS rebinding) are unchanged.

---

## Assurance upgrade (2026-10-31)

Canonical product spec unchanged: 5/7/9 juror tiers, losing-side appeals with per-side tokens, 1 free appeal per day then credits, no money on outcomes, text only, 18+.

### Results

| Check | Result |
|---|---|
| `contracts: python -m pytest -q` | **162 passed, 1 skipped** (152 direct-mode on the real GenVM v0.2 SDK, 10 static schema checks; 1 live test skipped without `GENLAYER_LIVE=1`) |
| `genvm-lint check` / `genvm-lint typecheck` | pass / no type errors |
| `relayer: npm run typecheck` (src, tests, deploy) | clean |
| `relayer: npm test` | **69 passed, 1 skipped** (31 unit, 38 stand-in, 1 live skipped) |
| `make demo` | PASS |
| Guard mutation sweep (each guard deleted in turn, suite re-run) | **31 / 31 mutants killed** (list below) |
| `scripts/verify.sh` on a fresh copy with an empty `HOME` (cold pip, npm and GenVM caches) | see `docs/VERIFY_LOG.md` |
| studionet deploy + 3 live cases through the real relayer | see `docs/LIVE_EVIDENCE.md` |

### What changed

1. **Case package + receipt number.** `schemas/case-package.v1.json` and `schemas/verdict-receipt.v1.json`. The relayer canonicalises (sorted keys, UTF-8, no whitespace, integers only; RFC 8785 subset) and hashes the package. New contract method `open_case_package` re-derives the canonical bytes and digest and checks, in a fixed order shared with `relayer/src/lib/package.ts`: digest, consent and 18+ (exactly `true`), closed key sets, schema, entry sha256s, sanitised form, destination address = itself, submission deadline, moderation result, injection screen. The digest is stored per case as the **receipt number**; `judge`, `appeal`, `confirm_verdict`, `finalize`, `revoke` and `expire` all require it, history records reference it, and the same `requestKey` with a different package reverts. `appeal` takes `from_tier` so retries never double-escalate.
2. **Two-step finality.** `relayer/src/lib/finality.ts` models PENDING / ACCEPTED / FINALIZED_SUCCESS / FINALIZED_ERROR / STALE from the genlayer-js 1.1.8 fields (verified in `node_modules/genlayer-js/dist`: `statusName`, `txExecutionResultName`, `consensus_data.leader_receipt[0].execution_result`; plus `status_name` and numeric `status`, found live on studionet). Only FINALIZED + SUCCESS imports a receipt, renders a card, resolves Twitch or unlocks an appeal. The relayer polls `getTransaction` itself because `waitForTransactionReceipt({status: ACCEPTED})` returns on any decided state.
3. **On-chain finality attestation.** New `confirm_verdict(case_id, digest, tier)`: the relayer records that a tier's verdict is FINALIZED_SUCCESS. For package cases the contract requires it before the next appeal, and `revoke` reverts once it exists, so a winner can never kill the loser's appeal.
4. **Outbox → reconcile, inbox.** Intent fsync'd before broadcast, tx hash right after, every status change appended. `reconcile()` finds cases by requestKey / status / tier and only resubmits identical bytes when the effect is absent and the deadline has not passed (tested: landed-then-timeout, never-landed, past deadline, digest conflict). Inbox records are hash-chained (`prevHash`, `recordHash`); a tampered line fails the load.
5. **Contract pinning.** `EXPECTED_CONTRACT_CODE_DIGEST` required; checked at startup and before every submit via `gen_getContractCode`. Unsupported RPC refuses unless `ALLOW_UNVERIFIED_CONTRACT=true`. Studionet supports it and the digest matched.
6. **Cross-runtime fixtures.** `fixtures/` (valid, tampered-digest, malformed-llm, injection-attempt, consent-missing, expired-case, revoked-case), generated by an independent Python canonicaliser and consumed by both `contracts/tests/direct/test_fixtures.py` and `relayer/test/unit/fixtures.test.ts`. A 1-byte change fails at the same check with the same code in both runtimes.
7. **Test tiers.** `contracts/tests/{direct,static,live}`, `relayer/test/{unit,standin,live}`; README table. The stand-in chain is labelled as such in code and docs. Live tiers are read-only and skip without `GENLAYER_LIVE=1`.
8. **Privacy and consent.** Exact-boolean consent and 18+ gates in relayer and contract; closed package key sets; a test sends API keys, forwarded IPs, side tokens, admin/webhook/Twitch secrets and a callback URL with a secret and asserts none reaches the chain, the outbox or the inbox.
9. **Revocation, expiry, takedown.** `revoke` (before Tier 1 is confirmed final; clears texts from contract state; history keeps them), `expire` (pending past lifetime → stale), off-chain takedown. Opponent draft deadline (`VERDICT_DRAFT_TTL_SEC`, 410 after).
10. **Provenance.** Per-entry `entrySource` (fixed by surface) and `assurance` (`verified_participant` only via the draft flow, where each side submits its own take with its token). Labels on every card/API response say the digest proves which takes were judged, not that the verdict is correct.
11. **Operator safety.** `VERDICT_MODE=shadow` default (unknown → shadow): no gas, no Twitch, no credit debit, logged `would_submit`. Moderation fails closed (provider error → 503; no provider → refuse unless `MODERATION_ACK_LOCAL_ONLY=true`).
12. **Durable state.** Case meta (side-token hashes, appeals, finality and revocation flags) and drafts in `state.jsonl`; credits in `credits.jsonl` with user ids stored as unsalted sha256 (pseudonymous, not anonymous: an IP-based id reverses quickly; HMAC still to do, audit P2-8); files created 0600. Restart test included.
13. **Strictness fixes.** Out-of-range juror scores now fail (`[LLM_ERROR]`) instead of being clamped (spec change, old test replaced deliberately). `set_paused` requires a real boolean. Surface is required (no `api` default). Custom rubrics only on `api`; Settle It exactly 2 sides.
14. **Repo hygiene for stewards.** `Makefile` (`setup/test/lint/demo/verify`), `scripts/verify.sh`, `.github/workflows/ci.yml`, pinned `contracts/requirements.txt`, `deploy/deploy.ts`, `deploy/STUDIO_DEPLOY.md`, `examples/`, `make demo`.

### Guards and the tests that fail without them (mutation sweep)

Relayer: consent exact-true, 18+ exact-true, losing-side-only appeal, max appeals per case, FINALIZED_SUCCESS gate, FINALIZED needs execution SUCCESS, appeal needs a final + confirmed verdict, digest match before judge, digest re-read after judge, expiry, local revocation suppresses cards, revoke window closes at Tier 1 final, shadow mode, email PII screen, credit debit, contract pin, package digest check, draft deadline, provider fail-closed, durable credits default, durable state. Contract: consent, package digest, judge digest, expiry, revoked status, score range, `from_tier`, closed key set, revoke after confirmation, appeal needs confirmation. All 31 killed.

### Error-handling audit (every catch / fallback in `relayer/src` and the contract)

| Site | Behaviour | Verdict |
|---|---|---|
| `finality.ts pollFinality` catch | RPC error keeps the previous classification (PENDING by default) and retries; budget → STALE | fail closed (nothing fires) |
| `pipeline.ts submit` broadcast catch | records `broadcast_error`, rethrows | not swallowed |
| `pipeline.ts` `.catch` on fetching a failed tx | only words the error; op already failing | justified in comment |
| `pipeline.ts reconcile` catch | reports `error` for that op, continues with others | not swallowed (reported) |
| `pinning.ts` catch | unsupported / error states, both refuse submit (unless explicit opt-in for unsupported) | fail closed |
| `genlayer.ts getContractCode` catch | maps method-not-found to `UnsupportedRpc`, rethrows others | not swallowed |
| `moderation.ts` provider catch | 503, never pass | fail closed |
| `package.ts verifyPackage` catches | typed failure codes; unknown errors rethrown | fail closed |
| `journal.ts readAll` catch | `JournalCorrupt`, refuses to start | fail closed |
| `app.ts twitchCall` / Twitch create catch | logged; Twitch is a display side effect and never changes a verdict | justified in comment |
| `app.ts bg()` catch | logs residual background failures; each tracker handles its own failure path first | justified |
| `app.ts` `req.body ?? {}` | empty body → every required field missing → 400/422 | fail closed |
| `app.ts` `c.provenance ?? []` | label becomes "Provenance not recorded; not verified" (bug found in this audit and fixed: it rendered "undefined") | fail closed |
| `webhook.ts` catches | invalid URL → rejected; network error → retried then logged | justified |
| `liveRun.ts` catches (tool only) | record errors into the evidence file | tool, not runtime |
| contract `_verify_package` `except Exception` | → `not_canonical` revert | fail closed |
| contract `_parse_tx_time` `except Exception` | → `[EXPECTED] unparseable transaction datetime` revert | fail closed |
| contract leader `except Exception` | → `[LLM_ERROR]` revert, never a partial verdict | fail closed |
| contract validator `except Exception` | validator's own LLM failure → disagree | fail closed |
| contract `raw.get("reason", "")` | missing reason → empty string; reason is free text and never compared | justified |

No `.catch(() => [])`, and no fallback to `true`, `"live"` or `"final"` remains. Unknown statuses, tiers, surfaces, sources, assurances and modes are denied.

### Still needs a live-testnet check

1. **Bradbury.** Deploy and the three-case run were done on studionet only; Bradbury needs faucet GEN and may need explicit `fees`.
2. **UNDETERMINED / LEADER_TIMEOUT / VALIDATORS_TIMEOUT / CANCELED** are classified FINALIZED_ERROR. Not observed live; confirm whether a GenLayer appeal can later turn them into ACCEPTED.
3. **Execution ERROR receipt shape on Bradbury.** On studionet an ERROR execution was observed live (the on-chain revoke after `confirm_verdict` went FINALIZED / ERROR with the expected revert reason). Confirm `txExecutionResultName` on Bradbury.
4. **Validator disagreement.** Observed live on studionet (3 agree / 2 disagree on one Tier 1 jury, 3/1/1 on one Tier 2 jury), both still majority-agree in round 1. Leader rotation and an overturn on appeal were not observed.
5. **Transaction datetime format** on Bradbury (the contract fails closed if it is not ISO 8601 with a timezone; studionet passed).
6. **`gen_getContractCode` on Bradbury** (pinning).
7. **Twitch** is not exercised live (no Partner/Affiliate channel here).

### Still open (not in this pass)

* SPEC items outside this scope: signed-in accounts as payer (V-FUN-21), credit HOLD/CAPTURE states and grant idempotency on provider event id (V-FUN-22, V-SEC-07), DNS re-check for webhooks (V-SEC-08), webhook names `case.accepted` / `case.finalized` (V-FUN-18), relayer calling `finalize()` when the appeal window closes (V-FUN-10), per-side consent rows with timestamps (V-PRIV-02/03), HMAC-keyed IP counters (V-PRIV-09), retention job (V-PRIV-06), separate owner key at deploy (V-SEC-11).
* The free-appeal day counter and Twitch timers are in memory (a restart can grant an extra free appeal and drops pending Twitch timers; state and credits are durable).
* `confirm_verdict` is a relayer attestation: the contract cannot observe consensus finality itself. It is creator/owner-only and consistent across relayer and chain.
* NFKC/Unicode-version differences between Node ICU and CPython could make `sanitise(text) != text` for newly assigned characters; that fails closed (`not_sanitised`), it never judges different bytes.
