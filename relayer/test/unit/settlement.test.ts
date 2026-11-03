// TIER: unit (pure functions and stubs, no network). Settlement -> Reputation
// bridge, relayer side (src/lib/settlement.ts). All addresses are fictional.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  bridgeConfigFromEnv,
  bridgeSettlements,
  CASE_REF_RE,
  deriveCaseRef,
  deriveRequestKey,
  markBridgedArg,
  parseBridgeableRow,
  REQUEST_KEY_RE,
  rowToRecordArgs,
  SETTLEMENT_MAX_LIST,
  SETTLEMENT_OUTCOMES,
  SettlementBridgeError,
  shortCourtAddr,
  type BridgeableRow,
  type BridgeEvent,
  type RecordOutcomeArgs,
  type RecordOutcomeResult,
  type ReputationLedgerPort,
  type SettlementCourtPort,
} from "../../src/lib/settlement.js";

const root = new URL("../../../../", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, root), "utf8");

const COURT = ("0x" + "ab".repeat(20)) as `0x${string}`;
const SUBJECT_A = "0x" + "11".repeat(20);
const SUBJECT_B = "0x" + "22".repeat(20);
const SUBJECT_C = "0x" + "33".repeat(20);

const row = (over: Partial<BridgeableRow> = {}): BridgeableRow => ({
  id: 1,
  subject: SUBJECT_A,
  bucket: "fulfilled",
  overturned_on_appeal: false,
  ...over,
});

// ---- fakes (no network) ----

class FakeLedger implements ReputationLedgerPort {
  readonly calls: RecordOutcomeArgs[] = [];
  /** Subjects that have opted in (so the ledger counts their outcome). */
  constructor(
    private readonly optedIn: Set<string>,
    private readonly failSubjects: Set<string> = new Set(),
  ) {}
  async recordOutcome(a: RecordOutcomeArgs): Promise<RecordOutcomeResult> {
    this.calls.push(a);
    if (this.failSubjects.has(a.subject)) throw new Error("rpc down");
    if (this.optedIn.has(a.subject)) {
      return { recorded: true, subject: a.subject, bucket: a.outcome, caseRef: a.caseRef, replayed: false, revised: false };
    }
    return { recorded: false, reason: "subject_not_opted_in", subject: a.subject, bucket: a.outcome, caseRef: a.caseRef };
  }
}

class FakeCourt implements SettlementCourtPort {
  readonly address = COURT;
  readonly marks: Array<{ caseId: number; recorded: boolean }> = [];
  constructor(
    private readonly rows: BridgeableRow[],
    private readonly failMark: Set<number> = new Set(),
  ) {}
  async listBridgeable(n: number): Promise<BridgeableRow[]> {
    return this.rows.slice(0, n);
  }
  async markBridged(caseId: number, recorded: boolean): Promise<void> {
    if (this.failMark.has(caseId)) throw new Error("mark failed");
    this.marks.push({ caseId, recorded });
  }
}

// ------------------------------------------------------------ cross-runtime

test("settlement: SETTLEMENT_OUTCOMES mirror contracts/reputation_ledger.py OUTCOMES", () => {
  const py = read("contracts/reputation_ledger.py");
  const block = py.split("OUTCOMES = (")[1]!.split(")")[0]!;
  assert.deepEqual([...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]), [...SETTLEMENT_OUTCOMES]);
});

test("settlement: buckets mirror contracts/settlement_court.py RULING_BUCKET values", () => {
  const py = read("contracts/settlement_court.py");
  const block = py.split("RULING_BUCKET = {")[1]!.split("}")[0]!;
  const values = [...block.matchAll(/:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...values].sort(), [...SETTLEMENT_OUTCOMES].sort());
});

test("settlement: contract case_ref / request_key regexes match ours", () => {
  const py = read("contracts/reputation_ledger.py");
  assert.ok(py.includes(`CASE_REF_RE = re.compile(r"[A-Za-z0-9_-]{1,80}")`));
  assert.ok(py.includes(`REQUEST_KEY_RE = re.compile(r"[A-Za-z0-9_-]{16,64}")`));
});

// ------------------------------------------------------------ pure helpers

test("deriveCaseRef: deterministic settlement-<short>-<id>, passes the contract regex", () => {
  const ref = deriveCaseRef(COURT, 42);
  assert.equal(shortCourtAddr(COURT), "ababababab");
  assert.equal(ref, "settlement-ababababab-42");
  assert.match(ref, CASE_REF_RE);
  assert.equal(deriveCaseRef(COURT, 42), ref, "idempotent");
  assert.notEqual(deriveCaseRef(COURT, 43), ref, "id changes the ref");
  assert.throws(() => deriveCaseRef(COURT, -1), SettlementBridgeError);
  assert.throws(() => deriveCaseRef(COURT, 1.5), SettlementBridgeError);
});

