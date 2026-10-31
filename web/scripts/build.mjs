// Build the static site into web/dist/:
//   app.js          genlayer-js + app code, bundled for the browser by esbuild
//   index.html, styles.css, favicon.svg
//   evidence.json   tx-hash index for the recorded studionet run
//                   (docs/live/studionet-run.json); the contract does not store
//                   tx hashes, so this is how read mode links them
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
const evidence = {
  source: "docs/live/studionet-run.json",
  network: run.network,
  contract: run.contract,
  recordedAt: run.startedAt,
  cases,
  takenDown,
};
await writeFile(path.join(dist, "evidence.json"), JSON.stringify(evidence, null, 2));
console.log(`evidence.json: ${Object.keys(cases).length} cases, ${Object.values(cases).flat().length} txs, takenDown=${JSON.stringify(takenDown)}`);
