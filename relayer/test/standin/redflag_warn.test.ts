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
const FLAGS = ["urgency", "link_pressure", "upfront_payment"];
/** One stub for both calls: the Red Flag jury (scam + FLAGS) and the pattern summariser. */
const llm = (reply: () => string, label = "scam") =>
  new StubProvider((prompt, j) => (prompt.includes("Red Flag Court") ? JSON.stringify({ label, flags: FLAGS, reason: `line ${j + 1}` }) : reply()));
const summaryPrompts = (p: StubProvider) => p.prompts.filter((x) => x.includes("public list of scam techniques"));
const ok = () => JSON.stringify({ category: "delivery", summary: SUMMARY });
const RF = (message = TEXT) => ({ message, disclosure: { adult_confirmed: true }, redaction: { user_approved: true } });
/** A real ruling from POST /redflag: its signed warn_ticket and the redacted text it was made on. */
async function ruled(h: Harness, message = TEXT) {
  const r = await h.post("/redflag", RF(message), KEY);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return { ticket: r.json.warn_ticket as string, text: r.json.redacted_text as string, ruling: r.json.ruling as string };
}
let n = 0;
/** A fresh ruling + warn body (each message differs, so each gets its own ticket). */
async function warnBody(h: Harness, over: Record<string, unknown> = {}) {
  const t = await ruled(h, `${TEXT} ${"!".repeat(++n % 50)}`);
  return { optIn: true, ticket: t.ticket, text: t.text, ...over };
}

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
    const w = await warnBody(h);
    for (const optIn of [undefined, "true", 1, false]) {
      const r = await h.post("/redflag/warn", { ...w, optIn }, KEY);
      assert.equal(r.status, 422, String(optIn));
      assert.equal(r.json.code, "opt_in_required");
    }
    assert.equal((await h.post("/redflag/warn", { ...w, text: "" }, KEY)).status, 400);
    assert.equal((await h.post("/redflag/warn", { ...w, text: "x".repeat(1001) }, KEY)).status, 400);
    assert.equal((await h.post("/redflag/warn", { ...w, ruling: "MAYBE" }, KEY)).status, 400);
    assert.equal((await h.post("/redflag/warn", { ...w, flags: "urgency" }, KEY)).status, 400);
    assert.equal(summaryPrompts(p).length, 0, "no LLM call before every gate passes");
  });
});

test("warn: SHADOW by default: 202 with the would-be record, 'Test run · Not public yet', no ledger write, no message text", async () => {
  const ledger = new Ledger();
  const p = llm(ok);
  await withH({ judgeProvider: p, patternChain: ledger }, async (h) => {
    const r = await h.post("/redflag/warn", await warnBody(h), KEY);
    assert.equal(r.status, 202, JSON.stringify(r.json));
    assert.equal(r.json.status, "shadow");
    assert.equal(r.json.label, "Test run · Not public yet");
    assert.equal(r.json.would_submit.category, "delivery");
    assert.deepEqual([...r.json.would_submit.flag_codes].sort(), ["link_pressure", "upfront_payment", "urgency"]);
    assert.ok(!JSON.stringify(r.json).includes("PARCEL NOTICE"), "the message never comes back");
    assert.equal(ledger.calls.length, 0);
    assert.equal(summaryPrompts(p).length, 1);
    assert.ok(summaryPrompts(p)[0]!.includes("[link"), "the summariser sees only the redacted text");
  });
});

test("warn: LIVE submits one abstract record (codes, category, summary, random key); a ledger error is 502", async () => {
  const ledger = new Ledger();
  await withH({ judgeProvider: llm(ok), patternChain: ledger, patternConfig: { mode: "live", address: `0x${"8a".repeat(20)}`, dailyCap: 5 } }, async (h) => {
    const r = await h.post("/redflag/warn", await warnBody(h), KEY);
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
    const bad = await h.post("/redflag/warn", await warnBody(h), {}); // another user: this pattern is new to them
    assert.equal(bad.status, 502);
    assert.equal(bad.json.status, "submit_failed");
  });
});

