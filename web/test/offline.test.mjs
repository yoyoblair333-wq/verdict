// OFFLINE web tier (AUDIT-2 P1-2): runs from a clean clone with no network.
//   npm run build && npm test
// 1. Pure-module tests under node: case package vs the cross-runtime fixture,
//    the display filter, the gallery trust model (ADR-023), receipt display,
//    pagination by id, and the built evidence index.
// 2. Browser tests on the built site (web/dist served under /verdict/ as on
//    GitHub Pages) with the studionet RPC BLOCKED and snapshot.json replaced
//    by a stub, so the page renders exactly the stubbed get_case results.
// Needs Playwright's Chromium: `npx playwright install chromium` once.
// The live tier (real studionet reads and an optional write) is test/live.test.cjs.

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { test, before, after } from "node:test";
import { fileURLToPath } from "node:url";
import pw from "playwright";
import { CONTRACT_ADDRESS, CONTRACT_CODE_DIGEST, LEDGER_ADDRESS, OWNER_ADDRESS as OWNER, RELAYER_ADDRESS } from "../src/config.js";
import { hideDecision } from "../src/lib/display.js"; import { classifyError, withTimeout, SlowError } from "../src/lib/errors.js"; import { redactForChain, screen as chainScreen } from "../src/lib/chainredact.js"; import { pickProof, proofSentence, proofVotes } from "../src/lib/proof.js"; import { categoryLabel, flagLabel, sinceIso, submissionLabel, writersLine } from "../src/lib/ledger.js";
import { groupCases, idsToFetch, isRelayerCase, provenanceLabel, receiptDisplay, tierStatus, VISITOR_LINE } from "../src/lib/gallery.js";
import { buildPackage, canonicalCodeText, canonicalize, codeDigest, sanitiseText, sha256Hex } from "../src/lib/package.js";
import { ALL_TEST_REFS, BANNED, compareCode, juryChecks, NOT_YET, revokeChecks, summarizeTx, tally, trustPlan } from "../src/lib/trust.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, "../dist");
const ROOT = path.resolve(here, "../..");
const BASE = "/verdict/";
const OUT = path.resolve(here, "../test-results");
const VISITOR = `0x${"b1".repeat(20)}`;

// ------------------------------------------------------------- node tier

test("case package matches the cross-runtime fixture", async () => {
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures/valid-case.json"), "utf8"));
  assert.equal(canonicalize(fx.package), fx.canonical);
  assert.equal(await sha256Hex(fx.canonical), fx.packageDigest);
  for (const e of fx.package.entries) assert.equal(sanitiseText(e.text), e.text);
  const b = await buildPackage({
    requestKey: "abcdefabcdefabcdef", rubric: " Whos_Right ", surface: "settle",
    entries: ["  one​ ", "two"], moderationPolicyVersion: "p", noticeVersion: "n", consent: true, adultConfirmed: true,
    network: "studionet", contractAddress: "0x00000000000000000000000000000000000000aa", contractCodeDigest: "0".repeat(64),
    now: new Date("2026-10-31T12:00:00Z"), submissionTtlSec: 900, caseLifetimeSec: 86400,
  });
  assert.equal(b.pkg.entries[0].text, "one");
  assert.equal(b.pkg.lifetime.submissionDeadline, "2026-10-31T12:15:00Z");
  assert.equal(b.digest, await sha256Hex(b.canonical));
});

test("P1-7: relayer wording only when the creator is the configured relayer; a forged verified_participant is 'says verified (not checked)'", () => {
  const forged = [{ entry_source: "participant_submitted", assurance: "verified_participant" }, { entry_source: "participant_submitted", assurance: "verified_participant" }];
  assert.equal(isRelayerCase({ creator: RELAYER_ADDRESS.toLowerCase() }, RELAYER_ADDRESS), true);
  assert.equal(isRelayerCase({ creator: VISITOR }, RELAYER_ADDRESS), false);
  assert.equal(isRelayerCase({ creator: RELAYER_ADDRESS }, ""), false, "no configured relayer: nobody gets relayer wording");
  const v = provenanceLabel(forged, false);
  assert.ok(v.startsWith(VISITOR_LINE));
  assert.match(v, /says verified \(not checked\)/);
  assert.doesNotMatch(v, /checked by the VERDICT relayer/);
  assert.match(provenanceLabel(forged, true), /checked by the VERDICT relayer/);
  assert.equal(VISITOR_LINE, "Opened by a visitor's testnet account. Self-reported labels not verified.");
});

test("P1-7: confirmed_tier is on-chain status, attributed to who set it; never 'Tier N finalized'", () => {
  assert.equal(tierStatus({ confirmed_tier: 0 }, true), null);
  assert.equal(tierStatus({ confirmed_tier: 1 }, false).text, "On-chain status: creator says Tier 1 final");
  assert.equal(tierStatus({ confirmed_tier: 2 }, true).text, "On-chain status: Tier 2 confirmed by the relayer");
  for (const r of [true, false]) assert.doesNotMatch(tierStatus({ confirmed_tier: 1 }, r).text, /finalized/i);
});

test("ADR-024 item 7: receipt shows 'Receipt' + first 4 and last 4 hex; full value kept; never VR-", () => {
  const d = "01f51eb7f80de32f59fb4dbe1ce047855e088ac9dbf98e05995c835627939267";
  assert.deepEqual(receiptDisplay(d), { label: "Receipt", short: "01f5…9267", full: d, text: "Receipt 01f5…9267" });
  assert.equal(receiptDisplay(`0x${d.toUpperCase()}`).full, d);
  assert.equal(receiptDisplay(""), null);
  assert.equal(receiptDisplay("VR-1234"), null);
});

