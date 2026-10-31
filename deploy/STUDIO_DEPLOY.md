# Deploy and run one full case in GenLayer Studio (web UI)

This walks through deploying `contracts/judge_router.py` at <https://studio.genlayer.com> and running one complete case by hand: open → judge → appeal → finalize. It needs only a browser. For a scripted deploy, see `deploy/deploy.ts` (bottom of this page).

Everything you type into a case is **public and permanent** on the network. Use the demo texts in `examples/`, never real names or personal details.

## 0. Before you start

1. Run the local checks first, so you deploy a version that passes: `bash scripts/verify.sh` must end with `VERIFY: PASS`.
2. Note the code digest you are deploying: `make digest` (or `cd relayer && npm run contract-digest`). Keep it; it goes in the evidence table.

## 1. Load the contract

1. Open <https://studio.genlayer.com>.
2. In the left panel, open **Contracts** and create a new file named `judge_router.py`.
3. Paste the full contents of `contracts/judge_router.py`. The first line must stay exactly as it is:
   `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`
   (GenVM v0.2 SDK; studionet accepted this version on 2026-10-31, see `docs/LIVE_EVIDENCE.md`).

## 2. Deploy

1. Open **Run and Debug**.
2. Constructor argument: `daily_limit` = `0` (no on-chain per-sender cap; the relayer enforces caps).
3. Click **Deploy** and wait until the transaction shows **FINALIZED**.
4. Copy as evidence: the **contract address** and the **deploy transaction hash**.

## 3. Run one full case (the Studio path uses `open_case`)

Studio's form is easiest with the legacy `open_case` method, which takes plain arguments. (The relayer uses `open_case_package`; to try that path in Studio, build a package with `cd relayer && npm run build && node dist/tools/makePackage.js ../examples/case-1-pizza.json <contract address>` and paste `package_json` and `package_digest` into `open_case_package`.)

Use `examples/case-1-pizza.json`; its `studio` block has the values.

| Step | Method | Arguments | What to check |
|---|---|---|---|
| 1 | `open_case` | rubric `whos_right`; entries `["Pineapple belongs on pizza: sweet + salty is a classic pairing.", "Pineapple on pizza is a crime against Naples."]`; surface `settle`; client_ref `demo-case-1` | returns `1` (the case id) |
| 2 | `get_case` (view) | case_id `1` | `status` = `pending`, `tier` = 1 |
| 3 | `judge` | case_id `1`; package_digest `""` (empty: legacy cases have no package) | wait for **FINALIZED**; 5 juror prompt passes run on the leader and every validator |
| 4 | `get_verdict` (view) | `1` | `winner_index`, `scores` (0–100), `juror_votes` (5), `split` (e.g. `4-1`), `reason` |
| 5 | `appeal` | case_id `1`; package_digest `""`; from_tier `1` | Appeals Court: 7 jurors, `tier` = 2. A retry with from_tier `1` reverts with `tier mismatch` (no double escalation) |
| 6 | `appeal` (optional) | `1`, `""`, `2` | Supreme Court: 9 jurors, `status` = `final` |
| 7 | `finalize` (if you stopped after step 5) | `1`, `""` | `status` = `final` |

Raise the validator count in Studio's settings before step 3 to watch the validators re-run the panel and agree or disagree (the custom validator accepts within ±2.0 points per mean, and the same winner or a close call within 1.0 point).

## 4. What to copy as evidence

Fill the table in README "Verify in 5 minutes" and `docs/LIVE_EVIDENCE.md`:

- contract address and deploy tx hash
- the tx hash of each `open_case` / `judge` / `appeal` / `finalize` call
- for each tx: the status it reached (ACCEPTED, then FINALIZED) and the execution result (SUCCESS / ERROR)
- the validator votes shown in the transaction details (agree / disagree / idle)
- a screenshot or short screen recording of steps 3–6

## 5. Scripted deploy (genlayer-js)

`deploy/deploy.ts` does the same deploy from the command line. It needs network access and a funded throwaway key (studionet accounts need no faucet; Bradbury needs testnet GEN from the faucet).

```bash
cd relayer && npm ci
# throwaway key, kept out of git (relayer/.gitignore lists .env.local):
node -e 'import("genlayer-js").then(m=>console.log("RELAYER_PRIVATE_KEY="+m.generatePrivateKey()))' > .env.local
set -a; . ./.env.local; set +a
GENLAYER_NETWORK=studionet DAILY_LIMIT=0 NODE_USE_ENV_PROXY=1 npm run deploy
```

It prints `EXPECTED_CONTRACT_CODE_DIGEST=…`, the deploy tx and `JUDGE_ROUTER_ADDRESS=…`. Then run the relayer against it (`VERDICT_MODE=shadow` first) or the full evidence run: `JUDGE_ROUTER_ADDRESS=… EXPECTED_CONTRACT_CODE_DIGEST=… NODE_USE_ENV_PROXY=1 node dist/tools/liveRun.js ../docs/live/run.json`.

`NODE_USE_ENV_PROXY=1` is only needed behind an HTTPS proxy (Node's built-in fetch ignores `HTTPS_PROXY` otherwise).