test("warn: a summary that leaks a number or link is rejected locally (422); a broken LLM answer is 502 and refunded", async () => {
  let reply = () => JSON.stringify({ category: "delivery", summary: "Pay the fee at fastship-help.xyz to get your parcel back." });
  await withH({ judgeProvider: llm(() => reply()), patternConfig: { mode: "shadow", address: null, dailyCap: 1 } }, async (h) => {
    const leak = await h.post("/redflag/warn", await warnBody(h), KEY);
    assert.equal(leak.status, 422);
    assert.equal(leak.json.status, "rejected_locally");
    // the leak used today's one warning; next day (LA) it is back
    h.clock.now = new Date("2026-11-01T07:00:00Z");
    reply = () => "not json at all";
    const wb = await warnBody(h);
    const broken = await h.post("/redflag/warn", wb, KEY);
    assert.equal(broken.status, 502);
    assert.equal(broken.json.status, "summary_failed");
    reply = ok;
    assert.equal((await h.post("/redflag/warn", wb, KEY)).status, 202, "a failed summary uses up neither the allowance nor the ticket");
  });
});

const CATS = ["delivery", "account-lock", "romance", "job", "prize", "investment", "impersonation", "other"];
test("warn: 5 per user per Los Angeles day, then 429 (resets at LA midnight, not UTC)", async () => {
  let c = 0;
  await withH({ judgeProvider: llm(() => JSON.stringify({ category: CATS[c++ % CATS.length], summary: SUMMARY })) }, async (h) => {
    for (let i = 0; i < 5; i++) assert.equal((await h.post("/redflag/warn", await warnBody(h), KEY)).status, 202, `warn ${i + 1}`);
    const over = await h.post("/redflag/warn", await warnBody(h), KEY);
    assert.equal(over.status, 429);
    assert.equal(over.json.code, "pattern_cap");
    h.clock.now = new Date("2026-11-01T01:00:00Z"); // new UTC day, same LA day
    assert.equal((await h.post("/redflag/warn", await warnBody(h), KEY)).status, 429);
    h.clock.now = new Date("2026-11-01T07:00:00Z");
    assert.equal((await h.post("/redflag/warn", await warnBody(h), KEY)).status, 202);
  });
});

test("warn (AUDIT-2 P1-4): ruling and flags come only from the server-signed ticket; forged, edited, reused, expired or text-swapped tickets are 422", async () => {
  const ledger = new Ledger();
  const p = llm(ok);
  await withH({ judgeProvider: p, patternChain: ledger, patternConfig: { mode: "live", address: `0x${"8a".repeat(20)}`, dailyCap: 50 } }, async (h) => {
    // no ticket at all: the PoC body (client ruling + flags, text that never went through /redflag)
    const poc = await h.post("/redflag/warn", { optIn: true, ruling: "SCAM", flags: FLAGS, text: "never ruled on" }, KEY);
    assert.equal(poc.status, 422);
    assert.equal(poc.json.code, "ruling_ticket_required");
    const t = await ruled(h);
    assert.equal(t.ruling, "SCAM");
    assert.match(t.ticket, /^[0-9a-f]+\.[0-9a-f]{64}$/);
    // a forged ruling or flags not in the ticket
    const forged = await h.post("/redflag/warn", { optIn: true, ticket: t.ticket, text: t.text, ruling: "SUS" }, KEY);
    assert.equal(forged.json.code, "ruling_mismatch");
    const extra = await h.post("/redflag/warn", { optIn: true, ticket: t.ticket, text: t.text, flags: ["urgency", "crypto_only"] }, KEY);
    assert.equal(extra.status, 422);
    assert.equal(extra.json.code, "flags_mismatch");
    // an edited payload (claims different flags) no longer verifies
    const [payload, mac] = t.ticket.split(".") as [string, string];
    const edited = JSON.parse(Buffer.from(payload, "hex").toString("utf8"));
    edited.f = ["crypto_only"];
    const forgedTicket = `${Buffer.from(JSON.stringify(edited)).toString("hex")}.${mac}`;
    assert.equal((await h.post("/redflag/warn", { optIn: true, ticket: forgedTicket, text: t.text }, KEY)).json.code, "ruling_ticket_invalid");
    // the ticket is bound to the text the jury ruled on
    assert.equal((await h.post("/redflag/warn", { optIn: true, ticket: t.ticket, text: "some other scam text" }, KEY)).json.code, "ruling_ticket_text_mismatch");
    assert.equal(summaryPrompts(p).length, 0, "nothing above reached the summariser");
    // the genuine use works once, with the server's flags
    const good = await h.post("/redflag/warn", { optIn: true, ticket: t.ticket, text: t.text, ruling: "SCAM", flags: ["urgency"] }, KEY);
    assert.equal(good.status, 202, JSON.stringify(good.json));
    assert.deepEqual([...ledger.calls[0]!.flagCodes].sort(), [...FLAGS].sort(), "codes from the ticket, not the client's subset");
    const reuse = await h.post("/redflag/warn", { optIn: true, ticket: t.ticket, text: t.text }, KEY);
    assert.equal(reuse.json.code, "ruling_ticket_used");
    // expiry: 15 minutes
    const late = await ruled(h, `${TEXT} late`);
    h.clock.now = new Date(h.clock.now.getTime() + 15 * 60 * 1000 + 1);
    assert.equal((await h.post("/redflag/warn", { optIn: true, ticket: late.ticket, text: late.text }, KEY)).json.code, "ruling_ticket_expired");
    assert.equal(ledger.calls.length, 1);
  });
});

