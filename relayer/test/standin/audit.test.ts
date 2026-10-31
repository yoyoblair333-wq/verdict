// TIER: stand-in. Tests added for the independent engineering audit
// (AUDIT-ENGINEERING.md, 2026-10-31): P1-1, P1-3 and P2-2. Each fails if its fix is removed.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { relayerKey } from "../../src/config.js";
import { JudgeRouterClient } from "../../src/lib/genlayer.js";
import { deliverWebhook } from "../../src/lib/webhook.js";
import { baseConfig, caseBody, harness, KEY, tok } from "./harness.js";

const REPO = new URL("../../../../", import.meta.url);

// ------------------------------------------------------------------ P1-1
test("audit P1-1: shadow mode replaces an unset or all-zero key; live mode refuses it", () => {
  const zero = `0x${"0".repeat(64)}`;
  for (const raw of [undefined, "", zero]) {
    const k = relayerKey("shadow", raw);
    assert.match(k, /^0x[0-9a-f]{64}$/);
    assert.notEqual(k, zero);
  }
  assert.throws(() => relayerKey("live", zero), /all-zero placeholder/);
  assert.throws(() => relayerKey("live", undefined), /0x \+ 64 hex/);
  const real = `0x${"ab".repeat(32)}`;
  assert.equal(relayerKey("live", real), real);
  assert.equal(relayerKey("shadow", real), real);
});

function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]!] = m[2]!;
  }
  return env;
}

