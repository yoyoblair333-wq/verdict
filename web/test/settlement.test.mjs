// OFFLINE tests for the standalone Settlement Court page (settlement.html),
// VERDICT v2 / Milestone 3 (SettlementCourt + ReputationLedger).
//   npm run build && npm test
// 1. Pure helpers under node: ruling/deliverable label text, case cleaning,
//    deliverable-row pairing, appeal summary, the display filter, scorecard
//    cleaning + formatting, and address validation. No network.
// 2. A browser tier on the BUILT site with NO network: the two contracts are
//    not deployed yet (config addresses are ''), so the page must render a clear
//    "not yet deployed" state, offer no write, and stay accessible. The RPC is
//    never even contacted in this state; every non-local request is refused.

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { test, before, after } from "node:test";
import { fileURLToPath } from "node:url";
import pw from "playwright";
import { SETTLEMENT_COURT_ADDRESS, REPUTATION_LEDGER_ADDRESS } from "../src/config.js";
import { BANNED } from "../src/lib/trust.js";
import {
  rulingLabel, deliverableLabel, cleanCase, deliverableRows, appealSummary, hideDecision, caseTexts,
  cleanScorecard, scoreText, scorecardSummary, scorecardTiles, addressError, COURT_SOURCE, LEDGER_SOURCE,
} from "../src/settlement.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, "../dist");
const ROOT = path.resolve(here, "../..");
const BASE = "/verdict/";
const IMG = `<img src=x onerror="window.__xss=1;alert(1)">`;

// ------------------------------------------------------------- node tier

test("settlement: ruling and deliverable labels map to display text + a tone", () => {
  assert.deepEqual(rulingLabel("FULFILLED"), { text: "Fulfilled", tone: "ok", blurb: "every judged deliverable was kept" });
  assert.equal(rulingLabel("PARTIAL").text, "Partially fulfilled");
  assert.equal(rulingLabel("NOT_FULFILLED").tone, "bad");
  assert.equal(rulingLabel("UNDECIDED").text, "Undecided");
  assert.equal(rulingLabel("??").text, "??", "an unknown ruling falls back to its own text, never throws");
  assert.deepEqual(deliverableLabel("kept"), { text: "Kept", tone: "ok" });
  assert.equal(deliverableLabel("broken").tone, "bad");
  assert.equal(deliverableLabel("disputed").text, "Disputed");
});

test("settlement: cleanCase forces every field to the expected type and keeps verdicts/history shape", () => {
  const c = cleanCase({
    id: "7", claimant: "0xabc", subject: "", terms: "we agreed on a thing",
    deliverables: ["a", "b"], tier: 2, jurors: 5, status: "judged", ruling: "PARTIAL",
    bucket: "partial", verdicts: [{ index: 0, label: "kept" }, { index: 1, label: "broken" }],
    reason: "mixed", first_ruling: "FULFILLED", overturned: true, appeals_upheld: 1,
    subject_bridged: false, bridge_recorded: false, created_at: "t", updated_at: "u",
    history: [{ tier: 1, ruling: "FULFILLED", jurors: 3, upheld: false, at: "t1", verdicts: [{ index: 0, label: "kept" }] },
              { tier: 2, ruling: "PARTIAL", jurors: 5, upheld: false, at: "t2", verdicts: [] }],
  });
  assert.equal(c.id, 0, "a non-numeric id is coerced to 0, never NaN");
  assert.deepEqual(c.deliverables, ["a", "b"]);
  assert.equal(c.verdicts.length, 2);
  assert.equal(c.overturned, true);
  assert.equal(c.appeals_upheld, 1);
  assert.equal(c.history.length, 2);
  assert.equal(cleanCase(null), null);
  const bad = cleanCase({ id: 3, verdicts: "nope", history: 5, deliverables: 9, overturned: "yes" });
  assert.deepEqual(bad.verdicts, []);
  assert.deepEqual(bad.history, []);
  assert.deepEqual(bad.deliverables, []);
  assert.equal(bad.overturned, false, "only a real boolean true is true");
});

test("settlement: deliverableRows pairs each promise with the jury's label by index; missing rows show no label", () => {
  const c = cleanCase({ id: 1, deliverables: ["ship the logo", "write the copy", "host it"], verdicts: [{ index: 0, label: "kept" }, { index: 1, label: "broken" }] });
  const rows = deliverableRows(c);
  assert.deepEqual(rows.map((r) => [r.index, r.text, r.label]), [[0, "ship the logo", "kept"], [1, "write the copy", "broken"], [2, "host it", ""]]);
  assert.equal(rows[0].display.text, "Kept");
  assert.equal(rows[2].display, null, "a deliverable with no verdict has no label");
});