test("warn: LOOKS LEGIT carries no ticket, so it can never be warned about", async () => {
  await withH({ judgeProvider: llm(ok, "legit") }, async (h) => {
    const r = await h.post("/redflag", RF("See you at practice tomorrow, bring the team jerseys."), KEY);
    assert.equal(r.json.ruling, "LOOKS LEGIT");
    assert.equal(r.json.warn_ticket, undefined);
  });
});

test("warn (V-PL-14): one sighting per user per pattern per 30 days; another user or another pattern still counts; keys expire", async () => {
  let cat = "delivery";
  await withH({ judgeProvider: llm(() => JSON.stringify({ category: cat, summary: SUMMARY })) }, async (h) => {
    assert.equal((await h.post("/redflag/warn", await warnBody(h), KEY)).status, 202);
    h.clock.now = new Date("2026-11-02T12:00:00Z"); // a new day: the daily cap is not what stops it
    const dup = await h.post("/redflag/warn", await warnBody(h), KEY);
    assert.equal(dup.status, 422);
    assert.equal(dup.json.code, "pattern_duplicate_user");
    assert.equal((await h.post("/redflag/warn", await warnBody(h), {})).status, 202, "another user (keyless, by IP) counts");
    cat = "job";
    assert.equal((await h.post("/redflag/warn", await warnBody(h), KEY)).status, 202, "another pattern counts");
    cat = "delivery";
    h.clock.now = new Date("2026-12-01T12:00:01Z"); // 30 days after the first sighting
    assert.equal((await h.post("/redflag/warn", await warnBody(h), KEY)).status, 202, "the window ended");
  });
});

