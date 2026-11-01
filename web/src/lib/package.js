// Browser port of the relayer's case-package code (relayer/src/lib/canonical.ts,
// package.ts, moderation.ts). Same canonical form, same sanitiser, same checks
// in the same order as contracts/judge_router.py `_verify_package`, so a package
// built here is byte-identical to one the relayer would build for the same
// input. sha256 uses WebCrypto (async). Kept in sync by hand: if the contract
// or relayer rules change, change this file too (web/test checks a fixture).

export const PACKAGE_SCHEMA_ID = "verdict.case-package.v1";
export const MAX_PACKAGE_CHARS = 8192;
export const MAX_ENTRY_CHARS = 280;
export const MAX_RUBRIC_CHARS = 200;
export const PRESETS = ["whos_right", "better_roast", "pettiest_text", "better_comeback"];
const SURFACE_SOURCE = { settle: "participant_submitted", live: "host_submitted", api: "api_client_submitted" };

// ------------------------------------------------------------- canonical

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const ASCII = /^[\x00-\x7f]*$/;

export function canonicalize(v) {
  if (v === null) return "null";
  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(v)) throw new Error("only safe integers are allowed");
      return String(v);
    case "string":
      if (LONE_SURROGATE.test(v)) throw new Error("lone surrogate in string");
      return JSON.stringify(v);
    case "object": {
      if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
      const keys = Object.keys(v).sort();
      return `{${keys
        .map((k) => {
          if (!ASCII.test(k)) throw new Error("object keys must be ASCII");
          return `${JSON.stringify(k)}:${canonicalize(v[k])}`;
        })
        .join(",")}}`;
    }
    default:
      throw new Error(`unsupported JSON type ${typeof v}`);
  }
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Contract code with line endings turned into LF and exactly one trailing
 * newline. Pasting a file into GenLayer Studio on Windows stores CRLF and
 * drops the final newline; normalising only that cannot hide a code change.
 * Same rule as relayer/src/lib/pinning.ts canonicalCodeText.
 */
export function canonicalCodeText(text) {
  return String(text).replace(/\r\n?/g, "\n").replace(/\n+$/, "") + "\n";
}

/** The digest every code check compares: sha256 of canonicalCodeText. */
export async function codeDigest(text) {
  return sha256Hex(canonicalCodeText(text));
}

// -------------------------------------------------------------- sanitise

const INVISIBLE_RE = /[​-‏‪-‮⁠-⁤﻿]/g;
const CONTROL_CHAR = /^\p{C}$/u;
const STRIP = new Set([" ", "\t", "\n", " ", " ", " "]);

/** Mirror of the contract's `_sanitise`. */
export function sanitiseText(raw) {
  const t = raw.normalize("NFKC").replace(INVISIBLE_RE, "");
  const chars = Array.from(t).filter((ch) => ch === "\n" || ch === "\t" || !CONTROL_CHAR.test(ch));
  let a = 0;
  let b = chars.length;
  while (a < b && STRIP.has(chars[a])) a++;
  while (b > a && STRIP.has(chars[b - 1])) b--;
  return chars.slice(a, b).join("");
}

// ------------------------------------------------------------ moderation
// Local pre-check only (relayer/src/lib/moderation.ts `localCheck`). There is
// no hosted moderation provider in the browser; the package's policyVersion
// records that ("+browser-local-only").