test("settlement: appealSummary states the tier, overturn and upheld counts honestly", () => {
  const one = cleanCase({ id: 1, tier: 1, jurors: 3, ruling: "FULFILLED", first_ruling: "FULFILLED", history: [{ tier: 1, ruling: "FULFILLED", jurors: 3 }] });
  assert.match(appealSummary(one), /No appeal/);
  const overturned = cleanCase({
    id: 2, tier: 2, jurors: 5, ruling: "NOT_FULFILLED", first_ruling: "FULFILLED", overturned: true,
    history: [{ tier: 1, ruling: "FULFILLED", jurors: 3 }, { tier: 2, ruling: "NOT_FULFILLED", jurors: 5 }],
  });
  assert.match(appealSummary(overturned), /OVERTURNED the first-tier ruling \(Fulfilled\)/);
  const upheld = cleanCase({
    id: 3, tier: 3, jurors: 7, ruling: "PARTIAL", first_ruling: "PARTIAL", overturned: false, appeals_upheld: 2,
    history: [{ tier: 1, ruling: "PARTIAL", jurors: 3 }, { tier: 2, ruling: "PARTIAL", jurors: 5, upheld: true }, { tier: 3, ruling: "PARTIAL", jurors: 7, upheld: true }],
  });
  assert.match(appealSummary(upheld), /did not change/);
  assert.match(appealSummary(upheld), /2 appeals upheld the ruling below/);
});

test("settlement: the display filter (same localCheck as the court page) hides a case whose redacted text still trips it", () => {
  const benign = cleanCase({ id: 1, terms: "we agreed to deliver a logo and a landing page", deliverables: ["the logo", "the page"], reason: "both were delivered" });
  assert.equal(hideDecision(benign), null);
  // defence in depth: if a stored string still carries an email/handle, hide the text
  const leaky = cleanCase({ id: 2, terms: "contact me at someone@example.com about the deal", deliverables: ["x"], reason: "ok" });
  assert.ok(hideDecision(leaky));
  const leakyDeliverable = cleanCase({ id: 3, terms: "a clean agreement sentence here", deliverables: ["mail someone@example.com"], reason: "" });
  assert.ok(hideDecision(leakyDeliverable));
  assert.deepEqual(caseTexts(benign).filter(Boolean).length ? true : false, true);
});

test("settlement: cleanScorecard, scoreText and scorecardSummary read the opt-in scorecard honestly", () => {
  const sc = cleanScorecard({ address: "0xA", fulfilled: 3, partial: 1, not_fulfilled: 1, undecided: 2, appeals_overturned: 1, total_cases: 7, decided_cases: 5, score: 70, opted_in: true, first_seen: "2026-11-01T00:00:00Z", last_seen: "2026-11-02T00:00:00Z" });
  assert.equal(sc.decided_cases, 5);
  assert.equal(scoreText(70), "70 / 100");
  assert.equal(scoreText(-5), "0 / 100", "score is clamped to 0..100");
  assert.equal(scoreText(140), "100 / 100");
  assert.equal(scoreText("x"), "–");
  assert.match(scorecardSummary(sc), /7 settled cases on record; score 70 \/ 100 over 5 decided; 1 overturned on appeal\./);
  const empty = cleanScorecard({ address: "0xB", opted_in: false, total_cases: 0, decided_cases: 0 });
  assert.match(scorecardSummary(empty), /has not opted in/);
  const optedEmpty = cleanScorecard({ address: "0xC", opted_in: true, total_cases: 0 });
  assert.match(scorecardSummary(optedEmpty), /opted in but has no settled cases/);
  const optedOut = cleanScorecard({ address: "0xD", opted_in: false, total_cases: 2, decided_cases: 2, fulfilled: 1, partial: 1, score: 75 });
  assert.match(scorecardSummary(optedOut), /opted out; past counts shown until erased/);
  const tiles = scorecardTiles(sc);
  assert.deepEqual(tiles.map((t) => t.key), ["fulfilled", "partial", "not_fulfilled", "undecided", "decided", "overturned"]);
  assert.deepEqual(tiles.map((t) => t.value), [3, 1, 1, 2, 5, 1]);
  assert.equal(cleanScorecard(null), null);
});

test("settlement: addressError accepts a 0x+40-hex address and rejects everything else in plain words", () => {
  assert.equal(addressError(`0x${"a".repeat(40)}`), "");
  assert.equal(addressError(`0x${"A1b2".repeat(10)}`), "");
  assert.match(addressError(""), /Paste a wallet address/);
  assert.match(addressError("   "), /Paste a wallet address/);
  assert.match(addressError("0x1234"), /not a wallet address/);
  assert.match(addressError(`0x${"z".repeat(40)}`), /not a wallet address/);
});

