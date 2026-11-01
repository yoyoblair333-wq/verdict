# Milestone 1: Red Flag Court on-chain ("Is this message a scam?")

Status: **owner deployment live on studionet** at `0x997E686B2A5A83e1C8f8E9F15CCB487b1893DDb0`, deployed 2026-11-01 from the owner's own wallet `0x920fbbCf2106B693A857D1995c198e341220a46A` in GenLayer Studio ([deploy/OWNER_DEPLOY.md](../deploy/OWNER_DEPLOY.md) section I). `get_config`: owner `0x920fbbCf2106B693A857D1995c198e341220a46A`, relayer `0x34653Fb290480a8C99B4D92D4857123B5624c37d`. It supersedes the throwaway test deployment `0x5eDbd538e7fc22F07a01d86051c0B82e230C14be` (relayer key as owner). The web section still sits behind `?redflag=1`.

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

## Evidence (studionet, owner deployment `0x997E686B2A5A83e1C8f8E9F15CCB487b1893DDb0`, 2026-11-01)

Full record: [docs/live/red-flag-court-run.json](live/red-flag-court-run.json) and [docs/live/red-flag-court-browser-run.json](live/red-flag-court-browser-run.json). The stored code matches `contracts/red_flag_court.py` (canonical sha256 `19d50b70…cf9e`, `code_pin: match`; the raw stored bytes hash to the same value). The run used the relayer key only as the contract's relayer role; it did not deploy anything. Run 17:51:36Z → 17:54:10Z for steps 1–7, each then tracked to finality.

| Step | Tx | Result |
|---|---|---|
| Deploy (owner's wallet, GenLayer Studio) | `0x8a7adb9c498f422d295fff20515ffc224bc6393124bcc0eb912da776bd0af2a6` | FINALIZED · SUCCESS; validators agree 4 / idle 1 |
| 1. Redacted parcel-fee message | `0x00d76b8995e2aafca87e9de111d67fd1e3998e8eb2adfa5f58c6d89c1cf3dd44` | FINALIZED · SUCCESS, **SCAM** (category delivery); validators agree 3 / idle 2 |
| 2. Ordinary message between friends | `0x982d51ca80c5c586d978e4cc6fca12f09aedd18110e1b8d7ddb3f207fee7a0be` | FINALIZED · SUCCESS, **LEGIT**; validators agree 3 / idle 2 |
| 3. Unredacted message (digits and a domain) | `0x30137368956f349fe98bf34c9565ac53388a669d5873d5f8beac0d37afb23891` | FINALIZED · ERROR, `[REJECTED] text is not redacted (digits); redact it first`, as designed; nothing stored |
| 4. Appeal of check 1 to 3 analysts | `0xb6e3c6ba857975525d9ee50bae707e6011e3e974a353a584ab8be0e76490271d` | FINALIZED · SUCCESS, **SCAM 3-0**; validators agree 3 / idle 2 |
| 5. Opt-in share (creator) | `0x2a8bb72cabced8febdf4ef2ef6a30ed33823e1b767075950808de2640ab79e0a` | FINALIZED · SUCCESS |
| 6. Relayer submits the abstract pattern to the owner PatternLedger `0x59C6…aE4D` | `0xcfb5b6fe170898e3f3a095609ae577e2f60718ab939de8385d51f0bf206277ce` | FINALIZED · SUCCESS; validators counted it as a **sighting of pattern #1** |
| 7. `mark_shared(1, 1)` | `0x599368502ac26d3ab99c751aeac05a811e7a3a890862bce3aa5ad99dae20806d` | FINALIZED · SUCCESS, check 1 now links to ledger pattern #1 |
| Browser-signed check 3 (visitor burner `0x45e1…A284`, `?redflag=1`, Playwright) | `0x5efc3a06537416500fd1486e780cf05715751fad76b3b9a0338d0305aabf7410` | FINALIZED · SUCCESS, **SCAM**; validators agree 3 / idle 2; the page's status rail ended on Final |

Note: step 6 wrote to the **owner** PatternLedger with the relayer key, the role that contract gives the relayer. Pattern #1's sighting count went up by one. The messages are fictional.

### Earlier throwaway test deployment `0x5eDbd538e7fc22F07a01d86051c0B82e230C14be` (2026-11-01, superseded)

Same code (canonical sha256 `19d50b70…cf9e`), deployed and owned by the relayer key. Same 8-step run: deploy `0xd9be3121…6dae`; SCAM `0xdd4cbe19…4c3b`; LEGIT `0x554c4971…6fe6`; refused unredacted `0x47124510…e19e`; appeal SCAM 3-0 `0xf495737e…bb2d`; opt-in `0xa60d9028…f485`; ledger sighting `0x47b6b0e3…21bc`; mark_shared `0xd12332d0…858d`; browser check `0x6a26150c…4203` (SCAM). Records: [red-flag-court-run-testdeploy.json](live/red-flag-court-run-testdeploy.json), [red-flag-court-browser-run-testdeploy.json](live/red-flag-court-browser-run-testdeploy.json).

### Earlier throwaway deployment `0xBaF13Ec3fe990868804f69aB2b53558F0ADE81CE` (2026-11-01, superseded)

Same 8-step run on the previous source (literal characters in `_INVISIBLE_RE`): deploy `0x6402a08e…613b`; SCAM `0xaba4140b…711c`; LEGIT `0xb5da0e97…12af`; refused unredacted `0x68ed1308…4a63`; appeal SCAM 3-0 `0x90b42773…6d3a`; opt-in `0xb4a8e744…b1fb`; ledger sighting `0x0281b4d7…a0a2`; mark_shared `0x4b198017…89af`; browser check `0x0fe86098…4d67`. Records: [red-flag-court-run-0xBaF13Ec3.json](live/red-flag-court-run-0xBaF13Ec3.json), [red-flag-court-browser-run-0xBaF13Ec3.json](live/red-flag-court-browser-run-0xBaF13Ec3.json).

## How to verify

1. Source and tests: `git checkout milestone-1 && bash scripts/verify.sh`. It runs genvm-lint check and typecheck on all three contracts, and the direct-mode suite against the real GenVM SDK with the LLM mocked. That suite includes `contracts/tests/direct/test_red_flag_court.py`: 34 tests covering consensus agree and disagree, the privacy gates, appeals, ties and opt-in. `contracts/tests/static/test_no_hidden_unicode.py` checks that the file has no hidden or bidirectional Unicode characters.
2. Web: build the branch and open `web/dist/index.html?redflag=1` (or the Pages site once merged). Click "Fill in a sample message". The preview shows the exact redacted text. Tick both boxes and click "Ask the court".
3. Chain: call `get_check(1)`, `list_recent(10)` and `get_config` on `0x997E686B2A5A83e1C8f8E9F15CCB487b1893DDb0` in GenLayer Studio (<https://studio.genlayer.com/?import-contract=0x997E686B2A5A83e1C8f8E9F15CCB487b1893DDb0>; explorer: <https://explorer-studio.genlayer.com/address/0x997E686B2A5A83e1C8f8E9F15CCB487b1893DDb0>), and `get_pattern(1)` on PatternLedger `0x59C6047571bCE66828C733330fc9B5C88afEaE4D`.

## Still to do before submitting as a Milestone

1. ~~The owner deploys RedFlagCourt from her wallet~~ Done 2026-11-01 (`0x997E…DDb0`).
2. ~~Re-run `scripts/redflag_live.mjs` against the owner deployment and point `web/src/config.js` at it~~ Done 2026-11-01 (table above).
3. Merge to main (the section stays behind the flag until the owner turns it on), and submit as a Milestone after the VERDICT project is accepted.