test("audit P1-1: the relayer boots from .env.example as shipped (shadow) and answers /healthz", async () => {
  const env = parseEnv(readFileSync(new URL("relayer/.env.example", REPO), "utf8"));
  assert.match(env.JUDGE_ROUTER_ADDRESS ?? "", /^0x[0-9a-fA-F]{40}$/, ".env.example must carry the deployed address");
  assert.notEqual(env.JUDGE_ROUTER_ADDRESS, `0x${"0".repeat(40)}`);
  assert.match(env.EXPECTED_CONTRACT_CODE_DIGEST ?? "", /^[0-9a-f]{64}$/, ".env.example must carry the pinned digest");
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [new URL("../../src/index.js", import.meta.url).pathname], {
    // offline: an unreachable RPC so the pin check fails fast; shadow mode still starts
    env: { PATH: process.env.PATH ?? "", ...env, PORT: String(port), GENLAYER_RPC_URL: "http://127.0.0.1:9", VERDICT_STATE_PATH: "", VERDICT_OUTBOX_PATH: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  try {
    let ok = false;
    for (let i = 0; i < 100 && !ok; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (child.exitCode !== null) break;
      try {
        const r = await fetch(`http://127.0.0.1:${port}/healthz`);
        const j = (await r.json()) as { ok: boolean; mode: string };
        ok = r.status === 200 && j.ok === true && j.mode === "shadow";
      } catch {
        // not listening yet
      }
    }
    assert.ok(ok, `relayer did not come up from .env.example:\n${log}`);
    assert.ok(!/expected valid private key/.test(log), log);
  } finally {
    child.kill();
  }
});

// ------------------------------------------------------------------ P1-3
test("audit P1-3: an ACCEPTED (not final) verdict shows 'Network checking' with no winner; gallery waits for FINALIZED_SUCCESS", async () => {
  const h = await harness();
  try {
    h.chain.holdFinal = true;
    const o = await h.post("/cases", caseBody(), KEY);
    assert.equal(o.status, 201);
    const id = o.json.id as number;
    const j = await h.post(`/cases/${id}/judge`, {}, tok(o.json.side_tokens[0]));
    assert.equal(j.status, 202);
    const mid = await h.get(`/cases/${id}`);
    assert.equal(mid.status, 200);
    assert.equal(mid.json.case.status, "judged", "the chain has a provisional verdict");
    assert.equal(mid.json.verdict_final, false);
    assert.equal(mid.json.case.rail_step, "Network checking");
    for (const k of ["winner_index", "scores", "juror_votes", "split", "reason"]) assert.ok(!(k in mid.json.case), `${k} leaked before finality`);
    assert.equal(mid.json.card, null);
    assert.deepEqual((await h.get("/cases")).json.cases, [], "gallery shows nothing before FINALIZED_SUCCESS");
    h.chain.holdFinal = false;
    await h.app.idle();
    const fin = await h.get(`/cases/${id}`);
    assert.equal(fin.json.verdict_final, true);
    assert.equal(typeof fin.json.case.winner_index, "number");
    const g = (await h.get("/cases")).json.cases as Array<{ id: number; winner_index: number }>;
    assert.equal(g.length, 1);
    assert.equal(g[0]!.id, id);
  } finally {
    h.close();
  }
});

test("audit P1-3: cases opened straight on the contract (no relayer package) are never shown", async () => {
  const h = await harness();
  try {
    // a legacy / foreign case: no relayer meta, no package digest, a verdict with no consent behind it
    h.chain.cases.set(99, {
      id: 99, surface: "settle", rubric: "x", entries: ["a", "b"], status: "judged", tier: 1, jurors: 5, winner_index: 0, scores: [80, 20],
      juror_votes: [0, 0, 0, 0, 0], split: "5-0", reason: "r", package_digest: "", confirmed_tier: 1, provenance: [],
    } as never);
    assert.equal((await h.get("/cases/99")).status, 404);
    assert.deepEqual((await h.get("/cases")).json.cases, []);
  } finally {
    h.close();
  }
});

// ------------------------------------------------------------------ P2-2
test("audit P2-2: webhooks are signed HMAC-SHA256(secret, `${timestamp}.${rawBody}`)", async () => {
  let got: { headers: Record<string, string | string[] | undefined>; body: string } | null = null;
  const srv = createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      got = { headers: req.headers, body: b };
      res.end("ok");
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  try {
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/hook`;
    await deliverWebhook(url, { event: "case.judged", case_id: 7, data: { x: 1 } }, "whsec-test", 2000);
    assert.ok(got);
    const g = got as { headers: Record<string, string>; body: string };
    const ts = g.headers["x-verdict-timestamp"]!;
    assert.match(ts, /^\d+$/);
    assert.equal(g.headers["x-verdict-signature"], createHmac("sha256", "whsec-test").update(`${ts}.${g.body}`).digest("hex"));
    assert.equal(g.headers["x-verdict-event"], "case.judged");
  } finally {
    srv.close();
  }
});

test("audit P2-2: every write sends value 0, and the contract has no payable method", async () => {
  const cfg = baseConfig("/tmp", { relayerPrivateKey: `0x${"11".repeat(32)}` as `0x${string}` });
  const client = new JudgeRouterClient(cfg);
  const seen: Array<Record<string, unknown>> = [];
  (client as unknown as { client: unknown }).client = {
    writeContract: async (p: Record<string, unknown>) => {
      seen.push(p);
      return "0xabc123";
    },
  };
  for (const fn of ["open_case_package", "judge", "appeal", "confirm_verdict", "revoke", "expire"] as const) await client.broadcast(fn, [1, "d"]);
  assert.equal(seen.length, 6);
  for (const p of seen) assert.equal(p.value, 0n);
  const py = readFileSync(new URL("contracts/judge_router.py", REPO), "utf8");
  assert.ok(!/payable/i.test(py), "the contract must not declare a payable method");
});

test("audit P2-2: request bodies over 16 kB are refused with 413 before any check or gas", async () => {
  const h = await harness();
  try {
    const big = caseBody({ pad: "x".repeat(17 * 1024) });
    const r = await h.post("/cases", big, KEY);
    assert.equal(r.status, 413);
    assert.equal(h.chain.broadcasts.length, 0);
    const ok = await h.post("/cases", caseBody({ pad: "x".repeat(15 * 1024) }), KEY);
    assert.notEqual(ok.status, 413);
  } finally {
    h.close();
  }
});