test("warn: no judge provider -> 503; digest without a ledger reader -> 503", async () => {
  await withH({}, async (h) => {
    assert.equal((await h.post("/redflag/warn", { optIn: true, ticket: "x", text: TEXT }, KEY)).status, 503);
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
    assert.equal(r.json.proof_line, null, "SHADOW: never 'Recorded on GenLayer' (AUDIT-2 P2-2)");
    assert.equal(r.json.label, "Test run · Not public yet");
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

test("digest (AUDIT-2 P2-2): 'Recorded on GenLayer' only in live mode on a ledger read that succeeded", async () => {
  const reader = { async topPatternsSince() { return [{ id: 1, category: "delivery", summary: SUMMARY, sightings: 3 }]; } };
  await withH({ patternReader: reader, patternConfig: { mode: "live", address: `0x${"8a".repeat(20)}`, dailyCap: 5 } }, async (h) => {
    const r = await h.get("/redflag/digest");
    assert.equal(r.status, 200);
    assert.equal(r.json.proof_line, "Recorded on GenLayer");
    assert.equal(r.json.label, undefined);
  });
  const broken = { async topPatternsSince(): Promise<unknown> { throw new Error("rpc down"); } };
  await withH({ patternReader: broken, patternConfig: { mode: "live", address: `0x${"8a".repeat(20)}`, dailyCap: 5 } }, async (h) => {
    const r = await h.get("/redflag/digest");
    assert.equal(r.status, 502);
    assert.ok(!JSON.stringify(r.json).includes("Recorded on GenLayer"));
  });
});

class TrackedLedger extends Ledger {
  /** One status script per submitted tx, consumed in order. */
  scripts: Array<{ statusName: string; txExecutionResultName?: string } | null> = [];
  private byHash = new Map<string, { statusName: string; txExecutionResultName?: string } | null>();
  private n = 0;
  readonly ids = new Map<string, number>();
  override async submitPattern(a: PatternSubmitArgs): Promise<string> {
    await super.submitPattern(a);
    const hash = "0x" + (++this.n).toString(16).padStart(64, "0");
    this.byHash.set(hash, this.scripts.shift() ?? { statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" });
    this.ids.set(a.requestKey, 7);
    return hash;
  }
  async getTransaction(hash: string) {
    return this.byHash.get(hash) ?? null;
  }
  async getByRequestKey(rk: string) {
    return { pattern_id: this.ids.get(rk) ?? 0, outcome: "new" };
  }
}

test("ledger (ADR-024 item 5): each submission is tracked to finality; the Proof tab gets the tx hash per pattern; the digest shows it in LIVE only", async () => {
  const ledger = new TrackedLedger();
  const reader = { async topPatternsSince() { return [{ id: 7, category: "delivery", summary: SUMMARY, sightings: 1 }, { id: 8, category: "job", summary: SUMMARY, sightings: 1 }]; } };
  let cat = "delivery";
  await withH({ judgeProvider: llm(() => JSON.stringify({ category: cat, summary: SUMMARY })), patternChain: ledger, patternReader: reader, patternConfig: { mode: "live", address: `0x${"8a".repeat(20)}`, dailyCap: 2 } }, async (h) => {
    const w = await h.post("/redflag/warn", await warnBody(h), KEY);
    assert.equal(w.status, 202, JSON.stringify(w.json));
    assert.equal(w.json.finality, "PENDING", "submitted is not recorded");
    await h.app.idle();
    const rc = await h.get(w.json.receipt_path);
    assert.equal(rc.json.finality, "FINALIZED_SUCCESS");
    assert.equal(rc.json.pattern_id, 7);
    assert.equal(rc.json.recorded, true);
    const proof = await h.get("/redflag/proof/7");
    assert.deepEqual(proof.json.txs, [w.json.tx]);
    assert.equal(proof.json.proof_line, "Recorded on GenLayer");
    assert.deepEqual((await h.get("/redflag/proof/8")).json.txs, [], "no finalized write, no receipt");
    const d = await h.get("/redflag/digest");
    assert.deepEqual(d.json.patterns[0].proof, { label: "Recorded on GenLayer", txs: [w.json.tx] });
    assert.equal(d.json.patterns[1].proof, undefined);
    // a no-consensus result gives back the allowance and the sighting (ADR-020 item 11)
    ledger.scripts.push({ statusName: "UNDETERMINED" });
    cat = "job";
    const nc = await h.post("/redflag/warn", await warnBody(h), KEY);
    assert.equal(nc.status, 202);
    await h.app.idle();
    assert.equal((await h.get(nc.json.receipt_path)).json.finality, "FINALIZED_ERROR");
    assert.equal((await h.get(nc.json.receipt_path)).json.recorded, false);
    // a submission still pending is never shown as proof (only FINALIZED_SUCCESS counts)
    ledger.scripts.push({ statusName: "PENDING" });
    const again = await h.post("/redflag/warn", await warnBody(h), KEY);
    assert.equal(again.status, 202, `cap of 2 and the same pattern: both were given back (${JSON.stringify(again.json)})`);
    assert.deepEqual((await h.get("/redflag/proof/7")).json.txs, [w.json.tx], "a pending tx is not proof");
    assert.equal((await h.get(again.json.receipt_path)).json.recorded, false);
    await h.app.idle();
    assert.deepEqual((await h.get("/redflag/proof/7")).json.txs, [w.json.tx], "nor once it went STALE");
  });
});

test("V-PL-14: the sighting window is durable (survives a restart) and holds only HMAC keys", async () => {
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const dir = mkdtempSync(path.join(tmpdir(), "verdict-sight-"));
  await withH({ dir, judgeProvider: llm(ok) }, async (h) => {
    assert.equal((await h.post("/redflag/warn", await warnBody(h), KEY)).status, 202);
  });
  const raw = readFileSync(path.join(dir, "pattern-sightings.jsonl"), "utf8");
  assert.ok(!raw.includes(KEY["x-api-key"]) && !raw.includes("delivery") && !raw.includes("127.0.0.1"), "no raw user or pattern in the store");
  await withH({ dir, judgeProvider: llm(ok) }, async (h) => {
    h.clock.now = new Date("2026-11-05T12:00:00Z");
    const dup = await h.post("/redflag/warn", await warnBody(h), KEY);
    assert.equal(dup.json.code, "pattern_duplicate_user", "the restart did not forget the window");
  });
});
