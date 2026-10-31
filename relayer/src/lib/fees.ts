// Fee measurement (ADR-022 item 4): one journal row per on-chain transaction
// that reached a terminal state, with whatever fee the transaction object
// reports. GenLayer's transaction shape for fees is not pinned down yet
// (studionet may report none); rows then say fee_source "unavailable" rather
// than guessing. A weekly report compares these with the model's fee bands.

import { JsonlFile } from "./journal.js";

export interface FeeRow {
  at: string;
  op_key: string;
  /** open | judge | appeal | confirm | revoke | expire | finalize | other (from the op key). */
  op: string;
  tx: string;
  finality: string;
  /** Fee in the chain's smallest unit, as a decimal string; null when the tx reports none. */
  fee: string | null;
  fee_source: string;
}

const FEE_KEYS = ["fee", "fees", "totalFee", "total_fee", "feePaid", "fee_paid"];
const GAS_USED = ["gasUsed", "gas_used"];
const GAS_PRICE = ["gasPrice", "gas_price", "effectiveGasPrice"];

function asBig(v: unknown): bigint | null {
  if (typeof v === "bigint") return v >= 0n ? v : null;
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === "string" && /^(0x[0-9a-fA-F]+|\d+)$/.test(v)) return BigInt(v);
  return null;
}

/** Best-effort fee from a transaction object: an explicit fee field, else gasUsed x gasPrice. */
export function measuredFee(tx: unknown): { fee: string | null; source: string } {
  if (typeof tx !== "object" || tx === null) return { fee: null, source: "unavailable" };
  const leader = (tx as { consensus_data?: { leader_receipt?: unknown[] } }).consensus_data?.leader_receipt?.[0];
  for (const obj of [tx, leader]) {
    if (typeof obj !== "object" || obj === null) continue;
    const o = obj as Record<string, unknown>;
    for (const k of FEE_KEYS) {
      const b = asBig(o[k]);
      if (b !== null) return { fee: b.toString(), source: obj === tx ? k : `leader_receipt.${k}` };
    }
    const used = GAS_USED.map((k) => asBig(o[k])).find((x) => x !== null);
    const price = GAS_PRICE.map((k) => asBig(o[k])).find((x) => x !== null);
    if (used !== undefined && used !== null && price !== undefined && price !== null) return { fee: (used * price).toString(), source: "gasUsed*gasPrice" };
  }
  return { fee: null, source: "unavailable" };
}

export const opOf = (opKey: string): string => {
  const m = /:(open|judge|appeal|confirm|revoke|expire|finalize)(?::|$)/.exec(opKey);
  return m ? m[1]! : "other";
};

export class FeesJournal {
  private readonly file: JsonlFile;
  constructor(path: string) {
    this.file = new JsonlFile(path);
  }

  record(row: FeeRow): void {
    this.file.append(row);
  }

  rows(): FeeRow[] {
    return this.file.readAll() as FeeRow[];
  }

  /** Admin summary: counts and measured totals per op, plus the latest rows. */
  summary(last = 20): Record<string, unknown> {
    const rows = this.rows();
    const byOp: Record<string, { txs: number; measured: number; total_fee: string }> = {};
    for (const r of rows) {
      const b = (byOp[r.op] ??= { txs: 0, measured: 0, total_fee: "0" });
      b.txs += 1;
      if (r.fee !== null) {
        b.measured += 1;
        b.total_fee = (BigInt(b.total_fee) + BigInt(r.fee)).toString();
      }
    }
    return { txs: rows.length, measured: rows.filter((r) => r.fee !== null).length, by_op: byOp, latest: rows.slice(-Math.max(1, last)) };
  }
}