test("deriveRequestKey: stable per (ref, bucket, overturned); passes the contract regex", () => {
  const ref = deriveCaseRef(COURT, 7);
  const k1 = deriveRequestKey(ref, "fulfilled", false);
  assert.match(k1, REQUEST_KEY_RE);
  assert.equal(deriveRequestKey(ref, "fulfilled", false), k1, "idempotent retry -> same key");
  assert.notEqual(deriveRequestKey(ref, "partial", false), k1, "a revised bucket -> new key");
  assert.notEqual(deriveRequestKey(ref, "fulfilled", true), k1, "an overturned flag flip -> new key");
  assert.notEqual(deriveRequestKey(deriveCaseRef(COURT, 8), "fulfilled", false), k1, "another case -> new key");
});

test("rowToRecordArgs: maps a bridgeable row to a record_outcome call", () => {
  const args = rowToRecordArgs(COURT, row({ id: 9, subject: SUBJECT_B, bucket: "not_fulfilled", overturned_on_appeal: true }));
  assert.deepEqual(args, {
    subject: SUBJECT_B,
    outcome: "not_fulfilled",
    caseRef: deriveCaseRef(COURT, 9),
    overturnedOnAppeal: true,
    requestKey: deriveRequestKey(deriveCaseRef(COURT, 9), "not_fulfilled", true),
  });
  // Idempotent: the same row maps to byte-identical args every time.
  assert.deepEqual(rowToRecordArgs(COURT, row({ id: 9, subject: SUBJECT_B, bucket: "not_fulfilled", overturned_on_appeal: true })), args);
});

test("markBridgedArg: exactly the ledger's recorded flag", () => {
  assert.equal(markBridgedArg({ recorded: true, subject: SUBJECT_A, bucket: "fulfilled" }), true);
  assert.equal(markBridgedArg({ recorded: false, subject: SUBJECT_A, bucket: "fulfilled", reason: "subject_not_opted_in" }), false);
});

test("parseBridgeableRow: strict on the fields consensus depends on", () => {
  assert.deepEqual(parseBridgeableRow({ id: 2, subject: SUBJECT_A, bucket: "partial", overturned_on_appeal: false }), {
    id: 2,
    subject: SUBJECT_A,
    bucket: "partial",
    overturned_on_appeal: false,
  });
  for (const bad of [
    null,
    [1],
    { id: -1, subject: SUBJECT_A, bucket: "fulfilled", overturned_on_appeal: false },
    { id: 1, subject: "0xnothex", bucket: "fulfilled", overturned_on_appeal: false },
    { id: 1, subject: SUBJECT_A, bucket: "won", overturned_on_appeal: false },
    { id: 1, subject: SUBJECT_A, bucket: "fulfilled", overturned_on_appeal: "yes" },
  ]) {
    assert.throws(() => parseBridgeableRow(bad), SettlementBridgeError, JSON.stringify(bad));
  }
});

// ------------------------------------------------------------ orchestrator

test("bridgeSettlements: FULFILLED opted-in, NOT_FULFILLED overturned, and subject-not-opted-in all mark_bridged", async () => {
  const rows = [
    row({ id: 1, subject: SUBJECT_A, bucket: "fulfilled", overturned_on_appeal: false }),
    row({ id: 2, subject: SUBJECT_B, bucket: "not_fulfilled", overturned_on_appeal: true }),
    row({ id: 3, subject: SUBJECT_C, bucket: "partial", overturned_on_appeal: false }), // never opted in
  ];
  const court = new FakeCourt(rows);
  const ledger = new FakeLedger(new Set([SUBJECT_A, SUBJECT_B])); // C did NOT opt in
  const events: BridgeEvent[] = [];

  const summary = await bridgeSettlements(court, ledger, 10, { log: (e) => events.push(e) });

  assert.equal(summary.scanned, 3);
  assert.equal(summary.errors.length, 0);

  // Every case was recorded once, with the right outcome + overturned flag.
  assert.equal(ledger.calls.length, 3);
  assert.deepEqual(
    ledger.calls.map((c) => [c.subject, c.outcome, c.overturnedOnAppeal]),
    [
      [SUBJECT_A, "fulfilled", false],
      [SUBJECT_B, "not_fulfilled", true],
      [SUBJECT_C, "partial", false],
    ],
  );

  // mark_bridged is called for ALL three, including the opted-out one (recorded=false).
  assert.deepEqual(court.marks, [
    { caseId: 1, recorded: true },
    { caseId: 2, recorded: true },
    { caseId: 3, recorded: false },
  ]);

  // The not-opted-in case is still a successful bridge, just a no-op in the ledger.
  assert.deepEqual(
    summary.bridged.map((b) => [b.caseId, b.recorded]),
    [
      [1, true],
      [2, true],
      [3, false],
    ],
  );
  // case_ref / request_key are the deterministic derivations.
  for (const b of summary.bridged) {
    assert.equal(b.caseRef, deriveCaseRef(COURT, b.caseId));
    assert.equal(b.requestKey, deriveRequestKey(b.caseRef, b.bucket, rows[b.caseId - 1]!.overturned_on_appeal));
    assert.match(b.caseRef, CASE_REF_RE);
    assert.match(b.requestKey, REQUEST_KEY_RE);
  }
});

