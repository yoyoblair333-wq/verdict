// Scam Pattern Ledger page (ledger.html): a standalone, shareable view of the
// PatternLedger Intelligent Contract. Read-only: only the owner and the
// relayer may write, so this page never offers a write. Every number on it is
// read live by the visitor's browser over the studionet RPC (get_config,
// list_recent, get_pattern, top_patterns_since, gen_getContractCode,
// getTransaction); the recorded transactions come from evidence.json, which
// scripts/build.mjs builds from docs/live/pattern-ledger-run.json.
// All text goes through h() (text nodes only; lib/dom.js), so nothing read
// from the chain is ever parsed as HTML.
//
// The pure helpers are exported for test/ledger.test.mjs; the page only boots
// in a browser.

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { transactionsStatusNumberToName } from "genlayer-js/types";
import * as C from "./config.js";
import { h } from "./lib/dom.js";
import { classifyError, readTimeoutMs, withTimeout } from "./lib/errors.js";
import { classifyTx, revertReason, voteSummary } from "./lib/finality.js";
import { categoryLabel, flagLabel, sinceIso, submissionLabel, writersLine } from "./lib/ledger.js";
import { codeDigest, sha256Hex } from "./lib/package.js";
import { gh } from "./lib/trust.js";

// ------------------------------------------------------------ pure parts

export const LEDGER_SOURCE = "contracts/pattern_ledger.py";
export const LEDGER_TEST_FILE = "contracts/tests/direct/test_pattern_ledger.py";
export const GUIDE_PATH = "docs/PATTERN_LEDGER.md";
export const STUDY_PATH = "docs/PATTERN_LEDGER_STUDY.md";

/** Lines of the (frozen) contract the page links to; the tests check each still says `has`. */
export const SOURCE_LINES = {
  pii: { line: 179, has: "def _pii_reason" },
  agree: { line: 326, has: "def _reviews_agree" },
  validator: { line: 427, has: "def validator_fn" },
  submit: { line: 453, has: "def submit_pattern" },
};

/** Test classes in contracts/tests/direct/test_pattern_ledger.py, linked from the explainer. */
export const LEDGER_TESTS = [
  { cls: "TestValidator", line: 283, what: "A validator agrees only on an exact match of both answers and the dedup decision; it refuses a leader error, a tampered payload and its own AI failure." },
  { cls: "TestDeterministicGates", line: 148, what: "Bad codes, categories and request keys, and every identifying-data screen case, are refused before any AI is asked." },
  { cls: "TestReviewRejects", line: 191, what: "A summary the review flags as identifying, or as not a coherent scam, is refused." },
  { cls: "TestDedup", line: 221, what: "A repeat adds a sighting; only same-category records are candidates; the answer must name a real candidate." },
  { cls: "TestIdempotency", line: 412, what: "A retried request key replays without another review and never double-counts." },
  { cls: "TestAccessControl", line: 453, what: "Only the relayer or the owner can write; admin calls are owner-only." },
];

/** Count `def test` lines in each class of the test file's text (so the page's counts can be checked). */
export function countTests(text, refs = LEDGER_TESTS) {
  const lines = String(text).split("\n");
  const starts = [];
  lines.forEach((l, i) => {
    const m = /^class (\w+)/.exec(l);
    if (m) starts.push({ cls: m[1], line: i + 1 });
  });
  return refs.map((r) => {
    const i = starts.findIndex((s) => s.cls === r.cls);
    if (i < 0) return { ...r, count: 0, found: false };
    const end = i + 1 < starts.length ? starts[i + 1].line - 1 : lines.length;
    const count = lines.slice(starts[i].line, end).filter((l) => /^\s+def test_/.test(l)).length;
    return { ...r, count, found: starts[i].line === r.line };
  });
}

/** genlayer-js decodes calldata maps as Map and ints as bigint; make plain JSON. */
export function plain(v) {
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "bigint") return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

const int = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : 0);
const str = (x) => (typeof x === "string" ? x : x === null || x === undefined ? "" : String(x));

