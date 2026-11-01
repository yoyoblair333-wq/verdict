// OFFLINE tests for the standalone Scam Pattern Ledger page (ledger.html).
//   npm run build && npm test
// 1. Pure helpers under node: chart rows, pin state, recorded-outcome match,
//    the recorded tx plan, and that every source line and test class the page
//    links to is still where the link says.
// 2. Browser tests on the built site with NO network: the studionet RPC is
//    either blocked, or answered by an in-test fake that speaks genlayer-js's
//    own calldata encoding (gen_call, gen_getContractCode,
//    eth_getTransactionByHash). The fake's data is made up for the test (a
//    hostile summary included) and is not a claim about the live ledger.

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { test, before, after } from "node:test";
import { fileURLToPath } from "node:url";
import { abi } from "genlayer-js";
import pw from "playwright";
import { LEDGER_ADDRESS, LEDGER_CODE_DIGEST, LEDGER_DEPLOY_TX, OWNER_ADDRESS, RELAYER_ADDRESS } from "../src/config.js";
import { codeDigest } from "../src/lib/package.js";
import { BANNED } from "../src/lib/trust.js";
import {
  barRows, chartSummary, cleanPattern, countTests, historyLine, LEDGER_SOURCE, LEDGER_TEST_FILE, LEDGER_TESTS, matchesRecord, pinState, SOURCE_LINES, studyPlan, txPlan,
} from "../src/ledger.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, "../dist");
const ROOT = path.resolve(here, "../..");
const BASE = "/verdict/";
const RPC = "https://studio.genlayer.com/api";
const IMG = `<img src=x onerror="window.__xss=1;alert(1)">`;

// ------------------------------------------------------------- node tier

test("ledger page: every contract line it links to still says what the link claims", () => {
  const src = fs.readFileSync(path.join(ROOT, LEDGER_SOURCE), "utf8").split("\n");
  for (const [k, v] of Object.entries(SOURCE_LINES)) assert.ok(src[v.line - 1].includes(v.has), `${k}: line ${v.line} is "${src[v.line - 1]}"`);
});

test("ledger page: every linked test class is at its line and has tests", () => {
  const rows = countTests(fs.readFileSync(path.join(ROOT, LEDGER_TEST_FILE), "utf8"));
  for (const r of rows) {
    assert.ok(r.found, `${r.cls} is not at line ${r.line}`);
    assert.ok(r.count > 0, `${r.cls} has no tests`);
  }
  assert.ok(rows.reduce((n, r) => n + r.count, 0) >= 30);
});

test("ledger page: chart rows are ranked as given, scaled to the top count, and summarised in words", () => {
  const rows = [
    { id: 4, category: "job", summary: "a", sightings: 9, sightings_since: 6, flag_codes: [] },
    { id: 2, category: "delivery", summary: "b", sightings: 3, sightings_since: 3, flag_codes: [] },
    { id: 0, category: "x", summary: "junk", sightings_since: 99 },
    null,
  ];
  const b = barRows(rows);
  assert.deepEqual(b.map((x) => [x.id, x.count, x.total, x.pct]), [[4, 6, 9, 100], [2, 3, 3, 50]]);
  assert.equal(b[0].label, "#4 · Job offer");
  assert.equal(chartSummary(b, 30), "2 patterns sighted 9 times in the last 30 days; the most sighted is pattern #4 · Job offer with 6.");
  assert.equal(chartSummary([], 7), "No sightings in the last 7 days.");
  assert.equal(barRows(Array.from({ length: 20 }, (_, i) => ({ id: i + 1, sightings_since: 1 }))).length, 10);
});

test("ledger page: pin state, recorded-outcome match, history line, hostile types", async () => {
  assert.equal(pinState(LEDGER_CODE_DIGEST, LEDGER_CODE_DIGEST), "match");
  assert.equal(pinState("0".repeat(64), LEDGER_CODE_DIGEST), "mismatch");
  assert.equal(pinState("", LEDGER_CODE_DIGEST), "unchecked");
  // The pinned digest is the canonical digest of the file on disk.
  assert.equal(await codeDigest(fs.readFileSync(path.join(ROOT, LEDGER_SOURCE), "utf8")), LEDGER_CODE_DIGEST);
  assert.equal(matchesRecord({ chainStatus: "FINALIZED", execution: "ERROR" }, "ERROR"), true);
  assert.equal(matchesRecord({ chainStatus: "FINALIZED", execution: "SUCCESS" }, "ERROR"), false);
  assert.equal(matchesRecord({ chainStatus: "ACCEPTED", execution: "SUCCESS" }, "SUCCESS"), null, "only a finalized tx is compared");
  assert.equal(historyLine([{ kind: "new" }, { kind: "sighting" }, { kind: "sighting" }]), "1 new, 2 repeat sightings in the kept history");
  const p = cleanPattern({ id: "7", sightings: -1, flag_codes: "urgency", history: [{ at: 5, kind: IMG }] });
  assert.equal(p.id, 0);
  assert.equal(p.sightings, 0);
  assert.deepEqual(p.flag_codes, []);
  assert.equal(p.history[0].at, "5");
});