test("P1-7: 50 spam cases cannot push the evidence cases off the page (pinned ids are always fetched, then pages by id)", () => {
  const nextId = 56; // cases 1..55: evidence 1,2,3,5 then 50 spam cases 6..55
  const first = idsToFetch(nextId, [1, 2, 3, 5], undefined, 20);
  assert.deepEqual(first.pinned, [1, 2, 3, 5]);
  assert.deepEqual(first.page, Array.from({ length: 20 }, (_, i) => 55 - i));
  const second = idsToFetch(nextId, [1, 2, 3, 5], first.nextBefore, 20);
  assert.deepEqual(second.page, Array.from({ length: 20 }, (_, i) => 35 - i));
  const third = idsToFetch(nextId, [1, 2, 3, 5], second.nextBefore, 20);
  assert.deepEqual(third.page, [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 4], "pinned ids are skipped, case 4 is reached");
  assert.equal(third.nextBefore, 1, "no older page");
  assert.deepEqual(idsToFetch(4, [1, 2, 3, 5, 99], undefined, 20).pinned, [1, 2, 3], "pinned ids beyond next_id are dropped");
  // grouping: evidence first by id, relayer cases next, visitors last
  const mk = (id, creator) => ({ id, creator });
  const spam = Array.from({ length: 50 }, (_, i) => mk(6 + i, VISITOR));
  const g = groupCases([...spam, mk(1, RELAYER_ADDRESS), mk(2, RELAYER_ADDRESS), mk(3, RELAYER_ADDRESS), mk(5, VISITOR), mk(60, RELAYER_ADDRESS)], [1, 2, 3, 5], RELAYER_ADDRESS);
  assert.deepEqual(g.evidence.map((c) => c.id), [1, 2, 3, 5]);
  assert.deepEqual(g.relayer.map((c) => c.id), [60]);
  assert.equal(g.visitor.length, 50);
});

test("display filter: PII hides a case's text; the operator list wins", () => {
  assert.equal(hideDecision({ id: 9, entries: ["mail me at someone@example.com", "fine"], rubric: "r", reason: "x" }).kind, "filter");
  assert.equal(hideDecision({ id: 3, entries: ["ok", "ok"] }, [{ id: 3, reason: "takedown" }]).kind, "operator");
  assert.equal(hideDecision({ id: 9, entries: ["Tabs are better.", "Spaces are better."], rubric: "Who's right?", reason: "fine" }), null);
});

test("build: evidence.json indexes the relayer run AND the browser-signed demo case; pinned = evidence cases; the taken-down case hidden", () => {
  const ev = JSON.parse(fs.readFileSync(path.join(DIST, "evidence.json"), "utf8"));
  assert.equal(ev.contract.toLowerCase(), CONTRACT_ADDRESS.toLowerCase());
  const run = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/live/studionet-run.json"), "utf8"));
  assert.equal(run.contract.toLowerCase(), CONTRACT_ADDRESS.toLowerCase(), "the web app and the evidence run name the same contract");
  const demoPath = path.join(ROOT, "docs/live/demo-case.json");
  const demo = fs.existsSync(demoPath) ? JSON.parse(fs.readFileSync(demoPath, "utf8")) : null;
  const runIds = run.cases.map((c) => c.caseId);
  assert.deepEqual(ev.pinned, [...runIds, ...(demo ? [demo.case_id] : [])].sort((a, b) => a - b));
  if (demo) {
    assert.equal(demo.contract.toLowerCase(), CONTRACT_ADDRESS.toLowerCase());
    assert.deepEqual(ev.cases[String(demo.case_id)].map((t) => t.hash), demo.transactions.map((t) => t.hash));
    assert.equal(demo.creator_burner.toLowerCase() === RELAYER_ADDRESS.toLowerCase(), false, "the demo case is a visitor case and must be labelled as one");
  }
  assert.ok(ev.hidden.some((x) => x.id === runIds[2]), "the run's taken-down case (its third) is hidden");
});

// ---------------------------------------------------------- browser tier

