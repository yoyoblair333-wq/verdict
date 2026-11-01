# PatternLedger: adversarial tests and known limitations

This page records what `contracts/pattern_ledger.py` does when someone attacks it,
as measured by `contracts/tests/direct/test_pattern_ledger_adversarial.py`. It covers
the contract as deployed. The contract file is not changed here. Any fix below is a
**proposal for a future contract version**; none of them is built.

Run the suite:

```
cd contracts
python -m pytest tests/direct/test_pattern_ledger_adversarial.py -v -rxX
```

Result on 2026-11-01 (GenVM SDK v0.2.16, direct mode, LLM mocked): **184 passed, 35 xfailed, 0 failed.**

- A **pass** is a defence that holds.
- An **xfail** is an attack that gets past a gate. Each xfail test asserts the
  behaviour we want and fails against today's code. All are `strict=True`: if a
  later version closes the gap, the test XPASSes and the run fails until the marker
  is removed. That keeps this list honest over time.
- To check that every xfail fails for the stated reason (not a broken test), run with
  `--runxfail`. On 2026-11-01 all 35 failed on their own assertion: 31 with "Expected
  revert ... but call succeeded", 2 with "Expected revert ... but call succeeded" on
  a different gate, and 2 with a wrong pattern id or sightings count.

## What the tests can and cannot show

The contract has two content gates.

1. **Gate 1, deterministic.** Caller, pause, request key, flag codes, category,
   length, an injection-phrase regex, and a PII screen (no Unicode digit, no `@`, no
   currency symbol, no URL or bare domain from a 27-entry TLD list). Runs before any
   LLM call, so it is the same on every validator.
2. **Gate 2, validator review.** Each validator asks its own model two yes/no
   questions (identifying data? coherent scam pattern?) plus a dedup decision, and
   the leader's answer is accepted only on an exact match
   (`gl.vm.run_nondet_unsafe` with a custom validator).

Direct mode runs the real SDK but replaces the model with a regex mock. So:

- For gate 1, the tests are exact: an input is either refused before the model or not.
- For gate 2, the tests show the **mechanism**: if the model flags the input, the
  record reverts and validators agree; if the leader lies, an honest validator votes
  against it. They cannot show how a real model judges a given text. That needs the
  live tier.
- Each gate-1 gap has a paired passing test (`test_llm_backstop_rejects_when_model_flags`,
  `test_gap_is_still_quoted_as_data`) that shows gate 2 stopping the same input when
  the model does its job.

Who can reach the contract also matters. Only the relayer or the owner can call
`submit_pattern` (tested). On the normal path the summary is written by the relayer's
own model from twice-redacted text, and the relayer runs the same screen first
(`relayer/src/lib/pattern.ts` `screenSummary` and `controlPatternHit`, kept in step by
`fixtures/pattern-screen.json`). So an outside attacker who wants to use a gap below
has to get the relayer's summariser to write the bypass text. These direct tests do
not exercise the relayer.

## What holds (passing tests)