test("ledger page: recorded tx plan is the deploy plus the evidence run's submissions, for this contract only", () => {
  const ev = JSON.parse(fs.readFileSync(path.join(DIST, "evidence.json"), "utf8"));
  const plan = txPlan(ev, LEDGER_DEPLOY_TX);
  const run = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/live/pattern-ledger-run.json"), "utf8")).current;
  assert.equal(plan[0].hash, run.deploy.tx);
  assert.deepEqual(plan.slice(1).map((t) => t.hash), run.submissions.map((s) => s.tx));
  assert.deepEqual(plan.slice(1).map((t) => t.expected), run.submissions.map((s) => s.final_execution));
  assert.match(plan.at(-1).label, /Rejected as designed/);
  const other = txPlan({ ledger: { ...ev.ledger, contract: `0x${"9".repeat(40)}` } }, LEDGER_DEPLOY_TX);
  assert.deepEqual(other.map((t) => t.kind), ["deploy"], "another contract's submissions are ignored");
});

test("ledger page: study tx plan is the consensus study's records, with expected and recorded outcomes, for this contract only", () => {
  const ev = JSON.parse(fs.readFileSync(path.join(DIST, "evidence.json"), "utf8"));
  const plan = studyPlan(ev);
  const study = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/live/pattern-ledger-study.json"), "utf8"));
  assert.equal(plan.length, 15);
  assert.deepEqual(plan.map((t) => t.hash), study.records.map((r) => r.tx));
  assert.deepEqual(plan.map((t) => t.expected), study.records.map((r) => r.final_execution));
  assert.equal(plan[1].intent, "expected a sighting of A0-job-base; recorded sighting of #2 (now 2)");
  assert.equal(plan[13].revert, "[REJECTED] not a coherent scam pattern");
  assert.deepEqual(studyPlan({ ledger: { ...ev.ledger, contract: `0x${"9".repeat(40)}` } }), [], "another contract's study is ignored");
  assert.deepEqual(studyPlan(null), []);
});

test("build: dist has the ledger page, its script and stylesheet; no banned wording", () => {
  for (const f of ["ledger.html", "ledger.js", "ledger.css"]) assert.ok(fs.existsSync(path.join(DIST, f)), `${f} missing`);
  const html = fs.readFileSync(path.join(here, "../src/ledger.html"), "utf8");
  assert.match(html, /<script type="module" src="ledger.js"><\/script>/);
  assert.match(html, /docs\/PATTERN_LEDGER\.md/);
  assert.match(html, /contracts\/pattern_ledger\.py/);
  for (const f of ["src/ledger.html", "src/ledger.js", "src/ledger.css"]) {
    const t = fs.readFileSync(path.join(here, "..", f), "utf8");
    for (const re of BANNED) assert.doesNotMatch(t, re, `${f}: ${re}`);
  }
});

// ---------------------------------------------------------- browser tier

let srv;
let browser;
let url;
before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, "ledger.html")), "web/dist missing: run `npm run build` first");
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
  url = `http://127.0.0.1:${srv.address().port}${BASE}ledger.html`;
  browser = await pw.chromium.launch();
});
after(async () => {
  await browser?.close();
  srv?.close();
});

// Test data for the fake RPC (not the live ledger).
const pat = (id, extra) => ({
  id, category: "delivery", flag_codes: ["urgency", "link_pressure"], summary: `Test summary ${id}.`, sightings: 1,
  first_seen: "2026-11-01T01:00:00Z", last_seen: "2026-11-01T02:00:00Z", ...extra,
});
const FAKE = {
  config: {
    schema: "verdict.pattern-ledger.v1", owner: OWNER_ADDRESS, relayer: RELAYER_ADDRESS, paused: false, next_id: 3, dedup_candidates: 10,
    max_summary_chars: 200, history_cap: 100, flag_codes: ["urgency", "link_pressure"], categories: ["delivery", "job"],
  },
  recent: [pat(2, { category: "job", summary: `Hostile ${IMG}<script>window.__xss=2</script>` }), pat(1, { sightings: 3 })],
  history: {
    1: [{ at: "2026-11-01T01:00:00Z", kind: "new", flag_codes: ["urgency"] }, { at: "2026-11-01T01:30:00Z", kind: "sighting", flag_codes: ["urgency"] }, { at: "2026-11-01T02:00:00Z", kind: "sighting", flag_codes: [IMG] }],
    2: [{ at: "2026-11-01T01:00:00Z", kind: "new", flag_codes: ["link_pressure"] }],
  },
  top: [{ ...pat(1, { sightings: 3 }), sightings_since: 3 }, { ...pat(2, { category: "job" }), sightings_since: 1 }],
};
const toMap = (v) => (Array.isArray(v) ? v.map(toMap) : v && typeof v === "object" ? new Map(Object.entries(v).map(([k, x]) => [k, toMap(x)])) : v);
const enc = (v) => Buffer.from(abi.calldata.encode(toMap(v))).toString("hex");

