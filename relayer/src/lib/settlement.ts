// Settlement -> Reputation bridge, relayer side (contracts/settlement_court.py
// + contracts/reputation_ledger.py).
//
// After a SettlementCourt case is FINAL and names a `subject` address, the
// relayer can carry its outcome into the OPT-IN ReputationLedger. This mirrors
// how pattern.ts carries a Red Flag Court ruling into the PatternLedger: the
// court itself never calls the ledger; a deterministic off-chain bridge reads
// the court's queue, submits one `record_outcome`, and writes the result back
// to the court with `mark_bridged`.
//
// This file is split in two, exactly like pattern.ts:
//   * PURE, network-free helpers (derive case_ref / request_key, map a
//     list_bridgeable row to a record_outcome call, parse the court's rows).
//     These are what the unit tests exercise.
//   * A thin orchestrator (bridgeSettlements) and genlayer-js client wrappers
//     (SettlementCourtClient / ReputationLedgerClient) for the live path.
//
// Privacy note: unlike the pattern bridge, there is no user text or PII to
// protect here - a `subject` is a wallet address and the ledger is address-only
// and opt-in. The deterministic request_key exists for IDEMPOTENCY (so a retry
// re-submits an identical record), not secrecy, so it is derived from public
// case facts rather than randomised.

import { createHash } from "node:crypto";
import { createAccount, createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";
import type { NetworkName, VerdictMode } from "../config.js";
import { pollFinality, type TxLike } from "./finality.js";
import { toPlain } from "./genlayer.js";

// ----------------------------------------------------------------- outcomes

/** The ledger's outcome buckets. MUST mirror OUTCOMES in
 * contracts/reputation_ledger.py and the values of RULING_BUCKET in
 * contracts/settlement_court.py (a unit test fails on drift). */
export const SETTLEMENT_OUTCOMES = ["fulfilled", "partial", "not_fulfilled", "undecided"] as const;
export type SettlementOutcome = (typeof SETTLEMENT_OUTCOMES)[number];

/** Default size of the bridge queue read per run; clamped to MAX_LIST. */
export const SETTLEMENT_BRIDGE_DEFAULT_LIMIT = 25;
/** list_bridgeable / list_recent cap in both contracts (MAX_LIST). */
export const SETTLEMENT_MAX_LIST = 50;

/** case_ref must match this in contracts/reputation_ledger.py (CASE_REF_RE). */
export const CASE_REF_RE = /^[A-Za-z0-9_-]{1,80}$/;
/** request_key must match this in both contracts (REQUEST_KEY_RE). */
export const REQUEST_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;
/** A 0x-prefixed 20-byte address, the only subject form the ledger accepts. */
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export class SettlementBridgeError extends Error {}

export function isSettlementOutcome(x: unknown): x is SettlementOutcome {
  return typeof x === "string" && (SETTLEMENT_OUTCOMES as readonly string[]).includes(x);
}

// ------------------------------------------------------------- pure helpers

/** One row from SettlementCourt.list_bridgeable: a final, subjected, not-yet-bridged case. */
export interface BridgeableRow {
  id: number;
  subject: string; // 0x + 40 hex
  bucket: SettlementOutcome;
  overturned_on_appeal: boolean;
}

/** The arguments for one ReputationLedger.record_outcome call. */
export interface RecordOutcomeArgs {
  subject: string;
  outcome: SettlementOutcome;
  caseRef: string;
  overturnedOnAppeal: boolean;
  requestKey: string;
}

/** What ReputationLedger.record_outcome returns. Only `recorded` drives the
 * bridge (it decides the mark_bridged argument); the rest is for logging. */
export interface RecordOutcomeResult {
  recorded: boolean;
  subject: string;
  bucket: string;
  caseRef?: string;
  reason?: string;
  replayed?: boolean;
  revised?: boolean;
  scorecard?: unknown;
  tx?: string;
}

/** Short, stable tag for a court address inside a case_ref: the first 10 hex
 * digits (lower-cased, no 0x). Collisions across courts are harmless - a
 * case_ref is only ever scoped to the one ledger this relayer writes to. */
export function shortCourtAddr(courtAddress: string): string {
  return courtAddress.replace(/^0x/i, "").toLowerCase().slice(0, 10);
}

/** Deterministic `settlement-<courtAddr-short>-<id>`. Same (court, id) -> same
 * ref, so the ledger counts the case exactly once and an appeal that changes
 * the bucket re-targets the SAME ref (the ledger then MOVES the count). */
export function deriveCaseRef(courtAddress: string, caseId: number): string {
  if (!Number.isInteger(caseId) || caseId < 0) throw new SettlementBridgeError(`bad case id ${String(caseId)}`);
  const ref = `settlement-${shortCourtAddr(courtAddress)}-${caseId}`;
  if (!CASE_REF_RE.test(ref)) throw new SettlementBridgeError(`derived case_ref does not match the contract regex: ${ref}`);
  return ref;
}

/** Deterministic request_key, stable per (case_ref, bucket, overturned). A
 * retry of the same record re-submits the same key (the ledger replays it
 * idempotently); a revision - a different bucket or overturned flag after an
 * appeal - yields a new key, which is what the ledger expects. The sha256 hex
 * digest is 64 chars, inside the contract's [A-Za-z0-9_-]{16,64}. */
export function deriveRequestKey(caseRef: string, bucket: SettlementOutcome, overturnedOnAppeal: boolean): string {
  const key = createHash("sha256")
    .update(`settlement-bridge|v1|${caseRef}|${bucket}|${overturnedOnAppeal ? 1 : 0}`)
    .digest("hex");
  if (!REQUEST_KEY_RE.test(key)) throw new SettlementBridgeError(`derived request_key does not match the contract regex: ${key}`);
  return key;
}

/** Strict parse of one list_bridgeable row (already run through toPlain). A
 * malformed row fails the bridge rather than being silently skipped. */
export function parseBridgeableRow(raw: unknown): BridgeableRow {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new SettlementBridgeError("bridgeable row is not an object");
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "number" || !Number.isInteger(r.id) || r.id < 0) throw new SettlementBridgeError("bad bridgeable id");
  if (typeof r.subject !== "string" || !ADDRESS_RE.test(r.subject)) throw new SettlementBridgeError("bad bridgeable subject");
  if (!isSettlementOutcome(r.bucket)) throw new SettlementBridgeError(`bad bridgeable bucket ${String(r.bucket)}`);
  if (typeof r.overturned_on_appeal !== "boolean") throw new SettlementBridgeError("overturned_on_appeal must be a boolean");
  return { id: r.id, subject: r.subject, bucket: r.bucket, overturned_on_appeal: r.overturned_on_appeal };
}

