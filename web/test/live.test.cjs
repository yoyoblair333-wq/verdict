// Live end-to-end test for the built site (web/dist), served under /verdict/
// exactly as on GitHub Pages. It talks to the REAL JudgeRouter on GenLayer
// studionet; nothing is mocked.
//
//   node test/live.test.cjs            read mode: cases render from the live
//                                      contract, screenshots at 375 and 1280 px
//   VERDICT_WEB_WRITE=1 node test/...  also runs one visitor-signed case end to
//                                      end (burner key, open -> judge -> confirm)
//
// Needs Playwright's Chromium (`require('playwright')`). Behind an HTTPS proxy
// the browser is pointed at $HTTPS_PROXY.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const DIST = path.resolve(__dirname, "../dist");
const OUT = path.resolve(__dirname, "../test-results");
const BASE = "/verdict/";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json" };

function serve() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (!u.pathname.startsWith(BASE)) return res.writeHead(404).end();
    let rel = decodeURIComponent(u.pathname.slice(BASE.length)) || "index.html";
    const file = path.join(DIST, rel);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

let failures = 0;
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`PASS  ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}

async function packageFixture() {
  const { buildPackage, canonicalize, sha256Hex, sanitiseText } = await import(path.resolve(__dirname, "../src/lib/package.js"));
  const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../fixtures/valid-case.json"), "utf8"));
  assert.equal(canonicalize(fx.package), fx.canonical, "canonical bytes differ from the cross-runtime fixture");
  assert.equal(await sha256Hex(fx.canonical), fx.packageDigest, "package digest differs from the fixture");
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
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await step("case package matches the cross-runtime fixture", packageFixture);

  assert.ok(fs.existsSync(path.join(DIST, "index.html")), "web/dist missing: run `npm run build` first");
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}${BASE}`;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: "127.0.0.1,localhost" } } : {});
  const errors = [];

  for (const [w, hgt] of [[375, 812], [1280, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: w === 375 ? 2 : 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${w}px: ${e.message}`));
    const rpcCalls = [];
    page.on("request", (r) => r.url().startsWith("https://studio.genlayer.com/api") && rpcCalls.push(r.postDataJSON()?.method));

    await step(`${w}px: page reads the live contract (not the snapshot)`, async () => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('#source[data-state="live"], #source[data-state="snapshot"], #source[data-state="error"]', { timeout: 90_000 });
      const st = await page.getAttribute("#source", "data-state");
      assert.equal(st, "live", `source is ${st}: ${await page.getAttribute("#source", "title")}`);
      assert.ok(rpcCalls.includes("gen_call"), `no gen_call seen; RPC methods: ${[...new Set(rpcCalls)].join(",")}`);
      assert.ok(rpcCalls.includes("gen_getContractCode"), "code pin not checked");
    });

    await step(`${w}px: real cases render with verdicts, votes and tier history`, async () => {
      await page.waitForSelector(".case[data-case-id] .split", { timeout: 60_000 });
      const ids = await page.$$eval(".case[data-case-id]", (els) => els.map((e) => Number(e.dataset.caseId)));
      assert.ok(ids.length >= 1, "no cases");
      assert.ok(ids.includes(1), "case #1 from the evidence run is missing");
      const c1 = page.locator('.case[data-case-id="1"]');
      assert.match(await c1.locator(".split").innerText(), /^\d+-\d+$/);
      assert.ok((await c1.locator(".seat").count()) >= 5, "juror votes missing");
      assert.ok((await c1.locator(".ladder li").count()) >= 2, "tier history missing");
      assert.match(await page.locator("#facts").innerText(), /Match/, "code pin did not match");
      assert.match(await page.locator(".netbar").innerText(), /GenLayer testnet \(studionet\).*no real value/i);
    });

    await step(`${w}px: latest jury tx is checked live and shows FINALIZED`, async () => {
      await page.waitForFunction(() => [...document.querySelectorAll('.case[data-case-id="1"] .txs .st')].some((e) => /FINALIZED/.test(e.textContent)), null, { timeout: 60_000 });
    });

    await step(`${w}px: no horizontal scroll`, async () => {
      const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      assert.ok(sw <= iw, `scrollWidth ${sw} > innerWidth ${iw}`);
    });

    await page.screenshot({ path: path.join(OUT, `live-${w}.png`), fullPage: true });
    await page.screenshot({ path: path.join(OUT, `live-${w}-top.png`) });
    await ctx.close();
  }

  if (fs.existsSync(path.join(DIST, "snapshot.json"))) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await page.route("https://studio.genlayer.com/**", (r) => r.abort());
    await step("fallback: RPC blocked -> labelled snapshot, write mode off", async () => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('#source[data-state="snapshot"]', { timeout: 60_000 });
      assert.match(await page.locator("#source").textContent(), /Snapshot · taken/);
      await page.waitForSelector(".case[data-case-id] .split");
      assert.ok(await page.locator("#submit").isDisabled(), "write mode should be off without the live network");
    });
    await ctx.close();
  }

  // Hostile chain text. The RPC is blocked and snapshot.json is replaced by a
  // stub, so the page renders exactly these get_case results.
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`xss: ${e.message}`));
    page.on("dialog", (d) => {
      errors.push(`xss: dialog opened (${d.message()})`);
      d.dismiss();
    });
    const IMG = `<img src=x onerror="window.__xss=1;alert(1)">`;
    const base = (id, extra) => ({
      id, surface: "settle", status: "judged", tier: 2, jurors: 7, winner_index: 0, scores: [70, 30],
      juror_votes: [0, 0, 0, 0, 0, 1, 0], split: "6-1", created_at: "2026-10-31T19:00:00Z", updated_at: "2026-10-31T19:01:00Z",
      package_digest: "a".repeat(64), request_key: "r".repeat(16), provenance: [{ entry_source: "participant_submitted", assurance: "self_asserted" }],
      appeal_deadline: "", revoked_by: -1, confirmed_tier: 2, juror_names: ["Marlowe", "Dahlia", "Frank", "Tiff", "Theo", "Augustine", IMG],
      creator: `0x${"1".repeat(40)}${IMG}`, ...extra,
    });
    const stub = {
      snapshotAt: "2026-10-31T19:00:00Z", contract: "0x7DBc10d8922A5Ba498007D212F2088872F2aCe06",
      pin: { state: "match", digest: "3ef39cc8a02f7c2bdbf3f3b7d19340622439a381192ced7cbcd799232139ea25" },
      config: { owner: IMG, paused: false, next_id: 4, tier_jurors: { 1: 5, 2: 7, 3: 9 } },
      cases: [
        base(901, {
          rubric: `Custom ${IMG}`, entries: [`Take one ${IMG}`, `<script>window.__xss=2</script><svg onload="window.__xss=3">`],
          reason: `<a href="javascript:window.__xss=4">click</a>`, history: [{ tier: 1, split: "5-0", winner_index: 0, reason: IMG, at: "x" }],
        }),
        base(902, { rubric: "Who's right? Pick the entry.", entries: ["mail me at someone@example.com", "fine"], reason: "ok", history: [] }),
        base(3, { rubric: "Pettiest text. Pick.", entries: ["operator-hidden text one", "two"], reason: "r", history: [] }),
      ],
    };
    await page.route("https://studio.genlayer.com/**", (r) => r.abort());
    await page.route("**/verdict/snapshot.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(stub) }));
    await step("escaping: hostile chain strings render as text, never as HTML", async () => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('.case[data-case-id="901"] .split', { timeout: 60_000 });
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => window.__xss), undefined, "injected script ran");
      assert.equal(await page.locator("#cases img, #cases script, #cases svg, #facts img, #cases a[href^='javascript']").count(), 0, "chain text became elements");
      const t = await page.locator('.case[data-case-id="901"]').textContent();
      assert.ok(t.includes(`Take one ${IMG}`), "hostile entry text not shown literally");
      assert.ok(t.includes("<script>window.__xss=2</script>"), "script text not shown literally");
    });
    await step("display filter: flagged text hidden, numbers/receipt/txs kept", async () => {
      const c = page.locator('.case[data-case-id="902"]');
      const t = await c.textContent();
      assert.ok(t.includes("Hidden by VERDICT's display filter"), "no filter label");
      assert.ok(!/null/.test(t.replace(/[a-f0-9]{64}/g, "")), "stray null rendered");
      assert.ok(!t.includes("someone@example.com") && !t.includes("fine"), "flagged case leaked text");
      assert.equal(await c.locator(".split").innerText(), "6-1");
      assert.ok(t.includes("a".repeat(64)), "receipt number missing");
      assert.ok((await c.locator(".entry .sc").count()) === 2, "scores missing");
      assert.equal(await c.locator(".hiddennote").getAttribute("data-hidden"), "filter");
    });
    await step("hidden-cases.json: operator-hidden case shows no text", async () => {
      const c = page.locator('.case[data-case-id="3"]');
      const t = await c.textContent();
      assert.equal(await c.locator(".hiddennote").getAttribute("data-hidden"), "operator");
      assert.ok(!t.includes("operator-hidden text one"), "operator-hidden case leaked text");
      assert.equal(await c.locator(".split").innerText(), "6-1");
    });
    await page.screenshot({ path: path.join(OUT, "safety-375.png"), fullPage: true });
    await ctx.close();
  }

  if (process.env.VERDICT_WEB_WRITE === "1") {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`write: ${e.message}`));
    await step("write: visitor-signed case runs end to end on studionet", async () => {
      await page.goto(url + "#try", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('#source[data-state="live"]', { timeout: 90_000 });
      await page.click("#sample");
      await page.check("#consent");
      await page.check("#adult");
      await page.click("#submit");
      await page.waitForFunction(() => document.querySelector('#rail li[data-k="final"]')?.className === "done", null, { timeout: 12 * 60_000 });
      await page.waitForSelector("#runresult .case .split", { timeout: 120_000 });
      await page.waitForFunction(() => /confirm_verdict: FINALIZED/.test(document.querySelector("#log")?.textContent ?? ""), null, { timeout: 5 * 60_000 });
      const log = await page.locator("#log").innerText();
      console.log(log.split("\n").map((l) => `      ${l}`).join("\n"));
      await page.locator("#run").screenshot({ path: path.join(OUT, "write-375.png") });
    });
    await ctx.close();
  }

  await step("no uncaught page errors", async () => assert.deepEqual(errors, []));
  await browser.close();
  srv.close();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
