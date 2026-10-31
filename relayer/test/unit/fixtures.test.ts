// TIER: unit (pure functions, no network). Cross-runtime fixtures: the SAME
// files contracts/tests/direct/test_fixtures.py runs against the real GenVM SDK.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canonicalize, sha256Hex } from "../../src/lib/canonical.js";
import { localCheck } from "../../src/lib/moderation.js";
import { provenanceLabel, verifyPackage, type VerifyContext } from "../../src/lib/package.js";
import { validateVerdictPayload } from "../../src/lib/verdict.js";

const load = (name: string) => JSON.parse(readFileSync(new URL(`../../../../fixtures/${name}`, import.meta.url), "utf8"));
const ctx = (fx: { now: string; contractAddress: string; contractCodeDigest: string }): VerifyContext => ({
  now: new Date(fx.now),
  contractAddress: fx.contractAddress,
  network: "studionet",
  contractCodeDigest: fx.contractCodeDigest,
});

test("valid-case: canonical bytes and digest reproduce exactly; package verifies", () => {
  const fx = load("valid-case.json");
  assert.equal(canonicalize(fx.package), fx.canonical);
  assert.equal(sha256Hex(fx.canonical), fx.packageDigest);
  for (const e of fx.package.entries) assert.equal(sha256Hex(e.text), e.sha256);
  const v = verifyPackage(fx.canonical, fx.packageDigest, ctx(fx));
  assert.ok(v.ok, JSON.stringify(v));
  const v2 = verifyPackage(fx.package, fx.packageDigest, ctx(fx));
  assert.ok(v2.ok);
});

for (const name of ["tampered-digest.json", "consent-missing.json", "injection-attempt.json", "expired-case.json"]) {
  const fx = load(name);
  for (const c of fx.cases) {
    test(`${name}: ${c.name} -> ${c.expect.code}`, () => {
      const v = verifyPackage(c.canonical, c.packageDigest, ctx(fx));
      assert.equal(v.ok, false);
      assert.equal(!v.ok && v.code, c.expect.code);
      // Where the contract's revert carries a detail, the relayer must fail at the same check.
      if (!v.ok && c.expect.contractRevert.startsWith(`${c.expect.code}:`)) assert.equal(`${v.code}: ${v.detail}`, c.expect.contractRevert);
      // the object form gives the same answer
      const v2 = verifyPackage(c.package, c.packageDigest, ctx(fx));
      assert.equal(!v2.ok && v2.code, c.expect.code);
    });
  }
}

test("tampered-digest: the change really is one byte", () => {
  const fx = load("tampered-digest.json");
  const valid = load("valid-case.json");
  const a = Buffer.from(valid.canonical, "utf8");
  const b = Buffer.from(fx.cases[0].canonical, "utf8");
  assert.equal(a.length, b.length);
  assert.equal([...a].filter((x, i) => x !== b[i]).length, 1);
});

test("injection-attempt: every text is refused locally; benign texts pass", () => {
  const fx = load("injection-attempt.json");
  for (const t of fx.texts) assert.equal(localCheck(t, "Entry", 280).ok, false, t);
  for (const t of fx.benign) assert.equal(localCheck(t, "Entry", 280).ok, true, t);
});

test("malformed-llm: every leader payload is rejected; the valid one passes", () => {
  const fx = load("malformed-llm.json");
  assert.deepEqual(validateVerdictPayload(fx.validLeaderPayload, fx.entriesCount, fx.jurors), { ok: true });
  for (const item of fx.leaderPayloads) {
    assert.equal(validateVerdictPayload(item.payload, fx.entriesCount, fx.jurors).ok, false, item.name);
  }
});

test("expired-case lateAction package is valid at openAt (expiry is enforced later)", () => {
  const fx = load("expired-case.json");
  const la = fx.lateAction;
  assert.ok(verifyPackage(la.canonical, la.packageDigest, { ...ctx(fx), now: new Date(la.openAt) }).ok);
  assert.ok(Date.parse(la.actAt) > Date.parse(la.package.lifetime.appealWindowExpiry));
});

test("revoked-case package verifies and its label is honest", () => {
  const fx = load("revoked-case.json");
  assert.ok(verifyPackage(fx.canonical, fx.packageDigest, ctx(fx)).ok);
  const label = provenanceLabel(fx.package.entries.map((e: { provenance: unknown }) => e.provenance));
  assert.match(label, /Entry A: submitted by the participant holding that side's link/);
  assert.match(label, /Entry B: submitted through Settle It; authorship not verified/);
  assert.match(label, /not that the verdict is correct/);
});
