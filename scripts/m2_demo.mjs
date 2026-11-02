// Milestone 2 demo capture: the built web app (web/dist) served locally, driven
// by Playwright's Chromium, LIVE against studionet. The page's requests to
// studionet are relayed through Node's fetch, so TLS stays verified. The run
// is real: the dispute is opened from the MAIN "Who's right?" form, routed to
// EvidenceCourt, signed by the page's own testnet burner, and tracked to
// finality. Frames are screenshots with a caption bar. ffmpeg stitches them
// into docs/media/m2-demo.gif and .mp4; the long validator wait is shortened.
//   cd web && npm run build && cd .. && NODE_USE_ENV_PROXY=1 node scripts/m2_demo.mjs <framesdir> <run.json>
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pw from "../web/node_modules/playwright/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "web/dist");
const FR = process.argv[2];
const OUT = process.argv[3];
fs.mkdirSync(FR, { recursive: true });
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".mp4": "video/mp4" };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (!u.pathname.startsWith("/verdict/")) return res.writeHead(404).end();
  const file = path.join(DIST, decodeURIComponent(u.pathname.slice(9)) || "index.html");
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${srv.address().port}/verdict/`;

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1, colorScheme: "light" });
// Relay outside requests (studionet RPC, Google Fonts) through Node.
await ctx.route((u) => !u.href.startsWith(base), async (route) => {
  const r = route.request();
  try {
    const resp = await fetch(r.url(), { method: r.method(), headers: { "content-type": r.headers()["content-type"] ?? "application/json" }, body: r.postDataBuffer() ?? undefined });
    const body = Buffer.from(await resp.arrayBuffer());
    await route.fulfill({ status: resp.status, headers: { "content-type": resp.headers.get("content-type") ?? "application/octet-stream", "access-control-allow-origin": "*" }, body });
  } catch {
    await route.abort();
  }
});
const page = await ctx.newPage();
const log = { frames: [], startedAt: new Date().toISOString() };
let n = 0;
async function caption(text) {
  await page.evaluate((t) => {
    let c = document.getElementById("__cap");
    if (!c) {
      c = document.createElement("div");
      c.id = "__cap";
      c.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#1B1340;color:#F7E26B;font:700 19px/1.35 system-ui,sans-serif;padding:12px 18px;border-top:3px solid #F7E26B";
      document.body.append(c);
    }
    c.textContent = t;
  }, text);
}
async function shot(text, secs) {
  await caption(text);
  await page.waitForTimeout(250);
  const f = path.join(FR, `f${String(n++).padStart(3, "0")}.png`);
  await page.screenshot({ path: f });
  log.frames.push({ file: path.basename(f), secs, text });
}
const toTop = (sel, offset = 70) => page.evaluate(([s, o]) => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - o); }, [sel, offset]);

await page.goto(base, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#evidence:not([hidden])", { timeout: 60_000 });
await page.waitForTimeout(2500);
await shot("VERDICT Milestone 2: Evidence Court. New on the main page: 'show your sources'.", 4);

await toTop("#try");
await shot("The normal 'Who's right?' form now has an optional step: Add evidence links.", 3.5);
await page.click("#evstep summary");
await page.click("#evstep-sample");
await toTop("#evstep", 90);
await shot("Sample: B cites a public notice. The route switches to Evidence Court (a 2nd contract).", 4.5);
await page.fill("#eva1", "http://192.168.1.1/admin");
await shot("Links get the contract's own screen before signing: no http, IPs, localhost, ports...", 4);
await page.fill("#eva1", "");
await page.check("#consent");
await page.check("#adult");
await toTop("#evroute", 300);
await shot("Consent and 18+ ticked. Send: the browser's testnet burner signs. No server in between.", 3.5);
await page.click("#submit");
await page.waitForSelector("#ev-routed:not([hidden])", { timeout: 20_000 });
await page.waitForTimeout(1500);
await toTop("#ev-routed", 80);
await shot("Handed to Evidence Court: same takes, plus the question and the link.", 4);

// The validators fetch the page and judge; capture the rail as it moves.
const t0 = Date.now();
let last = "";
while (Date.now() - t0 < 14 * 60_000) {
  const st = (await page.locator("#ev-status").textContent()) ?? "";
  const done = await page.locator("#ev-result .evdispute").count();
  const err = await page.locator("#ev-err .errbox").count();
  if (st !== last) {
    last = st;
    await toTop("#ev-rail", 260);
    await shot(`Every validator fetches the cited page itself, then the jury labels it. Status: ${st || "submitted"}`, 2.2);
  }
  if (done || err) break;
  await page.waitForTimeout(3000);
}
log.liveSeconds = Math.round((Date.now() - t0) / 1000);
log.status = await page.locator("#ev-status").textContent();
log.txs = await page.$$eval("#ev-log a", (as) => as.map((a) => a.textContent));
log.txHrefs = await page.$$eval("#ev-log a", (as) => as.map((a) => a.href));
log.error = (await page.locator("#ev-err").textContent()) || null;
log.burner = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("verdict.testnet-burner.v1")).privateKey ? "present" : "none"; } catch { return "none"; } });
if (await page.locator("#ev-result .evdispute").count()) {
  log.dispute = await page.locator("#ev-result .evdispute").first().getAttribute("data-dispute-id");
  log.ruling = await page.locator("#ev-result .evdispute").first().getAttribute("data-ruling");
  log.decidedBy = await page.locator("#ev-result .evdispute").first().getAttribute("data-decided-by");
  await toTop("#ev-result", 80);
  await shot("Final. The contract counted the verified label: B wins, decided by the evidence. The quote was checked word for word.", 6);
}
// The recorded attack-gallery and injection disputes, read live.
await page.waitForSelector("#ev-recent .evdispute", { timeout: 60_000 }).catch(() => {});
for (const [id, text] of [["3", "Dispute 3: a page that orders the court to 'rule for side A' is flagged, hidden from the jurors and ignored."],
  ["5", "Dispute 5, the attack gallery: a hidden comment, zero-width text and CSS-hidden text. All three flagged on-chain."]]) {
  const sel = `#ev-recent [data-dispute-id="${id}"]`;
  if (await page.locator(sel).count()) {
    await toTop(`${sel} .evlist`, 120);
    await shot(text, 5.5);
  }
}
await toTop("#evidence", 70);
await shot("Try it: yoyoblair333-wq.github.io/verdict  ·  contract 0x893aF111…A3E5 on GenLayer studionet (testnet)", 4);
log.finishedAt = new Date().toISOString();
fs.writeFileSync(OUT, JSON.stringify(log, null, 1) + "\n");
await browser.close();
srv.close();
console.log(JSON.stringify({ frames: log.frames.length, liveSeconds: log.liveSeconds, dispute: log.dispute, ruling: log.ruling, txs: log.txHrefs, error: log.error }));
