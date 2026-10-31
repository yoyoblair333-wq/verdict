#!/usr/bin/env node
// Runs the compiled relayer tests with an explicit file list.
//   node scripts/run-tests.mjs [--serial] unit standin live
// `node --test "dir/*.test.js"` only expands globs on Node 21+; on Node 20 the
// pattern is taken as a literal path and the run fails. Listing the files here
// works on every Node the package supports (engines: >=20).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const serial = args.includes("--serial");
const tiers = args.filter((a) => a !== "--serial");
if (tiers.length === 0) {
  console.error("usage: run-tests.mjs [--serial] <tier> [tier...]   (tiers: unit standin live)");
  process.exit(2);
}
const files = [];
for (const tier of tiers) {
  const dir = path.join(root, "dist-test", "test", tier);
  if (!existsSync(dir)) {
    console.error(`run-tests: ${path.relative(root, dir)} does not exist (did tsc -p tsconfig.test.json run?)`);
    process.exit(2);
  }
  for (const f of readdirSync(dir).sort()) if (f.endsWith(".test.js")) files.push(path.join(dir, f));
}
if (files.length === 0) {
  console.error(`run-tests: no *.test.js files in ${tiers.join(", ")}`);
  process.exit(2);
}
const r = spawnSync(process.execPath, ["--test", ...(serial ? ["--test-concurrency=1"] : []), ...files], { stdio: "inherit", cwd: root });
process.exit(r.status ?? 1);
