# VERDICT architecture diagrams

Eight sheets in one visual language, drawn for a reader who needs to know who controls what. Each is a standalone 1600px-wide SVG with subsetted Big Shoulders Display and Schibsted Grotesk embedded, so it renders identically everywhere, plus a PNG at real size.

| Sheet | File | What it answers |
|---|---|---|
| D1 | [system-topology.svg](system-topology.svg) ([png](system-topology.png)) | The three surfaces, relayer, GenLayer network, Twitch and the payment provider. Trust boundaries, who controls each zone, what each zone never holds, and the numbered path from submit to card (steps 1 to 14). |
| D2 | [case-lifecycle.svg](case-lifecycle.svg) ([png](case-lifecycle.png)) | Every case state: moderation and consent rejection, REVOKED, PENDING, ACCEPTED, FINALIZED_SUCCESS, FINALIZED_ERROR, STALE (deadline passes), shadow gate, appeal window, case closed, and the appeal loop. Includes the status rail mapping used by the app and overlay. |
| D3 | [appeal-ladder.svg](appeal-ladder.svg) ([png](appeal-ladder.png)) | 5, 7, 9 juror personas with the same icons and colours as the cards, who can trigger each tier, its price, and the validator check every tier must pass. |
| D4 | [data-boundary.svg](data-boundary.svg) ([png](data-boundary.png)) | Every data item classified PUBLIC-ON-CHAIN, CONFIDENTIAL or SECRET, and where it may live. The chain boundary is the case packager's allow-list. |
| D5 | [viral-loop.svg](viral-loop.svg) ([png](viral-loop.png)) | Argue, invite (sealed take), opponent joins, jury, card, appeal, second card, new users, with the K_opp and K_card measurement points, events, and targets. |
| D6 | [revenue-flow.svg](revenue-flow.svg) ([png](revenue-flow.png)) | Appeal credits, subscriptions, streamer tiers, sponsors and the developer API, through the payment provider, with the NO MONEY ON OUTCOMES boundary and the one allowed crossing (technical refund when a transaction fails). |
| D7 | [game-flows.svg](game-flows.svg) ([png](game-flows.png)) | Both security games. Red Flag Court: paste, browser redaction, approval, relayer redaction, safety check, Quick Verdict (off-chain), post-checks, ruling card. Jailbreak the Jury: door check (stopped at the door, blocked), practice court (private localnet), caught / overruled / mistrial / sealed, patch queue, PATCHED card, Hall, replay, opt-in and the testnet re-run with its short receipt (package digest). Five numbered redaction points. |
| D8 | [genlayer-decisions.svg](genlayer-decisions.svg) ([png](genlayer-decisions.png)) | Every point where VERDICT creates an on-chain GenLayer decision (docs/DESIGN-genlayer-fit.md section 4): publish (Tier 1 re-hearing), appeal 1 (7), appeal 2 (9), Hall of Contempt testnet re-run, self-chosen Jailbreak re-check, pattern record and dedup sighting. For each: the player trigger, the off-chain gate in the relayer, the decision and where it runs. Then what the decisions feed (cards, digest), what is never a decision, and the key metric, on-chain decisions per week. |

[verdict-system-sheet.png](verdict-system-sheet.png) is all eight on one sheet (3320px wide).

## How to read them

* **Trust boundary:** dashed box. The dark tab names the zone; the italic text beside it says who controls it.
* **Never holds:** the crossed-circle note inside a zone lists what must never be found there.
* **Arrows:** solid = command or request; dotted = event, callback or async delivery; blue = read or observe only.
* **Numbered discs:** steps of the main flow, in order.
* **Authority badge:** the key pill on a component says what it is allowed to do (sign transactions, write the verdict, resolve Predictions).
* **Colour:** legal-pad tint = public on-chain; blue tint = external service; robe = the Intelligent Contract; hatched robe = secret. Stamp red appears only on real stamps (UPHELD, OVERTURNED, NO MONEY ON OUTCOMES).
* **Redaction point:** ink bar with a number (R1, R2 ...): where text is hidden or removed. D7 lists each one under the lanes.
* Every sheet has a legend and an engineering title block (sheet, product, revision, source).

## Regenerate

```
python3 diagrams/source/build.py          # writes the eight SVGs (needs fonttools)
python3 diagrams/source/render.py         # PNGs at 1x and the composite sheet (needs playwright + chromium)
python3 diagrams/source/build.py d2 && python3 diagrams/source/render.py lifecycle   # one sheet
```

`diagrams/source/kit.py` holds the shared grammar (zones, nodes, states, arrows, labels, legend, title block, juror icons). Change a convention there, not per sheet.

Sources for the content: D8 follows docs/DESIGN-genlayer-fit.md v1 and the playbook re-check rules. D7 follows marketing/security-games-playbook.md §2, §3 and §8 and docs/DECISIONS.md ADR-013 to ADR-018. Other sheets: README.md (relayer API, appeal pricing, consensus design), brand/brand-guide.md (jurors, copy rules), marketing/viral-playbook.md (K_opp, K_card, targets), business/monetization.md (prices, marked there as assumptions). Status names (PENDING, ACCEPTED, FINALIZED_SUCCESS, FINALIZED_ERROR, STALE), REVOKED, the outbox, hash-chained inbox and shadow mode follow the canonical spec for the relayer.
