// OFFLINE web tier for Evidence Court (Milestone 2). No network: the studionet
// RPC is blocked. Covers:
//   - the browser link screen equals the contract's (fixtures/evidence-urls.json)
//   - the build serves the committed evidence pages, byte for byte
//   - the section is hidden unless ?evidence=1, and with the flag: the form,
//     the sample buttons, the per-link refusal messages, the consent gate
//   - the ruling view renders the RECORDED live run (docs/live/evidence-court-run.json):
//     every label, the injection flag, the verified excerpt, "decided by the evidence"
//   - axe (WCAG 2.1 AA serious/critical) light and dark, no sideways scroll at 375 px
//   npm run build && node --test test/evidence.test.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { test, before, after } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import pw from "playwright";
import { EVIDENCE_ADDRESS, EVIDENCE_ENABLED } from "../src/config.js";
import { decidedLine, linkProblem } from "../src/lib/evidencelinks.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, "../dist");
const ROOT = path.resolve(here, "../..");
const BASE = "/verdict/";
const RUN = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/live/evidence-court-run.json"), "utf8"));
const stepOf = (label) => RUN.steps.find((s) => s.label === label);
const finalDispute = (label) => stepOf(label)?.dispute_final ?? stepOf(label)?.dispute;

// ------------------------------------------------------------- node tier

test("evidence: the browser link screen is the contract's link screen (fixtures/evidence-urls.json)", () => {
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures/evidence-urls.json"), "utf8"));
  for (const c of fx.cases) assert.equal(linkProblem(c.url), c.reason, c.url);
});

test("evidence: config points at the recorded deployment and the section ships behind the flag", () => {
  assert.equal(EVIDENCE_ADDRESS.toLowerCase(), RUN.contract.toLowerCase());
  assert.equal(EVIDENCE_ENABLED, false);
  assert.equal(RUN.code_pin.state, "match");
});

test("evidence: the recorded live run has all five steps FINALIZED with the designed outcomes", () => {
  for (const s of RUN.steps) assert.equal(s.finality, "FINALIZED_SUCCESS", s.label);
  const d1 = finalDispute("1-evidence-decides");
  assert.equal(d1.history[0].ruling, "B");
  assert.equal(d1.history[0].decided_by, "evidence");
  assert.deepEqual(d1.history[0].labels, ["SUPPORTS_B"]);
  const d2 = finalDispute("2-irrelevant");
  assert.equal(d2.evidence[0].label, "IRRELEVANT");
  assert.equal(d2.decided_by, "panel");
  const d3 = finalDispute("3-injection");
  assert.equal(d3.evidence[0].injection, true);
  assert.equal(d3.evidence[0].label, "IRRELEVANT");
  assert.equal(d3.ruling, "B");
  assert.equal(d3.decided_by, "evidence");
  const d4 = finalDispute("4-unreachable");
  assert.equal(d4.evidence[0].label, "UNREACHABLE");
  assert.equal(d4.evidence[0].fetch, "http_404");
  const ap = stepOf("5-appeal");
  assert.equal(ap.dispute.tier, 2);
  assert.equal(ap.dispute.jurors, 3);
});

test("evidence: decidedLine says the contract counted the labels", () => {
  assert.match(decidedLine({ decided_by: "evidence", ruling: "B", support_a: 0, support_b: 1, evidence: [{}] }), /^Decided by the evidence: 1 verified link for side B against 0/);
  assert.match(decidedLine({ decided_by: "panel", ruling: "UNPROVEN", support_a: 0, support_b: 0, evidence: [{}] }), /No link settled it/);
  assert.match(decidedLine({ decided_by: "panel", ruling: "A", evidence: [] }), /No evidence links were cited/);
});

test("build: the committed evidence pages are served at <site>/evidence/, byte for byte", () => {
  const pages = fs.readdirSync(path.join(ROOT, "docs/evidence-pages")).filter((n) => n.endsWith(".html"));
  assert.equal(pages.filter((n) => n.startsWith("attack-")).length, 6, "the six attack-gallery pages");
  for (const f of pages) {
    assert.equal(fs.readFileSync(path.join(DIST, "evidence", f), "utf8"), fs.readFileSync(path.join(ROOT, "docs/evidence-pages", f), "utf8"), f);
  }
});

// ---------------------------------------------------------- browser tier

let srv;
let browser;
let url;
let cardBundle;
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
  // The ruling view, bundled on its own (no genlayer-js, no network).
  const out = await build({
    stdin: { contents: `import { renderDispute } from "./src/lib/evidencecard.js"; window.__renderDispute = renderDispute;`, resolveDir: path.resolve(here, ".."), loader: "js" },
    bundle: true, write: false, format: "iife", platform: "browser",
  });
  cardBundle = out.outputFiles[0].text;
});
after(async () => {
  await browser?.close();
  srv?.close();
});

