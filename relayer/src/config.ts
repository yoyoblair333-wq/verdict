// Environment configuration. Every secret is read from the environment;
// nothing sensitive is committed. See ../.env.example.

import { PUBLISH_BUDGET_CEILING_CENTS, PUBLISH_BUDGET_DEFAULT_CENTS } from "./lib/publishBudget.js";
import { randomBytes } from "node:crypto";
import path from "node:path";

export type NetworkName = "localnet" | "studionet" | "testnetBradbury" | "testnetAsimov";
export const NETWORKS: readonly NetworkName[] = ["localnet", "studionet", "testnetBradbury", "testnetAsimov"];

/** shadow = compute, validate and log what WOULD be submitted/resolved; never
 * spend gas, never touch Twitch, never debit credit. live = do it. */
export type VerdictMode = "shadow" | "live";

export interface Config {
  mode: VerdictMode;
  port: number;
  network: NetworkName;
  rpcUrl: string | undefined;
  contractAddress: `0x${string}`;
  /** sha256 (hex) of the JudgeRouter source this relayer was reviewed against. */
  expectedContractCodeDigest: string;
  /** Only "true" (exactly) lets a live relayer submit when the RPC cannot
   * return contract code for pinning. Default false: refuse. */
  allowUnverifiedContract: boolean;
  relayerPrivateKey: `0x${string}`;
  outboxPath: string;
  inboxPath: string;
  /** Durable relayer state: case meta (side-token hashes, appeal counts, flags) and drafts. */
  statePath: string;
  /** Prepaid credit ledger (user ids stored as unsalted sha256: pseudonymous, not anonymous). */
  creditsPath: string;
  /** Fee measurement journal (ADR-022 item 4). */
  feesPath: string;
  /** Seconds a draft's other side has to submit its take before the draft expires. */
  draftTtlSec: number;
  /** Seconds a package may wait before open_case_package must land. */
  submissionTtlSec: number;
  /** Seconds after the submission deadline during which judge/appeal are allowed. */
  caseLifetimeSec: number;
  /** Poll budget for ACCEPTED (request path) and FINALIZED (background). */
  acceptTimeoutMs: number;
  finalityTimeoutMs: number;
  pollIntervalMs: number;
  moderationPolicyVersion: string;
  /** Exactly "true": operator acknowledges there is no external moderation
   * provider and only the local pre-check runs. Without it, live mode refuses
   * to open cases (fail closed). */
  moderationAckLocalOnly: boolean;
  noticeVersion: string;
  apiKeys: Set<string>;
  perIpDailyCap: number;
  perKeyDailyCap: number;
  perKeyDailyActionCap: number;
  maxAppealsPerCase: number;
  freeAppealsPerDay: number;
  appealPriceCents: { tier2: number; tier3: number };
  adminToken: string;
  webhookSecret: string;
  webhookTimeoutMs: number;
  trustProxy: boolean;
  /** Quick Verdict (off-chain jury: Settle It quick, Red Flag Court, practice court). */
  quick: {
    /** Quick Verdicts (Settle It + Red Flag Court) per account key per UTC day. 0 = no cap. */
    dailyCap: number;
    /** Practice-court attempts per account key per UTC day (VERIFY P2-3: 10). */
    practiceDailyCap: number;
    /** Free publishes (Quick Verdict -> on-chain) per user per Los Angeles day (Design §1). */
    publishDailyCap: number;
    /** Global monthly fee budget for free publishes, in cents (ADR-022). Max PUBLISH_BUDGET_CEILING_CENTS. */
    publishBudgetCentsMonth: number;
    /** Fee reserved per publish until real fees are measured (open + judge + confirm). */
    publishFeeEstimateCents: number;
    /** Seconds a Settle It Quick Verdict can still be taken on-chain. */
    ttlSec: number;
    /** Reviewed secret-rule list for the practice court. */
    practiceRulesPath: string;
    /** Private store: Settle It Quick Verdict cases (needed to take one on-chain). */
    storePath: string;
    /** Private red-team store: door and bench catches (normalised text + pattern). */
    redTeamPath: string;
    /** Private sealed patch queue: attempts that got through. Never published. */
    sealedPath: string;
    /** HMAC secret for account keys (HMAC(IP or API key, day), V-PRIV-09). */
    accountKeySecret: string;
  };
  twitch: {
    clientId: string;
    broadcasterId: string;
    userAccessToken: string;
    predictionWindowSec: number;
    /** How long after a FINAL verdict the relayer waits for an appeal before
     * it resolves the Prediction (resolves at once when the case is final). */
    appealWindowMs: number;
  };
}