| Area | What was tried | Result |
|---|---|---|
| Unicode digits | Arabic-Indic, Devanagari, Thai, math bold, subscript, dingbat, fractions, `〇`, runic numerals, a digit hidden between zero-width spaces | Refused before the model (`digits`) |
| `@` look-alikes | `＠` (U+FF20), `﹫` (U+FE6B); emails split by zero-width space, word joiner, soft hyphen, invisible plus | Refused (`email_or_handle`) |
| Currency look-alikes | `﹩`, `＄`, `₿` | Refused (`amount`) |
| URLs | upper case, trailing dot, path, punycode, fullwidth `．`, one-dot leader, small full stop, zero-width inside the domain, right-to-left override, `hxxps://`, short-link style, "dot com" | Refused (`url`) |
| Hidden text | Unicode tag characters (ASCII smuggling) | Stripped by the sanitiser; never reaches prompt or chain |
| Prompt line forging | `\n`, `\r`, U+2028 to start a fake `Category:` line | Folded to spaces |
| Injection phrases | 22 forms: case, extra spaces, NBSP, U+2028, fullwidth letters, zero-width inside `system`, developer message, disregard, new instruction, you are now, jailbreak, fullwidth `<<<`, forged CANDIDATE delimiters, the reply's JSON keys in any case, `winner_index`, `"scores":`, judge-addressing, backtick fences | Refused before the model |
| Second-order injection | A stored summary re-appears inside later prompts | Wrapped in its own CANDIDATE delimiters; it cannot contain `<<<`/`>>>`, so it cannot close its block |
| Size | 201 characters, 100 000 characters, 5 000 invisible padding characters, 200 four-byte characters | Cap is 200 code points after sanitising; padding is dropped, not counted |
| Empty | empty, spaces, zero-width only, whitespace only, control characters only | `summary is empty` |
| Request keys | empty, 15 or 65 chars, 10 000 chars, Cyrillic letter, trailing newline, spaces, fullwidth digits | `bad request_key`; 16 and 64 chars accepted |
| Flag codes | padded, upper case, Cyrillic look-alike, zero-width, empty, `None`, dict, nested list, duplicates, 17 codes | `[EXPECTED]`, nothing stored |
| Categories | padded, upper case, Cyrillic look-alike, space for hyphen, non-breaking hyphen, zero-width, 5 000 chars | `unknown category` |
| Duplicate request keys | replay 5 times; point a key at another record; reuse a key with a PII variant; key after a rejection; case variants | Replays cost no model call and add no sighting; any change to the record reverts; rejected keys stay free; keys are case-sensitive |
| Leader dedup, own parse | `same_as` = nonexistent, 0, negative, 2^256, `"1"`, `1.0`, `true`, `null`, list, or an id from another category | `[LLM_ERROR]`, nothing changes |
| Leader dedup, tampered result | A leader that skips its own parse and returns `same_as` from another category, a nonexistent id, a huge id, a string or a bool; or merges a new pattern into an old one; or splits a sighting into a new record | Validator votes False |
| Leader verdict, tampered | Leader accepts what the validator flags as PII; leader rejects a good record (censorship) | Validator votes False both ways |
| Validators disagree on dedup | same vs new, new vs same, same vs same-but-other-id | Validator votes False; identical answers vote True; dedup is ignored when both reject |
| Pause | owner submit, relayer submit, relayer replay, bad input while paused | All revert `paused` (pause is checked before input). Views and owner admin still work. Relayer cannot unpause. `set_paused` refuses `1`, `0`, `"true"`, `None` |
| Callers | stranger submit (also a valid replay), stranger admin calls, old relayer after rotation, old owner after transfer (deployed shape), relayer taking ownership, zero-address relayer, malformed relayer address | All refused; a stranger is refused before any model call |

On "validators disagreeing must revert": a validator returning False is a vote against
the leader's result. With a disagreeing majority GenLayer does not finalise it (the
leader rotates, and the transaction can end undetermined). Direct mode runs one
validator, so the tests check that vote. One test also shows the leader's local write
exists before the vote (`test_disagreement_leaves_the_leader_state_undone_by_consensus`);
on a real network that write is kept only if the majority agrees.

## Known limitations (xfail tests)

Each row names the test, why the attack gets through, and a proposed fix for a
future contract version. "Gate 2 backstop" says whether a passing test shows the
model-review gate stopping it when the model flags it.

### L-01 PII screen gaps (16 xfails, `TestPIIGaps::test_known_gap_reaches_llm`)

