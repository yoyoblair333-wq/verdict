// The live deployment this page talks to. Same values as relayer/.env.example
// and docs/LIVE_EVIDENCE.md (current studionet deployment; matches contracts/judge_router.py).
export const NETWORK = "studionet";
export const NETWORK_LABEL = "GenLayer testnet (studionet) · no real value";
export const RPC_URL = "https://studio.genlayer.com/api";
export const CONTRACT_ADDRESS = "0x3f867934247d88Aa3134d897a9246cfB1324B1Fa";
/** sha256 of contracts/judge_router.py as deployed (gen_getContractCode). */
export const CONTRACT_CODE_DIGEST = "7c18143cf8f5224d6f8cdccebcdcc70b3b584f0b9247bf55c8439d2fac10ca1b";
/**
 * The VERDICT relayer's address on this deployment (get_config().relayer, also
 * the owner and the evidence deployer; docs/LIVE_EVIDENCE.md). Only a case whose
 * creator is this address gets relayer-verified labels (ADR-023, AUDIT-2 P1-7).
 * Every other case is a visitor case: its labels are the opener's own claims.
 */
export const RELAYER_ADDRESS = "0x34653Fb290480a8C99B4D92D4857123B5624c37d";
/** Cases per "Load older" page, fetched by id (not list_recent's 50-newest window). */
export const PAGE_SIZE = 20;
export const DEPLOY_TX = "0xf9606205fa12c2126b1499c814054ed5b9dba9077dad55968a3b1812344a8622";
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
