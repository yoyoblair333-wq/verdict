// Build-time snapshot of the live contract, written to web/dist/snapshot.json.
// The page reads the contract live from the browser (studionet's RPC allows
// cross-origin requests); this file is only the fallback when that live read
// fails, and the page labels it "Snapshot · taken <time>". Every value in it
// comes from the same contract views the page calls.
//
// Usage: node scripts/snapshot.mjs   (behind a proxy: NODE_USE_ENV_PROXY=1)
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { transactionsStatusNumberToName } from "genlayer-js/types";
import { CONTRACT_ADDRESS, CONTRACT_CODE_DIGEST, PAGE_SIZE, RPC_URL } from "../src/config.js";
import { idsToFetch } from "../src/lib/gallery.js";
import { hideDecision, redactCase } from "../src/lib/display.js";
import { RAW_SOURCE_URL, sha256Bytes, summarizeTx, trustPlan } from "../src/lib/trust.js";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const client = createClient({ chain: studionet, endpoint: RPC_URL });

const plain = (v) => {
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "bigint") return Number(v);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};
const view = async (functionName, args = []) => plain(await client.readContract({ address: CONTRACT_ADDRESS, functionName, args }));

async function withRetry(fn, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

const config = await withRetry(() => view("get_config"));
// Same display filter as the page: a hidden or flagged case is stored with
// its text removed, so the published JSON never carries it either.
let hidden = [];
let pinnedIds = [];
let ev = null;
try {
  ev = JSON.parse(await readFile(path.join(dist, "evidence.json"), "utf8"));
  hidden = ev.hidden ?? [];
  pinnedIds = ev.pinned ?? [];
} catch {
  hidden = JSON.parse(await readFile(path.join(dist, "../src/hidden-cases.json"), "utf8")).hidden ?? [];
}
// Same selection as the page: pinned evidence cases by id, then the newest page by id.
const { pinned, page } = idsToFetch(config.next_id, pinnedIds, undefined, PAGE_SIZE);
const cases = [];
let redacted = 0;
for (const id of [...pinned, ...page]) {
  const c = await withRetry(() => view("get_case", [id]));
  if (hideDecision(c, hidden)) {
    cases.push(redactCase(c));
    redacted++;
  } else cases.push(c);
}
const code = await withRetry(() => client.getContractCode(CONTRACT_ADDRESS));
const digest = createHash("sha256").update(code, "utf8").digest("hex");

// Trust page fallback ("Try to rig it."): the same transaction summaries and
// GitHub source hash the page computes live. A failure here never blocks the
// case snapshot; the page then says it could not read that section.
let trust = null;
try {
  const plan = trustPlan(ev);
  const txs = {};
  for (const { hash } of [...plan.jury, ...(plan.revoke ? [plan.revoke] : [])]) {
    txs[hash] = summarizeTx(await withRetry(() => client.getTransaction({ hash })), transactionsStatusNumberToName);
  }
  const r = await withRetry(async () => {
    const res = await fetch(RAW_SOURCE_URL);
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    return res;
  });
  trust = { at: new Date().toISOString(), txs, github: { url: RAW_SOURCE_URL, digest: await sha256Bytes(await r.arrayBuffer()) } };
} catch (e) {
  console.warn(`snapshot: trust section skipped (${e.message})`);
}

const snap = {
  snapshotAt: new Date().toISOString(),
  rpc: RPC_URL,
  contract: CONTRACT_ADDRESS,
  pin: { state: digest === CONTRACT_CODE_DIGEST ? "match" : "mismatch", digest },
  config,
  cases,
  trust,
};
await mkdir(dist, { recursive: true });
await writeFile(path.join(dist, "snapshot.json"), JSON.stringify(snap, null, 2));
console.log(`snapshot.json: ${cases.length} cases (${redacted} redacted) at ${snap.snapshotAt}, pin ${snap.pin.state}, trust ${trust ? `${Object.keys(trust.txs).length} txs, github ${trust.github.digest === digest ? "match" : "differ"}` : "skipped"}`);
