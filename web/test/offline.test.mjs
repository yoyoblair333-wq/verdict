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
import { CONTRACT_ADDRESS, CONTRACT_CODE_DIGEST, RELAYER_ADDRESS } from "../src/config.js";
import { hideDecision } from "../src/lib/display.js";
import { groupCases, idsToFetch, isRelayerCase, provenanceLabel, receiptDisplay, tierStatus, VISITOR_LINE } from "../src/lib/gallery.js";
import { buildPackage, canonicalize, sanitiseText, sha256Hex } from "../src/lib/package.js";

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

test("build: evidence.json indexes the relayer run AND the browser-signed demo case 5; pinned = evidence cases; case 3 hidden", () => {
  const ev = JSON.parse(fs.readFileSync(path.join(DIST, "evidence.json"), "utf8"));
  assert.equal(ev.contract.toLowerCase(), CONTRACT_ADDRESS.toLowerCase());
  assert.deepEqual(ev.pinned, [1, 2, 3, 5]);
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/live/demo-case.json"), "utf8"));
  assert.deepEqual(ev.cases["5"].map((t) => t.hash), demo.transactions.map((t) => t.hash));
  assert.ok(ev.hidden.some((x) => x.id === 3));
  assert.equal(demo.creator_burner.toLowerCase() === RELAYER_ADDRESS.toLowerCase(), false, "case 5 is a visitor case and must be labelled as one");
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
  pin: { state: "match", digest: CONTRACT_CODE_DIGEST },
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
