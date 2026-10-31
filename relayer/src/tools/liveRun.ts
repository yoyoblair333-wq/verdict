// Live evidence run: the REAL relayer (live mode, real genlayer-js client)
// against a real GenLayer network, for the three cases in ../examples.
//
//   set -a; . ./.env.local; set +a          # throwaway key, never committed
//   JUDGE_ROUTER_ADDRESS=0x... EXPECTED_CONTRACT_CODE_DIGEST=... \
//   NODE_USE_ENV_PROXY=1 node dist/tools/liveRun.js ../docs/live/studionet-run.json
//
// Case 1: open -> judge -> appeal (Tier 2) -> appeal (Supreme Court, final)
// Case 2: open -> judge -> appeal (Tier 2) -> finalize (operator call)
// Case 3: open -> judge -> winner tries to revoke (relayer 409) -> raw on-chain
//         revoke attempt after confirmation (must revert) -> takedown flag
// Every broadcast and every observed status transition is recorded.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { classifyTx, type TxLike } from "../lib/finality.js";
import { JudgeRouterClient, toPlain } from "../lib/genlayer.js";
import type { WriteFn } from "../lib/journal.js";
import { TwitchPredictions } from "../twitch/predictions.js";

const out = process.argv[2] ?? "live-run.json";
const here = path.dirname(fileURLToPath(import.meta.url));
const examples = ["case-1-pizza.json", "case-2-roast.json", "case-3-petty.json"].map((f) =>
  JSON.parse(readFileSync(path.resolve(here, "../../../examples", f), "utf8")),
);

const runDir = path.resolve(here, `../../data/live-${Date.now()}`);
process.env.VERDICT_MODE = "live";
process.env.MODERATION_ACK_LOCAL_ONLY = "true";
process.env.VERDICT_OUTBOX_PATH = path.join(runDir, "outbox.jsonl");
process.env.VERDICT_INBOX_PATH = path.join(runDir, "inbox.jsonl");
process.env.VERDICT_STATE_PATH = path.join(runDir, "state.jsonl");
process.env.VERDICT_CREDITS_PATH = path.join(runDir, "credits.jsonl");
process.env.GENLAYER_POLL_INTERVAL_MS ??= "3000";
process.env.GENLAYER_FINALITY_TIMEOUT_MS ??= "2400000";
process.env.API_KEYS = "live-run-key";
process.env.FREE_APPEALS_PER_DAY = "10";
mkdirSync(runDir, { recursive: true });
const cfg = loadConfig();

interface TxRecord {
  fn: WriteFn | "finalize" | "revoke(raw)";
  hash: string;
  sentAt: string;
  transitions: Array<{ at: string; tSec: number; chainStatus: string; finality: string; execution: string }>;
  final?: Record<string, unknown>;
}
const txs = new Map<string, TxRecord>();
const t0 = Date.now();
const iso = () => new Date().toISOString();

class Instrumented extends JudgeRouterClient {
  override async broadcast(fn: WriteFn, args: Array<string | number>): Promise<string> {
    const hash = await super.broadcast(fn, args);
    txs.set(hash, { fn, hash, sentAt: iso(), transitions: [] });
    console.log(`  -> ${fn} ${hash}`);
    return hash;
  }
  override async getTransaction(hash: string): Promise<TxLike | null> {
    const tx = await super.getTransaction(hash);
    note(hash, tx);
    return tx;
  }
}

function note(hash: string, tx: TxLike | null): void {
  const rec = txs.get(hash);
  if (!rec) return;
  const c = classifyTx(tx);
  const last = rec.transitions.at(-1);
  if (!last || last.chainStatus !== c.chainStatus || last.execution !== c.execution) {
    const sent = Date.parse(rec.sentAt);
    rec.transitions.push({ at: iso(), tSec: Math.round((Date.now() - sent) / 100) / 10, ...c });
  }
}