/** Parse a whole list_bridgeable response. */
export function parseBridgeableList(raw: unknown): BridgeableRow[] {
  if (!Array.isArray(raw)) throw new SettlementBridgeError("list_bridgeable did not return a list");
  return raw.map(parseBridgeableRow);
}

/** Map one bridgeable row to the record_outcome call for `courtAddress`. */
export function rowToRecordArgs(courtAddress: string, row: BridgeableRow): RecordOutcomeArgs {
  const caseRef = deriveCaseRef(courtAddress, row.id);
  return {
    subject: row.subject,
    outcome: row.bucket,
    caseRef,
    overturnedOnAppeal: row.overturned_on_appeal,
    requestKey: deriveRequestKey(caseRef, row.bucket, row.overturned_on_appeal),
  };
}

/** The mark_bridged argument is exactly the ledger's `recorded` flag: true when
 * the ledger counted the outcome, false when the subject had not opted in
 * (still a successful, final bridge - the court records the no-op). */
export function markBridgedArg(resp: RecordOutcomeResult): boolean {
  return resp.recorded === true;
}

// -------------------------------------------------------------------- ports

/** What the bridge needs from SettlementCourt. `address` is the court's own
 * contract address, used to derive deterministic case_refs. */
export interface SettlementCourtPort {
  readonly address: string;
  listBridgeable(n: number): Promise<BridgeableRow[]>;
  markBridged(caseId: number, recorded: boolean): Promise<void>;
}

/** What the bridge needs from ReputationLedger. */
export interface ReputationLedgerPort {
  recordOutcome(args: RecordOutcomeArgs): Promise<RecordOutcomeResult>;
}

// ------------------------------------------------------------- orchestrator

export interface BridgeOutcome {
  caseId: number;
  subject: string;
  bucket: SettlementOutcome;
  caseRef: string;
  requestKey: string;
  recorded: boolean;
  revised: boolean;
  replayed: boolean;
}

export interface BridgeError {
  caseId: number;
  stage: "record" | "mark";
  error: string;
}

export interface BridgeRunSummary {
  scanned: number;
  bridged: BridgeOutcome[];
  errors: BridgeError[];
}

export interface BridgeEvent {
  caseId: number;
  stage: "recorded" | "marked" | "error";
  detail?: Record<string, unknown>;
}

