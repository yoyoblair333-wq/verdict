# Milestone 1: Red Flag Court on-chain ("Is this message a scam?")

Status: **candidate on branch `milestone-1`, not merged to main.** It is live on studionet as a **throwaway test deployment from the relayer key**. The owner deployment from the owner's wallet is a later step ([deploy/OWNER_DEPLOY.md](../deploy/OWNER_DEPLOY.md) section I).

## What is new compared with the accepted VERDICT project

| | VERDICT project (main) | Milestone 1 (this branch) |
|---|---|---|
| Question decided | Who made the better take (entertainment) | Is this message a scam? SCAM / SUS / LEGIT |
| Contract | JudgeRouter, PatternLedger | **New third contract:** `contracts/red_flag_court.py` (RedFlagCourt). The deployed contracts are unchanged. |
| Red Flag Court | Off-chain only, LLM provider stubbed (relayer) | **On-chain**, validator consensus on the label, appealable 1 → 3 → 5 analysts |
| Privacy | PatternLedger stores abstract patterns written by the relayer | The visitor's browser redacts the pasted message (`web/src/lib/chainredact.js`, built on the relayer's `redact.ts`), shows the exact text that will be published, and the contract refuses anything that still has digits, "@", amounts or links. The analyst panel also refuses a check that still identifies a private person (consensus-checked). |
| Link to the ledger | Relayer writes patterns directly | Opt-in by the person who asked (`set_share`), relayer submits the analysts' abstract summary to PatternLedger (which runs its own consensus privacy review), then `mark_shared` links the two on-chain |
| Web | Case court, ledger read-only | "Is this message a scam?" section behind a feature flag (`?redflag=1`), signed by the visitor's own testnet burner, with appeal and opt-in buttons |

## Why it strengthens the trust problem

Asking one company's chatbot, or a stranger online, "is this a scam?" means trusting one model and one operator. Here no single model decides: every GenLayer validator re-runs the analyst panel with its own model and the label is written only if they agree. The result is public and checkable, and the person can appeal to a bigger panel.

## What consensus covers, exactly (honest scope)

* Validators must reach the **same majority label** (SCAM, SUS or LEGIT) and the **same decision on whether the text still identifies a private person**.
* The leader's flag codes, category, one-line reason and abstract pattern summary are stored as the leader wrote them, after deterministic checks every validator re-applies: fixed enums, length caps, and the same digits / "@" / amount / link screen. They are explanations, not consensus outputs.
* Ties in a panel resolve to SUS (the cautious middle).
* Redaction is best-effort. It can miss a person's name, which is why the panel's refusal gate exists. The design brief originally kept Red Flag Court off-chain and private for this reason. The on-chain version is a separate, consented, redacted path, and the off-chain relayer flow is unchanged.

## Evidence (studionet, throwaway deployment `0x5eDbd538e7fc22F07a01d86051c0B82e230C14be`, 2026-11-01)

Full record: [docs/live/red-flag-court-run.json](live/red-flag-court-run.json) and [docs/live/red-flag-court-browser-run.json](live/red-flag-court-browser-run.json). The stored code matches `contracts/red_flag_court.py` (canonical sha256 `19d50b70…cf9e`, `code_pin: match`).

This redeploy exists because the source changed: `_INVISIBLE_RE` now lists the zero-width and bidi characters it strips as `\u` escapes instead of literal characters, so GitHub no longer shows a hidden-Unicode warning on this file. The regex is identical (`contracts/tests/static/test_no_hidden_unicode.py` checks both).

