// Live run for a deployed contracts/pattern_ledger.py on studionet: checks the
// stored code against the source (canonical code digest), then makes three
// staff-written synthetic submissions (new, dedup sighting, PII-rejected) from
// the relayer key, reads them back and follows them to finality. The key is read
// from the environment and never printed. Usage (relayer built first):
//   set -a; . relayer/.env.local; set +a
//   PATTERN_LEDGER_ADDRESS=0x... OWNER_ADDRESS=0x... DEPLOY_TX=0x... \
//     NODE_USE_ENV_PROXY=1 node scripts/pattern_live.mjs <out.json> <rawdir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const R = path.join(ROOT, "relayer/node_modules/genlayer-js/dist");
const { createAccount, createClient } = await import(`${R}/index.js`);
const { studionet } = await import(`${R}/chains/index.js`);
const { classifyTx } = await import(path.join(ROOT, "relayer/dist-test/src/lib/finality.js"));

const out = process.argv[2];
const rawDir = process.argv[3];
mkdirSync(rawDir, { recursive: true });
const pk = process.env.RELAYER_PRIVATE_KEY;
if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("RELAYER_PRIVATE_KEY missing");
const account = createAccount(pk);
const client = createClient({ chain: studionet, account });
const codePath = path.join(ROOT, "contracts/pattern_ledger.py");
const code = new Uint8Array(readFileSync(codePath));
const digest = createHash("sha256").update(code).digest("hex"); // source file is LF + one final newline: equals the canonical code digest
const iso = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Map ? Object.fromEntries(x) : x)));

async function waitFor(hash, label, until = "ACCEPTED", timeoutMs = 900000) {
  const end = Date.now() + timeoutMs;
  let last = null, tx = null;
  while (Date.now() < end) {
    try { tx = await client.getTransaction({ hash }); } catch (e) { tx = null; }
    const c = classifyTx(tx);
    if (!last || last.chainStatus !== c.chainStatus) console.log(`  ${label} ${c.chainStatus} exec=${c.execution}`);
    last = c;
    if (c.finality === "FINALIZED_SUCCESS" || c.finality === "FINALIZED_ERROR") break;
    if (until === "ACCEPTED" && c.finality === "ACCEPTED") break;
    await sleep(4000);
  }
  writeFileSync(path.join(rawDir, `${label}.json`), JSON.stringify(plain(tx), null, 1));
  return { cls: last, tx };
}

function leaderResult(tx) {
  // Best effort: find the leader's result / error text in the receipt.
  const s = JSON.stringify(plain(tx));
  const m = s.match(/\[(EXPECTED|REJECTED|LLM_ERROR)\][^"\\]*/);
  return m ? m[0] : null;
}

const address = process.env.PATTERN_LEDGER_ADDRESS;
if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? "")) throw new Error("PATTERN_LEDGER_ADDRESS missing");
const run = { network: "studionet", contract: address, owner: process.env.OWNER_ADDRESS, relayer: account.address, contract_file: "contracts/pattern_ledger.py",
  contract_code_sha256: digest, startedAt: iso(), deploy: null, submissions: [], reads: {} };
const save = () => writeFileSync(out, JSON.stringify(run, null, 1) + "\n");

console.log(`relayer ${account.address}`);
const codeB64 = await fetch("https://studio.genlayer.com/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gen_getContractCode", params: [address] }) }).then((r) => r.json()).then((j) => j.result);
const stored = Buffer.from(codeB64, "base64").toString("utf8");
const canon = stored.replace(/\r\n?/g, "\n").replace(/\n+$/, "") + "\n";
run.deploy = { tx: process.env.DEPLOY_TX, by: "owner wallet via GenLayer Studio (MetaMask)" };
run.code_pin = { raw_sha256: createHash("sha256").update(stored, "utf8").digest("hex"), canonical_sha256: createHash("sha256").update(canon, "utf8").digest("hex"), source_sha256: digest };
run.code_pin.state = run.code_pin.canonical_sha256 === digest ? "match" : "mismatch";
save();
console.log(`pin ${run.code_pin.state}`);
if (run.code_pin.state !== "match") throw new Error("code pin mismatch");

const rk = () => "live_" + randomBytes(12).toString("hex");
const subs = [
  { label: "1-new", intent: "new pattern", codes: ["urgency", "upfront_payment", "link_pressure"], category: "delivery",
    summary: "A text claims a parcel is on hold and asks for a small redelivery fee through a link before it is sent back." },
  { label: "2-dedup", intent: "same pattern as #1 (dedup sighting)", codes: ["urgency", "link_pressure", "threat_of_loss"], category: "delivery",
    summary: "A message says a parcel delivery failed and demands a small fee paid through a link, or the parcel is returned." },
  { label: "3-pii", intent: "deliberately rejected for PII (digits and an email-like handle)", codes: ["code_request", "impersonation_claim"], category: "account-lock",
    summary: "Pretends to be support at help@fictional and asks for the 6 digit code sent by text." },
];
for (const s of subs) {
  const requestKey = rk();
  const hash = await client.writeContract({ address, functionName: "submit_pattern", args: [s.codes, s.category, s.summary, requestKey], value: 0n });
  console.log(`${s.label} ${hash}`);
  const r = await waitFor(hash, s.label);
  run.submissions.push({ label: s.label, intent: s.intent, request_key: requestKey, flag_codes: s.codes, category: s.category, summary: s.summary,
    tx: hash, status: r.cls.chainStatus, execution: r.cls.execution, revert: r.cls.execution === "SUCCESS" ? null : leaderResult(r.tx), at: iso() });
  save();
}

const read = async (fn, args) => { try { return plain(await client.readContract({ address, functionName: fn, args })); } catch (e) { return { error: String(e.message ?? e).slice(0, 300) }; } };
run.reads.get_pattern_1 = await read("get_pattern", [1]);
run.reads.list_recent = await read("list_recent", [10]);
run.reads.top_patterns_since = await read("top_patterns_since", ["2026-10-01T00:00:00Z", 5]);
run.reads.get_config = await read("get_config", []);
for (const s of run.submissions) run.reads[`get_by_request_key_${s.label}`] = await read("get_by_request_key", [s.request_key]);
save();

// Finality follow-up (studionet finality window), best effort.
for (const s of run.submissions) {
  const r = await waitFor(s.tx, `${s.label}-final`, "FINAL", 1500000);
  s.final_status = r.cls.chainStatus; s.final_execution = r.cls.execution; s.finality = r.cls.finality;
  save();
}
run.finishedAt = iso();
save();
console.log("done");