/** Carry up to `limit` final SettlementCourt outcomes into the ReputationLedger.
 * For each queued case: record_outcome, then mark_bridged(id, recorded). A row
 * that fails is captured in `errors` and the run continues; because the case
 * stays unbridged, the next run retries it (record_outcome is idempotent on the
 * derived request_key, so a retry never double-counts). */
export async function bridgeSettlements(
  court: SettlementCourtPort,
  ledger: ReputationLedgerPort,
  limit: number,
  opts: { log?: (e: BridgeEvent) => void } = {},
): Promise<BridgeRunSummary> {
  const log = opts.log ?? (() => {});
  const rows = await court.listBridgeable(limit);
  const summary: BridgeRunSummary = { scanned: rows.length, bridged: [], errors: [] };

  for (const row of rows) {
    const args = rowToRecordArgs(court.address, row);
    let resp: RecordOutcomeResult;
    try {
      resp = await ledger.recordOutcome(args);
    } catch (e) {
      const error = (e as Error).message;
      log({ caseId: row.id, stage: "error", detail: { stage: "record", error } });
      summary.errors.push({ caseId: row.id, stage: "record", error });
      continue;
    }
    const recorded = markBridgedArg(resp);
    log({ caseId: row.id, stage: "recorded", detail: { bucket: args.outcome, recorded } });
    try {
      await court.markBridged(row.id, recorded);
    } catch (e) {
      const error = (e as Error).message;
      log({ caseId: row.id, stage: "error", detail: { stage: "mark", error } });
      summary.errors.push({ caseId: row.id, stage: "mark", error });
      continue;
    }
    log({ caseId: row.id, stage: "marked", detail: { recorded } });
    summary.bridged.push({
      caseId: row.id,
      subject: args.subject,
      bucket: args.outcome,
      caseRef: args.caseRef,
      requestKey: args.requestKey,
      recorded,
      revised: resp.revised === true,
      replayed: resp.replayed === true,
    });
  }
  return summary;
}

// ------------------------------------------------------------------ config

export interface BridgeConfig {
  /** Effective mode: live only when SETTLEMENT_BRIDGE_MODE=live AND VERDICT_MODE=live. */
  mode: VerdictMode;
  courtAddress: `0x${string}` | null;
  ledgerAddress: `0x${string}` | null;
  limit: number;
}

function parseAddress(raw: string | undefined, name: string): `0x${string}` | null {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  if (!ADDRESS_RE.test(value)) throw new Error(`${name} must be 0x + 40 hex chars`);
  return value as `0x${string}`;
}

/** Reads SETTLEMENT_BRIDGE_MODE (default shadow), SETTLEMENT_COURT_ADDRESS and
 * REPUTATION_LEDGER_ADDRESS (both required in live) and SETTLEMENT_BRIDGE_LIMIT
 * (default 25, clamped 1..50). Only the exact string "live" in BOTH gates goes
 * live, matching patternConfigFromEnv. */
export function bridgeConfigFromEnv(env: NodeJS.ProcessEnv, verdictMode: VerdictMode): BridgeConfig {
  const want = (env.SETTLEMENT_BRIDGE_MODE ?? "").trim() === "live" ? "live" : "shadow";
  const mode: VerdictMode = want === "live" && verdictMode === "live" ? "live" : "shadow";
  const courtAddress = parseAddress(env.SETTLEMENT_COURT_ADDRESS, "SETTLEMENT_COURT_ADDRESS");
  const ledgerAddress = parseAddress(env.REPUTATION_LEDGER_ADDRESS, "REPUTATION_LEDGER_ADDRESS");
  if (mode === "live" && (courtAddress === null || ledgerAddress === null)) {
    throw new Error("SETTLEMENT_COURT_ADDRESS and REPUTATION_LEDGER_ADDRESS are required when SETTLEMENT_BRIDGE_MODE=live");
  }
  const rawLimit = (env.SETTLEMENT_BRIDGE_LIMIT ?? "").trim();
  if (rawLimit !== "" && !/^\d+$/.test(rawLimit)) throw new Error("SETTLEMENT_BRIDGE_LIMIT must be a non-negative integer");
  const parsed = rawLimit === "" ? SETTLEMENT_BRIDGE_DEFAULT_LIMIT : Number.parseInt(rawLimit, 10);
  const limit = Math.max(1, Math.min(parsed, SETTLEMENT_MAX_LIST));
  return { mode, courtAddress, ledgerAddress, limit };
}

