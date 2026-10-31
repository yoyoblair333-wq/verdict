// Case package v1 (schemas/case-package.v1.json): build, canonicalise, verify.
//
// verifyPackage() runs the SAME checks in the SAME order as
// contracts/judge_router.py `_verify_package` (+ the contract's entry
// cleaning), so both runtimes give the same `code` for every fixture in
// ../../fixtures. It fails closed: anything not explicitly valid is rejected.

import { canonicalize, CanonicalError, digestEquals, sha256Hex } from "./canonical.js";
import { controlPatternHit } from "./moderation.js";
import { NETWORKS, type NetworkName } from "../config.js";

export const PACKAGE_SCHEMA_ID = "verdict.case-package.v1";
export const MAX_PACKAGE_CHARS = 8192;
export const MAX_ENTRY_CHARS = 280;
export const MAX_RUBRIC_CHARS = 200;
const MAX_LIFETIME_MS = 30 * 86400 * 1000;

export type Surface = "settle" | "live" | "api";
export const SURFACES: readonly Surface[] = ["settle", "live", "api"];
export type EntrySource = "participant_submitted" | "host_submitted" | "api_client_submitted";
export type Assurance = "self_asserted" | "verified_participant";
export const ASSURANCES: readonly Assurance[] = ["self_asserted", "verified_participant"];

/** The surface fixes who relayed an entry; it is never chosen by the caller. */
export const SURFACE_SOURCE: Readonly<Record<Surface, EntrySource>> = {
  settle: "participant_submitted",
  live: "host_submitted",
  api: "api_client_submitted",
};

export const PRESETS = new Set(["whos_right", "better_roast", "pettiest_text", "better_comeback"]);

export interface PackageEntry {
  index: number;
  text: string;
  sha256: string;
  provenance: { entrySource: EntrySource; assurance: Assurance };
}

export interface CasePackage {
  schema: typeof PACKAGE_SCHEMA_ID;
  requestKey: string;
  identity: { clientRef: string; caseId: null; tier: 1; attempt: number };
  rubric: string;
  surface: Surface;
  entries: PackageEntry[];
  moderation: { result: "pass"; policyVersion: string };
  disclosure: { consent: true; adultConfirmed: true; noticeVersion: string };
  destination: { network: NetworkName; contractAddress: string; contractCodeDigest: string };
  lifetime: { submissionDeadline: string; appealWindowExpiry: string };
}

export type VerifyCode =
  | "not_canonical"
  | "digest_mismatch"
  | "consent_required"
  | "adult_confirmation_required"
  | "schema_invalid"
  | "not_sanitised"
  | "wrong_destination"
  | "expired"
  | "moderation_not_passed"
  | "instructions_aimed_at_judge";

export type VerifyResult =
  | { ok: true; pkg: CasePackage; canonical: string; digest: string }
  | { ok: false; code: VerifyCode; detail: string };

// ------------------------------------------------------------------ sanitise

const INVISIBLE_RE = /[​-‏‪-‮⁠-⁤﻿]/g;
const CONTROL_CHAR = /^\p{C}$/u;
const STRIP = new Set([" ", "\t", "\n", " ", " ", " "]);

/** Mirror of the contract's `_sanitise`: NFKC, drop zero-width/bidi, drop
 * Unicode category C except \n and \t, trim a fixed set of spaces. */
export function sanitiseText(raw: string): string {
  const t = raw.normalize("NFKC").replace(INVISIBLE_RE, "");
  const chars = Array.from(t).filter((ch) => ch === "\n" || ch === "\t" || !CONTROL_CHAR.test(ch));
  let a = 0;
  let b = chars.length;
  while (a < b && STRIP.has(chars[a]!)) a++;
  while (b > a && STRIP.has(chars[b - 1]!)) b--;
  return chars.slice(a, b).join("");
}

