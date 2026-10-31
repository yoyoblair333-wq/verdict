// TIER: stand-in. The Scam Pattern Ledger routes on the real relayer app:
// POST /redflag/warn (opt-in pattern record) and GET /redflag/digest.
// Stub LLM + fake ledger port; no network.

import assert from "node:assert/strict";
import { test } from "node:test";
import { StubProvider } from "../../src/lib/jury.js";
import type { PatternChainPort, PatternSubmitArgs } from "../../src/lib/pattern.js";
import { harness, KEY, type Harness } from "./harness.js";

const SUMMARY = "A text claims a parcel is held and asks for a small redelivery fee through a link before it is returned.";
const TEXT = "PARCEL NOTICE from [name]: pay the fee at [link] within 12 hrs or your parcel is returned.";
const llm = (reply: () => string) => new StubProvider(() => reply());
const ok = () => JSON.stringify({ category: "delivery", summary: SUMMARY });
const warn = (over: Record<string, unknown> = {}) => ({ optIn: true, ruling: "SCAM", flags: ["urgency", "link_pressure", "upfront_payment"], text: TEXT, ...over });

class Ledger implements PatternChainPort {
  readonly calls: PatternSubmitArgs[] = [];
  fail = false;
  async submitPattern(a: PatternSubmitArgs): Promise<string> {
    if (this.fail) throw new Error("rpc down");
    this.calls.push(a);
    return "0x" + "cd".repeat(32);
  }
}

async function withH(extra: Parameters<typeof harness>[2], fn: (h: Harness) => Promise<void>) {
  const h = await harness({}, undefined, extra);
  try {
    await fn(h);
  } finally {
    h.close();
  }
}

test("warn: opt-in must be exactly true; bad bodies are 400; ineligible rulings are refused; nothing is sent", async () => {
  const p = llm(ok);
  await withH({ judgeProvider: p }, async (h) => {
    for (const optIn of [undefined, "true", 1, false]) {
      const r = await h.post("/redflag/warn", warn({ optIn }), KEY);
      assert.equal(r.status, 422, String(optIn));
      assert.equal(r.json.code, "opt_in_required");
    }
    assert.equal((await h.post("/redflag/warn", warn({ text: "" }), KEY)).status, 400);
    assert.equal((await h.post("/redflag/warn", warn({ text: "x".repeat(1001) }), KEY)).status, 400);
    assert.equal((await h.post("/redflag/warn", warn({ ruling: "MAYBE" }), KEY)).status, 400);
    assert.equal((await h.post("/redflag/warn", warn({ flags: "urgency" }), KEY)).status, 400);
    const legit = await h.post("/redflag/warn", warn({ ruling: "LOOKS LEGIT" }), KEY);
    assert.equal(legit.status, 422);
    assert.equal(legit.json.code, "pattern_not_eligible");
    const none = await h.post("/redflag/warn", warn({ flags: ["not_a_code"] }), KEY);
    assert.equal(none.json.code, "pattern_no_flags");
    assert.equal(p.prompts.length, 0, "no LLM call before every gate passes");
  });
});

test("warn: SHADOW by default: 202 with the would-be record, 'Test run · Not public yet', no ledger write, no message text", async () => {
  const ledger = new Ledger();
  const p = llm(ok);
  await withH({ judgeProvider: p, patternChain: ledger }, async (h) => {
    const r = await h.post("/redflag/warn", warn(), KEY);
    assert.equal(r.status, 202, JSON.stringify(r.json));
    assert.equal(r.json.status, "shadow");
    assert.equal(r.json.label, "Test run · Not public yet");
    assert.equal(r.json.would_submit.category, "delivery");
    assert.deepEqual([...r.json.would_submit.flag_codes].sort(), ["link_pressure", "upfront_payment", "urgency"]);
    assert.ok(!JSON.stringify(r.json).includes("PARCEL NOTICE"), "the message never comes back");
    assert.equal(ledger.calls.length, 0);
    assert.equal(p.prompts.length, 1);
    assert.ok(p.prompts[0]!.includes("[link]"), "the summariser sees only the redacted text");
  });
});