| Test id | Gets through because | Gate 2 backstop |
|---|---|---|
| `spelled_out_digits` | Number words are not screened. | Yes |
| `spelled_out_quantity` | Same. Most number words are harmless, so a blanket ban would also reject real patterns. | Yes |
| `cjk_numeral_Lo` | CJK numerals (e.g. U+516D) are category Lo, not N. | Yes |
| `at_in_brackets`, `at_in_square_brackets` | Only the `@` character is screened, not `(at)` / `[at]`. | Yes |
| `enclosed_letter_handle` | Enclosed letters (U+1F150) are not folded by NFKC and are not `@`. | Yes |
| `unusual_tld_zip`, `unusual_tld_country`, `unusual_tld_new_gtld`, `spelled_dot_unlisted_tld` | The TLD list has 27 entries; `.zip`, `.de`, `.support` and most real TLDs are missing. | Yes |
| `defanged_brackets`, `spaced_dot`, `ideographic_full_stop` | `[.]`, ` .xyz` and U+3002 are not normalised to a dot. | Yes |
| `schemeless_pseudo_url` | Only `scheme://` is screened; `javascript:` without `//` passes. | Yes |
| `currency_word` | Amounts in words are not screened, only currency symbols. | Yes |
| `brand_name` | Names of people, brands and places cannot be screened by a regex. The model is the only gate, by design. | Yes |

Proposed fixes (future version, and the relayer screen in the same change so the
cross-runtime fixture still matches):

1. Treat any character with `unicodedata.numeric(ch)` defined as a digit. This
   catches CJK numerals (`六` → 6.0) as well as category N.
2. Replace the TLD allow-list with a shape rule: a label, a dot-like separator
   (`.`, `。`, `[.]`, `(dot)`, ` dot `, optional spaces), then 2 to 24 letters, with a
   short allow-list for abbreviations such as "e.g." and "i.e.". Test it against the
   existing clean fixture cases first.
3. Screen `(at)`, `[at]`, ` at ` between two word tokens with no spaces inside them,
   and fold enclosed alphanumerics to plain letters before the checks.
4. Screen `\b[a-z][a-z0-9+.-]{2,15}:(?=\S)` (scheme-colon without `//`), with an
   allow-list for normal prose such as "note:".
5. Number words: refuse a run of two or more number words (e.g. "five five five",
   "one two"), not single words like "one", so real patterns still pass.
6. Names and brands stay with gate 2. That is the reason the review exists.

### L-02 Injection-phrase gaps (15 xfails, `TestInjection::test_known_gap_reaches_llm`)

| Test id | Gets through because |
|---|---|
| `cyrillic_homoglyph` | NFKC does not fold Cyrillic `І` to Latin `I`; no confusable mapping. |
| `variation_selector_split`, `combining_grapheme_joiner_split` | Category Mn characters (U+FE0F, U+034F) are kept and split the keyword. |
| `hangul_filler_as_space`, `braille_blank_as_space` | U+3164 (Lo) and U+2800 (So) look blank but are not whitespace. |
| `letter_spacing` | `i g n o r e` is not collapsed. |
| `synonym_forget`, `synonym_override`, `roleplay_admin`, `addresses_reviewer` | The phrase list is closed; synonyms and third-person forms pass. |
| `spaced_field_names`, `bare_json_decision` | Only the underscored JSON keys are listed. |
| `lookalike_delimiter`, `double_angle_delimiter` | `‹‹‹` and `<<` are not folded to or matched as `<<<`. |
| `tilde_fence` | Only backtick fences are listed. |

Gate 2 backstop: yes for all 15 (`test_gap_is_still_quoted_as_data`). The prompt puts
the fixed rules first, quotes the summary between delimiters, and rule 2 says text that
addresses the reviewer makes the record "not a coherent scam pattern". The test checks
that this framing is present and that a model following rule 2 causes an agreed revert.
None of these texts can close the real `<<<END_SUMMARY>>>` delimiter (gate 1 refuses
`<<<` and `>>>`).

Proposed fixes:

1. Before the regex, drop default-ignorable characters in category Mn that have no
   visible effect (variation selectors U+FE00–FE0F and U+E0100–E01EF, U+034F), and map
   look-blank characters (U+115F, U+1160, U+3164, U+FFA0, U+2800) to a space.