let srv;
let browser;
let url;
before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, "index.html")), "web/dist missing: run `npm run build` first");
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json" };
  srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (!u.pathname.startsWith(BASE)) return res.writeHead(404).end();
    const file = path.join(DIST, decodeURIComponent(u.pathname.slice(BASE.length)) || "index.html");
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${srv.address().port}${BASE}`;
  browser = await pw.chromium.launch();
  fs.mkdirSync(OUT, { recursive: true });
});
after(async () => {
  await browser?.close();
  srv?.close();
});

const IMG = `<img src=x onerror="window.__xss=1;alert(1)">`;
const base = (id, extra) => ({
  id, surface: "settle", status: "judged", tier: 2, jurors: 7, winner_index: 0, scores: [70, 30],
  juror_votes: [0, 0, 0, 0, 0, 1, 0], split: "6-1", created_at: "2026-10-31T19:00:00Z", updated_at: "2026-10-31T19:01:00Z",
  package_digest: "a".repeat(64), request_key: "r".repeat(16), provenance: [{ entry_source: "participant_submitted", assurance: "self_asserted" }],
  appeal_deadline: "", revoked_by: -1, confirmed_tier: 2, juror_names: ["Marlowe", "Dahlia", "Frank", "Tiff", "Theo", "Augustine", IMG],
  creator: VISITOR, rubric: "Who's right? Pick the entry.", entries: ["Tabs are better.", "Spaces are better."], reason: "ok", history: [], ...extra,
});
const VERIFIED = [{ entry_source: "participant_submitted", assurance: "verified_participant" }, { entry_source: "participant_submitted", assurance: "verified_participant" }];
const spam = Array.from({ length: 50 }, (_, i) => base(6 + i, { entries: [`spam ${i}`, "spam"], confirmed_tier: 1 }));
const stub = {
  snapshotAt: "2026-10-31T19:00:00Z", contract: CONTRACT_ADDRESS,
  // Owner deployment: stored with CRLF and no final newline, so the raw bytes hash differently.
  pin: { state: "match", digest: CONTRACT_CODE_DIGEST, rawDigest: "6bfe51a77be80254a1572899044403bc54d193e32679226c7d6eabb33753f4da" },
  config: { owner: IMG, relayer: RELAYER_ADDRESS, paused: false, next_id: 911, tier_jurors: { 1: 5, 2: 7, 3: 9 } },
  cases: [
    ...spam,
    base(1, { creator: RELAYER_ADDRESS, provenance: VERIFIED, entries: ["Relayer evidence take A", "B"] }),
    base(5, { creator: `0x${"5".repeat(40)}`, tier: 1, jurors: 5, confirmed_tier: 1, split: "5-0", juror_votes: [0, 0, 0, 0, 0] }),
    base(901, {
      rubric: `Custom ${IMG}`, entries: [`Take one ${IMG}`, `<script>window.__xss=2</script><svg onload="window.__xss=3">`],
      reason: `<a href="javascript:window.__xss=4">click</a>`, history: [{ tier: 1, split: "5-0", winner_index: 0, reason: IMG, at: "x" }],
      creator: `0x${"1".repeat(40)}${IMG}`,
    }),
    base(902, { entries: ["mail me at someone@example.com", "fine"] }),
    base(3, { creator: RELAYER_ADDRESS, rubric: "Pettiest text. Pick.", entries: ["operator-hidden text one", "two"], reason: "r" }),
    base(910, { provenance: VERIFIED, entries: ["Forged verified take", "Other"] }),
  ],
};

async function stubbedPage(width = 375) {
  const ctx = await browser.newContext({ viewport: { width, height: 812 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => {
    errors.push(`dialog opened (${d.message()})`);
    d.dismiss();
  });
  // No network at all: every non-local request is refused; snapshot.json is the stub.
  await ctx.route((u) => !u.href.startsWith(url), (r) => r.abort());
  await page.route("**/verdict/snapshot.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(stub) }));
  // The stub's own evidence ids (1, 2, 3 and a browser-signed 5), independent of the live run's numbering.
  const ev = JSON.parse(fs.readFileSync(path.join(DIST, "evidence.json"), "utf8"));
  await page.route("**/verdict/evidence.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ...ev, pinned: [1, 2, 3, 5], hidden: [{ id: 3, reason: "takedown" }] }) }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('#source[data-state="snapshot"]', { timeout: 30_000 });
  await page.click("#visitors > summary");
  await page.waitForSelector('.case[data-case-id="901"] .split', { timeout: 30_000 });
  return { ctx, page, errors };
}

test("browser (offline): RPC blocked -> labelled snapshot, write mode off", async () => {
  const { ctx, page, errors } = await stubbedPage();
  assert.match(await page.locator("#source").textContent(), /Snapshot · taken/);
  assert.ok(await page.locator("#submit").isDisabled(), "write mode should be off without the live network");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser (offline): evidence cases pinned first, ahead of 50 newer spam cases; visitors behind their own control", async () => {
  const { ctx, page } = await stubbedPage();
  const ids = await page.$$eval(".case[data-case-id]", (els) => els.map((e) => Number(e.dataset.caseId)));
  assert.deepEqual(ids.slice(0, 3), [1, 3, 5], "evidence first, by id (the stub has no case 2)");
  assert.equal(await page.locator('[data-group="evidence"] .case').count(), 3);
  assert.equal(await page.locator('#visitors .case').count(), 50 + 3, "spam and other visitor cases sit in the visitor group");
  assert.match(await page.locator("#visitors > summary").innerText(), /Visitor cases \(53\) · not moderated by VERDICT/);
  await ctx.close();
});

test("browser (offline): relayer labels only on relayer-created cases; a forged verified_participant and a self-set tier are labelled as claims", async () => {
  const { ctx, page } = await stubbedPage();
  const forged = page.locator('.case[data-case-id="910"]');
  const ft = await forged.textContent();
  assert.ok(ft.includes("Opened by a visitor's testnet account. Self-reported labels not verified."));
  assert.ok(ft.includes("says verified (not checked)"));
  assert.ok(!ft.includes("checked by the VERDICT relayer"), "a stranger must never get relayer wording");
  assert.ok(ft.includes("On-chain status: creator says Tier 2 final"));
  assert.ok(!/Tier \d finalized/.test(ft));
  assert.equal(await forged.getAttribute("data-origin"), "visitor");
  const demo = page.locator('.case[data-case-id="5"]');
  assert.equal(await demo.getAttribute("data-origin"), "visitor", "the browser-signed demo case is pinned but still a visitor case");
  const rel = page.locator('.case[data-case-id="1"]');
  const rt = await rel.textContent();
  assert.equal(await rel.getAttribute("data-origin"), "relayer");
  assert.ok(rt.includes("checked by the VERDICT relayer"));
  assert.ok(rt.includes("On-chain status: Tier 2 confirmed by the relayer"));
  await ctx.close();
});

test("browser (offline): receipt shows 'Receipt aaaa…aaaa' with the full value one tap away", async () => {
  const { ctx, page } = await stubbedPage();
  const r = page.locator('.case[data-case-id="902"] details.receipt');
  assert.equal((await r.locator("summary").innerText()).trim(), "Receipt aaaa…aaaa");
  assert.ok((await r.textContent()).includes("a".repeat(64)));
  assert.ok(!(await page.locator("#cases").textContent()).includes("VR-"));
  await ctx.close();
});

test("browser (offline): hostile chain strings render as text, never as HTML", async () => {
  const { ctx, page, errors } = await stubbedPage();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__xss), undefined, "injected script ran");
  assert.equal(await page.locator("#cases img, #cases script, #cases svg, #facts img, #cases a[href^='javascript']").count(), 0, "chain text became elements");
  const t = await page.locator('.case[data-case-id="901"]').textContent();
  assert.ok(t.includes(`Take one ${IMG}`), "hostile entry text not shown literally");
  assert.ok(t.includes("<script>window.__xss=2</script>"), "script text not shown literally");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser (offline): display filter hides flagged text but keeps numbers, receipt and scores; operator-hidden case shows no text", async () => {
  const { ctx, page } = await stubbedPage();
  const c = page.locator('.case[data-case-id="902"]');
  const t = await c.textContent();
  assert.ok(t.includes("Hidden by VERDICT's display filter"));
  assert.ok(!t.includes("someone@example.com") && !t.includes("fine"), "flagged case leaked text");
  assert.equal(await c.locator(".split").innerText(), "6-1");
  assert.equal(await c.locator(".entry .sc").count(), 2);
  assert.equal(await c.locator(".hiddennote").getAttribute("data-hidden"), "filter");
  const op = page.locator('.case[data-case-id="3"]');
  assert.equal(await op.locator(".hiddennote").getAttribute("data-hidden"), "operator");
  assert.ok(!(await op.textContent()).includes("operator-hidden text one"));
  await page.screenshot({ path: path.join(OUT, "offline-375.png"), fullPage: true });
  await ctx.close();
});

test("browser (offline): no horizontal scroll at 375 and 1280 px", async () => {
  for (const w of [375, 1280]) {
    const { ctx, page } = await stubbedPage(w);
    // html has overflow-x:hidden, so scrollWidth alone can hide clipped overflow: check every case card's edge too.
    const { sw, iw, right } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      right: Math.max(...[...document.querySelectorAll("#cases .case, #cases h3, #cases p")].map((e) => e.getBoundingClientRect().right)),
    }));
    assert.ok(sw <= iw, `${w}px: scrollWidth ${sw} > innerWidth ${iw}`);
    assert.ok(right <= iw, `${w}px: a case card overflows to ${right}px (viewport ${iw})`);
    await ctx.close();
  }
});

// ------------------------------------------- "Try to rig it." (ADR-017)

test("trust: every test the page links to is still at its line on disk (so the GitHub link is honest)", () => {
  assert.ok(ALL_TEST_REFS.length >= 15);
  for (const r of ALL_TEST_REFS) {
    const lines = fs.readFileSync(path.join(ROOT, r.path), "utf8").split("\n");
    assert.ok(lines[r.line - 1]?.includes(r.anchor), `${r.path}:${r.line} no longer holds ${r.anchor}`);
    assert.equal(r.url, `https://github.com/yoyoblair333-wq/verdict/blob/main/${r.path}#L${r.line}`);
    assert.ok(Number.isSafeInteger(r.count) && r.count >= 1);
  }
});

