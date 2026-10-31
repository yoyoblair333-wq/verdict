// TIER: live (real network, READ-ONLY). Skipped unless GENLAYER_LIVE=1.
//   GENLAYER_LIVE=1 GENLAYER_NETWORK=studionet JUDGE_ROUTER_ADDRESS=0x... \
//   EXPECTED_CONTRACT_CODE_DIGEST=<sha256> npm run test:live
// Uses a random throwaway key for reads; never sends a transaction.

import assert from "node:assert/strict";
import { test } from "node:test";
import { generatePrivateKey } from "genlayer-js";
import { parseNetwork, type Config } from "../../src/config.js";
import { JudgeRouterClient } from "../../src/lib/genlayer.js";
import { checkContractPin } from "../../src/lib/pinning.js";

const LIVE = process.env.GENLAYER_LIVE === "1";

test("live: deployed contract code matches EXPECTED_CONTRACT_CODE_DIGEST and views respond", { skip: !LIVE && "set GENLAYER_LIVE=1 plus GENLAYER_NETWORK, JUDGE_ROUTER_ADDRESS, EXPECTED_CONTRACT_CODE_DIGEST" }, async () => {
  const cfg = {
    mode: "shadow",
    network: parseNetwork(process.env.GENLAYER_NETWORK ?? "studionet"),
    rpcUrl: process.env.GENLAYER_RPC_URL || undefined,
    contractAddress: process.env.JUDGE_ROUTER_ADDRESS as `0x${string}`,
    relayerPrivateKey: generatePrivateKey(),
  } as unknown as Config;
  const chain = new JudgeRouterClient(cfg);
  const pin = await checkContractPin(() => chain.getContractCode(), process.env.EXPECTED_CONTRACT_CODE_DIGEST ?? "");
  assert.equal(pin.state, "match", JSON.stringify(pin));
  const recent = await chain.listRecent(5, "");
  assert.ok(Array.isArray(recent));
});
