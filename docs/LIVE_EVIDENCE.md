# Live evidence: studionet

Every studionet deployment is recorded here. The **current** one matches `contracts/judge_router.py` (canonical code digest, pin below); the **earlier** ones are kept for the record (the first two no longer match the source; `0x3f867934…` runs the same code but was deployed by the throwaway key).

## Current deployment (2026-11-01)

Recorded by `relayer/src/tools/liveRun.ts`: the **real relayer in live mode** (HTTP routes, case packages, outbox, contract pin check, two-step finality, inbox, `confirm_verdict`) driving `genlayer-js` 1.1.8 against studionet. Rendered from [`docs/live/studionet-run.json`](live/studionet-run.json) by `scripts/live_evidence.py`.

This is the **owner deployment**: the same `contracts/judge_router.py` as the earlier deployment below, deployed on 2026-10-31 from the owner's own wallet (MetaMask) in GenLayer Studio, with the VERDICT relayer key passed as the constructor `relayer` (`daily_limit` 0). The owner and the relayer are now different keys: the owner wallet can pause, change the relayer and revoke; the relayer runs cases. The web app and `relayer/.env.example` point here. The code was pasted into Studio on Windows, so the stored bytes have CRLF line endings and no final newline; the pin compares the canonical code digest (line endings to LF, one final newline), which equals plain sha256 of the source file.

| Item | Value |
|---|---|
| Network / RPC | studionet, `https://studio.genlayer.com/api` |
| Contract address | `0xEe9AB3e45005E97dA53BFE570412f30D6F2C1e64` |
| Deploy tx | `0x83f46b045911a63ecdfcfb0992ef91a719037dd271f9a8c30f94f84a697c8a88`: FINALIZED, execution SUCCESS; validators agree 3, idle 2 |
| `get_config` roles | owner `0x920fbbCf2106B693A857D1995c198e341220a46A`, relayer `0x34653Fb290480a8C99B4D92D4857123B5624c37d` |
| Relayer key used for the run (throwaway) | `0x34653Fb290480a8C99B4D92D4857123B5624c37d` (same key as the earlier deployments) |
| Code pin | `gen_getContractCode` → canonical sha256 `7c18143cf8f5224d6f8cdccebcdcc70b3b584f0b9247bf55c8439d2fac10ca1b` = canonical sha256 of `contracts/judge_router.py` `7c18143cf8f5224d6f8cdccebcdcc70b3b584f0b9247bf55c8439d2fac10ca1b` = `EXPECTED_CONTRACT_CODE_DIGEST` (**match**) |
| Stored bytes | raw sha256 `6bfe51a77be80254a1572899044403bc54d193e32679226c7d6eabb33753f4da`: the code was pasted into GenLayer Studio on Windows, which stores CRLF line endings and drops the final newline. The pin compares the canonical form (line endings to LF, one final newline), which cannot hide any change to the code. |
| Run | 2026-11-01T01:57:41.849Z → 2026-11-01T02:11:28.410Z (827 s, 3 cases, 17 transactions) |

### The three cases

#### Who's right? (Settle It) (case id 1)

Receipt number (packageDigest): `98cd727ceac5f72004dd6ddf11f8619b663dc992ffa30e3d6bd4990265475394`

* POST /cases: HTTP 201, tx `0x82b1128c15577f2fc3d429ad62abf3a1f22311575fc493b9367617187ec5fa2f`, finality at response: ACCEPTED
* POST judge: HTTP 202, tx `0x44a3f10499d3fb9539e610603a8bfd68db59a6d22c599178789d45cd1737a83b`, finality at response: ACCEPTED
* **Tier 1 final**: winner entry 0, split 5-0, 5 jurors, mean scores [80, 34], reason: "Entry 0 gives a clear supporting rationale; Entry 1 relies on hyperbole instead of argument."
  * provenance label: "All takes submitted through Settle It; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."
* appeal -> Tier 2: HTTP 202, tx `0x9fab39801786910c99bded7ae01fcdb04d4a83e71074d9af83b72f3f5b7090a6`, finality at response: ACCEPTED, paid_with free
* **Tier 2 final**: winner entry 0, split 7-0, 7 jurors, mean scores [79, 34], reason: "Entry 0 gives a clear, relevant rationale; entry 1 relies on hyperbole rather than support."
* appeal -> Supreme Court: HTTP 202, tx `0xf417c0f6a1f40e9baaa3ca1a9c32c628d6bbdf969c384ceefd604be026fc1891`, finality at response: ACCEPTED, paid_with free
* **Supreme Court final**: winner entry 0, split 9-0, 9 jurors, mean scores [66, 34], reason: "Entry 0 gives a tasty rationale, while reasonable"

#### Better roast (Live Court) (case id 2)

Receipt number (packageDigest): `1bf9522629bd04a898823c954e78fc383f1e5d729564b7ddc8c3f0e9ba1200c2`

* POST /cases: HTTP 201, tx `0x7aee9bf02c3c3227473214cd2b83c9544e9c3f25ddef3886e5fd2d9fd2266d6a`, finality at response: ACCEPTED
* POST judge: HTTP 202, tx `0x1ecabc4c1c3b2a4711861cff1c48aaeb78dda8b6aa9a6aeb94b5e00a2107eff0`, finality at response: ACCEPTED
* **Tier 1 final**: winner entry 1, split 5-0, 5 jurors, mean scores [66, 90], reason: "More specific and relatable with a witty emotional twist."
  * provenance label: "All takes relayed by the stream host; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."
* appeal -> Tier 2: HTTP 202, tx `0x9f26a7927297178492dd76f27a7cea87de03759ab3ac7770516a60b207f6fd18`, finality at response: ACCEPTED, paid_with free
* **Tier 2 final**: winner entry 1, split 7-0, 7 jurors, mean scores [80, 90], reason: "Second entry is more original and cleverly targets a specific developer behavior rather than just general criticism."
* finalize (operator): tx `0x6d35097c0734e3ef178cf14e39ed4d06ab1f07eb61bda43c1b072f470e024bd4` → FINALIZED / execution SUCCESS
* status after finalize: {"status": "final"}

#### Pettiest text (API) (case id 3)

Receipt number (packageDigest): `f8d7bd2d5dbe08adb7366f1e0dc0ee577453600a098fc8807dc29fe46017715d`

* POST /cases: HTTP 201, tx `0xc936ba8d7394999b4ef37890f4e62ba5881e87ba73105326e7bf46aa04bd9b84`, finality at response: ACCEPTED
* POST judge: HTTP 202, tx `0x5a067ee197dce39f60c9fb0e0e9b99329435302acfb4e8b1d6d8e0be55128877`, finality at response: ACCEPTED
* **Tier 1 final**: winner entry 1, split 5-0, 5 jurors, mean scores [30, 80], reason: "Entry 1 is more impressively petty with its passive-aggressive birthday reminder threat, while Entry 0 is too brief to s"
  * provenance label: "All takes submitted by an API client; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."
* winner revoke via relayer (must be 409): HTTP 409, "the verdict is final; request a takedown instead (POST /cases/:id/takedown)"
* raw on-chain revoke after confirm_verdict (must revert): tx `0xbea18f58dea8eef3e671470c3f0412372927a954ee7b7e4bf4af8cc90689ef61` → FINALIZED / execution ERROR; revert reason `[EXPECTED] verdict is final; request an off-chain takedown instead`
* takedown (off-chain): HTTP 200, "Hidden from VERDICT's gallery and cards. The text remains in the public blockchain's history and cannot be erased.", `GET /cases/3` afterwards → HTTP 410

### Every transaction

Times are seconds after broadcast, as observed by the relayer's poller (3 s interval). Votes are the final `consensus_data.votes`.