/** Page whose RPC is answered by the fake (`rpc: "fake"`) or refused (`rpc: "blocked"`). */
async function ledgerPage({ width = 375, rpc = "fake", code = null, scheme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 812 }, serviceWorkers: "block", colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  const calls = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => {
    errors.push(`dialog opened (${d.message()})`);
    d.dismiss();
  });
  const source = code ?? fs.readFileSync(path.join(ROOT, LEDGER_SOURCE), "utf8").replace(/\n/g, "\r\n").replace(/\r\n$/, "");
  await ctx.route((u) => !u.href.startsWith(url.slice(0, url.indexOf(BASE))), async (r) => {
    if (rpc !== "fake" || !r.request().url().startsWith(RPC)) return r.abort();
    const body = JSON.parse(r.request().postData() ?? "{}");
    const answer = (result) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) });
    if (body.method === "gen_getContractCode") return answer(Buffer.from(source, "utf8").toString("base64"));
    if (body.method === "eth_getTransactionByHash") {
      const err = body.params[0].endsWith("3d"); // the recorded PII refusal ends in ...643d
      return answer({
        hash: body.params[0], status: "FINALIZED", result_name: "MAJORITY_AGREE",
        consensus_data: { votes: { "0x01": "agree", "0x02": "agree", "0x03": "agree", "0x04": "idle" }, leader_receipt: [{ execution_result: err ? "ERROR" : "SUCCESS", error: err ? "[REJECTED] summary contains identifying data (digits)" : undefined }] },
      });
    }
    if (body.method === "gen_call") {
      const data = Buffer.from(String(body.params[0].data).replace(/^0x/, ""), "hex").toString("latin1");
      calls.push(data);
      if (data.includes("top_patterns_since")) return answer(enc(FAKE.top));
      if (data.includes("list_recent")) return answer(enc(FAKE.recent));
      if (data.includes("get_pattern")) {
        const id = [1, 2].find((k) => data.includes(Buffer.from(abi.calldata.encode(abi.calldata.makeCalldataObject("get_pattern", [k]))).toString("latin1")));
        const p = FAKE.recent.find((x) => x.id === id);
        return answer(enc({ ...p, history: FAKE.history[id] }));
      }
      if (data.includes("get_config")) return answer(enc(FAKE.config));
    }
    return r.abort();
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("ledgersrc")?.dataset.state !== "loading", null, { timeout: 30_000 });
  await page.waitForSelector("#chart figure, #chart .errbox", { timeout: 30_000 });
  return { ctx, page, errors, calls };
}

