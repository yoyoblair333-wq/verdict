// Build the static site into web/dist/:
//   app.js          genlayer-js + app code, bundled for the browser by esbuild
//   index.html, styles.css, favicon.svg
//   evidence.json   tx-hash index for the recorded studionet run
//                   (docs/live/studionet-run.json) and the browser-signed demo
//                   case (docs/live/demo-case.json); the contract does not store
//                   tx hashes, so this is how read mode links them. Its case ids
//                   are the pinned evidence cases.
// snapshot.json is written separately by scripts/snapshot.mjs (Pages workflow).
import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(web, "..");
const dist = path.join(web, "dist");
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [path.join(web, "src/app.js")],
  outfile: path.join(dist, "app.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  sourcemap: true,
  legalComments: "linked",
  logLevel: "info",
});

for (const f of ["index.html", "styles.css"]) await copyFile(path.join(web, "src", f), path.join(dist, f));
await copyFile(path.join(root, "brand/logo-mark.svg"), path.join(dist, "favicon.svg"));
await writeFile(path.join(dist, ".nojekyll"), "");

// Evidence index: caseId -> ordered [{fn, hash}], from the recorded live run.
const run = JSON.parse(await readFile(path.join(root, "docs/live/studionet-run.json"), "utf8"));
const caseOfHash = new Map();
const takenDown = [];
for (const c of run.cases ?? []) {
  for (const s of c.steps ?? []) {
    const tx = s.body?.tx ?? s.tx;
    if (typeof tx === "string") caseOfHash.set(tx, c.caseId);
    if (/^takedown/i.test(s.step ?? "") && s.status === 200) takenDown.push(c.caseId);
  }
}
const cases = {};
let cur = null;
for (const t of run.transactions ?? []) {
  // confirm_verdict hashes are not in the case steps: they follow their jury tx.
  if (caseOfHash.has(t.hash)) cur = caseOfHash.get(t.hash);
  if (cur === null) continue;
  (cases[cur] ??= []).push({ fn: t.fn, hash: t.hash });
}
// Browser-signed demo case (docs/live/demo-case.json, AUDIT-2 P1-1): its tx
// hashes are indexed too, so every visitor sees them, not only the signing browser.
const demo = JSON.parse(await readFile(path.join(root, "docs/live/demo-case.json"), "utf8"));
if (String(demo.contract).toLowerCase() !== String(run.contract).toLowerCase()) throw new Error("demo-case.json is for another contract");
if (!Number.isSafeInteger(demo.case_id) || demo.case_id < 1) throw new Error("demo-case.json: bad case_id");
cases[demo.case_id] = (demo.transactions ?? []).filter((t) => typeof t.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(t.hash)).map((t) => ({ fn: t.fn, hash: t.hash }));
// Pinned = every evidence case: fetched by id and listed first, so spam can't push them off.
const pinned = Object.keys(cases).map(Number).sort((a, b) => a - b);
// Operator hidden list (src/hidden-cases.json) + takedowns recorded in the run.
const hc = JSON.parse(await readFile(path.join(web, "src/hidden-cases.json"), "utf8"));
if (String(hc.contract).toLowerCase() !== String(run.contract).toLowerCase()) throw new Error("hidden-cases.json is for another contract");
const hidden = [];
for (const x of hc.hidden ?? []) {
  if (!Number.isSafeInteger(x.id) || x.id < 1) throw new Error(`hidden-cases.json: bad id ${JSON.stringify(x.id)}`);
  hidden.push({ id: x.id, reason: typeof x.reason === "string" ? x.reason : "" });
}
for (const id of takenDown) if (!hidden.some((x) => x.id === id)) hidden.push({ id, reason: "" });
const evidence = {
  source: "docs/live/studionet-run.json + docs/live/demo-case.json",
  network: run.network,
  contract: run.contract,
  recordedAt: run.startedAt,
  cases,
  pinned,
  takenDown,
  hidden,
};
await writeFile(path.join(dist, "evidence.json"), JSON.stringify(evidence, null, 2));
console.log(`evidence.json: ${Object.keys(cases).length} cases (pinned ${JSON.stringify(pinned)}), ${Object.values(cases).flat().length} txs, hidden=${JSON.stringify(hidden.map((x) => x.id))}`);
