// File-backed JSONL journals.
//
// Outbox (relayer/data/outbox.jsonl): append-only intent log. An `intent`
// record (requestKey + packageDigest + the exact call) is fsync'ed BEFORE the
// transaction is broadcast; `broadcast` (txHash) right after; `status` on
// every finality change. genlayer-js 1.1.8's writeContract signs and sends
// in one call and the GenLayer tx id is assigned on-chain, so the txHash
// cannot be known before broadcast: a crash between broadcast and the
// `broadcast` record is recovered by `reconcile`, which looks the case up
// on-chain by requestKey instead of resubmitting blindly.
//
// Inbox (relayer/data/inbox.jsonl): outcomes imported from the chain, as
// schemas/verdict-receipt.v1.json records chained by prevHash/recordHash.
//
// Neither journal may contain secrets or personal data: only public chain
// data (packages, digests, tx hashes, case ids). Checked by
// test/standin/privacy.test.ts.

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import path from "node:path";
import { canonicalize, sha256Hex } from "./canonical.js";
import type { Classification, TxFinality } from "./finality.js";

export class JournalCorrupt extends Error {}

export class JsonlFile {
  constructor(readonly file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
  }

  append(obj: unknown): void {
    const fd = openSync(this.file, "a", 0o600); // owner-only: operator data
    try {
      writeSync(fd, JSON.stringify(obj) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  readAll(): unknown[] {
    if (!existsSync(this.file)) return [];
    const out: unknown[] = [];
    readFileSync(this.file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (line.trim() === "") return;
        try {
          out.push(JSON.parse(line));
        } catch {
          // Fail closed: a damaged journal must be inspected by a human.
          throw new JournalCorrupt(`${this.file}: line ${i + 1} is not valid JSON`);
        }
      });
    return out;
  }
}

// -------------------------------------------------------------------- outbox

export type OpKind = "open" | "judge" | "appeal" | "confirm" | "revoke" | "expire";
export type WriteFn = "open_case_package" | "judge" | "appeal" | "confirm_verdict" | "revoke" | "expire";

export interface OpIntent {
  opKey: string;
  kind: OpKind;
  requestKey: string;
  packageDigest: string;
  caseId: number | null;
  fn: WriteFn;
  args: Array<string | number>;
  /** appeal only: the tier being appealed from (on-chain from_tier guard). */
  fromTier?: number;
  /** open only: lifetime.submissionDeadline; reconcile never resubmits after it. */
  submissionDeadline?: string;
}

export type OutboxRecord =
  | ({ type: "intent"; at: string } & OpIntent)
  | { type: "broadcast"; at: string; opKey: string; txHash: string }
  | { type: "broadcast_error"; at: string; opKey: string; error: string }
  | ({ type: "status"; at: string; opKey: string; txHash: string } & Classification)
  | { type: "reconciled"; at: string; opKey: string; caseId: number; how: string }
  | { type: "conflict"; at: string; opKey: string; detail: string }
  | { type: "abandoned"; at: string; opKey: string; reason: string }
  | ({ type: "shadow"; at: string } & OpIntent);

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface OpState {
  intent: OpIntent;
  txHash: string | null;
  finality: TxFinality | null;
  done: boolean;
  conflict: string | null;
}

export class Outbox {
  private readonly log: JsonlFile;
  constructor(file: string, private readonly clock: () => Date = () => new Date()) {
    this.log = new JsonlFile(file);
  }

  record(r: DistOmit<OutboxRecord, "at">): void {
    this.log.append({ ...r, at: this.clock().toISOString() });
  }

  records(): OutboxRecord[] {
    return this.log.readAll() as OutboxRecord[];
  }

  /** Fold the log into one state per opKey (exact key match). Shadow records are ignored. */
  state(): Map<string, OpState> {
    const m = new Map<string, OpState>();
    for (const r of this.records()) {
      if (r.type === "shadow") continue;
      if (r.type === "intent") {
        const { type: _t, at: _a, ...intent } = r;
        const prev = m.get(r.opKey);
        m.set(r.opKey, { intent, txHash: null, finality: null, done: false, conflict: null, ...(prev ? { txHash: prev.txHash } : {}) });
        continue;
      }
      const s = m.get(r.opKey);
      if (!s) continue;
      if (r.type === "broadcast") s.txHash = r.txHash;
      if (r.type === "status") {
        s.txHash = r.txHash;
        s.finality = r.finality;
        s.done = r.finality === "FINALIZED_SUCCESS" || r.finality === "FINALIZED_ERROR";
      }
      if (r.type === "reconciled" || r.type === "abandoned") s.done = true;
      if (r.type === "conflict") {
        s.conflict = r.detail;
        s.done = true;
      }
    }
    return m;
  }
}

// --------------------------------------------------------------------- inbox

export const GENESIS = "0".repeat(64);
export const RECEIPT_SCHEMA_ID = "verdict.verdict-receipt.v1";

export interface ReceiptBody {
  caseId: number;
  requestKey: string;
  packageDigest: string;
  op: "judge" | "appeal" | "revoke" | "expire";
  txHash: string | null;
  finality: "FINALIZED_SUCCESS" | "REVOKED" | "STALE";
  caseStatus: "judged" | "appealed" | "final" | "revoked" | "stale";
  tier: 1 | 2 | 3;
  verdict: null | { winnerIndex: number; scores: number[]; jurorVotes: number[]; split: string; reason: string; jurors: 5 | 7 | 9 };
  provenance: Array<{ entrySource: string; assurance: string }>;
  provenanceLabel: string;
  destination: { network: string; contractAddress: string };
  observedAt: string;
}

export interface Receipt extends ReceiptBody {
  schema: typeof RECEIPT_SCHEMA_ID;
  seq: number;
  prevHash: string;
  recordHash: string;
}

function hashRecord(r: Omit<Receipt, "recordHash">): string {
  return sha256Hex(canonicalize(r));
}

/** Verify a whole chain; returns the index of the first bad record or -1. */
export function verifyInboxChain(records: unknown[]): number {
  let prev = GENESIS;
  for (let i = 0; i < records.length; i++) {
    const r = records[i] as Receipt;
    if (typeof r !== "object" || r === null || r.schema !== RECEIPT_SCHEMA_ID || r.seq !== i + 1 || r.prevHash !== prev) return i;
    const { recordHash, ...rest } = r;
    if (hashRecord(rest) !== recordHash) return i;
    prev = recordHash;
  }
  return -1;
}

export class Inbox {
  private readonly log: JsonlFile;
  private seq = 0;
  private head = GENESIS;

  constructor(file: string) {
    this.log = new JsonlFile(file);
    const all = this.log.readAll();
    const bad = verifyInboxChain(all);
    if (bad >= 0) throw new JournalCorrupt(`${file}: hash chain broken at record ${bad + 1}`);
    this.seq = all.length;
    if (all.length) this.head = (all[all.length - 1] as Receipt).recordHash;
  }

  append(body: ReceiptBody): Receipt {
    const unsigned: Omit<Receipt, "recordHash"> = { schema: RECEIPT_SCHEMA_ID, seq: this.seq + 1, prevHash: this.head, ...body };
    const rec: Receipt = { ...unsigned, recordHash: hashRecord(unsigned) };
    this.log.append(rec);
    this.seq = rec.seq;
    this.head = rec.recordHash;
    return rec;
  }

  all(): Receipt[] {
    return this.log.readAll() as Receipt[];
  }
}
