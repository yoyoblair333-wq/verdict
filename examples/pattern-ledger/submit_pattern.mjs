// PatternLedger WRITE example, for operators (the relayer or the owner).
//
// Only the address stored as `relayer` (or `owner`) may call submit_pattern;
// any other key reverts "[EXPECTED] only relayer or owner". Ordinary users
// never sign: they opt in inside the app and the relayer submits for them.
//
// The key comes ONLY from the environment. Never put a key in this file, a
// command line, a log or a commit. Default is a DRY RUN that needs no key:
// it runs the same deterministic pre-checks the contract runs and prints the
// call it would make. Add --send to broadcast.
//
//   (cd relayer && npm ci)
//   node examples/pattern-ledger/submit_pattern.mjs                     # dry run
//   set -a; . relayer/.env.local; set +a                                # loads RELAYER_PRIVATE_KEY
//   NODE_USE_ENV_PROXY=1 node examples/pattern-ledger/submit_pattern.mjs --send
//
// Optional env: PATTERN_LEDGER_ADDRESS (default: the studionet ledger).
// The production path is relayer/src/lib/pattern.ts (opt-in, rate limit, two
// redaction passes, LLM summary, SHADOW/LIVE modes, journal); this file shows
// only the chain call so another builder can see the shape.
import path from "node:path";
import { randomBytes } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const GL = path.join(ROOT, "relayer/node_modules/genlayer-js/dist");
const ADDRESS = process.env.PATTERN_LEDGER_ADDRESS ?? "0x59C6047571bCE66828C733330fc9B5C88afEaE4D";
const SEND = process.argv.includes("--send");

// A synthetic, staff-written record: no names, numbers, links, brands or amounts.
const record = {
  flag_codes: ["code_request", "impersonation_claim", "urgency"],
  category: "account-lock",
  summary: "A message poses as account support, says the account will be locked today and asks for the login code just sent by text.",
};
// Random, never derived from the user or the text (it is stored on-chain).
const requestKey = "ex_" + randomBytes(12).toString("hex");

// ---- Client-side mirror of the contract's deterministic gate (a courtesy:
// the contract re-runs it and is authoritative). Read the lists from chain so
// they cannot drift.
const { createClient, createAccount, generatePrivateKey } = await import(`${GL}/index.js`);
const { studionet } = await import(`${GL}/chains/index.js`);
const reader = createClient({ chain: studionet, account: createAccount(generatePrivateKey()) });
const toObj = (v) => (v instanceof Map ? Object.fromEntries(v) : v);
const cfg = toObj(await reader.readContract({ address: ADDRESS, functionName: "get_config", args: [] }));

const problems = [];
if (!/^[A-Za-z0-9_-]{16,64}$/.test(requestKey)) problems.push("bad request_key");
if (!record.flag_codes.length || record.flag_codes.some((c) => !cfg.flag_codes.includes(c))) problems.push("unknown flag code");
if (!cfg.categories.includes(record.category)) problems.push("unknown category");
if (record.summary.length > Number(cfg.max_summary_chars)) problems.push("summary too long");
if (/\p{N}/u.test(record.summary)) problems.push("digits");
if (record.summary.includes("@")) problems.push("email_or_handle");
if (/\p{Sc}/u.test(record.summary)) problems.push("amount");
if (/[a-z][a-z0-9+.-]*:\/\/|\bwww\./i.test(record.summary)) problems.push("url (partial check)");
if (cfg.paused) problems.push("ledger is paused");
if (problems.length) { console.error("pre-check failed:", problems.join(", ")); process.exit(1); }

const call = { address: ADDRESS, functionName: "submit_pattern",
  args: [record.flag_codes, record.category, record.summary, requestKey], value: 0n };
console.log("pre-check ok; call:", JSON.stringify({ ...call, value: "0" }, null, 2));
if (!SEND) { console.log("dry run (add --send with RELAYER_PRIVATE_KEY set to broadcast)"); process.exit(0); }

// ---- Broadcast.
const pk = process.env.RELAYER_PRIVATE_KEY;
if (!/^0x[0-9a-fA-F]{64}$/.test(pk ?? "")) throw new Error("RELAYER_PRIVATE_KEY missing or malformed (value not printed)");
const signer = createAccount(pk);
if (signer.address.toLowerCase() !== String(cfg.relayer).toLowerCase() &&
    signer.address.toLowerCase() !== String(cfg.owner).toLowerCase()) {
  throw new Error(`key's address ${signer.address} is neither relayer nor owner; the call would revert`);
}
const client = createClient({ chain: studionet, account: signer });
const hash = await client.writeContract(call);
console.log("tx", hash);

// Poll ourselves: waitForTransactionReceipt({status: ACCEPTED}) returns on any
// decided state, including UNDETERMINED / timeouts (see relayer/src/lib/finality.ts).
let tx;
for (let i = 0; i < 150; i++) {
  tx = await client.getTransaction({ hash });
  const st = tx?.statusName ?? tx?.status_name;
  if (["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(st)) break;
  await new Promise((r) => setTimeout(r, 4000));
}
const exec = tx?.consensus_data?.leader_receipt?.[0]?.execution_result ?? tx?.txExecutionResultName;
console.log("status", tx?.statusName ?? tx?.status_name, "execution", exec);

// Reconcile by request key: {pattern_id: 0} means it reverted ([REJECTED] /
// [EXPECTED] / [LLM_ERROR]) or validators did not agree, so nothing was stored.
const r = toObj(await reader.readContract({ address: ADDRESS, functionName: "get_by_request_key", args: [requestKey] }));
console.log("get_by_request_key:", JSON.stringify(r, (_k, x) => (typeof x === "bigint" ? Number(x) : x)));
