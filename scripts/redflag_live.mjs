// Milestone 1 live run: deploy contracts/red_flag_court.py to studionet from the
// relayer key (a THROWAWAY test deployment; the owner deployment from the
// owner's wallet is a later step, deploy/OWNER_DEPLOY.md), check the stored
// code against the source, then run:
//   1 a redacted parcel-fee message (expect SCAM or SUS)
//   2 an ordinary message between friends (expect LEGIT)
//   3 an UNREDACTED message with digits (expect a [REJECTED] revert)
//   4 an appeal of check 1 to the 3-analyst panel
//   5 opt-in share of check 1, the relayer submitting its abstract pattern to
//     the owner PatternLedger, and mark_shared linking the two
// All messages are fictional. The key is read from the environment and never printed.
//   set -a; . relayer/.env.local; set +a
//   PATTERN_LEDGER_ADDRESS=0x... NODE_USE_ENV_PROXY=1 node scripts/redflag_live.mjs <out.json> <rawdir>
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
const ledger = process.env.PATTERN_LEDGER_ADDRESS;
if (!/^0x[0-9a-fA-F]{40}$/.test(ledger ?? "")) throw new Error("PATTERN_LEDGER_ADDRESS missing");
const account = createAccount(pk);
const client = createClient({ chain: studionet, account });
const code = new Uint8Array(readFileSync(path.join(ROOT, "contracts/red_flag_court.py")));
const digest = createHash("sha256").update(code).digest("hex");
const iso = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Map ? Object.fromEntries(x) : x)));

async function waitFor(hash, label, until = "ACCEPTED", timeoutMs = 900000) {
  const end = Date.now() + timeoutMs;
  let last = null, tx = null;
  while (Date.now() < end) {
    try { tx = await client.getTransaction({ hash }); } catch { tx = null; }
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
const revertText = (tx) => (JSON.stringify(plain(tx)).match(/\[(EXPECTED|REJECTED|LLM_ERROR)\][^"\\]*/) ?? [null])[0];
const votes = (tx) => {
  const v = plain(tx)?.consensus_data?.votes ?? {};
  const counts = {};
  for (const x of Object.values(v)) counts[x] = (counts[x] ?? 0) + 1;
  return counts;
};

const run = { network: "studionet", contract_file: "contracts/red_flag_court.py", contract_code_sha256: digest, deployer: account.address,
  note: "THROWAWAY test deployment from the relayer key. The owner deployment (from the owner's wallet) is a later step: deploy/OWNER_DEPLOY.md.",
  pattern_ledger: ledger, startedAt: iso(), deploy: null, steps: [], reads: {} };
const save = () => writeFileSync(out, JSON.stringify(run, null, 1) + "\n");

// ---------------------------------------------------------------- deploy
// REDFLAG_ADDRESS=0x... (+ DEPLOY_TX) re-runs against an existing deployment, e.g. the
// owner deployment made from the owner's wallet; otherwise the relayer key deploys a throwaway.
let dh = process.env.DEPLOY_TX ?? null;
let d = null;
let address = process.env.REDFLAG_ADDRESS ?? "";
console.log(`caller ${account.address}`);
if (!address) {
  dh = await client.deployContract({ code, args: [account.address] });
  console.log(`deploy ${dh}`);
  d = await waitFor(dh, "0-deploy", "ACCEPTED");
  const dtx = plain(d.tx);
  address = dtx?.data?.contract_address ?? dtx?.txDataDecoded?.contractAddress ?? dtx?.to_address;
} else {
  run.note = "Run against an existing deployment (REDFLAG_ADDRESS).";
}
if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? "")) throw new Error("no contract address in the deploy receipt");
run.contract = address;
run.deploy = { tx: dh, status: d?.cls.chainStatus ?? null, execution: d?.cls.execution ?? null };
save();
console.log(`contract ${address}`);

const codeB64 = await fetch("https://studio.genlayer.com/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gen_getContractCode", params: [address] }) }).then((r) => r.json()).then((j) => j.result);
const stored = Buffer.from(codeB64, "base64").toString("utf8");
const canon = stored.replace(/\r\n?/g, "\n").replace(/\n+$/, "") + "\n";
run.code_pin = { canonical_sha256: createHash("sha256").update(canon, "utf8").digest("hex"), source_sha256: digest };
run.code_pin.state = run.code_pin.canonical_sha256 === digest ? "match" : "mismatch";
save();
console.log(`pin ${run.code_pin.state}`);