test("browser (fake RPC): live config, code pin Match on CRLF-stored code, newest patterns with history, chart", async () => {
  const { ctx, page, errors } = await ledgerPage();
  assert.match(await page.locator("#ledgersrc").textContent(), /^Live/);
  assert.equal(await page.locator("#pin [data-code]").getAttribute("data-code"), "match");
  assert.equal(await page.locator('#pin [data-digest="chain"]').textContent(), LEDGER_CODE_DIGEST);
  assert.match(await page.locator("#pin").textContent(), /raw bytes/, "CRLF-stored code: the raw hash differs and is shown");
  assert.equal(await page.locator('[data-fact="patterns"]').textContent(), "2");
  assert.match(await page.locator("#ledgerfacts").textContent(), /Only the owner's wallet and the VERDICT relayer can add patterns/);
  assert.equal(await page.locator("#patterns .pattern").count(), 2);
  assert.match(await page.locator('.pattern[data-pattern-id="1"] details.hist summary').textContent(), /1 new, 2 repeat sightings/);
  assert.equal(await page.locator(".barlist li").count(), 2);
  assert.match(await page.locator("#chart figcaption").textContent(), /2 patterns sighted 4 times in the last 30 days/);
  assert.equal(await page.locator(".barlist .bt").first().getAttribute("aria-hidden"), "true", "the bar is decoration; numbers are text");
  assert.equal(await page.locator("main form, main textarea, main input[type=text]").count(), 0, "the ledger page never offers a write");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser (fake RPC): window picker re-reads top_patterns_since with a new since", async () => {
  const { ctx, page, calls } = await ledgerPage();
  const before = calls.filter((c) => c.includes("top_patterns_since")).length;
  await page.click('label[for="win7"]');
  await page.waitForFunction(() => /last 7 days/.test(document.querySelector("#chart figcaption")?.textContent ?? ""), null, { timeout: 30_000 });
  assert.equal(calls.filter((c) => c.includes("top_patterns_since")).length, before + 1);
  await ctx.close();
});

test("browser (fake RPC): hostile chain strings render as text, never as HTML", async () => {
  const { ctx, page, errors } = await ledgerPage();
  await page.click('.pattern[data-pattern-id="1"] details.hist summary');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator("main img, main script").count(), 0);
  assert.match(await page.locator('.pattern[data-pattern-id="2"] .reason').textContent(), /<img src=x/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser (fake RPC): every recorded tx is checkable live and compared with the record", async () => {
  const { ctx, page } = await ledgerPage();
  const n = await page.locator("#ledgertxs li").count();
  assert.equal(n, 4, "deploy + 3 recorded submissions");
  for (let i = 0; i < n; i++) {
    await page.locator("#ledgertxs li button").nth(i).click();
    await page.waitForFunction((k) => !/checking/.test(document.querySelectorAll("#ledgertxs .st")[k].textContent) && document.querySelectorAll("#ledgertxs .st")[k].textContent, i, { timeout: 30_000 });
    assert.match(await page.locator("#ledgertxs .st").nth(i).textContent(), /FINALIZED .* as recorded/);
  }
  assert.match(await page.locator("#ledgertxs .st").nth(3).textContent(), /\[REJECTED\] summary contains identifying data/);
  assert.equal(await page.locator("#studytxs li").count(), 15, "the consensus study's submissions are listed too");
  await ctx.close();
});

test("browser (fake RPC): changed deployed code shows Mismatch", async () => {
  const { ctx, page } = await ledgerPage({ code: fs.readFileSync(path.join(ROOT, LEDGER_SOURCE), "utf8") + "\n# edited\n" });
  assert.equal(await page.locator("#pin [data-code]").getAttribute("data-code"), "mismatch");
  assert.match(await page.locator("#pin").textContent(), /Don't trust the rest of this page/);
  await ctx.close();
});

test("browser (offline): RPC blocked -> plain error with retry; explainer and recorded txs still there", async () => {
  const { ctx, page, errors } = await ledgerPage({ rpc: "blocked" });
  assert.match(await page.locator("#ledgersrc").textContent(), /Network unreachable/);
  assert.equal(await page.locator("#patterns .errbox button").count(), 1);
  assert.equal(await page.locator("#chart .errbox button").count(), 1);
  assert.equal(await page.locator("#ledgertxs li").count(), 4);
  assert.match(await page.locator("#never").textContent(), /never stores/i);
  await page.locator("#ledgertxs li button").first().click();
  await page.waitForFunction(() => /try again/i.test(document.querySelector("#ledgertxs .st")?.textContent ?? ""), null, { timeout: 30_000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser: no horizontal scroll at 375 and 1280 px", async () => {
  for (const width of [375, 1280]) {
    const { ctx, page } = await ledgerPage({ width });
    await page.click('.pattern[data-pattern-id="1"] details.hist summary');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= width, `scrollWidth ${sw} > ${width}`);
    await ctx.close();
  }
});

async function axeScan(page) {
  await page.addScriptTag({ path: path.resolve(here, "../node_modules/axe-core/axe.min.js") });
  const r = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("a11y: ledger page has no serious or critical WCAG 2.1 AA violations at 375 px, light and dark, live and offline", async () => {
  for (const scheme of ["light", "dark"]) {
    for (const rpc of ["fake", "blocked"]) {
      const { ctx, page } = await ledgerPage({ rpc, scheme });
      await page.emulateMedia({ colorScheme: scheme });
      if (rpc === "fake") {
        await page.click('.pattern[data-pattern-id="1"] details.hist summary');
        await page.click(".vocab summary");
        await page.click("#tested-body summary");
      }
      const v = await axeScan(page);
      assert.deepEqual(v, [], `ledger page (${scheme}, ${rpc}): ${v.join("; ")}`);
      await ctx.close();
    }
  }
});

test("a11y: keyboard - first Tab lands on 'Skip to content'; the window picker works by keyboard", async () => {
  const { ctx, page } = await ledgerPage();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.className), "skip");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "main");
  await page.focus("#win30");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => /last 365 days/.test(document.querySelector("#chart figcaption")?.textContent ?? ""), null, { timeout: 30_000 });
  await ctx.close();
});