function req(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`Missing required env var ${name}`);
  return v.trim();
}

function opt(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v.trim() === "" ? fallback : v.trim();
}

function int(name: string, fallback: number): number {
  const raw = opt(name);
  if (raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`Env var ${name} must be a non-negative integer`);
  return Number.parseInt(raw, 10);
}

function hex(name: string, bytes: number): `0x${string}` {
  const v = req(name);
  if (!new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(v)) throw new Error(`Env var ${name} must be 0x + ${bytes * 2} hex chars`);
  return v as `0x${string}`;
}

/** Boolean env gates are true only for the exact string "true". */
function flag(name: string): boolean {
  return opt(name) === "true";
}

/** Unknown or missing VERDICT_MODE -> shadow (never a permissive default). */
export function parseMode(raw: string | undefined): VerdictMode {
  if (raw === "live") return "live";
  if (raw !== undefined && raw !== "" && raw !== "shadow") {
    console.warn(`[config] unknown VERDICT_MODE ${JSON.stringify(raw)}; using shadow`);
  }
  return "shadow";
}

export function parseNetwork(raw: string): NetworkName {
  const n = NETWORKS.find((x) => x === raw);
  if (!n) throw new Error(`GENLAYER_NETWORK must be one of ${NETWORKS.join(" | ")}`);
  return n;
}

const ZERO_KEY = /^0x0{64}$/;

/** RELAYER_PRIVATE_KEY. Live mode needs a real key. Shadow mode never signs,
 * so an unset or all-zero placeholder gets a fresh random key for this process
 * only (audit P1-1: the .env.example placeholder used to crash startup). */