export function isoSeconds(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const RK_RE = /^[A-Za-z0-9_-]{16,64}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

// ------------------------------------------------------------------- build

export interface BuildInput {
  requestKey: string;
  rubric: string;
  surface: Surface;
  /** Raw entry texts and their assurance (verified_participant only when a
   * side-token holder submitted that entry). */
  entries: Array<{ text: string; assurance: Assurance }>;
  attempt?: number;
  moderationPolicyVersion: string;
  noticeVersion: string;
  network: NetworkName;
  contractAddress: string;
  contractCodeDigest: string;
  now: Date;
  submissionTtlSec: number;
  caseLifetimeSec: number;
}

export function buildPackage(i: BuildInput): { pkg: CasePackage; canonical: string; digest: string } {
  const source = SURFACE_SOURCE[i.surface];
  const deadline = new Date(i.now.getTime() + i.submissionTtlSec * 1000);
  const pkg: CasePackage = {
    schema: PACKAGE_SCHEMA_ID,
    requestKey: i.requestKey,
    identity: { clientRef: i.requestKey, caseId: null, tier: 1, attempt: i.attempt ?? 1 },
    rubric: PRESETS.has(i.rubric.trim().toLowerCase()) ? i.rubric.trim().toLowerCase() : sanitiseText(i.rubric),
    surface: i.surface,
    entries: i.entries.map((e, index) => {
      const text = sanitiseText(e.text);
      return { index, text, sha256: sha256Hex(text), provenance: { entrySource: source, assurance: e.assurance } };
    }),
    moderation: { result: "pass", policyVersion: i.moderationPolicyVersion },
    disclosure: { consent: true, adultConfirmed: true, noticeVersion: i.noticeVersion },
    destination: { network: i.network, contractAddress: i.contractAddress, contractCodeDigest: i.contractCodeDigest },
    lifetime: {
      submissionDeadline: isoSeconds(deadline),
      appealWindowExpiry: isoSeconds(new Date(deadline.getTime() + i.caseLifetimeSec * 1000)),
    },
  };
  const canonical = canonicalize(pkg);
  return { pkg, canonical, digest: sha256Hex(canonical) };
}

// ------------------------------------------------------------------ verify

export interface VerifyContext {
  now: Date;
  contractAddress: string;
  /** Relayer-only extra checks (the contract cannot see these). */
  network?: NetworkName;
  contractCodeDigest?: string;
}

class Fail extends Error {
  constructor(
    readonly code: VerifyCode,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
  }
}
const fail = (code: VerifyCode, detail = ""): never => {
  throw new Fail(code, detail);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function exactKeys(v: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!isObj(v)) return fail("schema_invalid", `${label} must be an object`);
  const have = Object.keys(v).sort();
  const want = [...keys].sort();
  if (have.length !== want.length || have.some((k, i) => k !== want[i])) fail("schema_invalid", `${label} must have exactly ${want.join(",")}`);
  return v;
}
const strictInt = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isSafeInteger(v) && v >= lo && v <= hi;
const str = (v: unknown, lo: number, hi: number) => typeof v === "string" && v.length >= lo && v.length <= hi;
function ts(v: unknown, label: string): number {
  if (typeof v !== "string" || !TS_RE.test(v)) return fail("schema_invalid", `${label} must be YYYY-MM-DDTHH:MM:SSZ`);
  const t = Date.parse(v);
  if (!Number.isFinite(t)) fail("schema_invalid", label);
  return t;
}

/** `input` is either the canonical string received/sent on the wire or a
 * parsed object. `claimedDigest` is the packageDigest that travels with it. */
export function verifyPackage(input: string | unknown, claimedDigest: unknown, ctx: VerifyContext): VerifyResult {
  try {
    return { ok: true, ...verifyOrThrow(input, claimedDigest, ctx) };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, code: e.code, detail: e.detail };
    throw e; // a bug, not a verdict about the package: surface it
  }
}

