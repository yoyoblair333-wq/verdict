// LIVE tier (optional; needs network): the built site (web/dist), served under
// /verdict/ exactly as on GitHub Pages, against the REAL JudgeRouter on GenLayer
// studionet; nothing is mocked. The offline tier is test/offline.test.mjs.
//
//   npm run test:live                  read mode: cases render from the live
//                                      contract, screenshots at 375 and 1280 px
//   VERDICT_WEB_WRITE=1 npm run test:live  also runs one visitor-signed case end to
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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
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
      assert.ok(ids.includes(1), "case #1 from the evidence run is missing (it is pinned, so spam cannot push it off)");
      assert.equal(await page.locator('.case[data-case-id="1"]').getAttribute("data-origin"), "relayer");
      assert.equal(await page.locator('.case[data-case-id="5"]').getAttribute("data-origin"), "visitor", "the demo case is a visitor case");
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

  // Escaping, the display filter, the operator hide list, the visitor/relayer
  // labels and pinning are the OFFLINE tier (test/offline.test.mjs, npm test).

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