const CONTROL_PATTERNS = [
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

const BANNED_PHRASES = [
  [/\b(i'?ll|i\s+will|gonna|going\s+to)\s+(kill|hurt|stab|shoot|beat)\s+(you|u|him|her|them)\b/i, "contains a threat"],
  [/\b(kys|kill\s+yourself)\b/i, "contains a threat"],
  [/\b(kill(ing)?\s+myself|suicide|self[- ]harm|hurt\s+myself)\b/i, "mentions self-harm; please reach out to 988 (US) instead"],
  [/\b(dox|doxx|home\s+address\s+is)\b/i, "looks like doxxing"],
];
const PII_PATTERNS = [
  [/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, "looks like a government ID number"],
  [/\b(?:\d[ -]?){13,19}\b/, "looks like a card number"],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, "contains an email address"],
  [/\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/, "contains a phone number"],
  [/\b\d{1,5}\s+\w+(\s+\w+)?\s+(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr)\b\.?/i, "looks like a street address"],
];

const normalise = (t) => t.normalize("NFKC").replace(INVISIBLE_RE, "");

/** Returns null when the text passes, else a reason. */
export function localCheck(text, label, maxChars = MAX_ENTRY_CHARS) {
  const t = normalise(text).trim();
  if (t.length === 0) return `${label} is empty`;
  if ([...t].length > maxChars) return `${label} exceeds ${maxChars} characters`;
  const collapsed = t.replace(/\s+/g, " ");
  if (CONTROL_RE.test(collapsed)) return `${label} contains instructions aimed at the judge`;
  for (const [re, why] of BANNED_PHRASES) if (re.test(collapsed)) return `${label} ${why}`;
  for (const [re, why] of PII_PATTERNS) if (re.test(collapsed)) return `${label} ${why}; entries are public and permanent.`;
  return null;
}

// ----------------------------------------------------------------- build

export function isoSeconds(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function randomRequestKey() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Build a canonical case package exactly as relayer/src/lib/package.ts
 * `buildPackage` does. `entries` are raw strings (all self_asserted).
 */
export async function buildPackage(i) {
  const source = SURFACE_SOURCE[i.surface];
  const deadline = new Date(i.now.getTime() + i.submissionTtlSec * 1000);
  const rubricKey = i.rubric.trim().toLowerCase();
  const entries = [];
  for (let index = 0; index < i.entries.length; index++) {
    const text = sanitiseText(i.entries[index]);
    entries.push({ index, text, sha256: await sha256Hex(text), provenance: { entrySource: source, assurance: "self_asserted" } });
  }
  const pkg = {
    schema: PACKAGE_SCHEMA_ID,
    requestKey: i.requestKey,
    identity: { clientRef: i.requestKey, caseId: null, tier: 1, attempt: 1 },
    rubric: PRESETS.includes(rubricKey) ? rubricKey : sanitiseText(i.rubric),
    surface: i.surface,
    entries,
    moderation: { result: "pass", policyVersion: i.moderationPolicyVersion },
    disclosure: { consent: i.consent === true, adultConfirmed: i.adultConfirmed === true, noticeVersion: i.noticeVersion },
    destination: { network: i.network, contractAddress: i.contractAddress, contractCodeDigest: i.contractCodeDigest },
    lifetime: {
      submissionDeadline: isoSeconds(deadline),
      appealWindowExpiry: isoSeconds(new Date(deadline.getTime() + i.caseLifetimeSec * 1000)),
    },
  };
  const canonical = canonicalize(pkg);
  return { pkg, canonical, digest: await sha256Hex(canonical) };
}

/**
 * Pre-flight: the checks the contract would fail on, run before any
 * transaction is signed (so a bad package never costs a reverted tx).
 * Returns null on success, else a reason.
 */
export async function preflight(built, contractAddress, now) {
  const { pkg, canonical, digest } = built;
  if (canonical.length > MAX_PACKAGE_CHARS) return "package too large";
  if ((await sha256Hex(canonical)) !== digest) return "digest mismatch";
  if (pkg.disclosure.consent !== true) return "consent is required";
  if (pkg.disclosure.adultConfirmed !== true) return "18+ confirmation is required";
  if (pkg.entries.length < 2 || pkg.entries.length > 10) return "need 2 to 10 entries";
  for (const e of pkg.entries) {
    if (sanitiseText(e.text) !== e.text) return `entry ${e.index + 1} is not in canonical form`;
    if (e.text.length === 0 || [...e.text].length > MAX_ENTRY_CHARS) return `entry ${e.index + 1} length`;
    if (CONTROL_RE.test(normalise(e.text).replace(/\s+/g, " "))) return `entry ${e.index + 1} contains instructions aimed at the judge`;
  }
  if (pkg.destination.contractAddress.toLowerCase() !== contractAddress.toLowerCase()) return "wrong destination";
  if (now.getTime() > Date.parse(pkg.lifetime.submissionDeadline)) return "submission deadline passed";
  return null;
}
