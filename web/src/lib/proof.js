// Trust-first landing (the "proof strip" under the hero): pick one real,
// recorded ruling transaction and summarise what the network says about it.
// Pure functions, so the offline tests can check them without a network.

import { classifyTx } from "./finality.js";

const TIER_NAME = { 1: "Verdict", 2: "Appeals Court", 3: "Supreme Court" };
const RULING_FNS = new Set(["judge", "appeal"]);

/**
 * The ruling to prove: among the evidence cases, the one judged at the highest
 * tier (ties: lowest id), and the last jury transaction recorded for it
 * (its latest appeal, else its Tier 1 judge). Returns null if none.
 * @param {Record<string, {fn: string, hash: string}[]>} evidence caseId -> txs
 * @param {object[]} cases get_case results already read from the contract
 */
export function pickProof(evidence, cases) {
  let best = null;
  for (const c of cases ?? []) {
    if (!c || c.status === "revoked" || !(c.winner_index >= 0)) continue;
    const txs = (evidence?.[c.id] ?? evidence?.[String(c.id)] ?? []).filter((t) => RULING_FNS.has(t.fn));
    if (!txs.length) continue;
    if (!best || c.tier > best.c.tier || (c.tier === best.c.tier && c.id < best.c.id)) best = { c, tx: txs[txs.length - 1] };
  }
  if (!best) return null;
  const { c, tx } = best;
  return {
    caseId: c.id,
    tier: c.tier,
    tierName: TIER_NAME[c.tier] ?? `Tier ${c.tier}`,
    jurors: c.jurors,
    split: c.split,
    winner: String.fromCharCode(65 + c.winner_index),
    fn: tx.fn,
    hash: tx.hash,
  };
}

/** Validator votes and finality for one transaction, from getTransaction. */
export function proofVotes(tx, numToName) {
  const votes = tx?.consensus_data?.votes;
  const counts = { agree: 0, disagree: 0, idle: 0, other: 0 };
  let selected = 0;
  if (votes && typeof votes === "object") {
    for (const v of Object.values(votes)) {
      selected += 1;
      if (v in counts) counts[v] += 1;
      else counts.other += 1;
    }
  }
  const f = classifyTx(tx, numToName);
  return { selected, ...counts, finality: f.finality, chainStatus: f.chainStatus, execution: f.execution };
}

/** One plain-English sentence for non-crypto readers. */
export function proofSentence(p, v) {
  const parts = [`${v.agree} agreed`];
  if (v.disagree) parts.push(`${v.disagree} disagreed`);
  if (v.idle) parts.push(`${v.idle} did not vote`);
  const verdict = `${p.jurors} AI jurors ruled ${p.split} for Take ${p.winner} (case #${p.caseId}, ${p.tierName}).`;
  const network = v.selected
    ? `The network gave the same case to ${v.selected} independent validators to re-run with their own AI models: ${parts.join(", ")}.`
    : "The network did not return validator votes for this transaction.";
  const final = v.finality === "FINALIZED_SUCCESS" ? "The ruling is final on the network." : `Network status: ${v.chainStatus} · ${v.execution}.`;
  return `${verdict} ${network} ${final}`;
}
