// Moderation. Runs BEFORE any gas is spent.
//
// 1. Local pre-check (this file, no network): length caps, the same
//    judge-addressing / prompt-injection patterns the contract enforces
//    on-chain (CONTROL_PATTERNS in contracts/judge_router.py, kept in sync by
//    hand), a small banned-phrase list (threats, self-harm), and a PII screen.
//    Anything the contract would reject is rejected here first, so a bad
//    entry never costs a reverted transaction.
// 2. `externalCheck`: platform policy via a hosted moderation provider
//    (slurs, harassment, identity attacks, minors). No provider is wired yet,
//    so it FAILS CLOSED unless the operator explicitly sets
//    MODERATION_ACK_LOCAL_ONLY=true (recorded in the package's policyVersion).
//
// Best-effort only: NFKC does not fold every homoglyph, so this is a filter,
// not a guarantee. Never market VERDICT as "injection-proof".

export interface ModerationResult {
  ok: boolean;
  reason?: string;
  /** HTTP status the caller should use when !ok (422 content, 503 config). */
  status?: 422 | 503;
}

export const MAX_ENTRY_CHARS = 280;
export const MAX_RUBRIC_CHARS = 200;

// Mirror of judge_router.py CONTROL_PATTERNS (same order, JS syntax).
export const CONTROL_PATTERNS: string[] = [
  String.raw`ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)`,
  String.raw`disregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|instructions|rules)`,
  String.raw`(system|developer)\s*(prompt|message|instruction)`,
  String.raw`you\s+are\s+now\b`,
  String.raw`new\s+instructions?`,
  String.raw`\bjailbreak\b`,
  String.raw`winner_index`,
  String.raw`"?scores"?\s*:`,
  String.raw`(as|you\s+are)\s+(the\s+)?(judge|juror|jury|ai|assistant|model)\b.*\b(must|should|will)\s+` +
    String.raw`(pick|choose|score|rate|vote|declare|rule|give|select)\b`,
  String.raw`(score|rate|pick|choose|declare|vote\s+for)\s+(this(\s+entry)?|me|entry\s*\d*)\s+` +
    String.raw`(as\s+)?(the\s+|a\s+)?(10|winner|highest|first|best)\b`,
  String.raw`<<<|>>>`,
  "```",
];
const CONTROL_RE = new RegExp(CONTROL_PATTERNS.map((p) => `(?:${p})`).join("|"), "i");

// Zero-width / bidi characters (same ranges as the contract's _INVISIBLE_RE).
const INVISIBLE_RE = /[​-‏‪-‮⁠-⁤﻿]/g;

// Content VERDICT never rules on. The contract can't see these (they are
// policy, not injection), so this is the only gate before a provider exists.
const BANNED_PHRASES: Array<[RegExp, string]> = [
  [/\b(i'?ll|i\s+will|gonna|going\s+to)\s+(kill|hurt|stab|shoot|beat)\s+(you|u|him|her|them)\b/i, "contains a threat"],
  [/\b(kys|kill\s+yourself)\b/i, "contains a threat"],
  [/\b(kill(ing)?\s+myself|suicide|self[- ]harm|hurt\s+myself)\b/i, "mentions self-harm; please reach out to 988 (US) instead"],
  [/\b(dox|doxx|home\s+address\s+is)\b/i, "looks like doxxing"],
];

// Cheap local screen for personal data that should never land on a public chain.
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, "looks like a government ID number"],
  [/\b(?:\d[ -]?){13,19}\b/, "looks like a card number"],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, "contains an email address"],
  [/\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/, "contains a phone number"],
  [/\b\d{1,5}\s+\w+(\s+\w+)?\s+(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr)\b\.?/i, "looks like a street address"],
];

export function normalise(text: string): string {
  return text.normalize("NFKC").replace(INVISIBLE_RE, "");
}

/** True if the text addresses the judge (same patterns as the contract). */
export function controlPatternHit(text: string): boolean {
  return CONTROL_RE.test(normalise(text).replace(/\s+/g, " "));
}