test("bridgeSettlements: idempotent re-run produces identical case_ref / request_key per case", async () => {
  const rows = [row({ id: 5, subject: SUBJECT_A, bucket: "undecided", overturned_on_appeal: false })];
  const first = await bridgeSettlements(new FakeCourt(rows), new FakeLedger(new Set([SUBJECT_A])), 10);
  const second = await bridgeSettlements(new FakeCourt(rows), new FakeLedger(new Set([SUBJECT_A])), 10);
  assert.deepEqual(first.bridged[0]!.caseRef, second.bridged[0]!.caseRef);
  assert.deepEqual(first.bridged[0]!.requestKey, second.bridged[0]!.requestKey);
});

test("bridgeSettlements: the limit is the list_bridgeable page size", async () => {
  const rows = [row({ id: 1 }), row({ id: 2, subject: SUBJECT_B }), row({ id: 3, subject: SUBJECT_C })];
  const court = new FakeCourt(rows);
  const summary = await bridgeSettlements(court, new FakeLedger(new Set([SUBJECT_A, SUBJECT_B, SUBJECT_C])), 2);
  assert.equal(summary.scanned, 2);
  assert.deepEqual(court.marks.map((m) => m.caseId), [1, 2]);
});

test("bridgeSettlements: a record failure is isolated; later rows still bridge and the case is left unbridged for retry", async () => {
  const rows = [
    row({ id: 1, subject: SUBJECT_A }),
    row({ id: 2, subject: SUBJECT_B, bucket: "partial" }),
  ];
  const court = new FakeCourt(rows);
  const ledger = new FakeLedger(new Set([SUBJECT_A, SUBJECT_B]), new Set([SUBJECT_A])); // record for A throws
  const summary = await bridgeSettlements(court, ledger, 10);

  assert.deepEqual(summary.errors, [{ caseId: 1, stage: "record", error: "rpc down" }]);
  assert.deepEqual(summary.bridged.map((b) => b.caseId), [2]);
  assert.deepEqual(court.marks, [{ caseId: 2, recorded: true }], "case 1 is never marked bridged, so a later run retries it");
});

test("bridgeSettlements: a mark failure after a successful record is reported (record stays idempotent on retry)", async () => {
  const rows = [row({ id: 1, subject: SUBJECT_A })];
  const court = new FakeCourt(rows, new Set([1])); // mark_bridged throws
  const ledger = new FakeLedger(new Set([SUBJECT_A]));
  const summary = await bridgeSettlements(court, ledger, 10);
  assert.equal(ledger.calls.length, 1, "the outcome was recorded");
  assert.deepEqual(summary.errors, [{ caseId: 1, stage: "mark", error: "mark failed" }]);
  assert.equal(summary.bridged.length, 0);
});

// ------------------------------------------------------------ config

test("bridgeConfigFromEnv: SHADOW unless both gates say live; addresses required in live", () => {
  const court = "0x" + "a".repeat(40);
  const ledger = "0x" + "b".repeat(40);
  assert.deepEqual(bridgeConfigFromEnv({}, "live"), { mode: "shadow", courtAddress: null, ledgerAddress: null, limit: 25 });
  assert.equal(
    bridgeConfigFromEnv({ SETTLEMENT_BRIDGE_MODE: "live", SETTLEMENT_COURT_ADDRESS: court, REPUTATION_LEDGER_ADDRESS: ledger }, "shadow").mode,
    "shadow",
    "VERDICT_MODE shadow keeps it shadow",
  );
  assert.equal(
    bridgeConfigFromEnv({ SETTLEMENT_BRIDGE_MODE: "LIVE", SETTLEMENT_COURT_ADDRESS: court, REPUTATION_LEDGER_ADDRESS: ledger }, "live").mode,
    "shadow",
    "only the exact string live",
  );
  assert.deepEqual(bridgeConfigFromEnv({ SETTLEMENT_BRIDGE_MODE: "live", SETTLEMENT_COURT_ADDRESS: court, REPUTATION_LEDGER_ADDRESS: ledger, SETTLEMENT_BRIDGE_LIMIT: "5" }, "live"), {
    mode: "live",
    courtAddress: court,
    ledgerAddress: ledger,
    limit: 5,
  });
  assert.throws(() => bridgeConfigFromEnv({ SETTLEMENT_BRIDGE_MODE: "live", SETTLEMENT_COURT_ADDRESS: court }, "live"), /required when SETTLEMENT_BRIDGE_MODE=live/);
  assert.throws(() => bridgeConfigFromEnv({ SETTLEMENT_COURT_ADDRESS: "0x12" }, "live"), /40 hex/);
  assert.throws(() => bridgeConfigFromEnv({ SETTLEMENT_BRIDGE_LIMIT: "-1" }, "live"), /SETTLEMENT_BRIDGE_LIMIT/);
  assert.equal(bridgeConfigFromEnv({ SETTLEMENT_BRIDGE_LIMIT: "999" }, "shadow").limit, SETTLEMENT_MAX_LIST, "clamped to 50");
});
