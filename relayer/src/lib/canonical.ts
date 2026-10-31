// Canonical JSON + SHA-256, shared by packages, outbox and inbox.
//
// An RFC 8785 (JCS)-style subset: object keys sorted by UTF-16 code units
// (keys must be ASCII, so this equals Python's code-point sort), no
// insignificant whitespace, strings escaped exactly as JSON.stringify does,
// integers only (no floats: JCS number formatting is where implementations
// most often disagree), UTF-8 output. contracts/judge_router.py
// `_canonical_json` and fixtures/generate.py produce byte-identical output
// for this input space; fixtures/valid-case.json pins one example.

import { createHash } from "node:crypto";

export class CanonicalError extends Error {}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const ASCII = /^[\x00-\x7f]*$/;

export function canonicalize(v: unknown): string {
  if (v === null) return "null";
  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(v)) throw new CanonicalError("only safe integers are allowed");
      return String(v);
    case "string":
      if (LONE_SURROGATE.test(v)) throw new CanonicalError("lone surrogate in string");
      return JSON.stringify(v);
    case "object": {
      if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) throw new CanonicalError("only plain objects are allowed");
      const keys = Object.keys(v as object).sort();
      return `{${keys
        .map((k) => {
          if (!ASCII.test(k)) throw new CanonicalError("object keys must be ASCII");
          return `${JSON.stringify(k)}:${canonicalize((v as Record<string, unknown>)[k])}`;
        })
        .join(",")}}`;
    }
    default:
      throw new CanonicalError(`unsupported JSON type ${typeof v}`);
  }
}

export function sha256Hex(text: string | Uint8Array): string {
  return createHash("sha256").update(typeof text === "string" ? Buffer.from(text, "utf8") : text).digest("hex");
}

/** Constant-time equality for two lowercase hex digests of equal length. */
export function digestEquals(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
