// Contract pinning: the relayer only submits to the exact contract code it was
// reviewed against (EXPECTED_CONTRACT_CODE_DIGEST = canonical code digest of
// contracts/judge_router.py; `npm run contract-digest` prints it).
//
// Canonical code digest = sha256 of the code with CRLF/CR turned into LF and
// exactly one trailing newline. Pasting the file into GenLayer Studio on
// Windows stores CRLF line endings and drops the final newline; normalising
// those two things cannot hide any change to the code itself. For a source
// file with LF endings and one final newline it equals plain sha256(file).
//
// genlayer-js 1.1.8 exposes `client.getContractCode(address)`: it calls the
// `gen_getContractCode` RPC (params [address] on Studio, [{address}] on
// testnets), base64-decodes the result and returns it as a UTF-8 string. We
// hash the UTF-8 bytes of that string. If the RPC does not implement the
// method, the result is "unsupported": a live relayer then refuses to submit
// unless ALLOW_UNVERIFIED_CONTRACT=true (exactly) - see the TODO below.

import { digestEquals, sha256Hex } from "./canonical.js";

export class UnsupportedRpc extends Error {}

/** Line endings to LF, exactly one trailing newline. */
export function canonicalCodeText(code: string): string {
  return code.replace(/\r\n?/g, "\n").replace(/\n+$/, "") + "\n";
}

/** sha256 of canonicalCodeText(code): the digest the pin compares. */
export function codeDigest(code: string): string {
  return sha256Hex(canonicalCodeText(code));
}

export type PinResult =
  | { state: "match"; digest: string; rawDigest: string }
  | { state: "mismatch"; digest: string; rawDigest: string; expected: string }
  | { state: "unsupported"; detail: string }
  | { state: "error"; detail: string };

export async function checkContractPin(getCode: () => Promise<string>, expected: string): Promise<PinResult> {
  let code: string;
  try {
    code = await getCode();
  } catch (e) {
    if (e instanceof UnsupportedRpc) return { state: "unsupported", detail: e.message };
    return { state: "error", detail: (e as Error).message };
  }
  if (typeof code !== "string" || code.length === 0) return { state: "error", detail: "empty contract code" };
  const digest = codeDigest(code);
  const rawDigest = sha256Hex(code);
  return digestEquals(digest, expected) ? { state: "match", digest, rawDigest } : { state: "mismatch", digest, rawDigest, expected };
}

/** May a live relayer submit given this pin result? */
export function pinAllowsSubmit(r: PinResult, allowUnverified: boolean): boolean {
  if (r.state === "match") return true;
  // TODO(live-check): confirm Studionet and Bradbury implement
  // gen_getContractCode. Until then an operator may opt in to submitting
  // without pinning with ALLOW_UNVERIFIED_CONTRACT=true; it is logged loudly.
  if (r.state === "unsupported") return allowUnverified === true;
  return false; // mismatch or RPC error: refuse
}