test("build: dist has the settlement page, its script and stylesheet; no banned wording in the source", () => {
  for (const f of ["settlement.html", "settlement.js", "settlement.css"]) assert.ok(fs.existsSync(path.join(DIST, f)), `${f} missing`);
  const html = fs.readFileSync(path.join(here, "../src/settlement.html"), "utf8");
  assert.match(html, /<script type="module" src="settlement.js"><\/script>/);
  assert.match(html, /contracts\/settlement_court\.py/);
  assert.match(html, /contracts\/reputation_ledger\.py/);
  // The two source paths the page links to really exist in the repo.
  assert.ok(fs.existsSync(path.join(ROOT, COURT_SOURCE)), `${COURT_SOURCE} missing`);
  assert.ok(fs.existsSync(path.join(ROOT, LEDGER_SOURCE)), `${LEDGER_SOURCE} missing`);
  for (const f of ["src/settlement.html", "src/settlement.js", "src/settlement.css"]) {
    const t = fs.readFileSync(path.join(here, "..", f), "utf8");
    for (const re of BANNED) assert.doesNotMatch(t, re, `${f}: ${re}`);
  }
  // The addresses ship as '' (not deployed) so the page degrades, never invents one.
  assert.equal(SETTLEMENT_COURT_ADDRESS, "");
  assert.equal(REPUTATION_LEDGER_ADDRESS, "");
});

// ---------------------------------------------------------- browser tier

let srv;
let browser;
let url;
before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, "settlement.html")), "web/dist missing: run `npm run build` first");
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
  url = `http://127.0.0.1:${srv.address().port}${BASE}settlement.html`;
  browser = await pw.chromium.launch();
});
after(async () => {
  await browser?.close();
  srv?.close();
});

/** The built page with NO network at all (both contracts are not deployed). */
async function settlementPage({ width = 375, scheme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 812 }, serviceWorkers: "block", colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  const offsite = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => { errors.push(`dialog opened (${d.message()})`); d.dismiss(); });
  await ctx.route((u) => !u.href.startsWith(url.slice(0, url.indexOf(BASE))), (r) => { offsite.push(r.request().url()); r.abort(); });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('#courtsrc[data-state="not-deployed"]', { timeout: 30_000 });
  return { ctx, page, errors, offsite };
}

test("browser (offline): not-deployed court + reputation widget degrade gracefully, never invent an address, offer no write", async () => {
  const { ctx, page, errors, offsite } = await settlementPage();
  assert.match(await page.title(), /^Settlement Court/);
  assert.match(await page.locator("#court-notdeployed").textContent(), /Not yet deployed/);
  assert.match(await page.locator("#court-notdeployed").textContent(), /contracts\/settlement_court\.py/);
  assert.match(await page.locator("#rep-notdeployed").textContent(), /Not yet deployed/);
  assert.ok(await page.locator("#rep-addr").isDisabled(), "the lookup is disabled until the ledger is deployed");
  assert.ok(await page.locator("#rep-go").isDisabled());
  // Read-only page: a single read lookup form, no textarea, no second input.
  assert.equal(await page.locator("textarea").count(), 0, "no write form on this page");
  assert.equal(await page.locator("input").count(), 1, "only the read-only reputation lookup input");
  // The RPC was never contacted while both contracts are undeployed.
  assert.equal(offsite.filter((u) => u.includes("studio.genlayer.com")).length, 0, "no RPC call in the not-deployed state");
  // No invented address anywhere on the page (the undeployed contracts have none).
  assert.equal(await page.locator("code", { hasText: /^0x[0-9a-fA-F]{40}$/ }).count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser (offline): settlement page has no horizontal scroll at 375 and 1280 px", async () => {
  for (const width of [375, 1280]) {
    const { ctx, page } = await settlementPage({ width });
    const { sw, iw, right } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      right: Math.max(...[...document.querySelectorAll(".wrap *")].map((e) => e.getBoundingClientRect().right)),
    }));
    assert.ok(sw <= iw, `${width}px: scrollWidth ${sw} > innerWidth ${iw}`);
    assert.ok(right <= iw + 1, `${width}px: an element overflows to ${right}px (viewport ${iw})`);
    await ctx.close();
  }
});

async function axeScan(page) {
  await page.addScriptTag({ path: path.resolve(here, "../node_modules/axe-core/axe.min.js") });
  const r = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("a11y: settlement page has no serious or critical WCAG 2.1 AA violations at 375 px, light and dark", async () => {
  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await settlementPage({ scheme });
    await page.emulateMedia({ colorScheme: scheme });
    const v = await axeScan(page);
    assert.deepEqual(v, [], `settlement page (${scheme}): ${v.join("; ")}`);
    await ctx.close();
  }
});