test("warn: LIVE submits one abstract record (codes, category, summary, random key); a ledger error is 502", async () => {
  const ledger = new Ledger();
  await withH({ judgeProvider: llm(ok), patternChain: ledger, patternConfig: { mode: "live", address: `0x${"8a".repeat(20)}`, dailyCap: 5 } }, async (h) => {
    const r = await h.post("/redflag/warn", warn(), KEY);
    assert.equal(r.status, 202, JSON.stringify(r.json));
    assert.equal(r.json.status, "submitted");
    assert.equal(r.json.tx, "0x" + "cd".repeat(32));
    assert.equal(ledger.calls.length, 1);
    const sent = ledger.calls[0]!;
    assert.deepEqual(Object.keys(sent).sort(), ["category", "flagCodes", "requestKey", "summary"]);
    assert.equal(sent.summary, SUMMARY);
    assert.match(sent.requestKey, /^[0-9a-f]{32}$/);
    assert.ok(!JSON.stringify(sent).includes(KEY["x-api-key"]), "no user identity on-chain");
    ledger.fail = true;
    const bad = await h.post("/redflag/warn", warn(), KEY);
    assert.equal(bad.status, 502);
    assert.equal(bad.json.status, "submit_failed");
  });
});

test("warn: a summary that leaks a number or link is rejected locally (422); a broken LLM answer is 502 and refunded", async () => {
  let reply = () => JSON.stringify({ category: "delivery", summary: "Pay the fee at fastship-help.xyz to get your parcel back." });
  await withH({ judgeProvider: llm(() => reply()), patternConfig: { mode: "shadow", address: null, dailyCap: 1 } }, async (h) => {
    const leak = await h.post("/redflag/warn", warn(), KEY);
    assert.equal(leak.status, 422);
    assert.equal(leak.json.status, "rejected_locally");
    // the leak used today's one warning; next day (LA) it is back
    h.clock.now = new Date("2026-11-01T07:00:00Z");
    reply = () => "not json at all";
    const broken = await h.post("/redflag/warn", warn(), KEY);
    assert.equal(broken.status, 502);
    assert.equal(broken.json.status, "summary_failed");
    reply = ok;
    assert.equal((await h.post("/redflag/warn", warn(), KEY)).status, 202, "a failed summary does not use up the allowance");
  });
});

test("warn: 5 per user per Los Angeles day, then 429 (resets at LA midnight, not UTC)", async () => {
  await withH({ judgeProvider: llm(ok) }, async (h) => {
    for (let i = 0; i < 5; i++) assert.equal((await h.post("/redflag/warn", warn(), KEY)).status, 202, `warn ${i + 1}`);
    const over = await h.post("/redflag/warn", warn(), KEY);
    assert.equal(over.status, 429);
    assert.equal(over.json.code, "pattern_cap");
    h.clock.now = new Date("2026-11-01T01:00:00Z"); // new UTC day, same LA day
    assert.equal((await h.post("/redflag/warn", warn(), KEY)).status, 429);
    h.clock.now = new Date("2026-11-01T07:00:00Z");
    assert.equal((await h.post("/redflag/warn", warn(), KEY)).status, 202);
  });
});

test("warn: no judge provider -> 503; digest without a ledger reader -> 503", async () => {
  await withH({}, async (h) => {
    assert.equal((await h.post("/redflag/warn", warn(), KEY)).status, 503);
    assert.equal((await h.get("/redflag/digest")).status, 503);
  });
});

test("digest: reads top patterns since N days ago (default 7) from the ledger; reader errors are 502", async () => {
  const seen: Array<[string, number]> = [];
  let fail = false;
  const reader = {
    async topPatternsSince(since: string, n: number) {
      if (fail) throw new Error("rpc down");
      seen.push([since, n]);
      return [{ id: 1, category: "delivery", summary: SUMMARY, sightings: 3 }];
    },
  };
  await withH({ patternReader: reader }, async (h) => {
    const r = await h.get("/redflag/digest");
    assert.equal(r.status, 200);
    assert.equal(r.json.title, "Scams going around");
    assert.equal(r.json.proof_line, "Recorded on GenLayer");
    assert.equal(r.json.patterns[0].sightings, 3);
    assert.deepEqual(seen[0], ["2026-10-24T12:00:00Z", 10]);
    await h.get("/redflag/digest?days=2&n=3");
    assert.deepEqual(seen[1], ["2026-10-29T12:00:00Z", 3]);
    await h.get("/redflag/digest?days=999&n=999");
    assert.deepEqual(seen[2], ["2026-10-01T12:00:00Z", 20], "clamped to 30 days and 20 patterns");
    fail = true;
    assert.equal((await h.get("/redflag/digest")).status, 502);
  });
});