| # | Call | Tx hash | Observed transitions | ACCEPTED | FINALIZED | Result | Validator votes |
|---|---|---|---|---|---|---|---|
| 1 | `open_case_package` | `0x82b1128c15577f2fc3d429ad62abf3a1f22311575fc493b9367617187ec5fa2f` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.2s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @50.4s | 6.2 s | 50.4 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 2 | `judge` | `0x44a3f10499d3fb9539e610603a8bfd68db59a6d22c599178789d45cd1737a83b` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @9.3s → ACCEPTED (SUCCESS) @43s → FINALIZED (SUCCESS) @74s | 43 s | 74 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 3 | `confirm_verdict` | `0x5b382692bac20aa491f95accf80dab8d05c0f17fd162bbe408e70bcf515199bc` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @38.2s | 6.2 s | 38.2 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 4 | `appeal` | `0x9fab39801786910c99bded7ae01fcdb04d4a83e71074d9af83b72f3f5b7090a6` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.2s → COMMITTING (SUCCESS) @12.4s → ACCEPTED (SUCCESS) @55.5s → FINALIZED (SUCCESS) @86.4s | 55.5 s | 86.4 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 5 | `confirm_verdict` | `0x1b591f7d52b08ffb4a6afa3d3e707a726154962dc4eff009570cca9ddd479533` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.2s → COMMITTING (SUCCESS) @6.3s → ACCEPTED (SUCCESS) @9.4s → FINALIZED (SUCCESS) @38.3s | 9.4 s | 38.3 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 6 | `appeal` | `0xf417c0f6a1f40e9baaa3ca1a9c32c628d6bbdf969c384ceefd604be026fc1891` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.2s → COMMITTING (SUCCESS) @40s → REVEALING (SUCCESS) @64.6s → ACCEPTED (SUCCESS) @67.6s → FINALIZED (SUCCESS) @95.4s | 67.6 s | 95.4 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 7 | `confirm_verdict` | `0x7e58be5895a52ec0b76e07be89fae0507d93c7b16a070e0551b1a3d9c80a04d3` | PENDING (UNKNOWN) @0.1s → REVEALING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @35.2s | 6.2 s | 35.2 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 5 |
| 8 | `open_case_package` | `0x7aee9bf02c3c3227473214cd2b83c9544e9c3f25ddef3886e5fd2d9fd2266d6a` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @47.3s | 6.2 s | 47.3 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 9 | `judge` | `0x1ecabc4c1c3b2a4711861cff1c48aaeb78dda8b6aa9a6aeb94b5e00a2107eff0` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @15.4s → ACCEPTED (SUCCESS) @36.8s → FINALIZED (SUCCESS) @67.7s | 36.8 s | 67.7 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 10 | `confirm_verdict` | `0xbcb035c42a040b3f3a5a3a9ff4e709f56e019084e1ae4660b2aa1e444838a45b` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @35.2s | 6.2 s | 35.2 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 11 | `appeal` | `0x9f26a7927297178492dd76f27a7cea87de03759ab3ac7770516a60b207f6fd18` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @12.3s → ACCEPTED (SUCCESS) @49.3s → FINALIZED (SUCCESS) @80.2s | 49.3 s | 80.2 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, disagree 1, idle 1 |
| 12 | `confirm_verdict` | `0xe9ecacd560114462a18d9d14a1dea0c6e35ac7acf54349fd1f5244a3aa511b7d` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @38.1s | 6.2 s | 38.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 13 | `finalize` | `0x6d35097c0734e3ef178cf14e39ed4d06ab1f07eb61bda43c1b072f470e024bd4` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @37s | 6.2 s | 37 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 5 |
| 14 | `open_case_package` | `0xc936ba8d7394999b4ef37890f4e62ba5881e87ba73105326e7bf46aa04bd9b84` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @53.5s | 6.2 s | 53.5 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 15 | `judge` | `0x5a067ee197dce39f60c9fb0e0e9b99329435302acfb4e8b1d6d8e0be55128877` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @9.3s → ACCEPTED (SUCCESS) @43.1s → FINALIZED (SUCCESS) @77s | 43.1 s | 77 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 16 | `confirm_verdict` | `0x69f1f3323f3ccf60de014e401a4125ad27ee9dfa3afc438bf165d6af232739b7` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.2s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @35.1s | 6.2 s | 35.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 17 | `revoke` | `0xbea18f58dea8eef3e671470c3f0412372927a954ee7b7e4bf4af8cc90689ef61` | PENDING (UNKNOWN) @0.1s → ACCEPTED (ERROR) @3.1s → FINALIZED (ERROR) @34s | 3.1 s | 34 s | FINALIZED / MAJORITY_AGREE / ERROR | agree 3, idle 2 |

### What this run shows

* **Two-step finality.** Jury transactions (`judge`, `appeal`) reached ACCEPTED after 36.8–67.6 s and FINALIZED after 67.7–95.4 s. Cards, the inbox receipt and `confirm_verdict` waited for FINALIZED + SUCCESS.
* **Execution result is separate from status.** `revoke` `0xbea18f58de…` reached FINALIZED with execution ERROR (`[EXPECTED] verdict is final; request an off-chain takedown instead`): the revocation window closed once Tier 1 was confirmed final.
* **Receipts.** The inbox holds 6 hash-chained FINALIZED_SUCCESS receipts whose `packageDigest` equals the on-chain receipt number.
* **Access.** Every write came from the relayer, which here is also the owner and the case creator. A stranger's `judge`, a non-owner `open_case`, and a relayer that is not the owner calling admin methods are refused by the contract; that is covered by the direct-mode tests, not by this run.

## Reproduce

The key file is written only if it does not exist yet, so this block can never overwrite the throwaway key that owns a deployment.

```bash
cd relayer && npm ci && npm run build
[ -e .env.local ] || node -e 'import("genlayer-js").then(m=>console.log("RELAYER_PRIVATE_KEY="+m.generatePrivateKey()))' > .env.local
set -a; . ./.env.local; set +a
GENLAYER_NETWORK=studionet NODE_USE_ENV_PROXY=1 npm run deploy          # prints address + digest
JUDGE_ROUTER_ADDRESS=0x... EXPECTED_CONTRACT_CODE_DIGEST=... GENLAYER_NETWORK=studionet \
  NODE_USE_ENV_PROXY=1 node dist/tools/liveRun.js ../docs/live/run.json
python3 ../scripts/live_evidence.py ../docs/live/run.json --deploy-tx 0x... --deploy-votes "agree 5"
```

## The live web app and visitor cases (same deployment)

*Hand-maintained section (not rendered by `scripts/live_evidence.py`): keep it when re-rendering this page.*

**URL:** <https://yoyoblair333-wq.github.io/verdict/>. GitHub Pages, built from `web/` by `.github/workflows/pages.yml` on every push to `main` (`npm ci`, `npm run build`, then `npm run snapshot` for the labelled fallback).

| | What the page does |
|---|---|
| **Reads** | From the visitor's browser over `https://studio.genlayer.com/api`: `get_config`; `get_case` **by id**, first the pinned evidence cases (1, 2, 3 and 4, from the build's `evidence.json`), then the newest cases in pages of 20; `gen_getContractCode` for the code pin (canonical code digest must equal `7c18143c…ca1b`; the raw stored bytes hash to `6bfe51a7…f4da` because of the CRLF line endings, and the page shows both); `eth_getTransactionByHash` to check indexed transactions live. If the RPC is unreachable it shows the build-time `snapshot.json`, labelled "Snapshot · taken …", and write mode is off. |
| **Writes** | Only from "Try it on testnet": a burner key generated in the visitor's browser (localStorage, "testnet only, no value") signs `open_case_package`, `judge`, `confirm_verdict` and, if chosen, `appeal`, with `value: 0`. No VERDICT server is involved; the relayer never sees or lists these cases. |
| **Labels** (ADR-023) | A case whose `creator` is the relayer address `0x34653Fb290480a8C99B4D92D4857123B5624c37d` (`web/src/config.js` `RELAYER_ADDRESS`) is "Opened by the VERDICT relayer". Every other case is a visitor case, labelled as one. The contract owner `0x920fbbCf2106B693A857D1995c198e341220a46A` is shown in the facts panel from `get_config`. Case 3 is hidden from the gallery after the run's takedown step (`web/src/hidden-cases.json`); its text stays on-chain. |
| **Trust page** | <https://yoyoblair333-wq.github.io/verdict/rig.html> hashes `gen_getContractCode` and `contracts/judge_router.py` on GitHub main in the browser and compares the canonical digests (it says why line endings are normalised and shows the raw hash when it differs), then reads the run's jury and revoke transactions live. |
| **Tests** | Offline tier `web/test/offline.test.mjs` (in `scripts/verify.sh` and CI; no network). Live tier `web/test/live.test.cjs` (`npm run test:live`; `VERDICT_WEB_WRITE=1` adds one browser-signed case): ALL PASS against this deployment on 2026-11-01. |

### Case 4: browser-signed demo case

Opened, judged and confirmed by `VERDICT_WEB_WRITE=1 npm run test:live`: `web/dist` served locally and driven by Playwright; every transaction signed in the browser by its own burner via genlayer-js; no relayer involved. Full record: [`docs/live/demo-case.json`](live/demo-case.json). The build indexes these three transaction hashes, so every visitor sees them. It is a **visitor case** and the page labels it as one.

