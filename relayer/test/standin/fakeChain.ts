// STAND-IN: an in-memory imitation of the JudgeRouter contract + GenLayer
// transaction lifecycle. NOT the real GenVM. It exists so the relayer's
// HTTP, outbox, finality and Twitch logic can be tested without a network.
// Contract semantics it imitates are tested for real in contracts/tests/direct.

import { verifyPackage } from "../../src/lib/package.js";
import { sha256Hex } from "../../src/lib/canonical.js";
import type { TxLike } from "../../src/lib/finality.js";
import type { CaseView, ChainPort, RefLookup } from "../../src/lib/genlayer.js";
import type { WriteFn } from "../../src/lib/journal.js";
import { UnsupportedRpc } from "../../src/lib/pinning.js";

export const CONTRACT = "0x00000000000000000000000000000000000000aa";
export const CODE = "# fake JudgeRouter source\n";
export const CODE_DIGEST = sha256Hex(CODE);

export interface TxScript {
  steps: string[]; // statusName per getTransaction call; the last one repeats
  execution?: "FINISHED_WITH_RETURN" | "FINISHED_WITH_ERROR" | "NOT_VOTED";
}

export type VerdictPatch = Partial<CaseView>;

export class FakeChain implements ChainPort {
  readonly relayerAddress = "0x00000000000000000000000000000000000000bb" as const;
  readonly cases = new Map<number, CaseView>();
  readonly refs = new Map<string, number>();
  readonly broadcasts: Array<{ fn: WriteFn; args: Array<string | number>; hash: string }> = [];
  private readonly txs = new Map<string, { script: TxScript; i: number }>();
  private nextId = 1;
  private n = 0;

  /** Next scripts, consumed one per broadcast (FIFO); default = normal finality. */
  scripts: TxScript[] = [];
  /** Verdict patches applied by judge / appeal, consumed FIFO; defaults below. */
  verdicts: VerdictPatch[] = [];
  /** Contract code returned to the pin check; a function lets tests throw. */
  code: () => Promise<string> = async () => CODE;
  /** Called inside broadcast before it "lands" (e.g. to inspect the outbox). */
  onBroadcast?: (fn: WriteFn, args: Array<string | number>) => void;
  /** Apply the effect, then throw (simulates a timeout after the tx landed). */
  landThenThrow = false;
  /** Throw without applying (the broadcast never reached the chain). */
  failBroadcast = false;
  now = "2026-10-31T12:00:00Z";
  /** While true, txs that would be FINALIZED stay ACCEPTED (lets a test act in between). */
  holdFinal = false;

  async broadcast(fn: WriteFn, args: Array<string | number>): Promise<string> {
    this.onBroadcast?.(fn, args);
    if (this.failBroadcast) {
      this.failBroadcast = false;
      throw new Error("ECONNRESET");
    }
    const hash = `0x${(++this.n).toString(16).padStart(8, "0")}`;
    this.broadcasts.push({ fn, args, hash });
    const script = this.scripts.shift() ?? { steps: ["PENDING", "ACCEPTED", "FINALIZED"] };
    const ok = script.execution === undefined || script.execution === "FINISHED_WITH_RETURN";
    const reverted = ok ? !this.apply(fn, args) : true;
    this.txs.set(hash, { script: reverted && ok ? { ...script, execution: "FINISHED_WITH_ERROR" } : script, i: 0 });
    if (this.landThenThrow) {
      this.landThenThrow = false;
      throw new Error("timeout waiting for RPC");
    }
    return hash;
  }