/** One chain pattern row, every field forced to the expected type. */
export function cleanPattern(p) {
  if (!p || typeof p !== "object") return null;
  return {
    id: int(p.id),
    category: str(p.category),
    flag_codes: Array.isArray(p.flag_codes) ? p.flag_codes.map(str) : [],
    summary: str(p.summary),
    sightings: int(p.sightings),
    sightings_since: int(p.sightings_since),
    first_seen: str(p.first_seen),
    last_seen: str(p.last_seen),
    history: Array.isArray(p.history) ? p.history.map((x) => ({ at: str(x?.at), kind: str(x?.kind), flag_codes: Array.isArray(x?.flag_codes) ? x.flag_codes.map(str) : [] })) : null,
  };
}

/**
 * Bar rows for the most-sighted chart, from top_patterns_since rows (already
 * ranked by the contract). Width is relative to the largest count in view.
 */
export function barRows(rows, max = 10) {
  const clean = (rows ?? []).map(cleanPattern).filter((r) => r && r.id > 0).slice(0, max);
  const top = Math.max(1, ...clean.map((r) => r.sightings_since));
  return clean.map((r) => ({
    id: r.id,
    label: `#${r.id} · ${categoryLabel(r.category)}`,
    summary: r.summary,
    count: r.sightings_since,
    total: r.sightings,
    pct: Math.round((r.sightings_since / top) * 100),
  }));
}

/** Plain sentence a screen reader hears for the chart. */
export function chartSummary(bars, days) {
  if (!bars.length) return `No sightings in the last ${days} days.`;
  const total = bars.reduce((n, b) => n + b.count, 0);
  const lead = bars[0];
  return `${bars.length} ${bars.length === 1 ? "pattern" : "patterns"} sighted ${total} ${total === 1 ? "time" : "times"} in the last ${days} days; the most sighted is pattern ${lead.label} with ${lead.count}.`;
}

/** "1 new, 3 repeat sightings" from a record's kept history. */
export function historyLine(history) {
  if (!Array.isArray(history)) return "";
  const n = history.filter((x) => x.kind === "new").length;
  const s = history.filter((x) => x.kind === "sighting").length;
  return `${n} new, ${s} repeat ${s === 1 ? "sighting" : "sightings"} in the kept history`;
}

/** Compare a canonical code digest with the pinned one. */
export function pinState(digest, pinned) {
  const hex = /^[0-9a-f]{64}$/;
  if (!hex.test(str(digest)) || !hex.test(str(pinned))) return "unchecked";
  return digest === pinned ? "match" : "mismatch";
}

/**
 * Did the live transaction end the way the run recorded? `expected` is the
 * recorded final execution (SUCCESS / ERROR). Only a FINALIZED tx is compared.
 */
export function matchesRecord(c, expected) {
  if (!expected || c.chainStatus !== "FINALIZED") return null;
  return c.execution === expected;
}

/** The recorded transactions: deploy first, then each submission. */
export function txPlan(ev, fallbackDeploy) {
  const HASH = /^0x[0-9a-fA-F]{64}$/;
  const l = ev?.ledger;
  const okContract = typeof l?.contract === "string" && l.contract.toLowerCase() === C.LEDGER_ADDRESS.toLowerCase();
  const deploy = okContract && HASH.test(str(l.deployTx)) ? l.deployTx : fallbackDeploy;
  const out = deploy ? [{ kind: "deploy", label: "Deploy (owner wallet)", hash: deploy, expected: "SUCCESS" }] : [];
  if (okContract) {
    for (const s of l.submissions ?? []) {
      if (!HASH.test(str(s?.tx))) continue;
      out.push({ kind: "submit", label: submissionLabel(s), intent: str(s.intent), hash: s.tx, expected: str(s.expected) || null, revert: str(s.revert) });
    }
  }
  return out;
}

