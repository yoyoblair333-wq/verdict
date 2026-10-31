// Relayer-side verdict validation: the mirror of the contract validator's
// `_leader_payload_ok`. A verdict read back from the chain must pass this
// before it is imported to the inbox, rendered as a card or used to resolve
// Twitch. A malformed verdict is a bounded failure, never a card.

export const TIER_JURORS: Readonly<Record<number, 5 | 7 | 9>> = { 1: 5, 2: 7, 3: 9 };
export const MAX_REASON_CHARS = 120;

export interface VerdictPayload {
  winner_index: number;
  scores: number[];
  votes: number[];
  split: string;
  reason: string;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

export function splitString(votes: number[], n: number): string {
  const counts = new Array<number>(n).fill(0);
  for (const v of votes) counts[v]! += 1;
  const nz = counts.filter((c) => c > 0).sort((a, b) => b - a);
  if (nz.length === 1) nz.push(0);
  return nz.join("-");
}

export function winnerFrom(votes: number[], means: number[], n: number): number {
  const counts = new Array<number>(n).fill(0);
  for (const v of votes) counts[v]! += 1;
  const best = Math.max(...counts);
  const tied = counts.flatMap((c, i) => (c === best ? [i] : []));
  let w = tied[0]!;
  for (const i of tied) if (means[i]! > means[w]!) w = i;
  return w;
}

export function validateVerdictPayload(p: unknown, n: number, jurors: number): { ok: true } | { ok: false; reason: string } {
  const bad = (reason: string) => ({ ok: false as const, reason });
  if (typeof p !== "object" || p === null || Array.isArray(p)) return bad("not an object");
  const v = p as Record<string, unknown>;
  if (!isInt(v.winner_index) || v.winner_index < 0 || v.winner_index >= n) return bad("winner_index out of range");
  if (!Array.isArray(v.scores) || v.scores.length !== n) return bad("scores length");
  if (!v.scores.every((s) => isInt(s) && s >= 0 && s <= 100)) return bad("score out of range or not an integer");
  if (!Array.isArray(v.votes) || v.votes.length !== jurors) return bad("juror count");
  if (!v.votes.every((x) => isInt(x) && x >= 0 && x < n)) return bad("vote out of range");
  if (typeof v.reason !== "string" || v.reason.length > MAX_REASON_CHARS) return bad("reason");
  if (v.split !== splitString(v.votes as number[], n)) return bad("split does not match votes");
  if (v.winner_index !== winnerFrom(v.votes as number[], v.scores as number[], n)) return bad("winner not supported by votes");
  return { ok: true };
}

const VERDICT_STATUSES = new Set(["judged", "appealed", "final"]);

/** Validate a get_case view that claims to carry a verdict. */
export function validateCaseVerdict(c: {
  status: unknown;
  tier: unknown;
  jurors?: unknown;
  entries: unknown;
  winner_index: unknown;
  scores: unknown;
  juror_votes: unknown;
  split: unknown;
  reason: unknown;
}): { ok: true } | { ok: false; reason: string } {
  if (typeof c.status !== "string" || !VERDICT_STATUSES.has(c.status)) return { ok: false, reason: `status ${String(c.status)} carries no verdict` };
  if (!isInt(c.tier) || !(c.tier in TIER_JURORS)) return { ok: false, reason: "unknown tier" };
  const jurors = TIER_JURORS[c.tier]!;
  if (c.jurors !== undefined && c.jurors !== jurors) return { ok: false, reason: "jurors does not match tier" };
  if (!Array.isArray(c.entries) || c.entries.length < 2 || c.entries.length > 10) return { ok: false, reason: "entries" };
  return validateVerdictPayload(
    { winner_index: c.winner_index, scores: c.scores, votes: c.juror_votes, split: c.split, reason: c.reason },
    c.entries.length,
    jurors,
  );
}
