// The live deployment this page talks to. Same values as relayer/.env.example
// and docs/LIVE_EVIDENCE.md (current studionet deployment, audited contract).
export const NETWORK = "studionet";
export const NETWORK_LABEL = "GenLayer testnet (studionet) · no real value";
export const RPC_URL = "https://studio.genlayer.com/api";
export const CONTRACT_ADDRESS = "0x7DBc10d8922A5Ba498007D212F2088872F2aCe06";
/** sha256 of contracts/judge_router.py as deployed (gen_getContractCode). */
export const CONTRACT_CODE_DIGEST = "3ef39cc8a02f7c2bdbf3f3b7d19340622439a381192ced7cbcd799232139ea25";
export const DEPLOY_TX = "0xf98a974976d949581eb6ec534a3e97598c95fab630e878aa7e2c4bbf07ed4bbd";
/**
 * Explorer for studionet as published in genlayer-js 1.1.8
 * (`studionet.blockExplorers.default.url`). The per-transaction path is an
 * assumption: the page also checks every transaction live over RPC, which
 * does not depend on the explorer.
 */
export const EXPLORER_TX = (hash) => `https://genlayer-explorer.vercel.app/transactions/${hash}`;
export const EXPLORER_ADDRESS = (addr) => `https://genlayer-explorer.vercel.app/address/${addr}`;

// Package settings for visitor-signed cases (mirrors relayer/src/config.ts defaults).
export const NOTICE_VERSION = "public-onchain-v1";
export const MODERATION_POLICY_VERSION = "verdict-local-2026-10-31+browser-local-only";
export const SUBMISSION_TTL_SEC = 900;
export const CASE_LIFETIME_SEC = 86400;
export const SURFACE = "settle";

export const POLL_MS = 3000;
export const TX_TIMEOUT_MS = 15 * 60 * 1000;

export const BURNER_KEY = "verdict.testnet-burner.v1";
export const MY_CASES_KEY = "verdict.my-cases.v1";