test("trust: SPEC §9.10 rows that are not Y stay in the 'not proven yet' list", () => {
  const spec = fs.readFileSync(path.join(ROOT, "docs/SPEC.md"), "utf8");
  const status = (id) => spec.match(new RegExp(`^\\| ${id} \\|.*\\| ([^|]*)\\|\\s*$`, "m"))?.[1].trim() ?? "";
  for (const row of NOT_YET) {
    for (const id of row.req.split(/,\s*/)) {
      if (row.status === "Not claimed") continue;
      assert.doesNotMatch(status(id), /^Y\b/, `${id} is Y in SPEC: move "${row.claim}" out of the not-proven list (ADR-017 item 4)`);
    }
  }
});

test("trust: tx summary, checks and code comparison", () => {
  const C = CONTRACT_ADDRESS;
  const tx = {
    hash: "0x1", statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN", result_name: "MAJORITY_AGREE",
    to_address: C.toLowerCase(), from_address: RELAYER_ADDRESS,
    consensus_data: { votes: { "0xbb": "idle", "0xaa": "agree", "0xcc": "disagree", "0xdd": "agree", "0xee": "agree" }, leader_receipt: [{ node_config: { address: "0xaa" } }] },
  };
  const s = summarizeTx(tx, {});
  assert.equal(s.finality, "FINALIZED_SUCCESS");
  assert.deepEqual(s.votes.map((v) => v.vote), ["agree", "agree", "agree", "disagree", "idle"]);
  assert.equal(tally(s.votes), "agree 3 · disagree 1 · idle 1");
  assert.deepEqual(juryChecks(s, C, RELAYER_ADDRESS), { finalized: true, toContract: true, fromRelayer: true, agreeMajority: true });
  assert.equal(juryChecks({ ...s, votes: s.votes.slice(1) }, C, RELAYER_ADDRESS).agreeMajority, false, "2 of 4 is not a majority");
  assert.equal(juryChecks({ ...s, to: VISITOR }, C, RELAYER_ADDRESS).toContract, false);
  const rv = summarizeTx({ ...tx, txExecutionResultName: "FINISHED_WITH_ERROR", consensus_data: { ...tx.consensus_data, leader_receipt: [{ result: { payload: { readable: "[EXPECTED] verdict is final; request an off-chain takedown instead" } } }] } }, {});
  assert.deepEqual(revokeChecks(rv, C, "verdict is final"), { finalizedError: true, toContract: true, reasonMatches: true });
  assert.equal(revokeChecks(s, C, "verdict is final").finalizedError, false, "a successful revoke is not a refusal");
  assert.equal(revokeChecks(rv, C, "").reasonMatches, false);
  const a = "a".repeat(64);
  assert.equal(compareCode(a, a, a).state, "match");
  assert.equal(compareCode(a, a, a).pinnedToo, true);
  assert.equal(compareCode(a, "b".repeat(64), a).state, "differ");
  assert.equal(compareCode(a, "", a).state, "incomplete");
  assert.equal(compareCode(a, "<img>", a).state, "incomplete");
});

test("code digest: Windows line endings and a missing final newline hash the same; real edits do not", async () => {
  const lf = "a = 1\nb = 2\n";
  const want = await sha256Hex(lf);
  assert.equal(await codeDigest(lf), want, "an LF file with one final newline hashes as plain sha256");
  for (const v of ["a = 1\r\nb = 2", "a = 1\r\nb = 2\r\n", "a = 1\rb = 2", "a = 1\nb = 2\n\n"]) assert.equal(await codeDigest(v), want, JSON.stringify(v));
  for (const v of ["a = 1\nb = 3\n", "a = 1\n\nb = 2\n", "a = 1 \nb = 2\n"]) assert.notEqual(await codeDigest(v), want, JSON.stringify(v));
  assert.equal(canonicalCodeText("x\r\ny"), "x\ny\n");
});

