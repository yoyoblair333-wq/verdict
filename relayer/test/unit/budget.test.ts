// TIER: unit. ADR-022 publish budget + queue, the budget ceiling, fee measurement.

import assert from "node:assert/strict";
import { test } from "node:test";
import { publishBudget } from "../../src/config.js";
import { measuredFee, opOf } from "../../src/lib/fees.js";
import { laMonth, PublishBudget, PUBLISH_BUDGET_CEILING_CENTS, PUBLISH_BUDGET_DEFAULT_CENTS, QUEUED_MESSAGE, type BudgetSnapshot } from "../../src/lib/publishBudget.js";
import { nextLaMidnight } from "../../src/lib/rateLimit.js";

test("budget config: default $500, hard ceiling $1,000; above the ceiling refuses to start", () => {
  assert.equal(PUBLISH_BUDGET_DEFAULT_CENTS, 50_000);
  assert.equal(PUBLISH_BUDGET_CEILING_CENTS, 100_000);
  assert.equal(publishBudget(100_000), 100_000);
  assert.equal(publishBudget(0), 0);
  assert.throws(() => publishBudget(100_001), /hard ceiling/);
  assert.throws(() => publishBudget(-1), /non-negative/);
  assert.equal(QUEUED_MESSAGE, "You're in line to be checked by the network. Your preview stays private until then.");
});

const entry = (quickId: string) => ({ quickId, side: 1, account: "acct", queuedAt: "2026-10-31T12:00:00Z" });

test("budget: reserves per publish, FIFO queue, no queue-jumping, rolls over each LA month, persists", () => {
  const clock = { now: new Date("2026-10-31T12:00:00Z") };
  let saved: BudgetSnapshot | undefined;
  const mk = () => new PublishBudget({ capCents: 200, estimateCents: 90, clock: () => clock.now, load: () => saved, save: (s) => (saved = s) });
  const b = mk();
  assert.equal(b.tryReserve(), true);
  assert.equal(b.tryReserve(), true);
  assert.equal(b.tryReserve(), false, "180 spent: a third 90 would pass 200");
  assert.equal(b.enqueue(entry("a")), 1);
  assert.equal(b.enqueue(entry("b")), 2);
  assert.equal(b.enqueue(entry("a")), 1, "idempotent");
  b.release(); // a technical refund frees 90...
  assert.equal(b.tryReserve(), false, "...but a newcomer never jumps the queue");
  const head = b.takeNext();
  assert.equal(head?.quickId, "a", "first in, first out");
  assert.equal(b.takeNext(), undefined, "budget spent again");
  assert.equal(b.position("b"), 1);
  // restart: the queue and spend survive
  const b2 = mk();
  assert.equal(b2.position("b"), 1);
  assert.equal(b2.status().spent_cents, 180);
  // 2026-11-01T06:59Z is still October in LA; 07:00Z is November
  clock.now = new Date("2026-11-01T06:59:00Z");
  assert.equal(b2.takeNext(), undefined);
  clock.now = new Date("2026-11-01T07:00:00Z");
  assert.equal(b2.status().spent_cents, 0, "a new LA month resets the spend");
  assert.equal(b2.takeNext()?.quickId, "b", "the queue rolled over");
  assert.equal(b2.status().queued, 0);
  assert.equal(b2.cancel("zzz"), undefined);
  b2.enqueue(entry("c"));
  assert.equal(b2.cancel("c")?.quickId, "c");
  assert.equal(b2.position("c"), 0);
  assert.equal(laMonth(new Date("2026-12-01T07:59:00Z")), "2026-11");
});

test("budget: a cap of 0 means every free publish waits (nothing is spent)", () => {
  const b = new PublishBudget({ capCents: 0, estimateCents: 90, clock: () => new Date() });
  assert.equal(b.tryReserve(), false);
});

test("fees: measured from an explicit fee field or gasUsed x gasPrice, else 'unavailable'; op from the op key", () => {
  assert.deepEqual(measuredFee({ fee: "1000" }), { fee: "1000", source: "fee" });
  assert.deepEqual(measuredFee({ gasUsed: 21000, gasPrice: "0x2" }), { fee: "42000", source: "gasUsed*gasPrice" });
  assert.deepEqual(measuredFee({ consensus_data: { leader_receipt: [{ fee: 7 }] } }), { fee: "7", source: "leader_receipt.fee" });
  assert.deepEqual(measuredFee({ statusName: "FINALIZED" }), { fee: null, source: "unavailable" });
  assert.deepEqual(measuredFee({ fee: -5 }), { fee: null, source: "unavailable" });
  assert.deepEqual(measuredFee(null), { fee: null, source: "unavailable" });
  assert.equal(opOf("abc:open"), "open");
  assert.equal(opOf("abc:appeal:2"), "appeal");
  assert.equal(opOf("abc:confirm:1"), "confirm");
  assert.equal(opOf("abc"), "other");
});

test("nextLaMidnight: the next 00:00 America/Los_Angeles, across DST", () => {
  assert.equal(nextLaMidnight(new Date("2026-10-31T12:00:00Z")).toISOString(), "2026-11-01T07:00:00.000Z");
  assert.equal(nextLaMidnight(new Date("2026-11-01T07:00:00Z")).toISOString(), "2026-11-02T08:00:00.000Z", "PST after the DST change");
});

test("loadConfig refuses to start above the $1,000 ceiling; default $500 a month", async () => {
  const { readFileSync } = await import("node:fs");
  const { loadConfig } = await import("../../src/config.js");
  const example = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");
  const saved = { ...process.env };
  try {
    for (const line of example.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]!] = m[2]!;
    }
    process.env.VERDICT_MODE = "shadow";
    delete process.env.PUBLISH_BUDGET_CENTS_MONTH;
    assert.equal(loadConfig().quick.publishBudgetCentsMonth, 50_000);
    process.env.PUBLISH_BUDGET_CENTS_MONTH = "100000";
    assert.equal(loadConfig().quick.publishBudgetCentsMonth, 100_000);
    process.env.PUBLISH_BUDGET_CENTS_MONTH = "100001";
    assert.throws(() => loadConfig(), /hard ceiling/);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
