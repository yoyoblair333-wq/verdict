// Two-step finality.
//
// A verdict is FINAL for VERDICT only when the GenLayer transaction is
// FINALIZED (not merely ACCEPTED: an accepted result can still be overturned
// by a GenLayer appeal) AND its execution result is SUCCESS (the contract
// returned instead of raising). Cards, Twitch resolution and inbox imports
// fire only on FINALIZED_SUCCESS.
//
// Receipt fields, from the PUBLISHED genlayer-js 1.1.8 typings
// (node_modules/genlayer-js/dist/index-*.d.ts, `GenLayerTransaction`):
//   statusName?: TransactionStatus  (UNINITIALIZED PENDING PROPOSING COMMITTING
//                REVEALING ACCEPTED UNDETERMINED FINALIZED CANCELED
//                APPEAL_REVEALING APPEAL_COMMITTING READY_TO_FINALIZE
//                VALIDATORS_TIMEOUT LEADER_TIMEOUT)
//   status?: TransactionStatus | number
//   txExecutionResultName?: ExecutionResult (NOT_VOTED | FINISHED_WITH_RETURN
//                | FINISHED_WITH_ERROR) - set by decodeTransaction on testnets
//   consensus_data?.leader_receipt?[0].execution_result: string - Studio/localnet
//                ("SUCCESS" | "ERROR" per genlayer-studio ExecutionResultStatus)
// Also verified in the 1.1.8 JS: waitForTransactionReceipt({status: ACCEPTED})
// returns on ANY "decided" state (ACCEPTED, UNDETERMINED, LEADER_TIMEOUT,
// VALIDATORS_TIMEOUT, CANCELED, FINALIZED), and waiting for FINALIZED needs an
// exact status match, so it would spin until timeout on CANCELED. We therefore
// poll getTransaction() ourselves and classify every state explicitly.
//
// LIVE FINDING (studionet, 2026-10-31, docs/LIVE_EVIDENCE.md): the simplified
// receipt returned by waitForTransactionReceipt on Studio carries
// `status_name` (snake_case) and a numeric `status` (5 = ACCEPTED), NOT
// `statusName`; getTransaction carries `statusName`. We therefore read
// statusName, then status_name, then map a numeric status with genlayer-js's
// own `transactionsStatusNumberToName` table. Anything else is UNKNOWN.
//
// UNCERTAIN (needs a live-testnet check, see REVIEW.md): whether UNDETERMINED
// / *_TIMEOUT can later become ACCEPTED through a GenLayer appeal. We classify
// them as FINALIZED_ERROR (no card, technical refund) - fail closed for
// cards, possibly generous for refunds.

export type TxFinality = "PENDING" | "ACCEPTED" | "FINALIZED_SUCCESS" | "FINALIZED_ERROR" | "STALE";
/** Case-level outcome: a tx finality, or REVOKED (a side withdrew consent). */
export type CaseOutcome = TxFinality | "REVOKED";
export type Execution = "SUCCESS" | "ERROR" | "UNKNOWN";

import { transactionsStatusNumberToName } from "genlayer-js/types";

export interface TxLike {
  status?: unknown;
  statusName?: unknown;
  status_name?: unknown;
  txExecutionResultName?: unknown;
  consensus_data?: { leader_receipt?: Array<{ execution_result?: unknown }> } | undefined;
}

export interface Classification {
  finality: TxFinality;
  chainStatus: string;
  execution: Execution;
}

const PENDING_STATES = new Set(["UNINITIALIZED", "PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACTIVATED"]);
const ACCEPTED_STATES = new Set(["ACCEPTED", "READY_TO_FINALIZE", "APPEAL_REVEALING", "APPEAL_COMMITTING"]);
const FAILED_TERMINAL = new Set(["CANCELED", "UNDETERMINED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);

export function executionOf(tx: TxLike): Execution {
  if (tx.txExecutionResultName === "FINISHED_WITH_RETURN") return "SUCCESS";
  if (tx.txExecutionResultName === "FINISHED_WITH_ERROR") return "ERROR";
  const leader = tx.consensus_data?.leader_receipt?.[0]?.execution_result;
  if (leader === "SUCCESS") return "SUCCESS";
  if (leader === "ERROR") return "ERROR";
  return "UNKNOWN"; // NOT_VOTED, missing or unrecognised: never treated as success
}

const NUM_TO_NAME = transactionsStatusNumberToName as Record<string, string>;

export function statusNameOf(tx: TxLike): string {
  if (typeof tx.statusName === "string") return tx.statusName;
  if (typeof tx.status_name === "string") return tx.status_name;
  if (typeof tx.status === "string") return /^\d+$/.test(tx.status) ? (NUM_TO_NAME[tx.status] ?? "UNKNOWN") : tx.status;
  if (typeof tx.status === "number" && Number.isInteger(tx.status)) return NUM_TO_NAME[String(tx.status)] ?? "UNKNOWN";
  return "UNKNOWN";
}

export function classifyTx(tx: TxLike | null | undefined): Classification {
  if (!tx) return { finality: "PENDING", chainStatus: "NOT_FOUND", execution: "UNKNOWN" };
  const name = statusNameOf(tx);
  const execution = executionOf(tx);
  if (name === "FINALIZED") {
    // FINALIZED with an unknown execution result is NOT success.
    return { finality: execution === "SUCCESS" ? "FINALIZED_SUCCESS" : "FINALIZED_ERROR", chainStatus: name, execution };
  }
  if (FAILED_TERMINAL.has(name)) return { finality: "FINALIZED_ERROR", chainStatus: name, execution: execution === "SUCCESS" ? "UNKNOWN" : execution };
  if (ACCEPTED_STATES.has(name)) return { finality: "ACCEPTED", chainStatus: name, execution };
  if (PENDING_STATES.has(name)) return { finality: "PENDING", chainStatus: name, execution };
  // Unknown status string or numeric-only status: deny (keep waiting; STALE at timeout).
  return { finality: "PENDING", chainStatus: name, execution: "UNKNOWN" };
}

export const isTerminal = (f: TxFinality) => f === "FINALIZED_SUCCESS" || f === "FINALIZED_ERROR" || f === "STALE";

export interface PollOptions {
  until: "ACCEPTED" | "FINAL";
  timeoutMs: number;
  intervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Poll until the tx reaches `until` (ACCEPTED or any terminal state) or the
 * budget runs out, in which case it is STALE (reconcile decides what next). */
export async function pollFinality(getTx: () => Promise<TxLike | null>, o: PollOptions): Promise<Classification> {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const end = now() + o.timeoutMs;
  let last: Classification = { finality: "PENDING", chainStatus: "NOT_FOUND", execution: "UNKNOWN" };
  for (;;) {
    try {
      last = classifyTx(await getTx());
    } catch (e) {
      // Justified: an RPC error or "not found yet" is not an answer. Keep the
      // previous classification (PENDING by default) and retry; the budget
      // turns persistent failure into STALE, which never fires anything.
      console.warn(`[finality] getTransaction failed: ${(e as Error).message}`);
    }
    if (isTerminal(last.finality)) return last;
    if (o.until === "ACCEPTED" && last.finality === "ACCEPTED") return last;
    if (now() >= end) return { ...last, finality: "STALE" };
    await sleep(o.intervalMs);
  }
}
