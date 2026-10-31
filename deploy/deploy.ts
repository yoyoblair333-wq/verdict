// Deploy JudgeRouter with genlayer-js (CLI alternative to the Studio UI guide
// in ./STUDIO_DEPLOY.md). Needs network access and a funded key.
//
//   cd relayer && npm ci
//   GENLAYER_NETWORK=studionet RELAYER_PRIVATE_KEY=0x... DAILY_LIMIT=0 npm run deploy
//
// Prints the contract address, the deploy tx hash and the code digest to put
// in EXPECTED_CONTRACT_CODE_DIGEST. Compiled by relayer/tsconfig.deploy.json.
// Address extraction follows genlayer-project-boilerplate/deploy (Oct 2026):
// Studio/localnet receipts carry data.contract_address, testnets
// txDataDecoded.contractAddress.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus, type DecodedDeployData, type TransactionHash } from "genlayer-js/types";
import { sha256Hex } from "../relayer/src/lib/canonical.js";
import { classifyTx } from "../relayer/src/lib/finality.js";

const CHAINS = { localnet, studionet, testnetAsimov, testnetBradbury } as const;

async function main(): Promise<void> {
  const network = process.env.GENLAYER_NETWORK ?? "studionet";
  if (!(network in CHAINS)) throw new Error(`GENLAYER_NETWORK must be one of ${Object.keys(CHAINS).join(" | ")}`);
  const chain = CHAINS[network as keyof typeof CHAINS];
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("RELAYER_PRIVATE_KEY missing or malformed");
  const rawLimit = process.env.DAILY_LIMIT ?? "0";
  if (!/^\d+$/.test(rawLimit)) throw new Error("DAILY_LIMIT must be a non-negative integer");

  // dist-deploy/deploy/deploy.js -> repo root is three levels up.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const contractPath = process.env.CONTRACT_PATH ?? path.resolve(here, "../../../contracts/judge_router.py");
  const code = new Uint8Array(readFileSync(contractPath));
  console.log(`contract: ${contractPath}`);
  console.log(`EXPECTED_CONTRACT_CODE_DIGEST=${sha256Hex(code)}`);

  const client = createClient({
    chain,
    account: createAccount(pk as `0x${string}`),
    ...(process.env.GENLAYER_RPC_URL ? { endpoint: process.env.GENLAYER_RPC_URL } : {}),
  });
  const hash = (await client.deployContract({ code, args: [Number.parseInt(rawLimit, 10)] })) as TransactionHash;
  console.log(`deploy tx: ${hash}`);
  // genlayer-js 1.1.8 returns on any decided state when asked for ACCEPTED;
  // classify explicitly and require a SUCCESS execution result.
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, retries: 200 });
  const cls = classifyTx(receipt);
  console.log(`status: ${cls.chainStatus} finality=${cls.finality} execution=${cls.execution}`);
  if (cls.execution !== "SUCCESS") throw new Error("deployment did not execute successfully");
  const r = receipt as unknown as { data?: { contract_address?: string }; txDataDecoded?: DecodedDeployData };
  const address = r.data?.contract_address ?? r.txDataDecoded?.contractAddress;
  console.log(`JUDGE_ROUTER_ADDRESS=${address ?? "(not in receipt; check the explorer for this tx)"}`);
  console.log("Wait for FINALIZED before announcing the address; record both in README 'Verify in 5 minutes'.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
