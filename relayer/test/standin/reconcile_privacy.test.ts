// TIER: stand-in. Crash/timeout recovery and the no-PII-on-chain guard.

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { FileCredits } from "../../src/lib/credits.js";
import { CONSENT, KEY, SECRETS, caseBody, harness, tok } from "./harness.js";
import { FakeChain } from "./fakeChain.js";

test("durable credits by default: the relayer's own FileCredits survives a restart", async () => {
  const chain = new FakeChain();
  const a = await harness({ freeAppealsPerDay: 0 }, chain, { defaultCredits: true });
  const payer = `key:${SECRETS.apiKey}`;
  const o = await a.post("/cases", caseBody(), KEY);
  const [t0] = o.json.side_tokens as string[];
  await a.post(`/cases/${o.json.id}/judge`, {}, tok(t0!));
  await a.app.idle();
  assert.equal((await a.post("/credits/grant", { payer, cents: 700 }, { authorization: `Bearer ${a.cfg.adminToken}` })).status, 200);
  a.close();
  const b = await harness({ freeAppealsPerDay: 0 }, chain, { dir: a.dir, defaultCredits: true });
  try {
    const r = await b.post(`/cases/${o.json.id}/appeal`, {}, tok(t0!));
    assert.equal(r.status, 202, JSON.stringify(r.json));
    assert.equal(r.json.paid_with, "credit");
    assert.equal(r.json.credit_balance_cents, 501);
  } finally {
    b.close();
  }
});

test("durable state: side tokens, appeal state and credits survive a restart", async () => {
  const chain = new FakeChain();
  const a = await harness({}, chain);
  const payer = `key:${SECRETS.apiKey}`;
  const o = await a.post("/cases", caseBody(), KEY);
  const [t0] = o.json.side_tokens as string[];
  await a.post(`/cases/${o.json.id}/judge`, {}, tok(t0!));
  await a.app.idle();
  new FileCredits(a.cfg.creditsPath).grant(payer, 700);
  a.close();
  // New process, same data dir, same chain.
  const b = await harness({}, chain, { dir: a.dir, credits: new FileCredits(a.cfg.creditsPath) });
  try {
    assert.equal(b.credits.balance(payer), 700);
    const g = await b.get(`/cases/${o.json.id}`);
    assert.equal(g.json.verdict_final, true, "finality flags reloaded");
    const r = await b.post(`/cases/${o.json.id}/appeal`, {}, tok(t0!));
    assert.equal(r.status, 202, JSON.stringify(r.json));
    const files = readFileSync(b.cfg.creditsPath, "utf8") + readFileSync(b.cfg.statePath, "utf8");
    assert.ok(!files.includes(SECRETS.apiKey), "user ids are hashed");
    assert.ok(!files.includes(t0!), "only side-token hashes are stored");
  } finally {
    b.close();
  }
});

test("reconcile: open landed but the broadcast call timed out -> found by requestKey, never resubmitted", async () => {
  const h = await harness();
  try {
    h.chain.landThenThrow = true;
    const r = await h.post("/cases", caseBody(), KEY);
    assert.equal(r.status, 500);
    assert.equal(h.chain.broadcasts.length, 1);
    const report = await h.app.reconcile();
    assert.deepEqual(report.map((x) => x.action), ["reconciled"]);
    assert.equal(h.chain.broadcasts.length, 1, "no double submit");
    assert.equal(h.chain.cases.size, 1);
    assert.deepEqual(await h.app.reconcile(), [], "idempotent");
  } finally {
    h.close();
  }
});

test("reconcile: broadcast never reached the chain -> resubmitted once with the same bytes", async () => {
  const h = await harness();
  try {
    h.chain.failBroadcast = true;
    assert.equal((await h.post("/cases", caseBody(), KEY)).status, 500);
    assert.equal(h.chain.broadcasts.length, 0);
    const intent = h.outbox.records().find((x) => x.type === "intent");
    const report = await h.app.reconcile();
    assert.deepEqual(report.map((x) => x.action), ["resubmitted"]);
    assert.equal(h.chain.broadcasts.length, 1);
    assert.equal(intent?.type === "intent" && intent.args[0], h.chain.broadcasts[0]!.args[0], "byte-identical package");
  } finally {
    h.close();
  }
});