test("build: evidence.json names the trust page's transactions (Tier 1 juries of cases 1-3, revoke on case 3)", () => {
  const ev = JSON.parse(fs.readFileSync(path.join(DIST, "evidence.json"), "utf8"));
  const plan = trustPlan(ev);
  assert.deepEqual(plan.jury.map((j) => j.caseId), [1, 2, 3]);
  assert.ok(plan.jury.every((j) => j.fn === "judge"));
  assert.equal(plan.revoke.caseId, 3);
  const run = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/live/studionet-run.json"), "utf8"));
  assert.equal(plan.revoke.hash, run.transactions.find((t) => t.fn === "revoke").hash);
  assert.ok(fs.readFileSync(path.join(ROOT, "contracts/judge_router.py"), "utf8").includes(plan.expectRevoke));
  assert.deepEqual(trustPlan({ trust: { jury: [{ caseId: 1, hash: "<img>" }], revoke: { caseId: "x", hash: "0x1" } } }), { jury: [], revoke: null, expectRevoke: "" });
});

test("trust: banned wording appears nowhere in the site source (ADR-017 item 1)", () => {
  for (const f of ["index.html", "rig.html", "rig.js", "app.js"]) {
    const t = fs.readFileSync(path.join(here, "../src", f), "utf8");
    for (const re of BANNED) assert.doesNotMatch(t, re, `${f} says ${re}`);
  }
});

async function rigPage(width = 375, { githubDigest = CONTRACT_CODE_DIGEST } = {}) {
  const ev = JSON.parse(fs.readFileSync(path.join(DIST, "evidence.json"), "utf8"));
  const plan = trustPlan(ev);
  const sum = (hash, extra) => ({
    hash, chainStatus: "FINALIZED", execution: "SUCCESS", finality: "FINALIZED_SUCCESS", consensus: "MAJORITY_AGREE",
    to: CONTRACT_ADDRESS, from: RELAYER_ADDRESS, leader: "0x00000000000000000000000000000000000000a1", reason: "",
    votes: [
      { address: "0x00000000000000000000000000000000000000a1", vote: "agree" }, { address: "0x00000000000000000000000000000000000000a2", vote: "agree" },
      { address: `0xa3${IMG}`, vote: "agree" }, { address: "0x00000000000000000000000000000000000000a4", vote: `disagree${IMG}` },
      { address: "0x00000000000000000000000000000000000000a5", vote: "idle" },
    ],
    ...extra,
  });
  const txs = Object.fromEntries(plan.jury.map((j) => [j.hash, sum(j.hash)]));
  txs[plan.revoke.hash] = sum(plan.revoke.hash, { execution: "ERROR", finality: "FINALIZED_ERROR", reason: `[EXPECTED] ${plan.expectRevoke} <script>window.__xss=9</script>` });
  const rigStub = { ...stub, trust: { at: "2026-10-31T19:30:00Z", txs, github: { url: "x", digest: githubDigest } } };
  const ctx = await browser.newContext({ viewport: { width, height: 812 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => {
    errors.push(`dialog opened (${d.message()})`);
    d.dismiss();
  });
  await ctx.route((u) => !u.href.startsWith(url), (r) => r.abort());
  await page.route("**/verdict/snapshot.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(rigStub) }));
  await page.goto(`${url}rig.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30_000 });
  return { ctx, page, errors, plan };
}

test("browser (offline): main page links to the trust page", async () => {
  const { ctx, page } = await stubbedPage();
  const nav = page.locator("nav.tabs a#nav-rig");
  assert.equal(await nav.getAttribute("href"), "rig.html");
  await nav.click();
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30_000 });
  assert.equal((await page.locator("h1").innerText()).replace(/\s+/g, " "), "Try to rig it.");
  assert.match(await page.title(), /^Try to rig it\./);
  await ctx.close();
});

test("browser (offline): trust page renders from the stub, labelled as a snapshot, with every check passing", async () => {
  const { ctx, page, errors, plan } = await rigPage();
  for (const s of ["network", "code", "appeals"]) {
    assert.equal(await page.getAttribute(`.source[data-for="${s}"]`, "data-state"), "snapshot", `${s} should say snapshot`);
    assert.match(await page.locator(`.source[data-for="${s}"]`).innerText(), /Snapshot · taken/i);
  }
  assert.equal(await page.locator("#network .txcard").count(), 3);
  for (const j of plan.jury) {
    const card = page.locator(`#network .txcard[data-hash="${j.hash}"]`);
    assert.equal(await card.getAttribute("data-finality"), "FINALIZED_SUCCESS");
    assert.equal(await card.locator('.checks li[data-ok="0"]').count(), 0);
    assert.equal(await card.locator(".votes li").count(), 5);
  }
  assert.equal(await page.locator("#network .votes li small", { hasText: "leader" }).count(), 3);
  assert.equal(await page.getAttribute("#appeals .txcard", "data-revoke"), "refused");
  assert.match(await page.locator("#appeals [data-reason]").innerText(), /verdict is final; request an off-chain takedown instead/);
  assert.equal(await page.getAttribute("#code [data-code]", "data-code"), "match");
  assert.equal(await page.locator('#code [data-note="line-endings"]').count(), 1);
  assert.match(await page.locator("#code small.raw").innerText(), /raw bytes: 6bfe51a7/);
  // live claims fall back to "Snapshot", never "Live"
  assert.equal(await page.locator('#network .claim[data-kind="live"], #code .claim[data-kind="live"], #appeals .claim[data-kind="live"]').count(), 0);
  assert.ok((await page.locator('.claim[data-kind="snapshot"]').count()) >= 3);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser (offline): trust page claims are labelled and linked; nothing banned; Try it links to the write flow", async () => {
  const { ctx, page } = await rigPage();
  // every tested claim and the injection section link to test files on GitHub
  const testLinks = await page.$$eval("#injection .tests a", (as) => as.map((a) => a.href));
  assert.ok(testLinks.length >= 8 && testLinks.every((h) => h.startsWith("https://github.com/yoyoblair333-wq/verdict/blob/main/") && /#L\d+$/.test(h)));
  for (const c of await page.$$('.claim[data-kind="tested"]')) {
    const inSection4 = await c.evaluate((e) => !!e.closest("#injection"));
    if (!inSection4) assert.ok(await c.$("details.testedby .tests a"), "a tested claim outside section 4 must carry its own test links");
  }
  assert.match(await page.locator("#injection").innerText(), /proven by the\s+tests below/i);
  assert.match(await page.locator("#injection .testsh").innerText(), /The \d+ tests behind these claims/);
  const limits = await page.locator("#limits").innerText();
  for (const t of ["That the verdict is right.", "Which AI model each validator actually ran.", "Who picks the validators."]) assert.ok(limits.includes(t), `missing "${t}"`);
  assert.ok((await page.locator("#limits .ny").count()) >= NOT_YET.length);
  const body = await page.locator("body").innerText();
  for (const re of BANNED) assert.doesNotMatch(body, re);
  assert.equal(await page.getAttribute("#tryit-link", "href"), "./#try");
  assert.equal(await page.getAttribute('nav.tabs a[aria-current="page"]', "href"), "rig.html");
  await ctx.close();
});

test("browser (offline): trust page escapes hostile snapshot and chain strings", async () => {
  const { ctx, page, errors } = await rigPage();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__xss), undefined, "injected script ran");
  assert.equal(await page.locator("main img, section img, section script, .txcard svg").count(), 0, "hostile text became elements");
  assert.ok((await page.locator("#network").textContent()).includes(`disagree${IMG}`), "hostile vote not shown literally");
  assert.ok((await page.locator("#appeals").textContent()).includes("<script>window.__xss=9</script>"));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser (offline): trust page shows 'Differ' when GitHub and the deployed code disagree", async () => {
  const { ctx, page } = await rigPage(375, { githubDigest: "b".repeat(64) });
  assert.equal(await page.getAttribute("#code [data-code]", "data-code"), "differ");
  assert.match(await page.locator("#code .verdictbox").innerText(), /Differ/);
  await ctx.close();
});

test("browser (offline): trust page and main header have no horizontal scroll at 375 and 1280 px", async () => {
  for (const w of [375, 1280]) {
    const { ctx, page } = await rigPage(w);
    const { sw, iw, right } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      right: Math.max(...[...document.querySelectorAll(".wrap *")].map((e) => e.getBoundingClientRect().right)),
    }));
    assert.ok(sw <= iw, `${w}px: scrollWidth ${sw} > innerWidth ${iw}`);
    assert.ok(right <= iw, `${w}px: an element overflows to ${right}px (viewport ${iw})`);
    await page.screenshot({ path: path.join(OUT, `rig-offline-${w}.png`), fullPage: true });
    await ctx.close();
    const m = await stubbedPage(w);
    const r2 = await m.page.evaluate(() => Math.max(...[...document.querySelectorAll("header.top *")].map((e) => e.getBoundingClientRect().right)));
    assert.ok(r2 <= w, `${w}px: main page header overflows to ${r2}px`);
    await m.ctx.close();
  }
});