/** Index into CONTROL_PATTERNS of the first pattern the text hits, or -1.
 * Used by the practice court to log WHICH door rule caught an attempt. */
export function matchedControlPattern(text: string): number {
  const collapsed = normalise(text).replace(/\s+/g, " ");
  return CONTROL_PATTERNS.findIndex((p) => new RegExp(p, "i").test(collapsed));
}

/** Policy-only check (threats, self-harm, doxxing), no PII or injection
 * screen. Red Flag Court uses it: a hit means the jury declines to rule. */
export function policyHit(text: string): string | null {
  const collapsed = normalise(text).replace(/\s+/g, " ");
  for (const [re, why] of BANNED_PHRASES) if (re.test(collapsed)) return why;
  return null;
}

/** Synchronous local pre-check for one text. `label` is used in messages. */
export function localCheck(text: string, label: string, maxChars: number): ModerationResult {
  const t = normalise(text).trim();
  if (t.length === 0) return { ok: false, reason: `${label} is empty` };
  if ([...t].length > maxChars) return { ok: false, reason: `${label} exceeds ${maxChars} characters` };
  const collapsed = t.replace(/\s+/g, " ");
  if (CONTROL_RE.test(collapsed)) return { ok: false, reason: `${label} contains instructions aimed at the judge` };
  for (const [re, why] of BANNED_PHRASES) {
    if (re.test(collapsed)) return { ok: false, reason: `${label} ${why}` };
  }
  for (const [re, why] of PII_PATTERNS) {
    if (re.test(collapsed)) return { ok: false, reason: `${label} ${why}; entries are public and permanent.` };
  }
  return { ok: true };
}

export type ModerationProvider = (texts: string[]) => Promise<{ ok: boolean; reason?: string }>;

export interface ModerationOptions {
  /** Operator acknowledged that only the local pre-check runs (no provider). */
  ackLocalOnly: boolean;
  /** Hosted provider. Its errors, timeouts and malformed answers fail CLOSED. */
  provider?: ModerationProvider;
}

async function externalCheck(texts: string[], opts: ModerationOptions): Promise<ModerationResult> {
  if (opts.provider) {
    let r: { ok: boolean; reason?: string };
    try {
      r = await opts.provider(texts);
    } catch (e) {
      // Fail closed: a provider outage means "not moderated", never "pass".
      return { ok: false, status: 503, reason: `moderation provider unavailable (${(e as Error).message}); try again later` };
    }
    if (r === null || typeof r !== "object" || typeof r.ok !== "boolean") return { ok: false, status: 503, reason: "moderation provider returned a malformed answer" };
    return r.ok === true ? { ok: true } : { ok: false, status: 422, reason: r.reason ?? "entry rejected by moderation" };
  }
  // No provider wired: refuse unless the operator explicitly accepted
  // local-only moderation. Never a silent pass.
  if (opts.ackLocalOnly === true) return { ok: true };
  return { ok: false, status: 503, reason: "no moderation provider configured (set MODERATION_ACK_LOCAL_ONLY=true to accept local-only checks)" };
}

const PRESETS = new Set(["whos_right", "better_roast", "pettiest_text", "better_comeback"]);

/** texts[0] is the rubric (preset key or custom text), the rest are entries. */
export async function moderate(texts: string[], opts: ModerationOptions): Promise<ModerationResult> {
  const [rubric, ...entries] = texts;
  if (rubric !== undefined && !PRESETS.has(rubric.trim().toLowerCase())) {
    const r = localCheck(rubric, "Rubric", MAX_RUBRIC_CHARS);
    if (!r.ok) return { ...r, status: 422 };
  }
  for (let i = 0; i < entries.length; i++) {
    const r = localCheck(entries[i]!, `Entry ${i + 1}`, MAX_ENTRY_CHARS);
    if (!r.ok) return { ...r, status: 422 };
  }
  return externalCheck(texts, opts);
}
