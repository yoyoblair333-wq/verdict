// Build the static site into web/dist/:
//   app.js, rig.js  the court record and the "Try to rig it." trust page,
//                   bundled for the browser by esbuild (genlayer-js shared in chunks/)
//   index.html, rig.html, styles.css, favicon.svg
//   evidence.json   tx-hash index for the recorded studionet run
//                   (docs/live/studionet-run.json) and the browser-signed demo
//                   case (docs/live/demo-case.json); the contract does not store
//                   tx hashes, so this is how read mode links them. Its case ids
//                   are the pinned evidence cases. Its `trust` block names the
//                   transactions the trust page reads live: each case's Tier 1
//                   jury tx and the revoke negative test.
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
  entryPoints: [path.join(web, "src/app.js"), path.join(web, "src/rig.js")],
  outdir: dist,
  entryNames: "[name]",
  chunkNames: "chunks/[name]-[hash]",
  splitting: true,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  sourcemap: true,
  legalComments: "linked",
  logLevel: "info",
});

for (const f of ["index.html", "rig.html", "styles.css"]) await copyFile(path.join(web, "src", f), path.join(dist, f));
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
// Trust page (ADR-017): the relayer run's Tier 1 jury txs (one per case) and its
// on-chain revoke after confirm_verdict, which must revert with this reason.
const EXPECT_REVOKE = "verdict is final; request an off-chain takedown instead";
const source = await readFile(path.join(root, "contracts/judge_router.py"), "utf8");
if (!source.includes(EXPECT_REVOKE)) throw new Error("trust: the revoke revert reason is no longer in contracts/judge_router.py");
const caseOfTx = new Map(Object.entries(cases).flatMap(([id, txs]) => txs.map((t) => [t.hash, Number(id)])));
const relayerCaseIds = new Set((run.cases ?? []).map((c) => c.caseId));
const jury = [];
for (const t of run.transactions ?? []) {
  const caseId = caseOfTx.get(t.hash);
  if (t.fn === "judge" && relayerCaseIds.has(caseId) && !jury.some((j) => j.caseId === caseId)) jury.push({ caseId, fn: t.fn, hash: t.hash });
}
const rv = (run.transactions ?? []).find((t) => t.fn === "revoke");
const relayerStep = (run.cases ?? []).flatMap((c) => (c.steps ?? []).map((s) => ({ caseId: c.caseId, ...s }))).find((s) => /winner revoke via relayer/i.test(s.step ?? ""));
const trust = {
  jury: jury.slice(0, 3),
  revoke: rv ? { caseId: caseOfTx.get(rv.hash), hash: rv.hash } : null,
  expectRevoke: EXPECT_REVOKE,
  relayerRevoke: relayerStep ? { caseId: relayerStep.caseId, status: relayerStep.status, error: String(relayerStep.body?.error ?? "") } : null,
};
if (trust.jury.length < 2 || !trust.revoke) throw new Error("trust: the evidence run no longer has the jury and revoke transactions the trust page reads");

const evidence = {
  source: "docs/live/studionet-run.json + docs/live/demo-case.json",
  network: run.network,
  contract: run.contract,
  recordedAt: run.startedAt,
  cases,
  pinned,
  takenDown,
  hidden,
  trust,
};
await writeFile(path.join(dist, "evidence.json"), JSON.stringify(evidence, null, 2));
console.log(`evidence.json: ${Object.keys(cases).length} cases (pinned ${JSON.stringify(pinned)}), ${Object.values(cases).flat().length} txs, hidden=${JSON.stringify(hidden.map((x) => x.id))}, trust jury=${JSON.stringify(trust.jury.map((j) => j.caseId))} revoke=case ${trust.revoke.caseId}`);
