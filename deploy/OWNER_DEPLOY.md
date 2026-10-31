# Deploy both contracts from your own wallet (owner deploy)

**Why.** A contract's *creator* (the address that deploys it) may receive a share of the transaction fees the contract generates: per GenLayer's portal; UNVERIFIED as to form and timing. Either way the creator is the owner, so the final `JudgeRouter` and `PatternLedger` must be deployed from **your own wallet**. The relayer's throwaway key only signs day-to-day transactions, as the **relayer** role. It is never the creator.

**The two roles in both contracts**

| Role | Who | Can do |
|---|---|---|
| Owner (creator) | your wallet, the deployer | everything, plus admin: `set_relayer`, `set_paused`, `set_daily_limit`, `transfer_ownership`, Studio-only `open_case` |
| Relayer | the relayer's hot key | JudgeRouter: open and run cases (`open_case_package`, `judge`, `appeal`, `confirm_verdict`, `finalize`, `expire`). PatternLedger: `submit_pattern`. Never admin. |

`revoke` stays with the case's creator (the relayer key that opened it) or the owner.

Each step below is one action. Do them in order.

## A. Before you start

1. On your computer, open a terminal in the `verdict` folder.
2. Run `bash scripts/verify.sh` and wait for `VERIFY: PASS`.
3. Run `cd relayer && npm run contract-digest` and copy the printed digest into a note. This is the `EXPECTED_CONTRACT_CODE_DIGEST` for the new JudgeRouter.
4. Find the relayer's address: in the same terminal run `node -e 'import("genlayer-js").then(m=>console.log(m.createAccount(process.env.RELAYER_PRIVATE_KEY).address))'` with `RELAYER_PRIVATE_KEY` set from `relayer/.env.local`.
5. Copy that address (it starts with `0x`) into your note as **RELAYER ADDRESS**.

## B. Connect your wallet in Studio

1. Open <https://studio.genlayer.com> in your browser.
2. Open the account menu (top right).
3. Choose your own wallet as the active account (connect it if Studio asks).
4. Copy the active account's address into your note as **OWNER ADDRESS**.
5. Check that OWNER ADDRESS is your wallet and **not** the RELAYER ADDRESS. If they match, stop: the relayer would become the creator.

## C. Deploy JudgeRouter

1. In the left panel, open **Contracts**.
2. Create a new file named `judge_router.py`.
3. Paste the full contents of `contracts/judge_router.py`. Keep the first line exactly as it is.
4. Open **Run and Debug**.
5. Set the constructor argument `daily_limit` to `0`.
6. Set the constructor argument `relayer` to your RELAYER ADDRESS.
7. Click **Deploy**.
8. Wait until the deploy transaction shows **FINALIZED**.
9. Copy the contract address into your note as **JUDGE_ROUTER_ADDRESS**.
10. Copy the deploy transaction hash into your note.

## D. Check JudgeRouter's roles

1. Call the view `get_config`.
2. Check that `owner` equals your OWNER ADDRESS.
3. Check that `relayer` equals your RELAYER ADDRESS.

If you left `relayer` empty at deploy time, the relayer defaults to you. Then do this one call:

4. Call `set_relayer` with your RELAYER ADDRESS, from your own wallet.
5. Wait until it shows **FINALIZED**.
6. Call `get_config` again and check `relayer`.

## E. Deploy PatternLedger

1. In **Contracts**, create a new file named `pattern_ledger.py`.
2. Paste the full contents of `contracts/pattern_ledger.py`. Keep the first line exactly as it is.
3. Open **Run and Debug**.
4. Set the constructor argument `relayer` to your RELAYER ADDRESS.
5. Click **Deploy**.
6. Wait until the deploy transaction shows **FINALIZED**.
7. Copy the contract address into your note as **PATTERN_LEDGER_ADDRESS**.
8. Copy the deploy transaction hash into your note.

## F. Check PatternLedger's roles

1. Call the view `get_config`.
2. Check that `owner` equals your OWNER ADDRESS.
3. Check that `relayer` equals your RELAYER ADDRESS.

If you left `relayer` empty at deploy time:

4. Call `set_relayer` with your RELAYER ADDRESS, from your own wallet.
5. Wait until it shows **FINALIZED**.
6. Call `get_config` again and check `relayer`.

## G. Point the relayer at the new contracts

1. Open `relayer/.env.local` (never commit it).
2. Set `JUDGE_ROUTER_ADDRESS` to your JUDGE_ROUTER_ADDRESS.
3. Set `EXPECTED_CONTRACT_CODE_DIGEST` to the digest from step A3.
4. Set `PATTERN_LEDGER_ADDRESS` to your PATTERN_LEDGER_ADDRESS.
5. Leave `VERDICT_MODE=shadow` and `PATTERN_LEDGER_MODE=shadow`.
6. Start the relayer with `cd relayer && npm run build && npm start`.
7. Check that the startup log shows the contract pin check passing.

## H. Send the lead the evidence

1. Send the lead your note: both contract addresses, both deploy transaction hashes, the OWNER ADDRESS, the RELAYER ADDRESS and the digest.
2. The lead updates `relayer/.env.example`, `docs/LIVE_EVIDENCE.md` and the README contract table from it.

## If the relayer key is ever exposed

1. In Studio, with your own wallet active, call `set_relayer` on JudgeRouter with a new relayer address.
2. Call `set_relayer` on PatternLedger with the same new address.
3. Put the new key in `relayer/.env.local`.

The new key keeps running cases the old key opened. Ownership never moves unless you call `transfer_ownership` yourself, and neither does any creator fee share (per GenLayer's portal; UNVERIFIED as to form and timing).