const chain = new Instrumented(cfg);
const raw = createClient({ chain: cfg.network === "testnetBradbury" ? testnetBradbury : studionet, account: createAccount(cfg.relayerPrivateKey), ...(cfg.rpcUrl ? { endpoint: cfg.rpcUrl } : {}) });
const app = buildApp({ cfg, chain, twitch: new TwitchPredictions({ ...cfg.twitch, clientId: "", broadcasterId: "", userAccessToken: "" }) });
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const KEY = { "x-api-key": "live-run-key" };
async function call(method: string, p: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(base + p, { method, headers: { "content-type": "application/json", ...KEY, ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, json: (await r.json()) as Record<string, any> };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFinal(id: number, tier: number, label: string) {
  const start = Date.now();
  for (;;) {
    await app.idle();
    const g = await call("GET", `/cases/${id}`);
    if (g.status === 200 && g.json.verdict_final && g.json.case.tier === tier && g.json.case.confirmed_tier >= tier) {
      console.log(`  ${label}: FINAL tier ${tier} winner=${g.json.case.winner_index} split=${g.json.case.split} (${Math.round((Date.now() - start) / 1000)}s)`);
      return g.json;
    }
    if (g.json.finality && ["FINALIZED_ERROR", "STALE"].includes(g.json.finality)) throw new Error(`${label}: ${g.json.finality}`);
    if (Date.now() - start > 45 * 60_000) throw new Error(`${label}: gave up waiting`);
    await sleep(5000);
  }
}
async function rawWrite(fn: string, args: Array<string | number>): Promise<TxRecord> {
  const hash = (await raw.writeContract({ address: cfg.contractAddress, functionName: fn, args, value: 0n })) as string;
  const rec: TxRecord = { fn: fn as TxRecord["fn"], hash, sentAt: iso(), transitions: [] };
  txs.set(hash, rec);
  console.log(`  -> ${fn} (raw) ${hash}`);
  for (let i = 0; i < 900; i++) {
    const tx = await raw.getTransaction({ hash: hash as TransactionHash });
    note(hash, tx);
    const f = classifyTx(tx).finality;
    if (f === "FINALIZED_SUCCESS" || f === "FINALIZED_ERROR") break;
    await sleep(3000);
  }
  return rec;
}

const report: Record<string, unknown> = { network: cfg.network, contract: cfg.contractAddress, relayer: chain.relayerAddress, startedAt: iso(), pin: await app.pipeline.pin(), cases: [] as unknown[] };
console.log(`pin: ${JSON.stringify(report.pin)}`);
const cases = report.cases as Array<Record<string, unknown>>;
try {
  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    const entry: Record<string, unknown> = { example: ex.title, steps: [] as unknown[] };
    cases.push(entry);
    const steps = entry.steps as unknown[];
    console.log(`\nCase ${i + 1}: ${ex.title}`);
    const o = await call("POST", "/cases", ex.relayer);
    steps.push({ step: "POST /cases", status: o.status, body: { ...o.json, side_tokens: undefined } });
    if (o.status !== 201) throw new Error(`open failed: ${JSON.stringify(o.json)}`);
    const id = o.json.id as number;
    entry.caseId = id;
    entry.receiptNumber = o.json.package_digest;
    const [t0k, t1k] = o.json.side_tokens as string[];
    const j = await call("POST", `/cases/${id}/judge`, undefined, { "x-side-token": t0k! });
    steps.push({ step: "POST judge", status: j.status, body: j.json });
    if (j.status !== 202) throw new Error(`judge failed: ${JSON.stringify(j.json)}`);
    let g = await waitFinal(id, 1, "Tier 1");
    steps.push({ step: "Tier 1 final", verdict: g.card?.verdict, provenance_label: g.card?.provenance_label });
    const loser = () => (g.case.winner_index === 0 ? t1k! : t0k!);
    const winner = () => (g.case.winner_index === 0 ? t0k! : t1k!);
    if (i === 0 || i === 1) {
      const a = await call("POST", `/cases/${id}/appeal`, undefined, { "x-side-token": loser() });
      steps.push({ step: "appeal -> Tier 2", status: a.status, body: a.json });
      if (a.status !== 202) throw new Error(`appeal failed: ${JSON.stringify(a.json)}`);
      g = await waitFinal(id, 2, "Tier 2");
      steps.push({ step: "Tier 2 final", verdict: g.card?.verdict });
    }
    if (i === 0) {
      const a = await call("POST", `/cases/${id}/appeal`, undefined, { "x-side-token": loser() });
      steps.push({ step: "appeal -> Supreme Court", status: a.status, body: a.json });
      if (a.status !== 202) throw new Error(`appeal 2 failed: ${JSON.stringify(a.json)}`);
      g = await waitFinal(id, 3, "Tier 3");
      steps.push({ step: "Supreme Court final", verdict: g.card?.verdict, status: g.case.status });
    }
    if (i === 1) {
      const f = await rawWrite("finalize", [id, entry.receiptNumber as string]);
      steps.push({ step: "finalize (operator)", tx: f.hash, transitions: f.transitions });
      steps.push({ step: "status after finalize", status: (await chain.getCase(id)).status });
    }
    if (i === 2) {
      const rv = await call("POST", `/cases/${id}/revoke`, undefined, { "x-side-token": winner() });
      steps.push({ step: "winner revoke via relayer (must be 409)", status: rv.status, body: rv.json });
      const rr = await rawWrite("revoke", [id, entry.receiptNumber as string, 0]);
      steps.push({ step: "raw on-chain revoke after confirm_verdict (must revert)", tx: rr.hash, transitions: rr.transitions });
      const td = await call("POST", `/cases/${id}/takedown`, undefined, { "x-side-token": winner() });
      steps.push({ step: "takedown (off-chain)", status: td.status, body: td.json, getAfter: (await call("GET", `/cases/${id}`)).status });
    }
  }
} catch (e) {
  report.error = (e as Error).message;
  console.error(`ERROR: ${(e as Error).message}`);
} finally {
  await app.idle();
  for (const rec of txs.values()) {
    try {
      const tx = (await raw.getTransaction({ hash: rec.hash as TransactionHash })) as unknown as Record<string, any>;
      note(rec.hash, tx);
      rec.final = {
        statusName: tx.statusName,
        result_name: tx.result_name,
        execution: tx.consensus_data?.leader_receipt?.[0]?.execution_result,
        votes: tx.consensus_data?.votes,
        num_of_initial_validators: tx.num_of_initial_validators,
        num_of_rounds: tx.num_of_rounds,
        rotation_count: tx.rotation_count,
        appealed: tx.appealed,
        gaslimit: toPlain(tx.gaslimit),
        value: toPlain(tx.value),
        created_at: tx.created_at,
        error: tx.consensus_data?.leader_receipt?.[0]?.genvm_result?.stderr?.slice?.(0, 300) ?? undefined,
      };
    } catch (e) {
      rec.final = { error: (e as Error).message };
    }
  }
  report.transactions = [...txs.values()];
  try {
    report.inbox = readFileSync(cfg.inboxPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    report.inbox = []; // justified: no inbox file means nothing was imported
  }
  report.finishedAt = iso();
  report.elapsedSec = Math.round((Date.now() - t0) / 1000);
  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nwrote ${out} (${report.elapsedSec}s)`);
  server.close();
}