| | |
|---|---|
| Creator (burner) | `0x404c5E75853F90A4BAf3640b415Ac9a44693E72B` |
| Receipt number (packageDigest) | `3e2970c2f7d3a68f44ff7fdb494a62d1e7cfcdbb417a00cc12308a794c3bc0a4` (shown as Receipt `3e29…c0a4`) |
| Takes | "Cereal is a soup: it is a liquid with solid pieces, eaten from a bowl with a spoon." / "Cereal is not a soup. Soup is cooked and savoury; nobody has ever simmered cornflakes." (the web app's built-in sample) |
| `open_case_package` | `0x58ae3f80a9ec07be66de86c1a3ed28f5a72c50bd751ae479c218b50f09882206`: FINALIZED / SUCCESS, agree 3, idle 2 |
| `judge` | `0xf5ec127771d95ab09abb57b770287379b6ddc096e0c70c42105cfc6fb18f18df`: FINALIZED / SUCCESS, agree 3, idle 2 |
| `confirm_verdict` | `0x0aebc775fa868914ee9cb383e93b90d70bcc47e5d6481d31e76cbfabd4ed602a`: FINALIZED / SUCCESS, agree 3, idle 2 |
| Verdict | Tier 1, 5 jurors, 4-1 for take B, mean scores [50, 68], `confirmed_tier` 1 (set by the creator) |

## Scam Pattern Ledger: owner deployment

Rendered by hand from [`docs/live/pattern-ledger-run.json`](live/pattern-ledger-run.json) (`current`), recorded by `scripts/pattern_live.mjs`. All summaries are staff-written and fully fictional.

| Item | Value |
|---|---|
| Contract | `0x59C6047571bCE66828C733330fc9B5C88afEaE4D` (deployed from the owner wallet in GenLayer Studio) |
| Deploy tx | `0x89a0c790e7bc0db5730d2b88e57d10c05e02da0d7f54cb6ae445c33ed03a435e`: FINALIZED, execution SUCCESS; validators agree 3, idle 2 |
| `get_config` roles | owner `0x920fbbCf2106B693A857D1995c198e341220a46A`, relayer `0x34653Fb290480a8C99B4D92D4857123B5624c37d` |
| Code pin | canonical sha256 `63c2e2d400df0656cf0fb099ecddca2c2c66064051e73ce1c08ea4336c60ad93` = sha256 of `contracts/pattern_ledger.py` (**match**); raw stored bytes `816b0be383a291d37682e7bbed2e4606b150209c52ad786720b0347a2ce809b6` (CRLF, pasted on Windows) |
| 1: new pattern | `0x175d40a86a567e24b6114958b00d7197227ae5426f372483706d91232c6f28df`: FINALIZED_SUCCESS; created pattern 1 |
| 2: same scam, worded differently | `0xe0719186fbcb1ccdc3e007d205c29541b8626cb9d99150421d51658bd0c58c2c`: FINALIZED_SUCCESS; validators agreed it is the same pattern, so pattern 1 went to `sightings` 2 instead of a new record |
| 3: summary with identifying data | `0xc66ed87412db89f8b2fd651e29cc327080e709ecbdf2b214c23841cc1639643d`: FINALIZED_ERROR; reverted with `[REJECTED] summary contains identifying data (digits)`, nothing stored |
| Reads after the run | `list_recent` and `top_patterns_since` return the one pattern (sightings 2); `get_config` reads `paused` false, `next_id` 2 |

The earlier PatternLedger `0x8af622094205440f120F4096151F0aaBBcf14fDF` (owned by the throwaway key, same code) and its runs are kept in the same file under `throwaway_deployment` and `run1_superseded`. The relayer still runs the ledger in SHADOW until counsel signs off (ADR-020); these runs are staff-written synthetic records.

## Red Flag Court (Milestone 1 candidate, throwaway deployment)

`contracts/red_flag_court.py` at `0xBaF13Ec3fe990868804f69aB2b53558F0ADE81CE`, deployed from the relayer key as a **test** deployment (deploy tx `0x6402a08ed36f2cbd0e6600e80f1c3a4162905d3f5521622c8fe08ef21708613b`, FINALIZED). Code pin: match. Eight transactions: SCAM, LEGIT, an unredacted text refused on-chain, an appeal to 3 analysts (SCAM 3-0), an opt-in, the relayer sharing the abstract pattern to the owner PatternLedger (counted as a sighting of pattern #1), and `mark_shared`. Plus one browser-signed check. All are listed with hashes and results in [docs/MILESTONE_1.md](MILESTONE_1.md). Raw record: [docs/live/red-flag-court-run.json](live/red-flag-court-run.json).

## Earlier deployment (2026-10-31, `0x3f867934247d88Aa3134d897a9246cfB1324B1Fa`)

Superseded by the owner deployment above. It runs the same code (canonical code digest `7c18143c…ca1b`), but the throwaway relayer key deployed it and holds both the owner and the relayer role. Its cases stay readable on studionet; the web app no longer points here. Its browser-signed demo case 5 is recorded in [`docs/live/demo-case-0x3f867934.json`](live/demo-case-0x3f867934.json). Its run data is kept in [`docs/live/studionet-run-0x3f867934.json`](live/studionet-run-0x3f867934.json).


Recorded by `relayer/src/tools/liveRun.ts`: the **real relayer in live mode** (HTTP routes, case packages, outbox, contract pin check, two-step finality, inbox, `confirm_verdict`) driving `genlayer-js` 1.1.8 against studionet. Rendered from [`docs/live/studionet-run-0x3f867934.json`](live/studionet-run-0x3f867934.json) by `scripts/live_evidence.py`.

This deployment exists because `contracts/judge_router.py` changed after the previous studionet deployment (`0x7DBc10d8…`, pin `3ef39cc8…`): it now has an owner/relayer split (constructor argument `relayer`, owner-only `set_relayer`, `relayer` in `get_config`, and `judge` / `appeal` / `finalize` / `confirm_verdict` open to the case creator, the owner or the current relayer; `revoke` stays creator-or-owner). The GenVM SDK header (`py-genlayer:1jb45aa8…`) is unchanged and pinned. The previous address no longer matches the source, so the contract was redeployed and re-pinned. The constructor `relayer` was left empty, so the throwaway deployer is both owner and relayer: this is still a testnet evidence deployment, not the final owner deployment (`deploy/OWNER_DEPLOY.md`).

| Item | Value |
|---|---|
| Network / RPC | studionet, `https://studio.genlayer.com/api` |
| Contract address | `0x3f867934247d88Aa3134d897a9246cfB1324B1Fa` |
| Deploy tx | `0xf9606205fa12c2126b1499c814054ed5b9dba9077dad55968a3b1812344a8622`: FINALIZED, execution SUCCESS; validators agree 5 |
| `get_config` roles | owner `0x34653Fb290480a8C99B4D92D4857123B5624c37d`, relayer `0x34653Fb290480a8C99B4D92D4857123B5624c37d` (the throwaway deployer holds both roles: constructor `relayer` left empty) |
| Relayer key used for the run (throwaway) | `0x34653Fb290480a8C99B4D92D4857123B5624c37d` (same key as the earlier deployments) |
| Code pin | `gen_getContractCode` → sha256 `7c18143cf8f5224d6f8cdccebcdcc70b3b584f0b9247bf55c8439d2fac10ca1b` = sha256 of `contracts/judge_router.py` `7c18143cf8f5224d6f8cdccebcdcc70b3b584f0b9247bf55c8439d2fac10ca1b` = `EXPECTED_CONTRACT_CODE_DIGEST` (**match**) |
| Run | 2026-10-31T19:58:22.603Z → 2026-10-31T20:13:26.253Z (904 s, 3 cases, 17 transactions) |

#### The three cases

##### Who's right? (Settle It) (case id 1)

Receipt number (packageDigest): `43b09ddff2cfd7fdbc58a16298d15bdee819bee7921bfc3cdfe1fd372931883e`

* POST /cases: HTTP 201, tx `0xe08409184d086bb6cb3e92dc0da1e672490e5b212123b7d75a37c6de4a3d3d14`, finality at response: ACCEPTED
* POST judge: HTTP 202, tx `0x926597b1a497e9e7a1b313958b23d6027615741116a08b0c3e82d8bf371e910f`, finality at response: ACCEPTED
* **Tier 1 final**: winner entry 0, split 5-0, 5 jurors, mean scores [68, 32], reason: "Sweet and salty pairing is a demonstrable culinary principle; tradition-based objection offers no logical counterargumen"
  * provenance label: "All takes submitted through Settle It; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."
* appeal -> Tier 2: HTTP 202, tx `0xfed31cf680876d75769ef4150b4763be285f0e386556aaed4c538685488c9e89`, finality at response: ACCEPTED, paid_with free
* **Tier 2 final**: winner entry 0, split 7-0, 7 jurors, mean scores [79, 34], reason: "One gives a clear, broadly grounded rationale; the other relies on hyperbole instead of support."
* appeal -> Supreme Court: HTTP 202, tx `0x2f653265ab200902585fb3903babd6fa88d987d0b5e13cab8ef09eb15ee146b0`, finality at response: ACCEPTED, paid_with free
* **Supreme Court final**: winner entry 0, split 9-0, 9 jurors, mean scores [69, 31], reason: "Sweet and salty pairings have broad culinary support; tradition alone isn't a counter-argument."

##### Better roast (Live Court) (case id 2)

Receipt number (packageDigest): `eb167ed7cfbd30029133da432dd390b55ef8de0d6940eaa277dcb3e3df302ebd`

* POST /cases: HTTP 201, tx `0x71d325273244b0965a0b58b021b67efc3c26d794b6bd7945a653af3c6264180d`, finality at response: ACCEPTED
* POST judge: HTTP 202, tx `0x5adc60577f1d84d58adeb292d21050e21b5f272f4371b0cd9e8227ad850a175c`, finality at response: ACCEPTED
* **Tier 1 final**: winner entry 1, split 5-0, 5 jurors, mean scores [66, 86], reason: "Entry 1 offers a sharper, more psychologically astute roast with greater originality, while entry 0 relies on a common, "
  * provenance label: "All takes relayed by the stream host; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."
* appeal -> Tier 2: HTTP 202, tx `0x50f2e49cee3af3f79357453692ba4d90415856dc3e112580b31b08d41febbef2`, finality at response: ACCEPTED, paid_with free
* **Tier 2 final**: winner entry 1, split 6-1, 7 jurors, mean scores [57, 73], reason: "Entry 1 is punchier and more pointed, while Entry 0’s familiar bug comparison feels less original."
* finalize (operator): tx `0x373f9d4e28e99282ee4c0bca13b4f1f29f1689520643f0bbbd847a5122dcfde7` → FINALIZED / execution SUCCESS
* status after finalize: {"status": "final"}

##### Pettiest text (API) (case id 3)

Receipt number (packageDigest): `05ceb5420f6ad332eaa3d5063cb7e66ce53c811aee8f769464acf05ffdb235cc`

* POST /cases: HTTP 201, tx `0x06e9c4ea8b940fdb7e35d21b4c00fc9d96f2530259a0203a996c9e4ec3ccfcf4`, finality at response: ACCEPTED
* POST judge: HTTP 202, tx `0x6f4b2f84e3274c53e56c0c2716be24c5bf786aa025d2e703a020a9682f119e9a`, finality at response: ACCEPTED
* **Tier 1 final**: winner entry 1, split 3-2, 5 jurors, mean scores [68, 76], reason: "The birthday threat-free promise of calculated future neglect is a masterclass in passive-aggressive precision and delay"
  * provenance label: "All takes submitted by an API client; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."
* winner revoke via relayer (must be 409): HTTP 409, "the verdict is final; request a takedown instead (POST /cases/:id/takedown)"
* raw on-chain revoke after confirm_verdict (must revert): tx `0xfcecc671e08106833d11e92c495cdada542ce9012e7d8673b2ebea6fb29984c4` → FINALIZED / execution ERROR; revert reason `[EXPECTED] verdict is final; request an off-chain takedown instead`
* takedown (off-chain): HTTP 200, "Hidden from VERDICT's gallery and cards. The text remains in the public blockchain's history and cannot be erased.", `GET /cases/3` afterwards → HTTP 410

#### Every transaction

Times are seconds after broadcast, as observed by the relayer's poller (3 s interval). Votes are the final `consensus_data.votes`.

| # | Call | Tx hash | Observed transitions | ACCEPTED | FINALIZED | Result | Validator votes |
|---|---|---|---|---|---|---|---|
| 1 | `open_case_package` | `0xe08409184d086bb6cb3e92dc0da1e672490e5b212123b7d75a37c6de4a3d3d14` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.2s → ACCEPTED (SUCCESS) @6.3s → FINALIZED (SUCCESS) @53.8s | 6.3 s | 53.8 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 2 | `judge` | `0x926597b1a497e9e7a1b313958b23d6027615741116a08b0c3e82d8bf371e910f` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @12.3s → ACCEPTED (SUCCESS) @46.1s → FINALIZED (SUCCESS) @77.1s | 46.1 s | 77.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 3 | `confirm_verdict` | `0xb36de12d1af430a2e720fe66bbd6243e99ac665010e85b4ea6d90c063f83bd01` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @38.3s | 6.2 s | 38.3 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 4 | `appeal` | `0xfed31cf680876d75769ef4150b4763be285f0e386556aaed4c538685488c9e89` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.2s → COMMITTING (SUCCESS) @18.5s → ACCEPTED (SUCCESS) @46.2s → FINALIZED (SUCCESS) @77.1s | 46.2 s | 77.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 5 | `confirm_verdict` | `0xc7456472fc6f43306e2eba800b06505d39f6e14ef8e3537e04e11b226e11ffc6` | PROPOSING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.2s → ACCEPTED (SUCCESS) @6.3s → FINALIZED (SUCCESS) @35.2s | 6.3 s | 35.2 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 6 | `appeal` | `0x2f653265ab200902585fb3903babd6fa88d987d0b5e13cab8ef09eb15ee146b0` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @21.6s → ACCEPTED (SUCCESS) @58.5s → FINALIZED (SUCCESS) @89.4s | 58.5 s | 89.4 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 7 | `confirm_verdict` | `0xf54171fe6553b48b63a7e1df932034d01dbc9c50d77f7b76f6144427a1ccfa99` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @38.3s | 6.2 s | 38.3 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 8 | `open_case_package` | `0x71d325273244b0965a0b58b021b67efc3c26d794b6bd7945a653af3c6264180d` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @66.3s | 6.2 s | 66.3 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 9 | `judge` | `0x5adc60577f1d84d58adeb292d21050e21b5f272f4371b0cd9e8227ad850a175c` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @12.3s → ACCEPTED (SUCCESS) @58.5s → FINALIZED (SUCCESS) @89.5s | 58.5 s | 89.5 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, disagree 1, idle 1 |
| 10 | `confirm_verdict` | `0xf7b73e5b3ce6ea976a94408f925a1ed349621d3802f5b67b2d0c3b2fedd72805` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @38.1s | 6.2 s | 38.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 11 | `appeal` | `0x50f2e49cee3af3f79357453692ba4d90415856dc3e112580b31b08d41febbef2` | PROPOSING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @33.8s → ACCEPTED (SUCCESS) @110.4s → FINALIZED (SUCCESS) @141.4s | 110.4 s | 141.4 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 12 | `confirm_verdict` | `0x96820ef22fe4a91c51f4000f8db84c9556e615da639e255833f1d652bf39351c` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.2s → COMMITTING (SUCCESS) @9.3s → ACCEPTED (SUCCESS) @12.4s → FINALIZED (SUCCESS) @44.4s | 12.4 s | 44.4 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 13 | `finalize` | `0x373f9d4e28e99282ee4c0bca13b4f1f29f1689520643f0bbbd847a5122dcfde7` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @37s | 6.2 s | 37 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 14 | `open_case_package` | `0x06e9c4ea8b940fdb7e35d21b4c00fc9d96f2530259a0203a996c9e4ec3ccfcf4` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.2s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @44.3s | 6.2 s | 44.3 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 15 | `judge` | `0x6f4b2f84e3274c53e56c0c2716be24c5bf786aa025d2e703a020a9682f119e9a` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.2s → COMMITTING (SUCCESS) @12.3s → ACCEPTED (SUCCESS) @36.9s → FINALIZED (SUCCESS) @67.8s | 36.9 s | 67.8 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, disagree 1, idle 1 |
| 16 | `confirm_verdict` | `0xf333ed24f6ddcec2b2454f753e6e0f64259ba2a62767f3a1e73b3af4edf6c1bc` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @35.1s | 6.2 s | 35.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 17 | `revoke` | `0xfcecc671e08106833d11e92c495cdada542ce9012e7d8673b2ebea6fb29984c4` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → ACCEPTED (ERROR) @6.2s → FINALIZED (ERROR) @40.1s | 6.2 s | 40.1 s | FINALIZED / MAJORITY_AGREE / ERROR | agree 3, idle 2 |

#### What this run shows

* **Two-step finality.** Jury transactions (`judge`, `appeal`) reached ACCEPTED after 36.9–110.4 s and FINALIZED after 67.8–141.4 s. Cards, the inbox receipt and `confirm_verdict` waited for FINALIZED + SUCCESS.
* **Execution result is separate from status.** `revoke` `0xfcecc671e0…` reached FINALIZED with execution ERROR (`[EXPECTED] verdict is final; request an off-chain takedown instead`): the revocation window closed once Tier 1 was confirmed final.
* **Receipts.** The inbox holds 6 hash-chained FINALIZED_SUCCESS receipts whose `packageDigest` equals the on-chain receipt number.
* **Access.** Every write came from the relayer, which here is also the owner and the case creator. A stranger's `judge`, a non-owner `open_case`, and a relayer that is not the owner calling admin methods are refused by the contract; that is covered by the direct-mode tests, not by this run.

#### The live web app and visitor cases (same deployment)

**URL:** <https://yoyoblair333-wq.github.io/verdict/>. GitHub Pages, built from `web/` by `.github/workflows/pages.yml` on every push to `main` (`npm ci`, `npm run build`, then `npm run snapshot` for the labelled fallback).

| | What the page does |
|---|---|
| **Reads** | From the visitor's browser over `https://studio.genlayer.com/api`: `get_config`; `get_case` **by id**, first the pinned evidence cases (1, 2, 3 and 5, from the build's `evidence.json`), then the newest cases in pages of 20; `gen_getContractCode` for the code pin (sha256 must equal `7c18143c…ca1b`); `eth_getTransactionByHash` to check indexed transactions live. If the RPC is unreachable it shows the build-time `snapshot.json`, labelled "Snapshot · taken …", and write mode is off. |
| **Writes** | Only from "Try it on testnet": a burner key generated in the visitor's browser (localStorage, "testnet only, no value") signs `open_case_package`, `judge`, `confirm_verdict` and, if chosen, `appeal`, with `value: 0`. No VERDICT server is involved; the relayer never sees or lists these cases. |
| **Labels** (ADR-023) | A case whose `creator` is the relayer address `0x34653Fb290480a8C99B4D92D4857123B5624c37d` (`web/src/config.js` `RELAYER_ADDRESS`) is "Opened by the VERDICT relayer". Every other case is "Visitor case · not moderated by VERDICT" with "Opened by a visitor's testnet account. Self-reported labels not verified."; a visitor package claiming `verified_participant` reads "says verified (not checked)". `confirmed_tier` is shown as "On-chain status: Tier N confirmed by the relayer" or "On-chain status: creator says Tier N final"; the network's own answer is the jury transaction's status, checked live. Visitor cases sit behind a separate "Visitor cases" control. Chain text is rendered as text only, passes a display filter (injection, threat, PII), and can be hidden by id in `web/src/hidden-cases.json`. The receipt is "Receipt" plus the first 4 and last 4 hex of the packageDigest; the full value is one tap away. |
| **Tests** | Offline tier `web/test/offline.test.mjs` (in `scripts/verify.sh` and CI; no network). Live tier `web/test/live.test.cjs` (`npm run test:live`, optional). |

##### Case 5: browser-signed demo case

Recorded for the demo video: `web/dist` served locally and driven by Playwright; every transaction signed in the browser by its own burner via genlayer-js; no relayer involved. Full record: [`docs/live/demo-case-0x3f867934.json`](live/demo-case-0x3f867934.json). The build indexes these three transaction hashes (`web/scripts/build.mjs`), so every visitor sees them, not only the signing browser. Case 5 is a **visitor case** and the page labels it as one.

| | |
|---|---|
| Creator (burner) | `0xB1a9D090c0aEC5560ad25646c38a4Db0254F844c` |
| Receipt number (packageDigest) | `01f51eb7f80de32f59fb4dbe1ce047855e088ac9dbf98e05995c835627939267` (shown as Receipt `01f5…9267`) |
| `open_case_package` | `0xe5f89db1258a952b5e724e5d76c15b3382d47a1a85c850983156cd3e82fa9ea1`: FINALIZED / SUCCESS, agree 3, idle 2 |
| `judge` | `0xa2701c2f0276cb84a2d529d5f6aa145dd7fba880c0e3d5535f25f5cb26b3e1ef`: FINALIZED / SUCCESS, agree 3, idle 1, disagree 1 |
| `confirm_verdict` | `0x11df92e968557e43a2347c7701e9640653aa895ece5280e336c2439a5285132c`: FINALIZED / SUCCESS, agree 3, idle 2 |
| Verdict | Tier 1, 5 jurors, 5-0 for take B, `confirmed_tier` 1 (set by the creator) |
| Wall clock | send click → Tier 1 FINALIZED 155.7 s; → `confirm_verdict` FINALIZED 198.0 s |

##### Case 4: unexplained stranded attempt

Read from the contract on 2026-10-31: creator `0x47209B8E68AA03514F2b017067D73d972E08A714` (a burner), `created_at` 2026-10-31T20:27:32Z, `updated_at` 20:27:41Z, `status` judged, tier 1, `confirmed_tier` 0 (no `confirm_verdict`). Its takes are the web app's second built-in sample ("You're always late." / "And yet you keep saving me a seat.", `web/src/app.js` `SAMPLES`). It was opened 72 seconds before case 5 by a different burner, which fits an earlier attempt during the demo recording (each Playwright browser context generates a new burner), but there is no record of who ran it or why it stopped before `confirm_verdict`, and the engineering lane did not create it in this round. **It is unexplained.** Its text is the app's own sample, so it is not hidden; the page shows it as a visitor case with "On-chain status" and no relayer wording. No transaction hashes are indexed for it.

## Earlier deployment (2026-10-31, `0x7DBc10d8922A5Ba498007D212F2088872F2aCe06`)

Superseded by the current deployment above: `contracts/judge_router.py` has changed since (owner/relayer split: constructor `relayer`, owner-only `set_relayer`, lifecycle calls open to the current relayer), so this address no longer matches the source or the pinned digest. Its run data is kept in [`docs/live/studionet-run-0x7DBc10d8.json`](live/studionet-run-0x7DBc10d8.json).


Recorded by `relayer/src/tools/liveRun.ts`: the **real relayer in live mode** (HTTP routes, case packages, outbox, contract pin check, two-step finality, inbox, `confirm_verdict`) driving `genlayer-js` 1.1.8 against studionet. Rendered from [`docs/live/studionet-run-0x7DBc10d8.json`](live/studionet-run-0x7DBc10d8.json) by `scripts/live_evidence.py`.

This deployment exists because the contract changed after the independent audit: `judge` now requires the case creator or the owner, and the legacy `open_case` path is owner-only. A contract change means a new address and a new pin.

| Item | Value |
|---|---|
| Network / RPC | studionet, `https://studio.genlayer.com/api` |
| Contract address | `0x7DBc10d8922A5Ba498007D212F2088872F2aCe06` |
| Deploy tx | `0xf98a974976d949581eb6ec534a3e97598c95fab630e878aa7e2c4bbf07ed4bbd`: FINALIZED, execution SUCCESS; validators agree 5 |
| Owner / relayer (throwaway) | `0x34653Fb290480a8C99B4D92D4857123B5624c37d` (same key as the earlier deployment) |
| Code pin | `gen_getContractCode` → sha256 `3ef39cc8a02f7c2bdbf3f3b7d19340622439a381192ced7cbcd799232139ea25` = `EXPECTED_CONTRACT_CODE_DIGEST` (**match**) |
| Run | 2026-10-31T18:29:04.795Z → 2026-10-31T18:43:32.304Z (868 s, 3 cases, 17 transactions) |

#### The three cases

##### Who's right? (Settle It) (case id 1)

Receipt number (packageDigest): `c29281263bd4b100bb0b4117d09155b5e868a16d3b7a7e2e2c7e331523a2d349`

* POST /cases: HTTP 201, tx `0x5731c408ec152f013ef03fbaa2d31b43c197cb6650a021548a65e252e6383de8`, finality at response: ACCEPTED
* POST judge: HTTP 202, tx `0xaab8cbbe1e2ea3082db1d766e8fa3e53394801c4ce84bcefbe1f2583404fa82d`, finality at response: ACCEPTED
* **Tier 1 final**: winner entry 0, split 5-0, 5 jurors, mean scores [76, 34], reason: "One offers a common culinary rationale; the other relies on hyperbole instead of support."
  * provenance label: "All takes submitted through Settle It; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."
* appeal -> Tier 2: HTTP 202, tx `0xb178e4c51d9cd397cc7d41db0004618ad0a1da609799d3d843444f1cdf8ee07e`, finality at response: ACCEPTED, paid_with free
* **Tier 2 final**: winner entry 0, split 7-0, 7 jurors, mean scores [79, 33], reason: "One offers a clear, common culinary rationale; the other is mostly hyperbole without support."
* appeal -> Supreme Court: HTTP 202, tx `0x3c9dac7e2633bb0d05e0b25db5c9fa8547199848bc53e93ba5c62a9c2308573f`, finality at response: ACCEPTED, paid_with free
* **Supreme Court final**: winner entry 0, split 9-0, 9 jurors, mean scores [69, 31], reason: "Sweet-salty contrast is a legitimate culinary principle; tradition-based dismissal offers no supporting logic."

##### Better roast (Live Court) (case id 2)

Receipt number (packageDigest): `a91f4f0c421a82383bdb0afb5095a6aa9395755ae4f19a230a9bb90322b14705`

* POST /cases: HTTP 201, tx `0xfa0971613d26caf5ddd4c50e12844ef0728890c03bf49301b661864396174705`, finality at response: ACCEPTED
* POST judge: HTTP 202, tx `0x545e262e755a9904cbc951111db4c27033e69cb6f94886931dc5e7b61d76f60c`, finality at response: ACCEPTED
* **Tier 1 final**: winner entry 1, split 5-0, 5 jurors, mean scores [62, 76], reason: "#1 is sharper and more original; #0 is familiar but still a solid, light roast."
  * provenance label: "All takes relayed by the stream host; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."
* appeal -> Tier 2: HTTP 202, tx `0x58655463f7ae48d6a2d804d338d1658719795215ac03a015ef13dc7eaa3df6d4`, finality at response: ACCEPTED, paid_with free
* **Tier 2 final**: winner entry 1, split 7-0, 7 jurors, mean scores [46, 79], reason: "The commit-message dig is sharper and more specific, landing with knowing insider wit rather than a tired cliché."
* finalize (operator): tx `0xce7e10f252a3d95da9959394d3bd60bb88f44a04083879f1599f9bc7b114d3c0` → FINALIZED / execution SUCCESS
* status after finalize: {"status": "final"}

##### Pettiest text (API) (case id 3)

Receipt number (packageDigest): `cbf26c1037bb6a262bc4b9c91fe0c12f8895bfe039612ae36958cd4df08fb5ee`

* POST /cases: HTTP 201, tx `0xc13b0a46b46c1fb91d6304ec28a7764fddd01f7401e115203cc97b975ae2739c`, finality at response: ACCEPTED
* POST judge: HTTP 202, tx `0x46bcd808c823d635140dda27570b10eed483bced4ff29a9409c85cf61ebd2ef9`, finality at response: ACCEPTED
* **Tier 1 final**: winner entry 1, split 5-0, 5 jurors, mean scores [32, 84], reason: "第二条把冷淡升级为带纪念性质的生日暗讽,精准、克制又很有小心眼的创意。"
  * provenance label: "All takes submitted by an API client; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."
* winner revoke via relayer (must be 409): HTTP 409, "the verdict is final; request a takedown instead (POST /cases/:id/takedown)"
* raw on-chain revoke after confirm_verdict (must revert): tx `0x3ff5be06c9e2be6a601c8abdc78e89491841cc45bfbfe42926ee4ea711acfb4e` → FINALIZED / execution ERROR; revert reason `[EXPECTED] verdict is final; request an off-chain takedown instead`
* takedown (off-chain): HTTP 200, "Hidden from VERDICT's gallery and cards. The text remains in the public blockchain's history and cannot be erased.", `GET /cases/3` afterwards → HTTP 410

#### Every transaction

Times are seconds after broadcast, as observed by the relayer's poller (3 s interval). Votes are the final `consensus_data.votes`.

| # | Call | Tx hash | Observed transitions | ACCEPTED | FINALIZED | Result | Validator votes |
|---|---|---|---|---|---|---|---|
| 1 | `open_case_package` | `0x5731c408ec152f013ef03fbaa2d31b43c197cb6650a021548a65e252e6383de8` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → ACCEPTED (SUCCESS) @6.3s → FINALIZED (SUCCESS) @53.6s | 6.3 s | 53.6 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 2 | `judge` | `0xaab8cbbe1e2ea3082db1d766e8fa3e53394801c4ce84bcefbe1f2583404fa82d` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @12.3s → ACCEPTED (SUCCESS) @43s → FINALIZED (SUCCESS) @74s | 43 s | 74 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 3 | `confirm_verdict` | `0xba7f5b5ed4d2a42b8bad556a9626aa5fd2e3200df4ab70e32edd07001da8eb2f` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @6.2s → ACCEPTED (SUCCESS) @9.3s → FINALIZED (SUCCESS) @38.6s | 9.3 s | 38.6 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 5 |
| 4 | `appeal` | `0xb178e4c51d9cd397cc7d41db0004618ad0a1da609799d3d843444f1cdf8ee07e` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @6.2s → COMMITTING (SUCCESS) @18.4s → ACCEPTED (SUCCESS) @36.9s → FINALIZED (SUCCESS) @68.1s | 36.9 s | 68.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 5 | `confirm_verdict` | `0x4816e4c5e2439c6863135a360c57c944d89e5e263d0fdc3c958ba2dde91f023e` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.2s → ACCEPTED (SUCCESS) @6.3s → FINALIZED (SUCCESS) @35.1s | 6.3 s | 35.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 4, idle 1 |
| 6 | `appeal` | `0x3c9dac7e2633bb0d05e0b25db5c9fa8547199848bc53e93ba5c62a9c2308573f` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @113.7s → ACCEPTED (SUCCESS) @132.1s → FINALIZED (SUCCESS) @160s | 132.1 s | 160 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 7 | `confirm_verdict` | `0x899b34e1d4e15068143194efbc89db03110fbd4f47bd0096e6e3f983f27a0db9` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.2s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @38.2s | 6.2 s | 38.2 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 8 | `open_case_package` | `0xfa0971613d26caf5ddd4c50e12844ef0728890c03bf49301b661864396174705` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @56.8s | 6.2 s | 56.8 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 9 | `judge` | `0x545e262e755a9904cbc951111db4c27033e69cb6f94886931dc5e7b61d76f60c` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.2s → COMMITTING (SUCCESS) @15.5s → ACCEPTED (SUCCESS) @46.2s → FINALIZED (SUCCESS) @77.1s | 46.2 s | 77.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 10 | `confirm_verdict` | `0xa400b03d88b61e4fa34c3465d974cd208ed548194cb44399f169e3b63f921a5b` | PENDING (UNKNOWN) @0.1s → REVEALING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @35.1s | 6.2 s | 35.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 11 | `appeal` | `0x58655463f7ae48d6a2d804d338d1658719795215ac03a015ef13dc7eaa3df6d4` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @15.4s → ACCEPTED (SUCCESS) @27.7s → FINALIZED (SUCCESS) @58.8s | 27.7 s | 58.8 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 12 | `confirm_verdict` | `0x3de31f3943e1d93142344eac5388c89a0b77c5e6bcc29cee59af7c0bbb3c0acc` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @35.5s | 6.2 s | 35.5 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 13 | `finalize` | `0xce7e10f252a3d95da9959394d3bd60bb88f44a04083879f1599f9bc7b114d3c0` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @34.2s | 6.2 s | 34.2 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 14 | `open_case_package` | `0xc13b0a46b46c1fb91d6304ec28a7764fddd01f7401e115203cc97b975ae2739c` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @6.2s → ACCEPTED (SUCCESS) @9.3s → FINALIZED (SUCCESS) @69.1s | 9.3 s | 69.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |
| 15 | `judge` | `0x46bcd808c823d635140dda27570b10eed483bced4ff29a9409c85cf61ebd2ef9` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @27.7s → REVEALING (SUCCESS) @55.3s → ACCEPTED (SUCCESS) @58.4s → FINALIZED (SUCCESS) @86.3s | 58.4 s | 86.3 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, disagree 1, idle 1 |
| 16 | `confirm_verdict` | `0x280ea5d14324a789c434b0b21773831e0e2ed1747d0a973cdd556be768812031` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @35.1s | 6.2 s | 35.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 5 |
| 17 | `revoke` | `0x3ff5be06c9e2be6a601c8abdc78e89491841cc45bfbfe42926ee4ea711acfb4e` | PENDING (UNKNOWN) @0.1s → ACCEPTED (ERROR) @3.2s → FINALIZED (ERROR) @34s | 3.2 s | 34 s | FINALIZED / MAJORITY_AGREE / ERROR | agree 3, idle 2 |

#### What this run shows

* **Two-step finality.** Jury transactions (`judge`, `appeal`) reached ACCEPTED after 27.7–132.1 s and FINALIZED after 58.8–160 s. Cards, the inbox receipt and `confirm_verdict` waited for FINALIZED + SUCCESS.
* **Execution result is separate from status.** `revoke` `0x3ff5be06c9…` reached FINALIZED with execution ERROR (`[EXPECTED] verdict is final; request an off-chain takedown instead`): the revocation window closed once Tier 1 was confirmed final.
* **Receipts.** The inbox holds 6 hash-chained FINALIZED_SUCCESS receipts whose `packageDigest` equals the on-chain receipt number.
* **Access (new in this deployment).** Every write came from the case creator (the relayer). A stranger's `judge` and a non-owner `open_case` are refused by the contract; that is covered by the direct-mode tests, not by this run.

## Earlier deployment (2026-10-31)

Superseded by the current deployment above: this contract still lets anyone call `judge` and lets anyone use `open_case`. Its run data is kept in [`docs/live/studionet-run-earlier-deployment.json`](live/studionet-run-earlier-deployment.json). Its old reproduce block (which could overwrite `.env.local`) is removed; use the one above.

Recorded by `relayer/src/tools/liveRun.ts`: the **real relayer in live mode** (HTTP routes, case packages, outbox, contract pin check, two-step finality, inbox, `confirm_verdict`) driving the real `genlayer-js` 1.1.8 client against GenLayer **studionet**. Raw data: [docs/live/studionet-run-earlier-deployment.json](live/studionet-run-earlier-deployment.json) (every transaction, every observed status transition, final validator votes, the inbox receipts). A fresh throwaway key was generated locally for this run; it is stored only in the git-ignored `relayer/.env.local` and appears in no file in this repo. No mainnet, no real value.

### Deployment

| Item | Value |
|---|---|
| Network / RPC | studionet, `https://studio.genlayer.com/api` |
| SDK | GenVM v0.2 Python SDK header `py-genlayer:1jb45aa8…` **accepted as written; no v0.3 port needed** |
| Contract address | `0xcBAD3fcee2CF1c59c6041518AE91b75CaBB0C29a` |
| Deploy tx | `0x251898dee087c093b271d8f6edfd3373575425034891572ed2113ed03beb7b06`: ACCEPTED, then FINALIZED, execution SUCCESS; 5 validators (agree 3, idle 2) |
| Owner / relayer (throwaway) | `0x34653Fb290480a8C99B4D92D4857123B5624c37d` |
| Code pin | `gen_getContractCode` → sha256 `0bde694438524e5eb4e2d23c97ef4aa394b68c1600da2ff7f6c246dd963bcc81` = `EXPECTED_CONTRACT_CODE_DIGEST` (**match**) |
| Run | 2026-10-31T17:34:17.216Z → 2026-10-31T17:48:35.894Z (859 s, 3 cases, 17 transactions) |

### The three cases

#### Case 1: Who's right? (Settle It) (case id 1)

Receipt number (packageDigest): `46fe472743eb699f5f8208fc08854bcce886269eece2108fcc49735a5d077fd8`

* POST /cases: HTTP 201, tx `0x3b83ef0e4d16ee07047da39f05042279f6bdf6f470e99e1f31595b39866239fd`, finality at response: ACCEPTED
* POST judge: HTTP 202, tx `0xcded5a4c43f8c07a708c1908d848c02efd605342d60e4ced4bc30b5e02546aee`, finality at response: ACCEPTED
* **Tier 1 final**: winner entry 0, split 5-0, 5 jurors, mean scores [60, 28], reason: "Entry 0 offers a reasoned culinary argument (sweet+salty pairing); Entry 1 is just an emotional appeal with no support."
  * provenance label: "All takes submitted through Settle It; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."
* appeal -> Tier 2: HTTP 202, tx `0x5daf3a64d2b4ea82f9a341061df9bb3762dcb95f832d0bf8a6fa1fb521f1b5ed`, finality at response: ACCEPTED, paid_with free
* **Tier 2 final**: winner entry 0, split 7-0, 7 jurors, mean scores [76, 30], reason: "The first view offers a clear culinary rationale, while the second relies mainly on an unsupported insult."
* appeal -> Supreme Court: HTTP 202, tx `0xc65caf7ae0ac724e8b25036267b0944a16131fc2dbb7687e375fb8b9de22d830`, finality at response: ACCEPTED, paid_with free
* **Supreme Court final**: winner entry 0, split 9-0, 9 jurors, mean scores [80, 31], reason: "Entry 0 gives a simple supporting rationale; Entry 1 relies on hyperbole rather than argument."

#### Case 2: Better roast (Live Court) (case id 2)

Receipt number (packageDigest): `68abdd43c16009c2e6f4e122cc94ee3d0a5a738613fb42af672211bbd7965b3a`

* POST /cases: HTTP 201, tx `0x5f7d3703d366c2bd44fce602af0d20b76bb0013597e8f88767f8a119f7fcf524`, finality at response: ACCEPTED
* POST judge: HTTP 202, tx `0x70407f423d18c9a94ddf8f99987d7c59f2d0401365f8aa9f87f9888e012b79be`, finality at response: ACCEPTED
* **Tier 1 final**: winner entry 1, split 5-0, 5 jurors, mean scores [36, 76], reason: "Entry 1 is sharper and more original; the psychological dig beats the tired picnic cliché."
  * provenance label: "All takes relayed by the stream host; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."
* appeal -> Tier 2: HTTP 202, tx `0x213d56d42436593818f1af91700cd9ed66c4181397be27cfb9ef9052aa5e7726`, finality at response: ACCEPTED, paid_with free
* **Tier 2 final**: winner entry 1, split 6-1, 7 jurors, mean scores [67, 77], reason: "Entry 1 offers a sharper, more original jab at the author's habits."
* finalize (operator): tx `0xcce5722e50263b246d1435e00b2a8051955ae84d8af8c32ddd52c86ffce4a2e0`
* status after finalize: {"status": "final"}

#### Case 3: Pettiest text (API) (case id 3)

Receipt number (packageDigest): `255d5008ac276097dd717bed368743233ba6b09e73cfcdfa516a2bfdc1e6ff72`

* POST /cases: HTTP 201, tx `0xe979695a8e9f714bec2f421b47e985208201d1a56043db942c2f9269b0184bf3`, finality at response: ACCEPTED
* POST judge: HTTP 202, tx `0xd91f8f643c7e24109c6c21973c5c88709bf4fc6cd43dbd22f2ebe6eed0eb2438`, finality at response: ACCEPTED
* **Tier 1 final**: winner entry 1, split 4-1, 5 jurors, mean scores [40, 72], reason: "Entry 1 delivers a delayed, beautifully targeted act of vengeance, whereas the other is merely monosyllabic."
  * provenance label: "All takes submitted by an API client; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct."
* winner revoke via relayer (must be 409): HTTP 409: "the verdict is final; request a takedown instead (POST /cases/:id/takedown)"
* raw on-chain revoke after confirm_verdict (must revert): tx `0x37ae96c20005039a8be448fc8fe743f9b9c657ac854f19bb84571b1d85c13197`
* takedown (off-chain): HTTP 200: "Hidden from VERDICT's gallery and cards. The text remains in the public blockchain's history and cannot be erased."; `GET /cases/3` afterwards → HTTP 410

### Every transaction

Times are seconds after broadcast, as observed by the relayer's poller (3 s interval). Votes are the final `consensus_data.votes`. Leader time is `leader_receipt.processing_time`.

| Case | Call | Tx hash | Observed transitions | ACCEPTED | FINALIZED | Result | Validator votes | Leader time |
|---|---|---|---|---|---|---|---|---|
| 1 | `open_case_package` | `0x3b83ef0e4d16ee07047da39f05042279f6bdf6f470e99e1f31595b39866239fd` | PENDING (UNKNOWN) @0.1s → ACCEPTED (SUCCESS) @3.1s → FINALIZED (SUCCESS) @38.3s | 3.1 s | 38.3 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 1.0 s |
| 1 | `judge` | `0xcded5a4c43f8c07a708c1908d848c02efd605342d60e4ced4bc30b5e02546aee` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @12.3s → ACCEPTED (SUCCESS) @30.8s → FINALIZED (SUCCESS) @61.6s | 30.8 s | 61.6 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 11.3 s |
| 1 | `confirm_verdict` | `0xc76051f3d38d0867b08461c40a70cf24426227503dd90224b249de45b5dd63f2` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.3s → FINALIZED (SUCCESS) @35.2s | 6.3 s | 35.2 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 1.0 s |
| 1 | `appeal` | `0x5daf3a64d2b4ea82f9a341061df9bb3762dcb95f832d0bf8a6fa1fb521f1b5ed` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @39.9s → ACCEPTED (SUCCESS) @73.7s → FINALIZED (SUCCESS) @104.6s | 73.7 s | 104.6 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 36.7 s |
| 1 | `confirm_verdict` | `0xd972dc89cd46d82710787e254e5604afdfa64fc0fc1bd8ed78866a3ad25a7836` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @35.1s | 6.2 s | 35.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 1.0 s |
| 1 | `appeal` | `0xc65caf7ae0ac724e8b25036267b0944a16131fc2dbb7687e375fb8b9de22d830` | PROPOSING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @21.6s → ACCEPTED (SUCCESS) @43.1s → FINALIZED (SUCCESS) @73.9s | 43.1 s | 73.9 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 20.4 s |
| 1 | `confirm_verdict` | `0x0607d660d502fc562f1edd91c2e636de7414cd64b0ca8c60e872fd013c740ffe` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.2s → ACCEPTED (SUCCESS) @6.3s → FINALIZED (SUCCESS) @35.2s | 6.3 s | 35.2 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 1.0 s |
| 2 | `open_case_package` | `0x5f7d3703d366c2bd44fce602af0d20b76bb0013597e8f88767f8a119f7fcf524` | PENDING (UNKNOWN) @0.1s → ACCEPTED (SUCCESS) @3.1s → FINALIZED (SUCCESS) @69.3s | 3.1 s | 69.3 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 1.0 s |
| 2 | `judge` | `0x70407f423d18c9a94ddf8f99987d7c59f2d0401365f8aa9f87f9888e012b79be` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @34s → ACCEPTED (SUCCESS) @61.6s → FINALIZED (SUCCESS) @92.6s | 61.6 s | 92.6 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 29.8 s |
| 2 | `confirm_verdict` | `0xbd14fd150d8ff0e6084304d1f80d42108031f9e3b7fca3f64f18ee4a1c373b15` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @38.2s | 6.2 s | 38.2 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 1.0 s |
| 2 | `appeal` | `0x213d56d42436593818f1af91700cd9ed66c4181397be27cfb9ef9052aa5e7726` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.1s → COMMITTING (SUCCESS) @46.2s → ACCEPTED (SUCCESS) @86.1s → FINALIZED (SUCCESS) @117.2s | 86.1 s | 117.2 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, disagree 1, idle 1 | 42.5 s |
| 2 | `confirm_verdict` | `0x577cda053d13648aad770b33a4aa18e72ac737310e9197b1f65f7f12ce356963` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.2s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @35.2s | 6.2 s | 35.2 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 1.0 s |
| 2 | `finalize` | `0xcce5722e50263b246d1435e00b2a8051955ae84d8af8c32ddd52c86ffce4a2e0` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @37.1s | 6.2 s | 37.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 1.0 s |
| 3 | `open_case_package` | `0xe979695a8e9f714bec2f421b47e985208201d1a56043db942c2f9269b0184bf3` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @3.2s → ACCEPTED (SUCCESS) @6.3s → FINALIZED (SUCCESS) @48.1s | 6.3 s | 48.1 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 1.0 s |
| 3 | `judge` | `0xd91f8f643c7e24109c6c21973c5c88709bf4fc6cd43dbd22f2ebe6eed0eb2438` | PENDING (UNKNOWN) @0.1s → PROPOSING (UNKNOWN) @6.2s → COMMITTING (SUCCESS) @21.5s → ACCEPTED (SUCCESS) @36.8s → FINALIZED (SUCCESS) @70.8s | 36.8 s | 70.8 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, disagree 2 | 16.7 s |
| 3 | `confirm_verdict` | `0xdbab7d79d10acc7f8a92a934a5cbf19047a3e22c636ef9d291bebb878300e0e6` | PENDING (UNKNOWN) @0.1s → COMMITTING (SUCCESS) @3.1s → ACCEPTED (SUCCESS) @6.2s → FINALIZED (SUCCESS) @35s | 6.2 s | 35 s | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 | 1.0 s |
| 3 | `revoke` | `0x37ae96c20005039a8be448fc8fe743f9b9c657ac854f19bb84571b1d85c13197` | PENDING (UNKNOWN) @0.1s → COMMITTING (ERROR) @3.1s → ACCEPTED (ERROR) @6.2s → FINALIZED (ERROR) @37s | 6.2 s | 37 s | FINALIZED / MAJORITY_AGREE / ERROR | agree 3, idle 2 | 1.0 s |

### What this shows

* **Two-step finality is real and observable.** Every transaction passed PENDING → PROPOSING/COMMITTING → ACCEPTED → FINALIZED. Jury transactions reached ACCEPTED after 30.8–86.1 s and FINALIZED after 61.6–117.2 s; deterministic calls (`open_case_package`, `confirm_verdict`, `finalize`) finalized after about 35–70 s. The relayer showed no verdict until FINALIZED + SUCCESS: each card/inbox receipt was written only after the FINALIZED observation, and every API response before that said `finality: ACCEPTED, final: false`.
* **Execution result is separate from status.** The on-chain `revoke` attempted after `confirm_verdict` (case 3) reached **FINALIZED with execution ERROR**, revert reason `[EXPECTED] verdict is final; request an off-chain takedown instead`. A status-only check would have called it final; the relayer classifies it FINALIZED_ERROR.
* **Validator agreement, including real disagreement.** Each transaction had 5 validators. Most finished agree 3 / idle 2. Case 3's Tier 1 jury finished **agree 3 / disagree 2** (two validators' own panels were outside tolerance or picked a different clear winner) and Case 2's Tier 2 jury finished **agree 3 / disagree 1 / idle 1**; both still reached MAJORITY_AGREE in round 1 with no leader rotation. The verdict stood because a majority of independently re-run panels agreed, which is the property the README claims.
* **Receipt number on-chain.** Every relayer write passed the packageDigest; the inbox holds 6 hash-chained FINALIZED_SUCCESS receipts (3 for case 1, 2 for case 2, 1 for case 3) whose `packageDigest` equals the on-chain `package_digest`.
* **Revocation window.** After Tier 1 was final, the winner's revoke was refused by the relayer (409) and by the contract (revert above); the off-chain takedown then hid the case (`GET` → 410) while the chain keeps the text.
* **Fees.** Studionet charged nothing: every leader receipt reports `gas_used: 0`, and the transaction's `gaslimit` field equals its nonce (1 … 17), so it is not a fee. Bradbury fee behaviour is still unmeasured.
* **Latency for a full ladder** (case 1: open, Tier 1, Tier 2, Supreme Court, with a `confirm_verdict` after each): about 6 minutes (363 s) end to end, dominated by the finality window of each jury transaction plus each confirmation.

