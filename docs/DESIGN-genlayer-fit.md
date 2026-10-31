# Design brief: make VERDICT something GenLayer wants (v1, 2026-10-31)

Owner: lead.

**Goal.** Every verdict that circulates in public is decided on GenLayer, and the consumer games feed a real on-chain adjudication record. Free private play stays cheap and off-chain.

## 1. Publish = network check (supersedes ADR-018 item 1)

**Private vs public.**
- A Settle It case starts as a private **Quick Verdict**, which is the preview.
- When either side taps **Publish**, the case is re-heard on GenLayer as an on-chain Tier 1 case with 5 jurors and validator agreement.

**Consent.**
- **Both** sides must accept notice `publish-onchain-v1`: "Your takes become public and permanent."
- If the other side hasn't consented, Publish waits. It does not go ahead.
- A side can withdraw its own consent at any time before submission.

**The network's ruling is the one that counts.**
- The published card shows the network's ruling, its receipt number and "Checked by GenLayer · Finalized".
- If the network's winner differs from the preview's, the card shows **"The network overruled the preview."** That's an honest moment and a dramatic one.

**Cost to the user.** Publishing is **free**: VERDICT pays the fee, capped at 3 publishes per user per Los Angeles day. Publishing is **not** an appeal.

**Appeals after publishing.** The normal ladder is restored:
- Appeal 1: Tier 2, 7 jurors. Uses the daily free appeal, or costs $1.99.
- Appeal 2: Tier 3, the 9-seat Supreme Court. Costs $4.99.
- Only the losing side can appeal. The maximum is 2 appeals.

**Unpublished cases.** They can never be appealed. "Appeal" in the UI on a Quick Verdict means "Publish first".

**Contract.** No change needed: Publish uses the existing `open_case_package` path.

## 2. Scam Pattern Ledger (new Intelligent Contract `pattern_ledger.py`)

**Opt-in only.** After a Red Flag Court SCAM or SUS ruling, the user may tap **"Help warn others"**. The default is off.

**What the relayer submits.** A *pattern record*, never the message:
- `flag_codes`: a subset of the fixed 16-code list.
- `category`: from a fixed enum, for example delivery, account-lock, romance, job, prize, investment, impersonation, other.
- `summary`: 200 characters or fewer. It is an abstract paraphrase written by the relayer's LLM from the *redacted* text, with instructions to remove every name, number, link, brand and amount.

**Non-deterministic check.** Validators each independently judge two questions:
- (a) Does the summary contain **any** personal or identifying data, brand, link, number or amount?
- (b) Do the summary and codes describe a coherent scam pattern?

A record is stored only if the validators agree on **(a) = no AND (b) = yes**. Otherwise it reverts with `[REJECTED]`. Equivalence uses `run_nondet_unsafe` with a custom validator that recomputes both booleans and compares them.

**Deduplication.**
- If the codes plus category match an existing pattern whose summary the validators judge "same pattern", the existing record's `sightings` count goes up by 1 and no new record is created.
- Keep it simple: the leader proposes either "new" or "same as id N", and validators check that proposal.

**Views.**
- `get_pattern(id)`
- `list_recent(n)`
- `top_patterns_since(timestamp, n)`, which feeds the weekly **"Scams going around"** digest. The digest becomes on-chain-backed, with a receipt per pattern.

**Privacy and limits.**
- No sender, no user id, no message text, and no hash of the message.
- Rate limit: 5 submissions per user per day.
- The relayer redacts twice before generating the summary.

**Proof layer.** The digest and the Proof tab show "Recorded on GenLayer · N sightings". The front layer stays plain.

**Gate.** It ships in SHADOW mode until counsel signs off, as per the ADR-014 stance.

## 3. Positioning
- **Message:** "Internet Court is for AI agents. VERDICT is the people's court."
- VERDICT is a consumer complement to GenLayer's own adjudication story, not a competitor.
- Avoid the word "arbitration". Never claim affiliation with GenLayer.

## 4. GenLayer usage this creates

Every activity below is a GenLayer decision:
- each published case
- each appeal
- each Hall of Contempt testnet re-run
- each self-chosen Jailbreak re-check
- each pattern record or dedup sighting

**Key metric to report:** on-chain decisions per week.
