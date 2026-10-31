// Build a canonical case package for open_case_package (e.g. to paste into
// GenLayer Studio, or for the live evidence run).
//   npm run build && node dist/tools/makePackage.js ../examples/case-1-pizza.json 0xCONTRACT [studionet]
// Prints JSON: { package_json, package_digest, request_key }.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseNetwork } from "../config.js";
import { sha256Hex } from "../lib/canonical.js";
import { buildPackage, verifyPackage, type Surface } from "../lib/package.js";

const [file, address, net] = process.argv.slice(2);
if (!file || !address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error("usage: node dist/tools/makePackage.js <example.json> <0xcontract> [network]");
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const code = readFileSync(path.resolve(here, "../../../contracts/judge_router.py"));
const ex = JSON.parse(readFileSync(file, "utf8")) as { rubric: string; entries: string[]; surface: Surface };
const now = new Date();
const built = buildPackage({
  requestKey: randomBytes(16).toString("hex"),
  rubric: ex.rubric,
  surface: ex.surface,
  entries: ex.entries.map((text) => ({ text, assurance: "self_asserted" as const })),
  moderationPolicyVersion: "verdict-local-2026-10-31+local-only",
  noticeVersion: "public-onchain-v1",
  network: parseNetwork(net ?? "studionet"),
  contractAddress: address,
  contractCodeDigest: sha256Hex(code),
  now,
  submissionTtlSec: 3600,
  caseLifetimeSec: 86400,
});
const v = verifyPackage(built.canonical, built.digest, { now, contractAddress: address });
if (!v.ok) throw new Error(`self-check failed: ${v.code} ${v.detail}`);
console.log(JSON.stringify({ package_json: built.canonical, package_digest: built.digest, request_key: built.pkg.requestKey }, null, 2));