  /** Imitates the contract; returns false for a revert. */
  private apply(fn: WriteFn, args: Array<string | number>): boolean {
    if (fn === "open_case_package") {
      const [pkgJson, digest] = args as [string, string];
      const v = verifyPackage(pkgJson, digest, { now: new Date(this.now), contractAddress: CONTRACT });
      if (!v.ok) return false;
      const existing = this.refs.get(v.pkg.requestKey);
      if (existing) return this.cases.get(existing)!.package_digest === digest;
      const id = this.nextId++;
      this.refs.set(v.pkg.requestKey, id);
      this.cases.set(id, {
        id, surface: v.pkg.surface, rubric: v.pkg.rubric, entries: v.pkg.entries.map((e) => e.text), creator: this.relayerAddress,
        status: "pending", tier: 1, jurors: 5, winner_index: -1, scores: [], juror_votes: [], split: "", reason: "", history: [],
        created_at: this.now, updated_at: this.now, package_digest: digest, request_key: v.pkg.requestKey,
        provenance: v.pkg.entries.map((e) => ({ entry_source: e.provenance.entrySource, assurance: e.provenance.assurance })),
        appeal_deadline: v.pkg.lifetime.appealWindowExpiry, revoked_by: -1, confirmed_tier: 0,
      });
      return true;
    }
    const c = this.cases.get(Number(args[0]));
    if (!c || c.package_digest !== args[1]) return false;
    if (fn === "judge") {
      if (c.status !== "pending") return false;
      Object.assign(c, { status: "judged", tier: 1, jurors: 5, winner_index: 1, scores: [40, 80], juror_votes: [1, 1, 1, 0, 1], split: "4-1", reason: "B argued better." }, this.verdicts.shift() ?? {});
      return true;
    }
    if (fn === "appeal") {
      if (!(c.status === "judged" || c.status === "appealed") || c.tier >= 3 || c.tier !== args[2] || c.confirmed_tier !== c.tier) return false;
      const tier = c.tier + 1;
      const base =
        tier === 2
          ? { winner_index: 0, scores: [70, 60], juror_votes: [0, 1, 0, 1, 0, 1, 0], split: "4-3", jurors: 7 }
          : { winner_index: 0, scores: [75, 55], juror_votes: [0, 0, 1, 0, 0, 1, 0, 1, 0], split: "6-3", jurors: 9 };
      Object.assign(c, { tier, status: tier >= 3 ? "final" : "appealed", reason: "On appeal." }, base, this.verdicts.shift() ?? {});
      return true;
    }
    if (fn === "confirm_verdict") {
      if (!["judged", "appealed", "final"].includes(c.status) || c.tier !== args[2]) return false;
      c.confirmed_tier = Math.max(c.confirmed_tier, c.tier);
      return true;
    }
    if (fn === "revoke") {
      if (!["pending", "judged"].includes(c.status) || c.tier !== 1 || c.confirmed_tier >= 1) return false;
      Object.assign(c, { status: "revoked", entries: [], rubric: "", reason: "", revoked_by: Number(args[2]) });
      return true;
    }
    if (fn === "expire") {
      if (c.status !== "pending") return false;
      c.status = "stale";
      return true;
    }
    return false;
  }

  async getTransaction(hash: string): Promise<TxLike | null> {
    const t = this.txs.get(hash);
    if (!t) return null;
    let status = t.script.steps[Math.min(t.i, t.script.steps.length - 1)]!;
    if (this.holdFinal && status === "FINALIZED") status = "ACCEPTED";
    else t.i++;
    const done = status !== "PENDING";
    return { statusName: status, ...(done && t.script.execution !== undefined ? { txExecutionResultName: t.script.execution } : done ? { txExecutionResultName: "FINISHED_WITH_RETURN" } : {}) };
  }

  async getCase(id: number): Promise<CaseView> {
    const c = this.cases.get(id);
    if (!c) throw new Error("[EXPECTED] case not found");
    return structuredClone(c);
  }

  async getCaseByRequestKey(rk: string): Promise<RefLookup> {
    const id = this.refs.get(rk); // exact Map key
    if (!id) return { case_id: 0, package_digest: "", status: "" };
    const c = this.cases.get(id)!;
    return { case_id: id, package_digest: c.package_digest, status: c.status };
  }

  async listRecent(limit: number): Promise<unknown[]> {
    // Same shape as the contract's list_recent: full case views (verdict fields included).
    return [...this.cases.values()].reverse().slice(0, limit).map((c) => structuredClone(c));
  }

  async getContractCode(): Promise<string> {
    return this.code();
  }

  static unsupported(): () => Promise<string> {
    return async () => {
      throw new UnsupportedRpc("method not found");
    };
  }
}