/** The consensus study's synthetic submissions to this contract (docs/PATTERN_LEDGER_STUDY.md). */
export function studyPlan(ev) {
  const HASH = /^0x[0-9a-fA-F]{64}$/;
  const l = ev?.ledger;
  if (typeof l?.contract !== "string" || l.contract.toLowerCase() !== C.LEDGER_ADDRESS.toLowerCase()) return [];
  const out = [];
  for (const r of l.study?.records ?? []) {
    if (!HASH.test(str(r?.tx))) continue;
    const exp = str(r.expect), got = str(r.outcome);
    const intent = [exp ? `expected ${exp}` : "", got ? `recorded ${got}` : ""].filter(Boolean).join("; ");
    out.push({ kind: "study", label: str(r.label), intent, hash: r.tx, expected: str(r.expected) || null, revert: str(r.revert) });
  }
  return out;
}

// --------------------------------------------------------------- browser

const $ = (id) => document.getElementById(id);
const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso ?? "") : d.toISOString().replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, " UTC");
};
const ext = (href, ...kids) => h("a", { href, target: "_blank", rel: "noopener" }, ...kids);
let read = null;

async function view(functionName, args = []) {
  return plain(await withTimeout(read.readContract({ address: C.LEDGER_ADDRESS, functionName, args }), readTimeoutMs(), "Reading the ledger"));
}

function errBox(info, onRetry, extra = "") {
  return h("div", { class: "errbox", role: "alert", "data-kind": info.kind },
    h("p", {}, info.message, extra ? ` ${extra}` : ""),
    onRetry ? h("button", { class: "btn2 small", type: "button", onclick: onRetry }, info.retry) : null,
  );
}

function setSource(state, text, title = "") {
  const el = $("ledgersrc");
  el.dataset.state = state;
  el.textContent = text;
  el.title = title;
}

function renderTested() {
  const box = $("tested-body");
  if (!box) return;
  box.replaceChildren(h("details", { class: "testedby" },
    h("summary", {}, "Proven by the contract tests (links)"),
    h("ul", { class: "tests" }, LEDGER_TESTS.map((r) => h("li", { "data-test-class": r.cls },
      ext(gh(LEDGER_TEST_FILE, r.line), h("code", {}, `${r.cls}`)),
      h("span", { class: "w" }, r.what),
    ))),
  ));
}

function renderPin(code) {
  return codeDigest(code).then(async (digest) => {
    const state = pinState(digest, C.LEDGER_CODE_DIGEST);
    const raw = await sha256Hex(code);
    $("pin").replaceChildren(h("div", { class: `verdictbox ${state === "match" ? "match" : "differ"}`, "data-code": state },
      h("span", { class: "big" }, state === "match" ? "Match" : state === "mismatch" ? "Mismatch" : "Unchecked"),
      h("span", {}, state === "match"
        ? `The contract at this address runs ${LEDGER_SOURCE}: the same canonical code digest (line endings normalised).`
        : `The deployed code does not hash to the pinned digest of ${LEDGER_SOURCE}. Don't trust the rest of this page until it matches.`),
      h("code", { class: "dig", "data-digest": "chain" }, digest),
      raw !== digest ? h("small", {}, `raw bytes: ${raw}`) : null,
    ));
  });
}

function renderConfig(cfg) {
  const facts = $("ledgerfacts");
  facts.replaceChildren();
  const add = (dt, ...dd) => facts.append(h("dt", {}, dt), h("dd", {}, ...dd));
  add("Address", ext(C.EXPLORER_ADDRESS(C.LEDGER_ADDRESS), h("code", {}, C.LEDGER_ADDRESS)));
  add("Schema", h("code", {}, str(cfg.schema)));
  add("Patterns", h("b", { "data-fact": "patterns" }, String(Math.max(0, int(cfg.next_id) - 1))), cfg.paused === true ? h("span", { class: "pin-bad" }, " · PAUSED: new reports are refused") : " · accepting reports");
  add("Who can write", writersLine(cfg, C.OWNER_ADDRESS, C.RELAYER_ADDRESS));
  add("Owner", h("code", {}, str(cfg.owner)));
  add("Relayer", h("code", {}, str(cfg.relayer)));
  add("Dedup", `each new report is compared with up to ${int(cfg.dedup_candidates)} stored records in its category`);
  add("Limits", `summary at most ${int(cfg.max_summary_chars)} characters · newest ${int(cfg.history_cap)} sightings kept per record`);
  const cats = Array.isArray(cfg.categories) ? cfg.categories : [];
  const codes = Array.isArray(cfg.flag_codes) ? cfg.flag_codes : [];
  $("vocab").replaceChildren(h("details", { class: "vocab" },
    h("summary", {}, `The fixed vocabulary: ${cats.length} categories, ${codes.length} warning-sign codes`),
    h("p", { class: "vh" }, "Categories"),
    h("div", { class: "chips" }, cats.map((c) => h("span", { class: "chip", title: str(c) }, categoryLabel(c)))),
    h("p", { class: "vh" }, "Warning-sign codes"),
    h("div", { class: "chips" }, codes.map((c) => h("span", { class: "chip", title: str(c) }, flagLabel(c)))),
  ));
}

