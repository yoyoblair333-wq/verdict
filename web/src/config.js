// The live deployment this page talks to. Same values as relayer/.env.example
// and docs/LIVE_EVIDENCE.md: the owner deployment on studionet, deployed from the
// owner's own wallet in GenLayer Studio; its code matches contracts/judge_router.py
// (canonical code digest: line endings normalised, see src/lib/package.js).
export const NETWORK = "studionet";
export const NETWORK_LABEL = "GenLayer testnet (studionet) · no real value";
export const RPC_URL = "https://studio.genlayer.com/api";
export const CONTRACT_ADDRESS = "0xEe9AB3e45005E97dA53BFE570412f30D6F2C1e64";
/**
 * Canonical code digest of contracts/judge_router.py (codeDigest in
 * src/lib/package.js), compared with the same digest of gen_getContractCode.
 * The stored bytes have CRLF line endings (raw sha256 6bfe51a7...f4da).
 */
export const CONTRACT_CODE_DIGEST = "7c18143cf8f5224d6f8cdccebcdcc70b3b584f0b9247bf55c8439d2fac10ca1b";
/**
 * PatternLedger (contracts/pattern_ledger.py), the Scam Pattern Ledger. Same
 * owner wallet; only the owner and the relayer may write (submit_pattern), so
 * the page reads it and never offers a visitor write. Canonical code digest
 * of the source; the stored bytes have CRLF line endings (raw 816b0be3...09b6).
 */
export const LEDGER_ADDRESS = "0x59C6047571bCE66828C733330fc9B5C88afEaE4D";
export const LEDGER_CODE_DIGEST = "63c2e2d400df0656cf0fb099ecddca2c2c66064051e73ce1c08ea4336c60ad93";
export const LEDGER_DEPLOY_TX = "0x89a0c790e7bc0db5730d2b88e57d10c05e02da0d7f54cb6ae445c33ed03a435e";
/** The contract owner (get_config().owner): the wallet that deployed it. */
export const OWNER_ADDRESS = "0x920fbbCf2106B693A857D1995c198e341220a46A";
/**
 * The VERDICT relayer's address on this deployment (get_config().relayer; it
 * opened the evidence cases; docs/LIVE_EVIDENCE.md). Only a case whose
 * creator is this address gets relayer-verified labels (ADR-023, AUDIT-2 P1-7).
 * Every other case is a visitor case: its labels are the opener's own claims.
 */
export const RELAYER_ADDRESS = "0x34653Fb290480a8C99B4D92D4857123B5624c37d";
/** Cases per "Load older" page, fetched by id (not list_recent's 50-newest window). */
export const PAGE_SIZE = 20;
export const DEPLOY_TX = "0x83f46b045911a63ecdfcfb0992ef91a719037dd271f9a8c30f94f84a697c8a88";
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

// Red Flag Court (Milestone 1, contracts/red_flag_court.py). OWNER deployment,
// deployed 2026-11-01 from the owner's wallet (owner 0x920fbbCf…a46A, relayer
// 0x34653Fb2…c37d; deploy/OWNER_DEPLOY.md section I). Supersedes the throwaway
// test deployment 0x5eDbd538e7fc22F07a01d86051c0B82e230C14be. The section is off
// unless REDFLAG_ENABLED or the page URL carries ?redflag=1.
export const REDFLAG_ADDRESS = "0x997E686B2A5A83e1C8f8E9F15CCB487b1893DDb0";
export const REDFLAG_ENABLED = false;

// Evidence Court (Milestone 2, contracts/evidence_court.py). Owner = the owner's
// wallet 0x920fbbCf…a46A (constructor `owner`), relayer = the VERDICT relayer
// key, which deployed it; stored code matches the source (canonical sha256
// in docs/live/evidence-court-run.json). The section is off unless
// EVIDENCE_ENABLED or the page URL carries ?evidence=1.
export const EVIDENCE_ADDRESS = "0x893aF11134BA268f922aB454DDd53123DF82A3E5";
export const EVIDENCE_ENABLED = false;