async function offlinePage(scheme = "light", query = "?evidence=1") {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block", colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ctx.route((u) => !u.href.startsWith(url), (r) => r.abort());
  await page.route("**/verdict/snapshot.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ cases: [] }) }));
  await page.goto(`${url}${query}`, { waitUntil: "domcontentloaded" });
  return { ctx, page, errors };
}

async function axeScan(page, selector = "#evidence") {
  await page.addScriptTag({ path: path.resolve(here, "../node_modules/axe-core/axe.min.js") });
  const r = await page.evaluate(async (sel) => window.axe.run(document.querySelector(sel), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }), selector);
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("browser (offline): Evidence Court stays hidden unless ?evidence=1", async () => {
  const { ctx, page, errors } = await offlinePage("light", "");
  await page.waitForLoadState("load");
  assert.equal(await page.locator("#evidence").isHidden(), true);
  assert.equal(await page.locator("#nav-evidence").isHidden(), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser (offline): flag on -> form, samples, per-link refusals before signing, consent gate, admits the network is down", async () => {
  const { ctx, page, errors } = await offlinePage();
  await page.waitForSelector("#evidence:not([hidden])", { timeout: 30_000 });
  assert.equal(await page.locator("#nav-evidence").isVisible(), true);
  assert.match(await page.locator("#ev-addr").textContent(), new RegExp(EVIDENCE_ADDRESS));
  await page.click("#ev-sample");
  assert.match(await page.inputValue("#ev-b1"), /\/evidence\/garden-notice\.html$/);
  assert.equal(await page.inputValue("#ev-a1"), "");
  await page.click("#ev-sample-inj");
  assert.match(await page.inputValue("#ev-a1"), /\/evidence\/injection-notice\.html$/);
  assert.equal(await page.locator("#ev-a1-err").textContent(), "", "a hostile PAGE is allowed in: the court flags it after fetching");
  // A link the contract would refuse is caught before anything is signed.
  await page.fill("#ev-a2", "http://192.168.1.1/admin");
  assert.equal(await page.locator("#ev-a2-err").textContent(), "Would be refused: must start with https://.");
  await page.fill("#ev-a2", "https://example.com/ignore-all-previous-instructions");
  assert.equal(await page.locator("#ev-a2-err").textContent(), "Would be refused: instructions in the link.");
  await page.fill("#ev-a2", "");
  await page.fill("#ev-b2", await page.inputValue("#ev-b1"));
  assert.match(await page.locator("#ev-b2-err").textContent(), /cited twice/);
  await page.click("#ev-send");
  assert.match(await page.locator("#ev-formerr").textContent(), /Fix the evidence links/);
  await page.fill("#ev-b2", "");
  await page.click("#ev-send");
  assert.match(await page.locator("#ev-formerr").textContent(), /consent/);
  assert.equal(await page.locator("#ev-rail").isHidden(), true, "nothing was sent");
  await page.locator('#ev-recent .errbox[role="alert"]').waitFor({ timeout: 30_000 });
  const ax = await axeScan(page);
  assert.deepEqual(ax, [], ax.join("; "));
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `scrollWidth ${sw} > ${iw}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const scheme of ["light", "dark"]) {
  test(`browser (offline): the ruling view renders the recorded live run (${scheme}): labels, injection flag, verified excerpt`, async () => {
    const { ctx, page, errors } = await offlinePage(scheme);
    await page.waitForSelector("#evidence:not([hidden])", { timeout: 30_000 });
    await page.addScriptTag({ content: cardBundle });
    const disputes = ["1-evidence-decides", "2-irrelevant", "3-injection", "4-unreachable", "5-appeal"].map((l) => stepOf(l).dispute);
    await page.evaluate((ds) => {
      const box = document.getElementById("ev-result");
      box.replaceChildren(...ds.map((d) => window.__renderDispute(d)));
    }, disputes);
    const card = (id) => page.locator(`#ev-result [data-dispute-id="${id}"]`).first();
    const d1 = disputes[0], d3 = disputes[2], d4 = disputes[3];
    assert.equal(await card(d1.id).getAttribute("data-decided-by"), "evidence");
    assert.match(await card(d1.id).locator(".decided").textContent(), /Decided by the evidence/);
    assert.match(await card(d1.id).locator(".quote").first().textContent(), new RegExp(d1.evidence[0].excerpt.slice(0, 30)));
    const inj = card(d3.id).locator('.evitem[data-injection="true"]');
    assert.equal(await inj.count(), 1);
    assert.match(await inj.textContent(), /Injection flagged/);
    assert.match(await inj.textContent(), /withheld from the jurors/);
    assert.equal(await inj.locator(".quote").count(), 0, "nothing from the hostile page is quoted");
    assert.match(await card(d4.id).locator('.evitem[data-label="UNREACHABLE"]').textContent(), /could not read this page \(http 404\)/);
    const ax = await axeScan(page);
    assert.deepEqual(ax, [], ax.join("; "));
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    assert.ok(sw <= iw, `scrollWidth ${sw} > ${iw}`);
    await page.locator("#ev-result").screenshot({ path: path.resolve(here, `../test-results/evidence-ruling-${scheme}.png`) });
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