// --------------------------------------------------------------- live clients

const CHAINS = { localnet, studionet, testnetAsimov, testnetBradbury } as const;
type Client = ReturnType<typeof createClient>;
type CalldataArg = NonNullable<Parameters<Client["writeContract"]>[0]["args"]>;

interface ClientOpts {
  network: NetworkName;
  rpcUrl?: string | undefined;
  address: `0x${string}`;
  privateKey: `0x${string}`;
  /** Finality budget for a write before it is treated as failed (default 1h). */
  finalityTimeoutMs?: number;
  pollIntervalMs?: number;
}

abstract class ContractClient {
  protected readonly client: Client;
  readonly relayerAddress: `0x${string}`;
  protected readonly finalityTimeoutMs: number;
  protected readonly pollIntervalMs: number;

  constructor(protected readonly opts: ClientOpts) {
    const account = createAccount(opts.privateKey);
    this.relayerAddress = account.address;
    this.client = createClient({ chain: CHAINS[opts.network], account, ...(opts.rpcUrl ? { endpoint: opts.rpcUrl } : {}) });
    this.finalityTimeoutMs = opts.finalityTimeoutMs ?? 3_600_000;
    this.pollIntervalMs = opts.pollIntervalMs ?? 5000;
  }

  protected async read(functionName: string, args: Array<string | number> = []): Promise<unknown> {
    return toPlain(await this.client.readContract({ address: this.opts.address, functionName, args }));
  }

  protected async getTransaction(hash: string): Promise<TxLike | null> {
    return ((await this.client.getTransaction({ hash: hash as TransactionHash })) as unknown as TxLike | null) ?? null;
  }

  /** Broadcast a write, then wait for FINALIZED_SUCCESS. Throws otherwise, so a
   * caller never records a write that did not land (two-step finality: see
   * finality.ts - an ACCEPTED result can still be overturned). */
  protected async writeFinal(functionName: string, args: ReadonlyArray<unknown>): Promise<string> {
    const hash = await this.client.writeContract({
      address: this.opts.address,
      functionName,
      args: args as unknown as CalldataArg,
      value: 0n, // never any value: no money is ever at stake
    });
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]+$/.test(hash)) throw new Error("writeContract returned no tx hash");
    const cls = await pollFinality(() => this.getTransaction(hash), {
      until: "FINAL",
      timeoutMs: this.finalityTimeoutMs,
      intervalMs: this.pollIntervalMs,
    });
    if (cls.finality !== "FINALIZED_SUCCESS") throw new Error(`${functionName} did not finalize (${cls.chainStatus}/${cls.execution})`);
    return hash;
  }
}

/** genlayer-js client for contracts/settlement_court.py (bridge reads + mark_bridged). */
export class SettlementCourtClient extends ContractClient implements SettlementCourtPort {
  readonly address: string;
  constructor(opts: ClientOpts) {
    super(opts);
    this.address = opts.address;
  }

  async listBridgeable(n: number): Promise<BridgeableRow[]> {
    return parseBridgeableList(await this.read("list_bridgeable", [n]));
  }

  async markBridged(caseId: number, recorded: boolean): Promise<void> {
    await this.writeFinal("mark_bridged", [caseId, recorded]);
  }

  getSettlementOutcome(caseId: number): Promise<unknown> {
    return this.read("get_settlement_outcome", [caseId]);
  }
}

/** genlayer-js client for contracts/reputation_ledger.py (record_outcome). */
export class ReputationLedgerClient extends ContractClient implements ReputationLedgerPort {
  async recordOutcome(a: RecordOutcomeArgs): Promise<RecordOutcomeResult> {
    const tx = await this.writeFinal("record_outcome", [a.subject, a.outcome, a.caseRef, a.overturnedOnAppeal, a.requestKey]);
    // record_outcome is a write, so its returned dict is not in the tx hash.
    // The ground truth of whether it was counted is get_case(case_ref).recorded:
    // true once the ledger stored the outcome, false when the subject never
    // opted in (the ledger declined - a normal, successful no-op for the bridge).
    const got = (await this.read("get_case", [a.caseRef])) as { recorded?: unknown };
    return {
      recorded: got.recorded === true,
      subject: a.subject,
      bucket: a.outcome,
      caseRef: a.caseRef,
      tx,
    };
  }

  isOptedIn(address: string): Promise<unknown> {
    return this.read("is_opted_in", [address]);
  }

  getScorecard(address: string): Promise<unknown> {
    return this.read("get_scorecard", [address]);
  }
}
