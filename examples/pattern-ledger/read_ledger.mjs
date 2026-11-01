// PatternLedger read-only client example (genlayer-js). No private key needed:
// views run through gen_call, and a throwaway account (generated in memory,
// never funded, never saved) is only used as the `from` address.
//
// Usage, from the repo root (installs the pinned genlayer-js 1.1.8):
//   (cd relayer && npm ci)
//   NODE_USE_ENV_PROXY=1 node examples/pattern-ledger/read_ledger.mjs [address]
// NODE_USE_ENV_PROXY=1 is only needed behind an HTTP(S) proxy (Node 22+).
// Default address: the owner-deployed ledger on studionet.
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const GL = path.join(ROOT, "relayer/node_modules/genlayer-js/dist");
const { createClient, createAccount, generatePrivateKey } = await import(`${GL}/index.js`);
const { studionet } = await import(`${GL}/chains/index.js`);

const ADDRESS = process.argv[2] ?? "0x59C6047571bCE66828C733330fc9B5C88afEaE4D";
const client = createClient({ chain: studionet, account: createAccount(generatePrivateKey()) });

// genlayer-js returns bigint for integers and Map for dicts; make them printable.
const plain = (v) => JSON.parse(JSON.stringify(v, (_k, x) =>
  typeof x === "bigint" ? Number(x) : x instanceof Map ? Object.fromEntries(x) : x));
const read = async (functionName, args = []) =>
  plain(await client.readContract({ address: ADDRESS, functionName, args }));

const config = await read("get_config");
console.log("get_config:", JSON.stringify(config, null, 2));

const recent = await read("list_recent", [5]);
console.log(`\nlist_recent(5): ${recent.length} pattern(s)`);
for (const p of recent) {
  console.log(`  #${p.id} [${p.category}] x${p.sightings}  ${p.flag_codes.join(",")}`);
  console.log(`      "${p.summary}"`);
}

if (recent.length > 0) {
  const p = await read("get_pattern", [recent[recent.length - 1].id]);
  console.log(`\nget_pattern(${p.id}):`, JSON.stringify(p, null, 2));
}

// Rolling 30-day window, the same query the weekly digest makes.
const since = new Date(Date.now() - 30 * 864e5).toISOString().replace(/\.\d{3}Z$/, "Z");
const top = await read("top_patterns_since", [since, 5]);
console.log(`\ntop_patterns_since("${since}", 5):`);
for (const r of top) console.log(`  #${r.id} sightings_since=${r.sightings_since} total=${r.sightings} last_seen=${r.last_seen}`);