test("proof strip: picks the highest-tier evidence ruling and its last jury tx; counts votes honestly", () => {
  const ev = { 1: [{ fn: "open_case_package", hash: "0x01" }, { fn: "judge", hash: "0x02" }, { fn: "appeal", hash: "0x03" }, { fn: "appeal", hash: "0x04" }], 2: [{ fn: "judge", hash: "0x05" }] };
  const cases = [
    { id: 2, tier: 1, jurors: 5, split: "4-1", winner_index: 1, status: "final" },
    { id: 1, tier: 3, jurors: 9, split: "9-0", winner_index: 0, status: "final" },
    { id: 3, tier: 3, jurors: 9, split: "5-4", winner_index: 0, status: "revoked" },
  ];
  const p = pickProof(ev, cases);
  assert.deepEqual([p.caseId, p.hash, p.tierName, p.winner], [1, "0x04", "Supreme Court", "A"]);
  assert.equal(pickProof({}, cases), null);
  const tx = { statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN", consensus_data: { votes: { a: "agree", b: "agree", c: "agree", d: "disagree", e: "idle" } } };
  const v = proofVotes(tx, {});
  assert.deepEqual([v.selected, v.agree, v.disagree, v.idle, v.finality], [5, 3, 1, 1, "FINALIZED_SUCCESS"]);
  const line = proofSentence(p, v);
  assert.match(line, /9 AI jurors ruled 9-0 for Take A/);
  assert.match(line, /5 independent validators/);
  assert.match(line, /3 agreed, 1 disagreed, 1 did not vote/);
  assert.match(line, /final on the network/);
  const pending = proofVotes({ statusName: "ACCEPTED", consensus_data: { votes: {} } }, {});
  assert.doesNotMatch(proofSentence(p, pending), /final on the network/);
});

test("browser (offline): trust-first landing states the problem and the proof strip admits it cannot reach the network", async () => {
  const { ctx, page, errors } = await stubbedPage();
  assert.match(await page.locator(".hero .problem").textContent(), /trust that company's model/);
  await page.waitForFunction(() => document.getElementById("proofsrc")?.dataset.state !== "loading", null, { timeout: 30_000 });
  const src = await page.locator("#proofsrc").textContent();
  const line = await page.locator("#proofline").textContent();
  assert.ok(/Network unreachable|No recorded ruling/.test(src), src);
  assert.doesNotMatch(line, /agreed/, "must not claim validator votes it could not read");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("ledger: labels, since window, writers line and submission outcomes", () => {
  assert.equal(categoryLabel("delivery"), "Parcel / delivery");
  assert.equal(flagLabel("link_pressure"), "Pushes a link");
  assert.equal(flagLabel("new_code"), "new code");
  assert.equal(sinceIso(new Date("2026-11-08T12:00:00.123Z"), 7), "2026-11-01T12:00:00Z");
  const line = writersLine({ owner: OWNER, relayer: RELAYER_ADDRESS.toLowerCase() }, OWNER, RELAYER_ADDRESS);
  assert.match(line, /Only the owner's wallet and the VERDICT relayer can add patterns/);
  assert.match(line, /never offers a write/);
  assert.match(writersLine({ owner: "0xabc", relayer: "0xdef" }, OWNER, RELAYER_ADDRESS), /the owner 0xabc and the relayer 0xdef/);
  assert.equal(submissionLabel({ label: "1-new", intent: "new pattern", expected: "SUCCESS" }), "New pattern stored");
  assert.equal(submissionLabel({ label: "2-dedup", intent: "same pattern as #1 (dedup sighting)", expected: "SUCCESS" }), "Counted as a repeat sighting");
  assert.match(submissionLabel({ label: "3-pii", intent: "identifying data", expected: "ERROR" }), /Rejected as designed/);
});

test("build: evidence.json carries the owner PatternLedger run (3 recorded submissions)", () => {
  const ev = JSON.parse(fs.readFileSync(path.join(DIST, "evidence.json"), "utf8"));
  assert.equal(ev.ledger.contract.toLowerCase(), LEDGER_ADDRESS.toLowerCase());
  assert.equal(ev.ledger.submissions.length, 3);
  for (const x of ev.ledger.submissions) assert.match(x.tx, /^0x[0-9a-f]{64}$/i);
  assert.equal(ev.ledger.submissions[2].expected, "ERROR");
});

test("browser (offline): scam ledger is read-only, says who can write, admits the network is blocked, lists recorded txs", async () => {
  const { ctx, page, errors } = await stubbedPage();
  await page.waitForFunction(() => document.getElementById("ledgersrc")?.dataset.state !== "loading", null, { timeout: 30_000 });
  assert.match(await page.locator("#ledgersrc").textContent(), /Network unreachable/);
  assert.equal(await page.locator("#ledgertxs li").count(), 3);
  assert.equal(await page.locator("#ledger form, #ledger textarea, #ledger input").count(), 0, "the ledger section must not offer a write");
  assert.match(await page.locator("#ledgertxs").textContent(), /Rejected as designed/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("review guide: every tx hash it cites is in the recorded evidence; every in-site link exists; nothing banned", () => {
  const html = fs.readFileSync(path.join(here, "../src/review.html"), "utf8");
  const evidence = [fs.readFileSync(path.join(ROOT, "docs/LIVE_EVIDENCE.md"), "utf8"), ...fs.readdirSync(path.join(ROOT, "docs/live")).map((f) => fs.readFileSync(path.join(ROOT, "docs/live", f), "utf8"))].join("\n").toLowerCase();
  const hashes = [...new Set(html.match(/0x[0-9a-fA-F]{64}/g) ?? [])];
  assert.ok(hashes.length >= 7, `only ${hashes.length} hashes`);
  for (const x of hashes) assert.ok(evidence.includes(x.toLowerCase()), `${x} is not in docs/LIVE_EVIDENCE.md or docs/live/`);
  const index = fs.readFileSync(path.join(here, "../src/index.html"), "utf8");
  for (const [, id] of html.matchAll(/href="\.\/#([a-z-]+)"/g)) assert.match(index, new RegExp(`id="${id}"`), `index.html has no #${id}`);
  for (const [, f] of html.matchAll(/href="([a-z]+\.html)"/g)) assert.ok(fs.existsSync(path.join(DIST, f)), `${f} is not built`);
  assert.ok(fs.existsSync(path.join(DIST, "demo/verdict-demo.mp4")), "demo video is not built");
  for (const re of BANNED) assert.doesNotMatch(html, re);
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  assert.match(readme, /^## Use VERDICT from your app/m, "review.html points to this README section");
});

test("browser (offline): review guide renders without horizontal scroll at 375 and 1280 px", async () => {
  for (const width of [375, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 812 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await ctx.route((u) => !u.href.startsWith(url), (r) => r.abort());
    await page.goto(`${url}review.html`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator(".review").count(), 6);
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    assert.ok(sw <= iw, `${width}px: scrollWidth ${sw} > innerWidth ${iw}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});


// ------------------------------------------------ errors + accessibility (round 2)

test("errors: every failure kind maps to a plain-language message and a retry label", async () => {
  const k = (e, o) => classifyError(e, o).kind;
  assert.equal(k(new TypeError("Failed to fetch")), "offline");
  assert.equal(k(new Error("fetch failed")), "offline");
  assert.equal(k(new Error("HTTP 503 Service Unavailable")), "offline");
  assert.equal(k(new SlowError("Reading the contract", 20000)), "slow");
  assert.equal(k(new Error("request timed out")), "slow");
  assert.equal(k(new Error("x"), { finality: "STALE" }), "stale");
  assert.equal(k(new Error("insufficient funds for gas * price + value")), "funds");
  assert.equal(k(new Error("out of gas")), "funds");
  const r = classifyError(new Error("x"), { execution: "ERROR", reason: "[EXPECTED] the case is final" });
  assert.equal(r.kind, "refused");
  assert.match(r.message, /the case is final/);
  assert.equal(k(new Error("weird")), "unknown");
  for (const e of [new TypeError("Failed to fetch"), new SlowError("a", 1000), new Error("out of gas"), new Error("weird")]) {
    const i = classifyError(e);
    assert.ok(i.message.length > 20 && i.retry, i.kind);
    assert.doesNotMatch(i.message, /RPC|calldata|revert|nonce/i, "no jargon in the visitor-facing sentence");
  }
  await assert.rejects(withTimeout(new Promise(() => {}), 30, "Test"), (e) => e.code === "SLOW");
  assert.equal(await withTimeout(Promise.resolve(7), 1000), 7);
});

test("browser (offline): network down -> plain-language error with a working Try again button", async () => {
  const { ctx, page, errors } = await stubbedPage();
  const box = page.locator('#neterr .errbox[role="alert"]');
  await box.waitFor({ timeout: 30_000 });
  assert.equal(await box.getAttribute("data-kind"), "offline");
  assert.match(await box.textContent(), /can't reach the GenLayer test network/);
  assert.match(await box.textContent(), /saved copy/);
  await box.locator("button").click();
  await page.waitForSelector('#source[data-state="snapshot"]', { timeout: 30_000 });
  await page.locator('#neterr .errbox[data-kind="offline"]').waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => document.getElementById("ledgersrc")?.dataset.state === "error", null, { timeout: 30_000 });
  assert.equal(await page.locator('#patterns .errbox button').count(), 1, "the ledger offers its own retry");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser (offline): slow network -> 'answering slowly' message instead of an endless spinner", async () => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { window.VERDICT_READ_TIMEOUT_MS = 1500; });
  // The RPC host accepts the request and never answers; everything else off-site is refused.
  await ctx.route((u) => !u.href.startsWith(url), (r) => (/genlayer\.com/.test(r.request().url()) ? undefined : r.abort()));
  const ev = JSON.parse(fs.readFileSync(path.join(DIST, "evidence.json"), "utf8"));
  await page.route("**/verdict/snapshot.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(stub) }));
  await page.route("**/verdict/evidence.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ...ev, pinned: [1, 2, 3, 5] }) }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const box = page.locator("#neterr .errbox");
  await box.waitFor({ timeout: 30_000 });
  assert.equal(await box.getAttribute("data-kind"), "slow");
  assert.match(await box.textContent(), /answering slowly/);
  assert.match(await page.locator("#source").textContent(), /Snapshot/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

async function axeScan(page) {
  await page.addScriptTag({ path: path.resolve(here, "../node_modules/axe-core/axe.min.js") });
  const r = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("a11y: no serious or critical WCAG 2.1 AA violations at 375 px, light and dark (court, trust page, review guide)", async () => {
  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await stubbedPage();
    await page.emulateMedia({ colorScheme: scheme });
    const v1 = await axeScan(page);
    assert.deepEqual(v1, [], `court page (${scheme}): ${v1.join("; ")}`);
    await ctx.close();
    const r = await rigPage();
    await r.page.emulateMedia({ colorScheme: scheme });
    const v2 = await axeScan(r.page);
    assert.deepEqual(v2, [], `trust page (${scheme}): ${v2.join("; ")}`);
    await r.ctx.close();
    const c3 = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block", colorScheme: scheme });
    const p3 = await c3.newPage();
    await c3.route((u) => !u.href.startsWith(url), (x) => x.abort());
    await p3.goto(`${url}review.html`, { waitUntil: "domcontentloaded" });
    const v3 = await axeScan(p3);
    assert.deepEqual(v3, [], `review guide (${scheme}): ${v3.join("; ")}`);
    await c3.close();
  }
});

test("a11y: keyboard - first Tab lands on 'Skip to content', which moves focus into the main content", async () => {
  const { ctx, page } = await stubbedPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.className), "skip");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "main");
  // Every control in the write form is reachable and labelled.
  const unlabeled = await page.evaluate(() => [...document.querySelectorAll("#caseform input, #caseform textarea, #caseform button")]
    .filter((el) => !(el.labels?.length || el.getAttribute("aria-label") || el.textContent.trim()))
    .map((el) => el.id || el.name));
  assert.deepEqual(unlabeled, []);
  await ctx.close();
});


// ------------------------------------------- Red Flag Court preview (Milestone 1)

test("redflag: the browser screen is the contract's screen (fixtures/pattern-screen.json)", () => {
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures/pattern-screen.json"), "utf8"));
  for (const c of fx.cases) assert.equal(chainScreen(c.clean ?? c.input), c.reason, c.name);
});

test("redflag: chain redaction leaves nothing the contract would refuse (redaction fixtures + hostile samples)", () => {
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures/redaction.json"), "utf8"));
  const inputs = (fx.cases ?? fx).map((c) => c.input ?? c.in ?? c.text).filter(Boolean);
  inputs.push(
    "URGENT: your parcel is on hold. Pay the 1.99 redelivery fee at parcel-help.co/pay within 1 hour.",
    "Pay $49 at https://x.co/a or call 555-123-4567, mail bob@x.com, 2 euros, ref A1B2, ٣ days, www.example.org",
    "Send 0.5 BTC to win €1,000,000 dot com support",
  );
  for (const i of inputs) {
    const r = redactForChain(i);
    assert.equal(r.issue, "", `${i} -> ${r.text}`);
    assert.equal(chainScreen(r.text), "");
  }
  const r = redactForChain("Pay $49 at https://x.co/a or call 555-123-4567, mail bob@x.com");
  assert.match(r.text, /\[AMOUNT\]/);
  assert.match(r.text, /\[LINK\]/);
  assert.match(r.text, /\[EMAIL\]/);
  assert.ok(r.removed >= 4);
});

test("browser (offline): Red Flag Court preview stays hidden unless the flag is on", async () => {
  const { ctx, page, errors } = await stubbedPage();
  assert.equal(await page.locator("#redflag").isHidden(), true);
  assert.equal(await page.locator("#nav-redflag").isHidden(), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser (offline): flag on -> scam check redacts before sending, says what is published, admits the network is down", async () => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ctx.route((u) => !u.href.startsWith(url), (r) => r.abort());
  await page.route("**/verdict/snapshot.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(stub) }));
  await page.goto(`${url}?redflag=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#redflag:not([hidden])", { timeout: 30_000 });
  await page.click("#rf-sample");
  const preview = await page.locator("#rf-preview").textContent();
  assert.doesNotMatch(preview, /\d|@|parcel-help/);
  assert.match(preview, /\[AMOUNT\]|\[NUMBER\]/);
  assert.match(await page.locator("#rf-removed").textContent(), /removed/);
  assert.equal(await page.locator("#rf-issue").textContent(), "");
  // Unticked consent is caught before anything is signed.
  await page.click("#rf-send");
  assert.match(await page.locator("#rf-formerr").textContent(), /consent/);
  await page.locator('#rf-recent .errbox[role="alert"]').waitFor({ timeout: 30_000 });
  const ax = await axeScan(page);
  assert.deepEqual(ax, [], ax.join("; "));
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `scrollWidth ${sw} > ${iw}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});