### Findings that changed the code

1. **Receipt status field names.** `waitForTransactionReceipt` on Studio returns a simplified receipt with `status_name` (snake_case) and a numeric `status` (5 = ACCEPTED, 7 = FINALIZED), not `statusName`. The first deploy attempt classified it as UNKNOWN (fail closed: nothing was treated as final). `classifyTx` now reads `statusName`, then `status_name`, then maps numeric status with genlayer-js's own `transactionsStatusNumberToName`; unit tests added.
2. **Node fetch and proxies.** genlayer-js uses Node's built-in fetch, which ignores `HTTPS_PROXY`; behind a proxy run with `NODE_USE_ENV_PROXY=1` (documented in `deploy/STUDIO_DEPLOY.md`).
3. **Transient RPC garbage.** Twice during the run studionet answered `eth_getTransactionByHash` with an HTML page instead of JSON-RPC. The poller logged it and retried (an RPC error is never an answer), and both transactions were classified correctly on the next poll.

### Not covered by this run

* Bradbury testnet (needs faucet GEN; fees may be required). The README placeholders for Bradbury, the demo video and the live app are still **TO FILL AFTER DEPLOY**.
* An overturn on appeal (all three ladders upheld the first verdict), a leader rotation, an UNDETERMINED or timeout outcome, and Twitch (no Partner/Affiliate channel).
* Wall-clock variance: one run of three cases; treat the latencies as indicative.