test("reconcile: past the submission deadline the op is abandoned, not resubmitted", async () => {
  const h = await harness();
  try {
    h.chain.failBroadcast = true;
    await h.post("/cases", caseBody(), KEY);
    h.clock.now = new Date("2026-10-31T13:00:00Z");
    assert.deepEqual((await h.app.reconcile()).map((x) => x.action), ["abandoned"]);
    assert.equal(h.chain.broadcasts.length, 0);
  } finally {
    h.close();
  }
});

test("reconcile: judge landed but call timed out -> case is judged on-chain, no second judge", async () => {
  const h = await harness();
  try {
    const o = await h.post("/cases", caseBody(), KEY);
    h.chain.landThenThrow = true;
    assert.equal((await h.post(`/cases/${o.json.id}/judge`, {}, tok(o.json.side_tokens[0]))).status, 500);
    const report = await h.app.reconcile();
    assert.ok(report.some((x) => x.opKey.endsWith(":judge") && x.action === "reconciled"));
    assert.equal(h.chain.broadcasts.filter((b) => b.fn === "judge").length, 1);
  } finally {
    h.close();
  }
});

test("reconcile: same requestKey on-chain with a different digest is a conflict", async () => {
  const h = await harness();
  try {
    h.chain.landThenThrow = true;
    await h.post("/cases", caseBody(), KEY);
    const id = [...h.chain.cases.keys()][0]!;
    h.chain.cases.get(id)!.package_digest = "e".repeat(64);
    assert.deepEqual((await h.app.reconcile()).map((x) => x.action), ["conflict"]);
  } finally {
    h.close();
  }
});

test("guard: no IPs, tokens, API keys or emails ever go on-chain or into the journals", async () => {
  const h = await harness({ trustProxy: true });
  try {
    const ip = "203.0.113.9";
    const headers = { ...KEY, "x-forwarded-for": ip };
    const o = await h.post("/cases", caseBody({ surface: "live", twitch: { title: "t" }, callback_url: "https://hooks.example.com/cb?sig=CALLBACK-SECRET" }), headers);
    assert.equal(o.status, 201);
    const tokens = o.json.side_tokens as string[];
    await h.post(`/cases/${o.json.id}/judge`, {}, { ...headers, "x-side-token": tokens[0]! });
    await h.app.idle();
    h.credits.grant(`key:${SECRETS.apiKey}`, 1000);
    await h.post(`/cases/${o.json.id}/appeal`, {}, { ...headers, "x-side-token": tokens[0]! });
    await h.post("/judge", { rubric: "whos_right", entries: ["a", "b"], disclosure: CONSENT }, headers);
    await h.app.idle();
    // An entry with an email is refused before it can reach the chain.
    assert.equal((await h.post("/cases", caseBody({ entries: ["write me: someone@example.org", "b"] }), headers)).status, 422);

    const onChain = JSON.stringify(h.chain.broadcasts.map((b) => b.args));
    const journals = readFileSync(h.cfg.outboxPath, "utf8") + readFileSync(h.cfg.inboxPath, "utf8");
    // The private state store may keep the callback URL (needed to deliver
    // webhooks after a restart) but nothing else on the list.
    const state = readFileSync(h.cfg.statePath, "utf8");
    for (const s of [SECRETS.apiKey, SECRETS.adminToken, SECRETS.webhookSecret, SECRETS.twitchToken, SECRETS.privateKey.slice(2), ip, ...tokens]) {
      assert.ok(!state.includes(s), `state store contains ${s}`);
    }
    assert.equal(statSync(h.cfg.statePath).mode & 0o077, 0, "state store is owner-only");
    const forbidden = [SECRETS.apiKey, SECRETS.adminToken, SECRETS.webhookSecret, SECRETS.twitchToken, SECRETS.privateKey.slice(2), ip, "127.0.0.1", "CALLBACK-SECRET", "hooks.example.com", ...tokens];
    for (const s of forbidden) {
      assert.ok(!onChain.includes(s), `on-chain args contain ${s}`);
      assert.ok(!journals.includes(s), `journals contain ${s}`);
    }
    assert.doesNotMatch(onChain, /[\w.+-]+@[\w-]+\.[\w.-]+/, "no email address on-chain");
    assert.ok(h.chain.broadcasts.length >= 4);
  } finally {
    h.close();
  }
});