function patternCard(p) {
  return h("article", { class: "pattern", "data-pattern-id": p.id },
    h("p", { class: "rubric" }, h("b", {}, categoryLabel(p.category)), ` · pattern #${p.id} · first seen ${fmtTime(p.first_seen)}`),
    h("p", { class: "reason" }, `“${p.summary}”`),
    h("div", { class: "chips" }, p.flag_codes.map((f) => h("span", { class: "chip" }, flagLabel(f)))),
    h("p", { class: "sightings" }, h("b", {}, String(p.sightings)), p.sightings === 1 ? " sighting" : " sightings", ` · last seen ${fmtTime(p.last_seen)}`),
    p.history ? h("details", { class: "hist" },
      h("summary", {}, historyLine(p.history)),
      h("ol", { class: "ladder" }, [...p.history].reverse().map((x) => h("li", {},
        h("b", {}, x.kind === "new" ? "Stored as new" : "Repeat sighting"), ` · ${fmtTime(x.at)}`,
        h("span", { class: "r" }, x.flag_codes.map(flagLabel).join(", ")),
      ))),
    ) : null,
  );
}

let winDays = 30;
async function renderChart() {
  const box = $("chart");
  const kind = $("topkind");
  box.setAttribute("aria-busy", "true");
  try {
    const rows = await view("top_patterns_since", [sinceIso(new Date(), winDays), 10]);
    const bars = barRows(rows);
    const caption = chartSummary(bars, winDays);
    kind.dataset.kind = "live";
    kind.textContent = "Live";
    box.replaceChildren(h("figure", { class: "bars", "data-bars": bars.length },
      h("figcaption", {}, caption),
      bars.length ? h("ol", { class: "barlist" }, bars.map((b) => h("li", { "data-pattern-id": b.id },
        h("span", { class: "bl" }, b.label, h("small", {}, b.summary)),
        h("span", { class: "bt", "aria-hidden": "true" }, h("span", { class: "bf", style: `width:${b.pct}%` })),
        h("span", { class: "bn" }, h("b", {}, String(b.count)), h("small", {}, ` in window · ${b.total} all time`)),
      ))) : null,
    ));
  } catch (e) {
    kind.dataset.kind = "unchecked";
    kind.textContent = "Could not read";
    box.replaceChildren(errBox(classifyError(e), () => renderChart()));
  } finally {
    box.removeAttribute("aria-busy");
  }
}

async function renderLedger() {
  setSource("loading", "Connecting…");
  $("ledgerrefresh").disabled = true;
  const list = $("patterns");
  try {
    const [cfg, recent, code] = await Promise.all([
      view("get_config"),
      view("list_recent", [10]),
      withTimeout(read.getContractCode(C.LEDGER_ADDRESS), readTimeoutMs(), "Reading the ledger code"),
    ]);
    renderConfig(cfg ?? {});
    await renderPin(code);
    const rows = (recent ?? []).map(cleanPattern).filter((p) => p && p.id > 0);
    // History per record (get_pattern), newest five; a failed read keeps the card without it.
    const full = await Promise.all(rows.map((p, i) => (i < 5 ? view("get_pattern", [p.id]).then(cleanPattern).catch(() => p) : p)));
    list.replaceChildren(...(full.length ? full.map(patternCard) : [h("p", { class: "empty" }, "No patterns recorded yet.")]));
    setSource("live", `Live · read ${new Date().toLocaleTimeString()}`, `Read from ${C.RPC_URL} by this browser`);
  } catch (e) {
    setSource("error", "Network unreachable", e.message);
    $("pin").replaceChildren();
    $("ledgerfacts").replaceChildren(h("dt", {}, "Address"), h("dd", {}, ext(C.EXPLORER_ADDRESS(C.LEDGER_ADDRESS), h("code", {}, C.LEDGER_ADDRESS))));
    list.replaceChildren(errBox(classifyError(e), () => renderAll(), "The recorded transactions below can still be opened in the explorer."));
  } finally {
    $("ledgerrefresh").disabled = false;
  }
}