| Step | Tx | Result |
|---|---|---|
| Deploy (relayer key) | `0xd9be31214f49bb82687f0e4d1c750a976a9ffe12b2370554bd6be9cfac636dae` | FINALIZED · SUCCESS |
| 1. Redacted parcel-fee message | `0xdd4cbe199ec2ac28f87d747899efe66ed688258386d16db1f45728c217524c3b` | FINALIZED · SUCCESS, **SCAM**, validators agree 4 / idle 1 |
| 2. Ordinary message between friends | `0x554c497106445bdf7af510ed196927641548957dfa19f99ccad033c84b686fe6` | FINALIZED · SUCCESS, **LEGIT** |
| 3. Unredacted message (digits and a domain) | `0x471245103b36340c9e9aa5df28cbe99fc3b35c836ef3c70c13a37768455be19e` | FINALIZED · ERROR, `[REJECTED] text is not redacted (digits); redact it first`, as designed |
| 4. Appeal of check 1 to 3 analysts | `0xf495737edb9f712fc7945b229dea523b08e359547a1136bac0e052a8bc52bb2d` | FINALIZED · SUCCESS, **SCAM 3-0**; validators agree 3 / disagree 1 / idle 1 |
| 5. Opt-in share (creator) | `0xa60d9028beb7a863df7a0cceeb60c72b1c2b4130e9127ad56eee8ca78acbf485` | FINALIZED · SUCCESS |
| 6. Relayer submits the abstract pattern to the owner PatternLedger `0x59C6…aE4D` | `0x47b6b0e3248d9c28bdb6f52914e2b372010f67b5f31d9b1734feb8e5970221bc` | FINALIZED · SUCCESS; counted as a **sighting of pattern #1** |
| 7. `mark_shared(1, 1)` | `0xd12332d0952f9e7643edfa91f56d4cf16d7be291b021f1d82ce3e2d082b2858d` | FINALIZED · SUCCESS, check 1 now links to ledger pattern #1 |
| Browser-signed check (visitor burner, `?redflag=1`, Playwright) | `0x6a26150cfce0977aba57665f5ac02c60696e2414ce5fbdeffe46289887474203` | **SCAM**; the page's status rail ended on Final |

Note: step 6 wrote to the **owner** PatternLedger with the relayer key, the role that contract gives the relayer. Pattern #1's sighting count went up by one.

### Earlier throwaway deployment `0xBaF13Ec3fe990868804f69aB2b53558F0ADE81CE` (2026-11-01, superseded)

Same 8-step run on the previous source (literal characters in `_INVISIBLE_RE`): deploy `0x6402a08e…613b`; SCAM `0xaba4140b…711c`; LEGIT `0xb5da0e97…12af`; refused unredacted `0x68ed1308…4a63`; appeal SCAM 3-0 `0x90b42773…6d3a`; opt-in `0xb4a8e744…b1fb`; ledger sighting `0x0281b4d7…a0a2`; mark_shared `0x4b198017…89af`; browser check `0x0fe86098…4d67`. Records: [red-flag-court-run-0xBaF13Ec3.json](live/red-flag-court-run-0xBaF13Ec3.json), [red-flag-court-browser-run-0xBaF13Ec3.json](live/red-flag-court-browser-run-0xBaF13Ec3.json).

## How to verify

1. Source and tests: `git checkout milestone-1 && bash scripts/verify.sh`. It runs genvm-lint check and typecheck on all three contracts, and the direct-mode suite against the real GenVM SDK with the LLM mocked. That suite includes `contracts/tests/direct/test_red_flag_court.py`: 34 tests covering consensus agree and disagree, the privacy gates, appeals, ties and opt-in. `contracts/tests/static/test_no_hidden_unicode.py` checks that the file has no hidden or bidirectional Unicode characters.
2. Web: build the branch and open `web/dist/index.html?redflag=1` (or the Pages site once merged). Click "Fill in a sample message". The preview shows the exact redacted text. Tick both boxes and click "Ask the court".
3. Chain: call `get_check(1)`, `list_recent(10)` and `get_config` on `0x5eDbd538e7fc22F07a01d86051c0B82e230C14be` in GenLayer Studio, and `get_pattern(1)` on PatternLedger `0x59C6047571bCE66828C733330fc9B5C88afEaE4D`.

## Still to do before submitting as a Milestone

1. The owner deploys RedFlagCourt from her wallet ([deploy/OWNER_DEPLOY.md](../deploy/OWNER_DEPLOY.md) section I).
2. Re-run `scripts/redflag_live.mjs` with `REDFLAG_ADDRESS` set to the owner deployment, and point `REDFLAG_ADDRESS` in `web/src/config.js` at it.
3. Merge to main (the section stays behind the flag until the owner turns it on), and submit as a Milestone after the VERDICT project is accepted.