function verifyOrThrow(input: unknown, claimedDigest: unknown, ctx: VerifyContext) {
  if (typeof claimedDigest !== "string" || !DIGEST_RE.test(claimedDigest)) fail("schema_invalid", "packageDigest must be 64 lowercase hex");
  let obj: unknown;
  let canonical: string;
  try {
    if (typeof input === "string") {
      if (input.length > MAX_PACKAGE_CHARS) fail("schema_invalid", "package too large");
      obj = JSON.parse(input);
      canonical = canonicalize(obj);
      if (canonical !== input) fail("not_canonical", "package bytes are not in canonical form");
    } else {
      obj = input;
      canonical = canonicalize(obj);
    }
  } catch (e) {
    if (e instanceof Fail) throw e;
    if (e instanceof CanonicalError || e instanceof SyntaxError) return fail("not_canonical", (e as Error).message);
    throw e;
  }
  // 1. digest of the exact bytes
  const digest = sha256Hex(canonical);
  if (!digestEquals(digest, claimedDigest as string)) fail("digest_mismatch", "package digest");
  // 2. consent gates: exactly boolean true
  if (!isObj(obj)) return fail("schema_invalid", "package must be an object");
  const disclosure = obj.disclosure;
  if (!isObj(disclosure) || disclosure.consent !== true) fail("consent_required", "disclosure.consent must be true");
  if ((disclosure as Record<string, unknown>).adultConfirmed !== true) fail("adult_confirmation_required", "disclosure.adultConfirmed must be true");
  // 3. shape (closed key sets)
  const p = exactKeys(obj, ["schema", "requestKey", "identity", "rubric", "surface", "entries", "moderation", "disclosure", "destination", "lifetime"], "package");
  const d = exactKeys(disclosure, ["consent", "adultConfirmed", "noticeVersion"], "disclosure");
  if (!str(d.noticeVersion, 1, 64)) fail("schema_invalid", "disclosure.noticeVersion");
  if (p.schema !== PACKAGE_SCHEMA_ID) fail("schema_invalid", "unknown schema id");
  if (typeof p.requestKey !== "string" || !RK_RE.test(p.requestKey)) fail("schema_invalid", "requestKey");
  const id = exactKeys(p.identity, ["clientRef", "caseId", "tier", "attempt"], "identity");
  if (id.clientRef !== p.requestKey) fail("schema_invalid", "identity.clientRef must equal requestKey");
  if (id.caseId !== null) fail("schema_invalid", "identity.caseId must be null for a new case");
  if (id.tier !== 1) fail("schema_invalid", "identity.tier must be 1");
  if (!strictInt(id.attempt, 1, 100)) fail("schema_invalid", "identity.attempt");
  const surface = SURFACES.find((s) => s === p.surface);
  if (!surface) return fail("schema_invalid", "unknown surface");
  if (typeof p.rubric !== "string") fail("schema_invalid", "rubric");
  const mod = exactKeys(p.moderation, ["result", "policyVersion"], "moderation");
  if (!str(mod.policyVersion, 1, 64)) fail("schema_invalid", "moderation.policyVersion");
  const dest = exactKeys(p.destination, ["network", "contractAddress", "contractCodeDigest"], "destination");
  if (!NETWORKS.includes(dest.network as NetworkName)) fail("schema_invalid", "destination.network");
  if (typeof dest.contractAddress !== "string" || !ADDR_RE.test(dest.contractAddress)) fail("schema_invalid", "destination.contractAddress");
  if (typeof dest.contractCodeDigest !== "string" || !DIGEST_RE.test(dest.contractCodeDigest)) fail("schema_invalid", "destination.contractCodeDigest");
  const life = exactKeys(p.lifetime, ["submissionDeadline", "appealWindowExpiry"], "lifetime");
  const deadline = ts(life.submissionDeadline, "lifetime.submissionDeadline");
  const expiry = ts(life.appealWindowExpiry, "lifetime.appealWindowExpiry");
  if (expiry <= deadline || expiry - deadline > MAX_LIFETIME_MS) fail("schema_invalid", "lifetime window");
  const entries = p.entries;
  if (!Array.isArray(entries) || entries.length < 2 || entries.length > 10) return fail("schema_invalid", "need 2 to 10 entries");
  const wantSource = SURFACE_SOURCE[surface];
  entries.forEach((raw, i) => {
    const e = exactKeys(raw, ["index", "text", "sha256", "provenance"], `entries[${i}]`);
    if (e.index !== i) fail("schema_invalid", `entries[${i}].index`);
    if (typeof e.text !== "string" || typeof e.sha256 !== "string" || !DIGEST_RE.test(e.sha256)) fail("schema_invalid", `entries[${i}]`);
    const prov = exactKeys(e.provenance, ["entrySource", "assurance"], `entries[${i}].provenance`);
    if (prov.entrySource !== wantSource) fail("schema_invalid", `entries[${i}].provenance.entrySource must be ${wantSource} on ${surface}`);
    if (!ASSURANCES.includes(prov.assurance as Assurance)) fail("schema_invalid", `entries[${i}].provenance.assurance`);
    if (prov.assurance === "verified_participant" && wantSource !== "participant_submitted") {
      fail("schema_invalid", "only participant_submitted entries can be verified_participant");
    }
  });
  const es = entries as PackageEntry[];
  // 4. per-entry digests
  es.forEach((e, i) => {
    if (!digestEquals(sha256Hex(e.text), e.sha256)) fail("digest_mismatch", `entries[${i}].sha256`);
  });
  // 5. sanitised form
  es.forEach((e, i) => {
    if (sanitiseText(e.text) !== e.text) fail("not_sanitised", `entries[${i}].text`);
  });
  // 6. destination
  if ((dest.contractAddress as string).toLowerCase() !== ctx.contractAddress.toLowerCase()) fail("wrong_destination", "destination.contractAddress");
  if (ctx.network !== undefined && dest.network !== ctx.network) fail("wrong_destination", "destination.network");
  if (ctx.contractCodeDigest !== undefined && dest.contractCodeDigest !== ctx.contractCodeDigest) fail("wrong_destination", "destination.contractCodeDigest");
  // 7. lifetime
  if (ctx.now.getTime() > deadline) fail("expired", "submission deadline passed");
  // 8. moderation
  if (mod.result !== "pass") fail("moderation_not_passed");
  // 9. what the contract's _resolve_rubric / _clean_entry would reject
  const rubric = p.rubric as string;
  if (!PRESETS.has(rubric.trim().toLowerCase())) {
    const r = sanitiseText(rubric);
    if (r.length === 0 || [...r].length > MAX_RUBRIC_CHARS) fail("schema_invalid", "rubric");
    if (controlPatternHit(r)) fail("instructions_aimed_at_judge", "rubric");
  }
  es.forEach((e, i) => {
    if (e.text.length === 0 || [...e.text].length > MAX_ENTRY_CHARS) fail("schema_invalid", `entries[${i}].text length`);
    if (controlPatternHit(e.text)) fail("instructions_aimed_at_judge", `entry ${i}`);
  });
  return { pkg: obj as unknown as CasePackage, canonical, digest };
}

// --------------------------------------------------------------- provenance

/** Card/API label. Never implies more than the recorded assurance. */
export function provenanceLabel(prov: ReadonlyArray<{ entrySource?: string; entry_source?: string; assurance: string }>): string {
  const one = (p: { entrySource?: string; entry_source?: string; assurance: string }) => {
    const src = p.entrySource ?? p.entry_source;
    if (src === "participant_submitted" && p.assurance === "verified_participant") return "submitted by the participant holding that side's link (checked by the VERDICT relayer)";
    if (src === "participant_submitted") return "submitted through Settle It; authorship not verified";
    if (src === "host_submitted") return "relayed by the stream host; authorship not verified";
    if (src === "api_client_submitted") return "submitted by an API client; authorship not verified";
    return "source unknown; not verified";
  };
  if (prov.length === 0) return "Provenance not recorded; authorship not verified. The receipt number proves which takes were judged, not that the verdict is correct.";
  const labels = prov.map(one);
  const body = labels.every((l) => l === labels[0]) ? `All takes ${labels[0]}` : labels.map((l, i) => `Entry ${String.fromCharCode(65 + i)}: ${l}`).join(". ");
  return `${body}. The receipt number proves which takes were judged, not that the verdict is correct.`;
}
