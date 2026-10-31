// Submission pipeline: pin check -> outbox intent (fsync) -> broadcast ->
// outbox txHash -> poll to ACCEPTED -> (background) poll to FINALIZED.
// Plus `reconcile`, which settles every unfinished outbox op against the
// chain instead of double-submitting after a timeout or crash.

import type { Config } from "../config.js";
import { digestEquals } from "./canonical.js";
import { classifyTx, isTerminal, pollFinality, type Classification } from "./finality.js";
import type { ChainPort } from "./genlayer.js";
import { toPlain } from "./genlayer.js";
import type { OpIntent, Outbox } from "./journal.js";
import { checkContractPin, pinAllowsSubmit, type PinResult } from "./pinning.js";

export class PipelineError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface SubmitResult {
  hash: string;
  accepted: Classification;
  /** The contract's "[EXPECTED] ..." reason when the leader's execution reverted. */
  expectedError: string | null;
}

export interface ReconcileEntry {
  opKey: string;
  action: "final" | "pending" | "reconciled" | "resubmitted" | "abandoned" | "conflict" | "error";
  detail?: string;
}

export interface PipelineDeps {
  cfg: Config;
  chain: ChainPort;
  outbox: Outbox;
  clock: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export class Pipeline {
  constructor(private readonly d: PipelineDeps) {}

  async pin(): Promise<PinResult> {
    return checkContractPin(() => this.d.chain.getContractCode(), this.d.cfg.expectedContractCodeDigest);
  }

  /** Called before EVERY submit. */
  private async requirePin(): Promise<void> {
    const r = await this.pin();
    if (!pinAllowsSubmit(r, this.d.cfg.allowUnverifiedContract)) {
      throw new PipelineError(503, `contract pin check failed (${r.state}); refusing to submit`);
    }
    if (r.state === "unsupported") console.warn("[pin] RPC cannot return contract code; submitting UNVERIFIED (ALLOW_UNVERIFIED_CONTRACT=true)");
  }

  /** Shadow mode: record what would be submitted. No gas, no network write. */
  shadow(intent: OpIntent): void {
    this.d.outbox.record({ type: "shadow", ...intent });
    console.log(`[shadow] would call ${intent.fn}(${intent.args.map((a) => (typeof a === "string" && a.length > 80 ? `<${a.length} chars>` : JSON.stringify(a))).join(", ")}) opKey=${intent.opKey} digest=${intent.packageDigest}`);
  }

  async submit(intent: OpIntent): Promise<SubmitResult> {
    if (this.d.cfg.mode !== "live") throw new PipelineError(500, "submit called in shadow mode");
    await this.requirePin();
    this.d.outbox.record({ type: "intent", ...intent }); // durable BEFORE broadcast
    let hash: string;
    try {
      hash = await this.d.chain.broadcast(intent.fn, intent.args);
    } catch (e) {
      this.d.outbox.record({ type: "broadcast_error", opKey: intent.opKey, error: String((e as Error).message).slice(0, 300) });
      throw e;
    }
    this.d.outbox.record({ type: "broadcast", opKey: intent.opKey, txHash: hash });
    const accepted = await pollFinality(() => this.d.chain.getTransaction(hash), {
      until: "ACCEPTED",
      timeoutMs: this.d.cfg.acceptTimeoutMs,
      intervalMs: this.d.cfg.pollIntervalMs,
      ...(this.d.sleep ? { sleep: this.d.sleep } : {}),
    });
    this.d.outbox.record({ type: "status", opKey: intent.opKey, txHash: hash, ...accepted });
    let expectedError: string | null = null;
    if (accepted.execution === "ERROR") {
      const tx = await this.d.chain.getTransaction(hash).catch((e: Error) => {
        // Justified: only used to word the error; the op is already failing.
        console.warn(`[pipeline] could not fetch failed tx ${hash}: ${e.message}`);
        return null;
      });
      const m = /\[EXPECTED\]\s*([^"\\]+)/.exec(JSON.stringify(toPlain(tx)));
      expectedError = m ? m[1]!.trim() : "transaction reverted";
    }
    return { hash, accepted, expectedError };
  }

  async awaitFinal(opKey: string, hash: string): Promise<Classification> {
    const final = await pollFinality(() => this.d.chain.getTransaction(hash), {
      until: "FINAL",
      timeoutMs: this.d.cfg.finalityTimeoutMs,
      intervalMs: this.d.cfg.pollIntervalMs,
      ...(this.d.sleep ? { sleep: this.d.sleep } : {}),
    });
    this.d.outbox.record({ type: "status", opKey, txHash: hash, ...final });
    return final;
  }

  /** Settle every unfinished op. Never resubmits an op whose effect is already on-chain. */
  async reconcile(): Promise<ReconcileEntry[]> {
    const out: ReconcileEntry[] = [];
    for (const [opKey, s] of this.d.outbox.state()) {
      if (s.done) continue;
      const it = s.intent;
      try {
        if (s.txHash) {
          const cls = classifyTx(await this.d.chain.getTransaction(s.txHash));
          if (isTerminal(cls.finality)) {
            this.d.outbox.record({ type: "status", opKey, txHash: s.txHash, ...cls });
            out.push({ opKey, action: "final", detail: cls.finality });
          } else {
            out.push({ opKey, action: "pending", detail: cls.chainStatus });
          }
          continue;
        }
        // No tx hash recorded: the broadcast may or may not have landed.
        const landed = await this.alreadyApplied(it);
        if (landed.kind === "conflict") {
          this.d.outbox.record({ type: "conflict", opKey, detail: landed.detail });
          out.push({ opKey, action: "conflict", detail: landed.detail });
        } else if (landed.kind === "applied") {
          this.d.outbox.record({ type: "reconciled", opKey, caseId: landed.caseId, how: "found on-chain" });
          out.push({ opKey, action: "reconciled" });
        } else if (it.submissionDeadline && this.d.clock().getTime() > Date.parse(it.submissionDeadline)) {
          this.d.outbox.record({ type: "abandoned", opKey, reason: "submission deadline passed" });
          out.push({ opKey, action: "abandoned" });
        } else if (this.d.cfg.mode !== "live") {
          out.push({ opKey, action: "pending", detail: "shadow mode: not resubmitting" });
        } else {
          const r = await this.submit(it);
          out.push({ opKey, action: "resubmitted", detail: r.hash });
        }
      } catch (e) {
        out.push({ opKey, action: "error", detail: (e as Error).message });
      }
    }
    return out;
  }

  private async alreadyApplied(it: OpIntent): Promise<{ kind: "applied"; caseId: number } | { kind: "absent" } | { kind: "conflict"; detail: string }> {
    if (it.kind === "open") {
      const r = await this.d.chain.getCaseByRequestKey(it.requestKey);
      if (!r || r.case_id === 0) return { kind: "absent" };
      if (!digestEquals(r.package_digest, it.packageDigest)) return { kind: "conflict", detail: "requestKey exists on-chain with a different packageDigest" };
      return { kind: "applied", caseId: r.case_id };
    }
    if (it.caseId === null) return { kind: "conflict", detail: "op without case id" };
    const c = await this.d.chain.getCase(it.caseId);
    if (!digestEquals(c.package_digest, it.packageDigest)) return { kind: "conflict", detail: "case receipt number differs from outbox" };
    const applied =
      (it.kind === "judge" && c.status !== "pending") ||
      (it.kind === "appeal" && typeof it.fromTier === "number" && c.tier > it.fromTier) ||
      (it.kind === "confirm" && typeof it.fromTier === "number" && (c.confirmed_tier ?? 0) >= it.fromTier) ||
      (it.kind === "revoke" && c.status === "revoked") ||
      (it.kind === "expire" && c.status === "stale");
    return applied ? { kind: "applied", caseId: c.id } : { kind: "absent" };
  }
}
