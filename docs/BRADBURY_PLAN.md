# Bradbury testnet: plan and blocker

Status (2026-10-31): **not deployed.** The throwaway relayer address `0x34653Fb290480a8C99B4D92D4857123B5624c37d` holds 0 GEN on Bradbury, and the faucet cannot be used from an automated session.

## Network parameters

From `relayer/node_modules/genlayer-js` 1.1.8 (`testnetBradbury` in `genlayer-js/chains`), checked live against the RPC:

| Item | Value |
|---|---|
| Chain id | `4221` (`eth_chainId` = `0x107d`, confirmed live) |
| RPC (genlayer-js default) | `https://rpc-bradbury.genlayer.com` (live; latest block 201700 at 2026-10-31 22:04 UTC) |
| Explorer | `https://explorer-bradbury.genlayer.com/` |
| Currency | GEN, 18 decimals |
| Consensus main contract | `0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D` |
| Consensus data contract | `0x85D7bf947A512Fc640C75327A780c90847267697` |
| Fee manager contract | `0xF205868bf5db79d2162843742D18D0900A9E462a` |
| Staking contract | `0x4A4449E617F8D10FDeD0b461CadEf83939E821A5` |
| Default validators / max rotations | 5 / 3 |
| `eth_gasPrice` (observed) | `0x989680` = 10,000,000 wei = 0.01 gwei |

The faucet page calls the network "Bradbury Phase 2" and lists a different RPC and explorer for the same chain id 4221: `https://rpc-genlayer-chain-testnet-cfn8m3xc6l.t.conduit.xyz` and `https://explorer-genlayer-chain-testnet-cfn8m3xc6l.t.conduit.xyz`. Both are blocked by this session's egress allowlist, so it is unverified whether they are the same chain as `rpc-bradbury.genlayer.com`. If they differ, set `GENLAYER_RPC_URL` to the conduit RPC for every command below.

## Faucet requirements (`https://testnet-faucet.genlayer.foundation`)

Read from the page and its client bundle:

1. Sign in with GitHub. The account must be older than 3 months and have at least 1 public repo.
2. Pass a Cloudflare Turnstile captcha.
3. The address you claim for must hold at least 0.01 ETH on Ethereum mainnet. This is the most common rejection (6,906 of 22,110 per `/api/stats`).
4. Limit: 100 GEN per claim, once per week.

The throwaway address has no mainnet ETH, so it cannot claim directly even with a login.

## Next steps for Blair

1. Open `https://testnet-faucet.genlayer.foundation` in your browser.
2. Sign in with your GitHub account.
3. Enter your own wallet address that holds at least 0.01 ETH on Ethereum mainnet.
4. Solve the captcha and claim the 100 GEN.
5. In your wallet, add the network shown on the faucet page (chain id 4221).
6. Send 25 GEN from your wallet to `0x34653Fb290480a8C99B4D92D4857123B5624c37d`.
7. Tell Claude the transfer is done. Claude then runs the steps below.

## What Claude runs once the address is funded

1. Check the balance: `eth_getBalance` on the RPC above.
2. Deploy JudgeRouter: `GENLAYER_NETWORK=testnetBradbury DAILY_LIMIT=0 NODE_USE_ENV_PROXY=1 npm run deploy` (in `relayer/`, with `.env.local` loaded).
3. Deploy PatternLedger. `deploy/deploy.ts` passes `[DAILY_LIMIT]` as the first constructor argument, but `pattern_ledger.py`'s first parameter is `relayer: str`, so it needs an args override (pass `[]`) before it can deploy that contract.
4. Compare `gen_getContractCode` for each address with `sha256` of the source (`npm run contract-digest`).
5. Run the 3 cases: `GENLAYER_NETWORK=testnetBradbury JUDGE_ROUTER_ADDRESS=0x... EXPECTED_CONTRACT_CODE_DIGEST=... NODE_USE_ENV_PROXY=1 node dist/tools/liveRun.js ../docs/live/bradbury-run.json`.
6. Make 2 pattern submissions through `relayer/src/lib/pattern.ts` (there is no CLI tool for this yet; the studionet run in `docs/live/pattern-ledger-run.json` was done by hand).
7. Record per-tx fees from receipts (gas used x effective gas price, in GEN) and the times to ACCEPTED and FINALIZED.
8. Add the "Bradbury testnet" section to `docs/LIVE_EVIDENCE.md` and fill the README's Bradbury row.

Open questions to answer during the run (from README "Open items"): whether Bradbury requires explicit `fees` on writes (the relayer sends none), and whether the v0.2 SDK header is accepted as on studionet.