export function relayerKey(mode: VerdictMode, raw: string | undefined): `0x${string}` {
  const v = (raw ?? "").trim();
  if (mode === "shadow" && (v === "" || ZERO_KEY.test(v))) {
    console.warn("[config] shadow mode: RELAYER_PRIVATE_KEY unset or placeholder; using a throwaway in-memory key (nothing is ever signed in shadow mode)");
    return `0x${randomBytes(32).toString("hex")}`;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error("Env var RELAYER_PRIVATE_KEY must be 0x + 64 hex chars");
  if (ZERO_KEY.test(v)) throw new Error("RELAYER_PRIVATE_KEY is the all-zero placeholder; live mode needs a real key (see README: Running it)");
  return v as `0x${string}`;
}

/** ADR-022: the operator sets the budget, but never above the hard ceiling. Refuse to start. */
export function publishBudget(cents: number): number {
  if (!Number.isInteger(cents) || cents < 0) throw new Error("PUBLISH_BUDGET_CENTS_MONTH must be a non-negative integer (cents)");
  if (cents > PUBLISH_BUDGET_CEILING_CENTS) {
    throw new Error(`PUBLISH_BUDGET_CENTS_MONTH=${cents} is above the hard ceiling of ${PUBLISH_BUDGET_CEILING_CENTS} cents a month (ADR-022); refusing to start`);
  }
  return cents;
}

export function loadConfig(): Config {
  const mode = parseMode(process.env.VERDICT_MODE?.trim());
  const digest = req("EXPECTED_CONTRACT_CODE_DIGEST").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error("EXPECTED_CONTRACT_CODE_DIGEST must be 64 hex chars (npm run contract-digest)");
  const dataDir = path.resolve(process.cwd(), "data");
  return {
    mode,
    port: int("PORT", 8787),
    network: parseNetwork(opt("GENLAYER_NETWORK", "studionet")),
    rpcUrl: opt("GENLAYER_RPC_URL") || undefined,
    contractAddress: hex("JUDGE_ROUTER_ADDRESS", 20),
    expectedContractCodeDigest: digest,
    allowUnverifiedContract: flag("ALLOW_UNVERIFIED_CONTRACT"),
    relayerPrivateKey: relayerKey(mode, process.env.RELAYER_PRIVATE_KEY),
    outboxPath: path.resolve(opt("VERDICT_OUTBOX_PATH", path.join(dataDir, "outbox.jsonl"))),
    inboxPath: path.resolve(opt("VERDICT_INBOX_PATH", path.join(dataDir, "inbox.jsonl"))),
    statePath: path.resolve(opt("VERDICT_STATE_PATH", path.join(dataDir, "state.jsonl"))),
    creditsPath: path.resolve(opt("VERDICT_CREDITS_PATH", path.join(dataDir, "credits.jsonl"))),
    feesPath: path.resolve(opt("VERDICT_FEES_PATH", path.join(dataDir, "fees.jsonl"))),
    draftTtlSec: Math.min(Math.max(60, int("VERDICT_DRAFT_TTL_SEC", 86400)), 7 * 86400),
    submissionTtlSec: Math.max(60, int("VERDICT_SUBMISSION_TTL_SEC", 900)),
    caseLifetimeSec: Math.min(Math.max(300, int("VERDICT_CASE_LIFETIME_SEC", 86400)), 30 * 86400),
    acceptTimeoutMs: int("GENLAYER_ACCEPT_TIMEOUT_MS", 600_000),
    finalityTimeoutMs: int("GENLAYER_FINALITY_TIMEOUT_MS", 3_600_000),
    pollIntervalMs: Math.max(1, int("GENLAYER_POLL_INTERVAL_MS", 5000)),
    moderationPolicyVersion: "verdict-local-2026-10-31",
    moderationAckLocalOnly: flag("MODERATION_ACK_LOCAL_ONLY"),
    noticeVersion: "public-onchain-v1",
    apiKeys: new Set(opt("API_KEYS").split(",").map((s) => s.trim()).filter(Boolean)),
    perIpDailyCap: int("PER_IP_DAILY_CAP", 20),
    perKeyDailyCap: int("PER_KEY_DAILY_CAP", 1000),
    perKeyDailyActionCap: int("PER_KEY_DAILY_ACTION_CAP", 1000),
    maxAppealsPerCase: Math.min(int("MAX_APPEALS_PER_CASE", 2), 2),
    freeAppealsPerDay: int("FREE_APPEALS_PER_DAY", 1),
    appealPriceCents: { tier2: int("APPEAL_PRICE_TIER2_CENTS", 199), tier3: int("APPEAL_PRICE_TIER3_CENTS", 499) },
    adminToken: opt("ADMIN_TOKEN"),
    webhookSecret: opt("WEBHOOK_SIGNING_SECRET"),
    webhookTimeoutMs: int("WEBHOOK_TIMEOUT_MS", 5000),
    trustProxy: flag("TRUST_PROXY"),
    quick: {
      dailyCap: int("QUICK_DAILY_CAP", 10),
      practiceDailyCap: int("PRACTICE_DAILY_CAP", 10),
      publishDailyCap: int("PUBLISH_DAILY_CAP", 3),
      publishBudgetCentsMonth: publishBudget(int("PUBLISH_BUDGET_CENTS_MONTH", PUBLISH_BUDGET_DEFAULT_CENTS)),
      publishFeeEstimateCents: Math.max(1, int("PUBLISH_FEE_ESTIMATE_CENTS", 90)),
      ttlSec: Math.min(Math.max(300, int("QUICK_TTL_SEC", 86400)), 7 * 86400),
      practiceRulesPath: path.resolve(opt("PRACTICE_RULES_PATH", path.resolve(process.cwd(), "config", "practice-rules.v1.json"))),
      storePath: path.resolve(opt("QUICK_STORE_PATH", path.join(dataDir, "quick.jsonl"))),
      redTeamPath: path.resolve(opt("REDTEAM_STORE_PATH", path.join(dataDir, "redteam.jsonl"))),
      sealedPath: path.resolve(opt("SEALED_STORE_PATH", path.join(dataDir, "sealed.jsonl"))),
      accountKeySecret: opt("ACCOUNT_KEY_SECRET") || randomBytes(32).toString("hex"),
    },
    twitch: {
      clientId: opt("TWITCH_CLIENT_ID"),
      broadcasterId: opt("TWITCH_BROADCASTER_ID"),
      userAccessToken: opt("TWITCH_USER_ACCESS_TOKEN"),
      predictionWindowSec: int("TWITCH_PREDICTION_WINDOW_SEC", 120),
      appealWindowMs: Math.min(int("TWITCH_APPEAL_WINDOW_SEC", 300), 3600) * 1000,
    },
  };
}