const rk = () => "live_" + randomBytes(12).toString("hex");
const read = async (fn, args, addr = address) => { try { return plain(await client.readContract({ address: addr, functionName: fn, args })); } catch (e) { return { error: String(e.message ?? e).slice(0, 300) }; } };
async function step(label, intent, fn, args, addr = address) {
  const hash = await client.writeContract({ address: addr, functionName: fn, args, value: 0n });
  console.log(`${label} ${hash}`);
  const r = await waitFor(hash, label);
  const s = { label, intent, fn, contract: addr, tx: hash, status: r.cls.chainStatus, execution: r.cls.execution,
    revert: r.cls.execution === "SUCCESS" ? null : revertText(r.tx), votes: votes(r.tx), at: iso() };
  run.steps.push(s);
  save();
  return s;
}

const PARCEL = "Your parcel is on hold. Pay the small redelivery fee of [AMOUNT] at [LINK] within the hour or it goes back to the sender.";
const FRIEND = "Hey, running late, see you at the cafe in ten minutes. Save me a seat please.";
const RAW = "Final notice: pay 49 dollars today at parcel-help.com or your package is destroyed.";
const rk1 = rk(), rk2 = rk(), rk3 = rk();

await step("1-scam", "redacted parcel-fee message (expect SCAM or SUS)", "open_check", [PARCEL, rk1, true, true]);
run.reads.check_1_tier1 = await read("get_check", [1]);
await step("2-legit", "ordinary message between friends (expect LEGIT)", "open_check", [FRIEND, rk2, true, true]);
run.reads.check_2 = await read("get_check", [2]);
await step("3-unredacted", "unredacted message with digits and a domain (expect [REJECTED])", "open_check", [RAW, rk3, true, true]);
await step("4-appeal", "appeal check 1 to the 3-analyst panel", "appeal", [1]);
run.reads.check_1_tier2 = await read("get_check", [1]);
save();

// Opt-in share -> PatternLedger (owner deployment; relayer role) -> mark_shared
const c1 = run.reads.check_1_tier2;
if (c1 && c1.label !== "LEGIT" && c1.pattern_summary) {
  await step("5-share-optin", "creator opts in to share the abstract pattern", "set_share", [1, true]);
  run.reads.list_shareable = await read("list_shareable", [10]);
  const q = (run.reads.list_shareable ?? [])[0];
  if (q) {
    const lk = rk();
    const s = await step("6-ledger-submit", "relayer submits the abstract pattern to the owner PatternLedger", "submit_pattern",
      [q.flag_codes.length ? q.flag_codes : ["urgency"], q.category, q.pattern_summary, lk], ledger);
    if (s.execution === "SUCCESS") {
      const got = await read("get_by_request_key", [lk], ledger);
      run.reads.ledger_by_request_key = got;
      if (got?.pattern_id) {
        await step("7-mark-shared", "link the check to its PatternLedger id", "mark_shared", [1, Number(got.pattern_id)]);
        run.reads.check_1_shared = await read("get_check", [1]);
      }
    }
  }
} else {
  run.share_skipped = "check 1 is LEGIT or has no pattern summary after the appeal";
}
run.reads.get_config = await read("get_config", []);
run.reads.list_recent = await read("list_recent", [10]);
save();

for (const s of run.steps) {
  const r = await waitFor(s.tx, `${s.label}-final`, "FINAL", 1500000);
  s.final_status = r.cls.chainStatus; s.final_execution = r.cls.execution; s.finality = r.cls.finality;
  save();
}
if (dh) {
  const fd = await waitFor(dh, "0-deploy-final", "FINAL", 1500000);
  run.deploy.final_status = fd.cls.chainStatus; run.deploy.final_execution = fd.cls.execution;
}
run.finishedAt = iso();
save();
console.log("done");