async function checkTx(t, st) {
  st.className = "st";
  st.textContent = "checking…";
  try {
    const tx = await withTimeout(read.getTransaction({ hash: t.hash }), readTimeoutMs(), "Reading the transaction");
    const c = classifyTx(tx, transactionsStatusNumberToName);
    const votes = voteSummary(tx);
    const why = c.execution === "ERROR" ? revertReason(tx) : "";
    const m = matchesRecord(c, t.expected);
    st.className = `st ${m === false ? "bad" : c.finality === "FINALIZED_SUCCESS" || m === true ? "ok" : ""}`;
    st.dataset.match = m === null ? "" : m ? "1" : "0";
    st.textContent = `${c.chainStatus} · ${c.execution}${votes ? ` · validators ${votes}` : ""}${why ? ` · ${why}` : ""}${m === true ? " · as recorded" : m === false ? " · DIFFERS from the record" : ""}`;
  } catch (e) {
    st.className = "st bad";
    st.textContent = `${classifyError(e).message} Press "Check live" to try again.`;
  }
}

function renderTxs(plan, target = "ledgertxs") {
  $(target).replaceChildren(...plan.map((t) => {
    const st = h("span", { class: "st", role: "status" });
    const li = h("li", { "data-hash": t.hash, "data-kind": t.kind, "data-outcome": t.expected ?? "" },
      h("span", { class: "row" }, h("span", { class: "fn" }, t.kind === "deploy" ? "deploy" : "submit_pattern"), h("span", {}, t.label)),
      t.intent ? h("span", { class: "intent" }, t.kind === "study" ? `Study: ${t.intent}` : `Test intent: ${t.intent}`) : null,
      t.revert ? h("span", { class: "intent" }, "Recorded revert: ", h("code", {}, t.revert)) : null,
      h("code", {}, t.hash),
      h("span", { class: "row" },
        ext(C.EXPLORER_TX(t.hash), "Explorer"),
        h("button", { class: "link", type: "button", "aria-label": `Check ${t.kind === "deploy" ? "the deploy" : t.label} transaction live`, onclick: () => checkTx(t, st) }, "Check live"),
        st,
      ),
    );
    return li;
  }));
}

async function loadEvidence() {
  try {
    const r = await fetch("evidence.json", { cache: "no-cache" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function renderAll() {
  renderLedger();
  renderChart();
}

function boot() {
  read = createClient({ chain: studionet, endpoint: C.RPC_URL });
  $("guide-link").href = gh(GUIDE_PATH);
  $("source-link").href = gh(LEDGER_SOURCE);
  $("src-agree").href = gh(LEDGER_SOURCE, SOURCE_LINES.agree.line);
  $("src-validator").href = gh(LEDGER_SOURCE, SOURCE_LINES.validator.line);
  renderTested();
  for (const el of document.querySelectorAll('input[name="win"]')) {
    el.addEventListener("change", () => {
      winDays = Number(el.value) || 30;
      renderChart();
    });
  }
  $("ledgerrefresh").addEventListener("click", () => renderAll());
  renderTxs(txPlan(null, C.LEDGER_DEPLOY_TX));
  if ($("study-link")) $("study-link").href = gh(STUDY_PATH);
  loadEvidence().then((ev) => {
    renderTxs(txPlan(ev, C.LEDGER_DEPLOY_TX));
    if ($("studytxs")) renderTxs(studyPlan(ev), "studytxs");
  });
  renderAll();
}

if (typeof document !== "undefined" && document.getElementById("ledgertxs")) boot();
