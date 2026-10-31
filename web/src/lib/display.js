// Display-side safety. `open_case_package` is open to anyone, so the contract
// can hold any text a stranger writes. Before the page shows a case, it runs
// the same local moderation the submit path uses over every chain string that
// came from a person or the jury (entries, a custom rubric, reasons). A hit,
// or an id on the operator's list (src/hidden-cases.json, merged into
// evidence.json at build), hides ALL of that case's text. The verdict numbers,
// receipt number, creator and transaction links stay: they are the proof.
//
// This is a display filter, not moderation of the chain: the text stays in the
// contract and in transaction history.

import { localCheck } from "./package.js";

const BIG = 10_000; // length is not a display concern; only content patterns are

function flagged(text) {
  if (typeof text !== "string" || text.trim() === "") return null;
  return localCheck(text, "text", BIG);
}

/** Every person- or jury-written string in a get_case result. */
export function caseTexts(c) {
  const out = [];
  for (const e of c.entries ?? []) out.push(e);
  out.push(c.rubric, c.reason);
  for (const x of c.history ?? []) out.push(x?.reason);
  return out;
}

/**
 * null = show normally; otherwise {kind, label, note}. `hidden` is the
 * operator list: [{id, reason}].
 */
export function hideDecision(c, hidden = []) {
  const op = hidden.find((x) => Number(x.id) === Number(c.id));
  if (op) {
    return {
      kind: "operator",
      label: "Hidden by VERDICT",
      note: op.reason || "Hidden by VERDICT's operator. The text remains in the public blockchain's history and cannot be erased.",
    };
  }
  for (const t of caseTexts(c)) {
    if (c.redacted === true || flagged(t)) {
      return {
        kind: "filter",
        label: "Hidden by VERDICT's display filter",
        note: "This case's text tripped the same checks VERDICT runs before submitting. The verdict, receipt number and transactions are still shown; the text remains on-chain.",
      };
    }
  }
  return null;
}

/** Copy of a case with every free-text field removed (for the snapshot file). */
export function redactCase(c) {
  return {
    ...c,
    entries: (c.entries ?? []).map(() => ""),
    rubric: "",
    reason: "",
    history: (c.history ?? []).map((x) => ({ ...x, reason: "" })),
    redacted: true,
  };
}