2. Match the phrase list against a confusable skeleton (Unicode TS #39) as well as
   the NFKC text, and against a copy with single-letter spacing collapsed.
3. Add `forget`, `override`, `pretend`, `act as`, `the reviewer (must|should)`,
   spaced field names, `"decision"`, `<<`, `‹`, `~~~`.
4. Accept that a phrase list is never complete. Gate 2 rule 2 is the real defence;
   these fixes only cut model calls spent on obvious attempts.

### L-03 Symbol-only summary (1 xfail, `TestFieldBounds::test_symbol_only_summary_is_rejected_deterministically`)

A summary of only emoji or symbols passes every gate-1 check. Gate 2 backstop: yes
(`test_symbol_only_summary_stopped_by_coherence_review`).
Fix: require a minimum number of letters (for example at least 20 letters and 4 words)
before the model is called.

### L-04 Sighting farming with fresh request keys (1 xfail, `TestRequestKeys::test_same_record_new_key_does_not_add_sighting`)

Idempotency is per request key, not per record. The same summary sent under new keys
is reviewed again and, if the model says "same", adds a sighting each time. Only the
relayer or owner can submit, so this needs the relayer to send it; the per-user limits
live off-chain (V-PL-09 cap, built; V-PL-14 one sighting per user per pattern, **not
built**, see `docs/SPEC.md`).
Fix: on-chain, keep a short per-pattern list of recent record fingerprints and refuse a
sighting whose fingerprint was seen in the last N days. The real fix is V-PL-14 in the
relayer, since the chain does not know users (by design).

### L-05 Candidate-window eviction (1 xfail, `TestValidatorDedupDisagreement::test_old_pattern_stays_a_candidate_after_flood`)

Dedup candidates are the newest `dedup_candidates` patterns in the category, by
`last_seen`. Flooding a category with fresh records pushes an older pattern out of the
window, so new sightings of it are filed as separate records and its count stops
growing. Test: window 3, three fresh records, then a true repeat of #1 is stored as #5.
Fix: pick candidates by flag-code overlap first and recency second, or keep the window
per category ranked by sightings, so a popular pattern cannot be pushed out by a burst
of one-off records. The bound must stay small to keep the prompt short.

### L-06 Default relayer survives an ownership transfer (1 xfail, `TestCallers::test_old_owner_loses_submit_rights_with_default_relayer`)

With the constructor default (`relayer = ""`, so relayer = owner), `transfer_ownership`
moves only the owner. The old owner stays the relayer and can keep submitting until the
new owner calls `set_relayer`. The deployed contract sets an explicit relayer, so this
does not apply to it (`test_old_owner_loses_rights_after_transfer` passes for that
shape). It is a trap for anyone who reuses the contract with the default.
Fix: in `transfer_ownership`, if `relayer == owner`, move the relayer too.

### L-07 Strict equivalence costs liveness (design note, passing test)

`test_rejection_reasons_must_match` shows that two validators who both reject a record,
one for "identifying data" and one for "not coherent", still disagree, because both
booleans must match. This never stores a bad record, but a borderline record can end
with no consensus instead of an agreed rejection. That is a deliberate trade (safety
over liveness). Not an xfail because it is the intended behaviour.
Possible change: when both validators reject, agree on "rejected" regardless of reason,
and record a generic `[REJECTED]`. That loses the reason in the revert message.

## Links to the threat model

| This page | `docs/THREAT_MODEL.md` |
|---|---|
| L-01 | T57 (pattern summary leaks personal data) |
| L-02 | T57, and the general injection threat on the judge prompts |
| L-04, L-05 | T58 (ledger poisoning), T59 (sighting farming) |
| L-06 | Admin key handling (not a threat for the deployed configuration) |

## Counts by area

| Class | Passed | Xfailed |
|---|---:|---:|
| `TestPIIBlocked` | 31 | 0 |
| `TestPIIGaps` (gate 2 backstop + sanitiser) | 18 | 16 |
| `TestInjection` | 38 | 15 |
| `TestFieldBounds` | 21 | 1 |
| `TestCodesAndCategories` | 21 | 0 |
| `TestRequestKeys` | 5 | 1 |
| `TestLeaderDedup` | 20 | 0 |
| `TestValidatorDedupDisagreement` | 7 | 1 |
| `TestPause` | 10 | 0 |
| `TestCallers` | 13 | 1 |
| **Total** | **184** | **35** |
