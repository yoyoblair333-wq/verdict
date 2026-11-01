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

## Evidence (studionet, throwaway deployment `0xBaF13Ec3fe990868804f69aB2b53558F0ADE81CE`)

Full record: [docs/live/red-flag-court-run.json](live/red-flag-court-run.json) and [docs/live/red-flag-court-browser-run.json](live/red-flag-court-browser-run.json). The stored code matches `contracts/red_flag_court.py` (canonical sha256, `code_pin: match`).

| Step | Tx | Result |
|---|---|---|
| Deploy (relayer key) | `0x6402a08ed36f2cbd0e6600e80f1c3a4162905d3f5521622c8fe08ef21708613b` | FINALIZED · SUCCESS |
| 1. Redacted parcel-fee message | `0xaba4140bbfd5c7a63f9caff373e25584d8dbcfd50fe33f313ff4e4bfa6ac711c` | FINALIZED · SUCCESS, **SCAM**, validators agree 3 / idle 2 |
| 2. Ordinary message between friends | `0xb5da0e9736471f8009ece660e5318f6c9a6d0457b50a49fdc879212b671412af` | FINALIZED · SUCCESS, **LEGIT** |
| 3. Unredacted message (digits and a domain) | `0x68ed1308bed4919ddccb4bca67ca7117e41f101d55b818b04b40aee925db4a63` | FINALIZED · ERROR, `[REJECTED] text is not redacted (digits)`, as designed |
| 4. Appeal of check 1 to 3 analysts | `0x90b427731df32f185dd45db0da3ba7e537ecd5ab6baade67e5ecd1b650c56d3a` | FINALIZED · SUCCESS, **SCAM 3-0** |
| 5. Opt-in share (creator) | `0xb4a8e744fb5d09c05c8f1dc83c60a54b96711d91b5b8648a4138a6fc333bb1fb` | FINALIZED · SUCCESS |
| 6. Relayer submits the abstract pattern to the owner PatternLedger `0x59C6…aE4D` | `0x0281b4d7cc547dd35e3e10bbf144d37c08a47cf391e510cff98eedd319c2b0a2` | FINALIZED · SUCCESS; PatternLedger's validators judged it the same pattern as #1, so it counted as a **sighting of pattern #1** |
| 7. `mark_shared(1, 1)` | `0x4b1980174e885ce97e485cfa3a847a79000e42ec9c2928bda1172fc3fe5089af` | FINALIZED · SUCCESS, check 1 now links to ledger pattern #1 |
| Browser-signed check (visitor burner, `?redflag=1`, Playwright) | `0x0fe86098a425ad7925df8591667688abc37d9a5fd1c9bfb5cfb02bf30c114d67` | **SCAM**, check #3 |

Note: step 6 wrote to the **owner** PatternLedger with the relayer key, the role that contract gives the relayer. Pattern #1's sighting count went up by one.

## How to verify

1. Source and tests: `git checkout milestone-1 && bash scripts/verify.sh`. It runs genvm-lint check and typecheck on all three contracts, and the direct-mode suite against the real GenVM SDK with the LLM mocked. That suite includes `contracts/tests/direct/test_red_flag_court.py`: 34 tests covering consensus agree and disagree, the privacy gates, appeals, ties and opt-in.
2. Web: build the branch and open `web/dist/index.html?redflag=1` (or the Pages site once merged). Click "Fill in a sample message". The preview shows the exact redacted text. Tick both boxes and click "Ask the court".
3. Chain: call `get_check(1)`, `list_recent(10)` and `get_config` on `0xBaF13Ec3fe990868804f69aB2b53558F0ADE81CE` in GenLayer Studio, and `get_pattern(1)` on PatternLedger `0x59C6047571bCE66828C733330fc9B5C88afEaE4D`.

## Still to do before submitting as a Milestone

1. The owner deploys RedFlagCourt from her wallet ([deploy/OWNER_DEPLOY.md](../deploy/OWNER_DEPLOY.md) section I).
2. Re-run `scripts/redflag_live.mjs` with `REDFLAG_ADDRESS` set to the owner deployment, and point `REDFLAG_ADDRESS` in `web/src/config.js` at it.
3. Merge to main (the section stays behind the flag until the owner turns it on), and submit as a Milestone after the VERDICT project is accepted.
