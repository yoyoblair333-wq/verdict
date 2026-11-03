// Settlement Court page (settlement.html): a standalone, shareable, READ-ONLY
// view of VERDICT v2's two new contracts (Milestone 3):
//   SettlementCourt   (contracts/settlement_court.py) - "did they hold up their
//                      end?": per-deliverable kept/broken/disputed labels, a
//                      derived overall ruling, the appeal ladder, and whether an
//                      appeal overturned the first-tier ruling.
//   ReputationLedger  (contracts/reputation_ledger.py) - an OPT-IN, address-only
//                      settlement scorecard, looked up with get_scorecard.
//
// Neither contract is deployed yet (config.SETTLEMENT_COURT_ADDRESS /
// REPUTATION_LEDGER_ADDRESS are ''), so the page degrades to a clear "not yet
// deployed" state and invents no address. When they are deployed it reads them
// live from the visitor's browser over the studionet RPC, exactly as ledger.js
// reads PatternLedger (get_config, list_recent, get_case / get_scorecard), and
// falls back to a plain retryable error when the network is unreachable.
//
// This page is READ-ONLY: only the relayer/owner write to SettlementCourt and
// only a subject may opt itself into ReputationLedger, so the page never offers
// a visitor write. Every on-chain string is put on the page through h() (text
// nodes only; lib/dom.js) and additionally run through the SAME display filter
// the court page uses (lib/package.js localCheck): a case whose redacted text
// still trips the filter is hidden, exactly like app.js hides a JudgeRouter
// case. Nothing read from the chain is ever parsed as HTML.
//
// The pure helpers below are exported for test/settlement.test.mjs; the page
// only boots in a browser.

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { transactionsStatusNumberToName } from "genlayer-js/types";
import * as C from "./config.js";
import { h } from "./lib/dom.js";
import { classifyError, readTimeoutMs, withTimeout } from "./lib/errors.js";
import { localCheck } from "./lib/package.js";
import { gh } from "./lib/trust.js";

// ------------------------------------------------------------ pure parts

export const COURT_SOURCE = "contracts/settlement_court.py";
export const LEDGER_SOURCE = "contracts/reputation_ledger.py";

/** Overall ruling -> display text + a tone the stylesheet colours. */
const RULING = {
  FULFILLED: { text: "Fulfilled", tone: "ok", blurb: "every judged deliverable was kept" },
  PARTIAL: { text: "Partially fulfilled", tone: "warn", blurb: "some kept, some broken" },
  NOT_FULFILLED: { text: "Not fulfilled", tone: "bad", blurb: "nothing judged was kept" },
  UNDECIDED: { text: "Undecided", tone: "muted", blurb: "the account did not clearly establish the outcome" },
};
/** Per-deliverable label -> display text + tone. */
const DELIVERABLE = {
  kept: { text: "Kept", tone: "ok" },
  broken: { text: "Broken", tone: "bad" },
  disputed: { text: "Disputed", tone: "muted" },
};

export function rulingLabel(ruling) {
  return RULING[ruling] ?? { text: String(ruling ?? "Undecided"), tone: "muted", blurb: "" };
}
export function deliverableLabel(label) {
  return DELIVERABLE[label] ?? { text: String(label ?? "disputed"), tone: "muted" };
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
const bool = (x) => x === true;

/** One SettlementCourt get_case / list_recent row, every field forced to type. */
export function cleanCase(c) {
  if (!c || typeof c !== "object") return null;
  const verdicts = Array.isArray(c.verdicts)
    ? c.verdicts.map((v) => ({ index: int(v?.index), label: str(v?.label) }))
    : [];
  return {
    id: int(c.id),
    claimant: str(c.claimant),
    subject: str(c.subject),
    terms: str(c.terms),
    deliverables: Array.isArray(c.deliverables) ? c.deliverables.map(str) : [],
    tier: int(c.tier),
    jurors: int(c.jurors),
    status: str(c.status),
    ruling: str(c.ruling),
    bucket: str(c.bucket),
    verdicts,
    reason: str(c.reason),
    first_ruling: str(c.first_ruling),
    overturned: bool(c.overturned),
    appeals_upheld: int(c.appeals_upheld),
    subject_bridged: bool(c.subject_bridged),
    bridge_recorded: bool(c.bridge_recorded),
    created_at: str(c.created_at),
    updated_at: str(c.updated_at),
    history: Array.isArray(c.history)
      ? c.history.map((x) => ({
          tier: int(x?.tier),
          ruling: str(x?.ruling),
          jurors: int(x?.jurors),
          upheld: bool(x?.upheld),
          at: str(x?.at),
          verdicts: Array.isArray(x?.verdicts) ? x.verdicts.map((v) => ({ index: int(v?.index), label: str(v?.label) })) : [],
        }))
      : [],
  };
}

/**
 * Pair each deliverable with the jury's majority label, by index. The verdicts
 * list is the consensus-anchored per-deliverable majority; a deliverable with
 * no verdict row (e.g. a not-yet-judged case) is shown without a label.
 */
export function deliverableRows(c) {
  const byIndex = new Map((c.verdicts ?? []).map((v) => [v.index, v.label]));
  return (c.deliverables ?? []).map((text, i) => {
    const label = byIndex.has(i) ? byIndex.get(i) : "";
    return { index: i, text, label, display: label ? deliverableLabel(label) : null };
  });
}

/** One plain sentence about the appeal ladder and whether it changed anything. */
export function appealSummary(c) {
  const TIER = { 1: "a 3-juror panel", 2: "a 5-juror panel", 3: "a 7-juror panel" };
  const rounds = (c.history ?? []).length;
  const tierName = TIER[c.tier] ?? `${c.jurors || "?"} jurors`;
  if (rounds <= 1) return `Ruled by ${tierName} (tier ${c.tier || 1}). No appeal.`;
  const parts = [`Appealed to ${tierName} (tier ${c.tier}).`];
  if (c.overturned) parts.push(`The appeal OVERTURNED the first-tier ruling (${rulingLabel(c.first_ruling).text}).`);
  else parts.push("The appeal did not change the first-tier ruling.");
  if (c.appeals_upheld > 0) parts.push(`${c.appeals_upheld} appeal${c.appeals_upheld === 1 ? "" : "s"} upheld the ruling below (a public record that the appeal changed nothing).`);
  return parts.join(" ");
}

// -- display filter (the SAME one the court page uses: lib/package.js) --------
const BIG = 10_000; // length is not a display concern on this page; only content

function flagged(text) {
  if (typeof text !== "string" || text.trim() === "") return null;
  return localCheck(text, "text", BIG);
}
/** Every person- or jury-written string in a settlement case. */
export function caseTexts(c) {
  const out = [c.terms, c.reason, ...(c.deliverables ?? [])];
  for (const x of c.history ?? []) out.push(x?.reason);
  return out;
}
/** null = show the text; otherwise a short note. Mirrors lib/display.js. */
export function hideDecision(c) {
  for (const t of caseTexts(c)) {
    if (flagged(t)) {
      return {
        note: "This case's redacted text tripped the same checks VERDICT runs before submitting. The ruling, per-deliverable labels and appeal history are still shown; the text remains on-chain.",
      };
    }
  }
  return null;
}

// -- reputation scorecard -----------------------------------------------------

/** One ReputationLedger get_scorecard row, every field forced to type. */
export function cleanScorecard(sc) {
  if (!sc || typeof sc !== "object") return null;
  const f = int(sc.fulfilled), p = int(sc.partial), n = int(sc.not_fulfilled), u = int(sc.undecided);
  return {
    address: str(sc.address),
    fulfilled: f, partial: p, not_fulfilled: n, undecided: u,
    appeals_overturned: int(sc.appeals_overturned),
    total_cases: int(sc.total_cases),
    decided_cases: int(sc.decided_cases),
    score: int(sc.score),
    opted_in: bool(sc.opted_in),
    first_seen: str(sc.first_seen),
    last_seen: str(sc.last_seen),
  };
}

/** "72 / 100" — the ledger's 0..100 integer score, clamped for display. */
export function scoreText(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "–";
  return `${Math.max(0, Math.min(100, Math.round(n)))} / 100`;
}

/**
 * What the scorecard says, in one honest sentence, for a screen reader and the
 * empty/opt-out cases. `opted_in=false` and no cases => never recorded.
 */
export function scorecardSummary(sc) {
  if (!sc) return "No scorecard.";
  if (sc.total_cases === 0) {
    return sc.opted_in
      ? "This address opted in but has no settled cases on record yet."
      : "This address has not opted in to the reputation ledger, and has no record.";
  }
  const decided = sc.decided_cases;
  const base = `${sc.total_cases} settled case${sc.total_cases === 1 ? "" : "s"} on record`;
  const sc_ = decided > 0 ? `; score ${scoreText(sc.score)} over ${decided} decided` : "; no decided cases yet";
  const over = sc.appeals_overturned > 0 ? `; ${sc.appeals_overturned} overturned on appeal` : "";
  const opt = sc.opted_in ? "" : " (opted out; past counts shown until erased)";
  return `${base}${sc_}${over}${opt}.`;
}

/** The six count tiles for the scorecard, in display order. */
export function scorecardTiles(sc) {
  return [
    { key: "fulfilled", label: "Fulfilled", value: sc.fulfilled, tone: "ok" },
    { key: "partial", label: "Partial", value: sc.partial, tone: "warn" },
    { key: "not_fulfilled", label: "Not fulfilled", value: sc.not_fulfilled, tone: "bad" },
    { key: "undecided", label: "Undecided", value: sc.undecided, tone: "muted" },
    { key: "decided", label: "Decided", value: sc.decided_cases, tone: "" },
    { key: "overturned", label: "Overturned on appeal", value: sc.appeals_overturned, tone: "" },
  ];
}

/** "" if `raw` is a 0x + 40-hex address, else a plain-language reason. */
export function addressError(raw) {
  const v = String(raw ?? "").trim();
  if (v === "") return "Paste a wallet address to look up.";
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return "That is not a wallet address (expected 0x followed by 40 hex characters).";
  return "";
}

// --------------------------------------------------------------- browser

const $ = (id) => document.getElementById(id);
const NUM_TO_NAME = transactionsStatusNumberToName;
const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso ?? "") : d.toISOString().replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, " UTC");
};
const ext = (href, ...kids) => h("a", { href, target: "_blank", rel: "noopener" }, ...kids);
const shortAddr = (a) => (typeof a === "string" && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : String(a ?? ""));
let read = null;

async function courtView(functionName, args = []) {
  return plain(await withTimeout(read.readContract({ address: C.SETTLEMENT_COURT_ADDRESS, functionName, args }), readTimeoutMs(), "Reading the court"));
}
async function ledgerView(functionName, args = []) {
  return plain(await withTimeout(read.readContract({ address: C.REPUTATION_LEDGER_ADDRESS, functionName, args }), readTimeoutMs(), "Reading the ledger"));
}

function errBox(info, onRetry, extra = "") {
  return h("div", { class: "errbox", role: "alert", "data-kind": info.kind },
    h("p", {}, info.message, extra ? ` ${extra}` : ""),
    onRetry ? h("button", { class: "btn2 small", type: "button", onclick: onRetry }, info.retry) : null,
  );
}

/** The clear "not deployed yet" box used wherever an address is ''. */
function notDeployed(what, source) {
  return h("div", { class: "verdictbox differ", "data-state": "not-deployed" },
    h("span", { class: "big" }, "Not yet deployed"),
    h("span", {}, `${what} is not deployed on studionet yet, so there is nothing to read. Its address in web/src/config.js is empty; when it is deployed this page reads it live from your browser. Until then the explainer below describes exactly what it will show.`),
    h("span", { class: "meta" }, "Source: ", ext(gh(source), h("code", {}, source))),
  );
}

function setSource(state, text, title = "") {
  const el = $("courtsrc");
  if (!el) return;
  el.dataset.state = state;
  el.textContent = text;
  el.title = title;
}

// ---- Settlement Court ----

function deliverableList(c) {
  const rows = deliverableRows(c);
  if (!rows.length) return h("p", { class: "empty" }, "No deliverables listed.");
  return h("ol", { class: "deliverables" }, rows.map((r) =>
    h("li", { "data-index": r.index, "data-label": r.label || "" },
      h("span", { class: "dtext" }, r.text),
      r.display ? h("span", { class: `dlabel tone-${r.display.tone}` }, r.display.text) : h("span", { class: "dlabel tone-muted" }, "—"),
    ),
  ));
}

function caseCard(raw) {
  const c = cleanCase(raw);
  if (!c) return h("p", { class: "empty" }, "Unreadable case.");
  const hide = hideDecision(c);
  const rl = rulingLabel(c.ruling);
  const body = h("div", { class: "casebody" });
  // Derived overall ruling (the deterministic consensus anchor, not the LLM text).
  body.append(h("div", { class: `verdictline` },
    h("span", { class: `ruling tone-${rl.tone}` }, rl.text),
    h("span", { class: "who" }, c.status === "final" ? "Final" : "Open to appeal", h("small", {}, `${c.jurors} jurors · tier ${c.tier}`)),
  ));
  if (c.overturned) body.append(h("p", { class: "overturned" }, "Overturned on appeal"));
  // The deliverables with their per-deliverable labels.
  body.append(h("p", { class: "dhead" }, "Deliverables judged"), deliverableList(c));
  // The redacted terms + the aligned juror's one-sentence reason, both filtered.
  if (hide) {
    body.append(h("p", { class: "hiddennote", "data-hidden": "filter" }, h("b", {}, "Text hidden by VERDICT's display filter"), h("br"), hide.note));
  } else {
    if (c.reason) body.append(h("p", { class: "reason" }, `“${c.reason}”`));
    body.append(h("details", { class: "terms" }, h("summary", {}, "The redacted agreement, as published"), h("p", { class: "quote" }, c.terms)));
  }
  // Appeal history / tier / upheld counts.
  body.append(h("p", { class: "appeal" }, appealSummary(c)));
  if ((c.history ?? []).length > 1) {
    body.append(h("ol", { class: "ladder", "aria-label": "Appeal history" },
      c.history.map((x, i) => h("li", { class: i === c.history.length - 1 ? "cur" : "" },
        h("b", {}, `Tier ${x.tier} · ${x.jurors} jurors · ${rulingLabel(x.ruling).text}`),
        h("span", { class: "r" }, `${x.upheld ? "Upheld the ruling below" : i === 0 ? "First ruling" : "Changed the ruling"} · ${fmtTime(x.at)}`),
      )),
    ));
  }
  // Subject + reputation-bridge status.
  body.append(h("div", { class: "meta" },
    h("span", {}, "Claimant ", h("code", {}, shortAddr(c.claimant))),
    c.subject ? h("span", {}, "Subject ", h("code", {}, shortAddr(c.subject)), c.subject_bridged ? (c.bridge_recorded ? " · bridged to the reputation ledger" : " · bridge attempted (subject had not opted in)") : (c.status === "final" ? " · bridgeable" : "")) : h("span", {}, "No subject (advisory-only; never bridged)"),
  ));
  return h("article", { class: "case", "data-case-id": c.id, "data-ruling": c.ruling, "data-overturned": String(c.overturned) },
    h("div", { class: "casehead" }, h("span", { class: "no" }, `Case #${c.id}`), h("span", { class: "chips" },
      h("span", { class: `chip ${c.status === "final" ? "final" : ""}` }, c.status),
      c.overturned ? h("span", { class: "chip" }, "overturned") : null,
      c.appeals_upheld > 0 ? h("span", { class: "chip" }, `${c.appeals_upheld} upheld`) : null,
    )),
    body,
  );
}

function renderCourtConfig(cfg) {
  const facts = $("courtfacts");
  if (!facts) return;
  facts.replaceChildren();
  const add = (dt, ...dd) => facts.append(h("dt", {}, dt), h("dd", {}, ...dd));
  add("Address", ext(C.EXPLORER_ADDRESS(C.SETTLEMENT_COURT_ADDRESS), h("code", {}, C.SETTLEMENT_COURT_ADDRESS)));
  add("Schema", h("code", {}, str(cfg.schema)));
  add("Cases", h("b", { "data-fact": "cases" }, String(Math.max(0, int(cfg.next_id) - 1))), cfg.paused === true ? h("span", { class: "pin-bad" }, " · PAUSED") : " · open");
  add("Panels", Object.entries(cfg.tier_jurors ?? {}).map(([t, n]) => `tier ${t}: ${n} jurors`).join(" · "));
  add("Owner", h("code", {}, str(cfg.owner)));
  add("Relayer", h("code", {}, str(cfg.relayer)));
  add("Rulings", Array.isArray(cfg.labels) ? cfg.labels.map((l) => rulingLabel(l).text).join(" · ") : "");
}

async function renderCourt() {
  const list = $("cases");
  if (!list) return;
  if (!C.SETTLEMENT_COURT_ADDRESS) {
    setSource("not-deployed", "Not deployed");
    $("courtfacts")?.replaceChildren();
    $("court-notdeployed")?.replaceChildren(notDeployed("SettlementCourt", COURT_SOURCE));
    list.replaceChildren();
    $("courtrefresh") && ($("courtrefresh").disabled = true);
    return;
  }
  setSource("loading", "Reading the network…");
  if ($("courtrefresh")) $("courtrefresh").disabled = true;
  try {
    const [cfg, recent] = await Promise.all([courtView("get_config"), courtView("list_recent", [10])]);
    renderCourtConfig(cfg ?? {});
    const rows = (recent ?? []);
    list.replaceChildren(...(rows.length ? rows.map(caseCard) : [h("p", { class: "empty" }, "No settlement cases yet.")]));
    setSource("live", `Live · read ${new Date().toLocaleTimeString()}`, `Read from ${C.RPC_URL} by this browser`);
  } catch (e) {
    setSource("error", "Network unreachable", e.message);
    $("courtfacts")?.replaceChildren(h("dt", {}, "Address"), h("dd", {}, ext(C.EXPLORER_ADDRESS(C.SETTLEMENT_COURT_ADDRESS), h("code", {}, C.SETTLEMENT_COURT_ADDRESS))));
    list.replaceChildren(errBox(classifyError(e), () => renderCourt(), "The explainer above still describes what this court shows."));
  } finally {
    if ($("courtrefresh")) $("courtrefresh").disabled = false;
  }
}

// ---- Reputation lookup ----

function tile(t) {
  return h("div", { class: `rtile tone-${t.tone}`, "data-key": t.key },
    h("b", {}, String(t.value)),
    h("span", {}, t.label),
  );
}

function renderScorecard(raw) {
  const box = $("rep-result");
  const sc = cleanScorecard(raw);
  if (!sc) { box.replaceChildren(h("p", { class: "empty" }, "No scorecard.")); return; }
  const card = h("article", { class: "scorecard", "data-opted-in": String(sc.opted_in), "data-address": sc.address },
    h("div", { class: "casehead" },
      h("span", { class: "no" }, h("code", {}, shortAddr(sc.address))),
      h("span", { class: "chips" }, h("span", { class: `chip ${sc.opted_in ? "final" : ""}` }, sc.opted_in ? "opted in" : "not opted in")),
    ),
    h("div", { class: "casebody" },
      h("div", { class: "scoreline" },
        h("span", { class: "scorebig" }, sc.decided_cases > 0 ? scoreText(sc.score) : "–"),
        h("span", { class: "scorelbl" }, "settlement score", h("small", {}, "share of decided cases kept or partly kept")),
      ),
      h("p", { class: "repsum" }, scorecardSummary(sc)),
      h("div", { class: "rtiles" }, scorecardTiles(sc).map(tile)),
      sc.first_seen ? h("p", { class: "meta" }, h("span", {}, `First seen ${fmtTime(sc.first_seen)} · last seen ${fmtTime(sc.last_seen)}`)) : null,
    ),
  );
  box.replaceChildren(card);
}

async function lookupReputation() {
  const input = $("rep-addr");
  const errEl = $("rep-err");
  const box = $("rep-result");
  errEl.textContent = "";
  if (!C.REPUTATION_LEDGER_ADDRESS) { box.replaceChildren(notDeployed("ReputationLedger", LEDGER_SOURCE)); return; }
  const bad = addressError(input.value);
  if (bad) { errEl.textContent = bad; input.setAttribute("aria-invalid", "true"); input.focus(); return; }
  input.setAttribute("aria-invalid", "false");
  const addr = input.value.trim();
  box.replaceChildren(h("p", { class: "empty" }, `Reading the scorecard for ${shortAddr(addr)}…`));
  try {
    renderScorecard(await ledgerView("get_scorecard", [addr]));
  } catch (e) {
    box.replaceChildren(errBox(classifyError(e), () => lookupReputation()));
  }
}

function initReputation() {
  const form = $("rep-form");
  if (!form) return;
  if (!C.REPUTATION_LEDGER_ADDRESS) {
    $("rep-notdeployed")?.replaceChildren(notDeployed("ReputationLedger", LEDGER_SOURCE));
    $("rep-addr") && ($("rep-addr").disabled = true);
    $("rep-go") && ($("rep-go").disabled = true);
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); lookupReputation(); });
}

function boot() {
  read = createClient({ chain: studionet, endpoint: C.RPC_URL });
  if ($("court-source-link")) $("court-source-link").href = gh(COURT_SOURCE);
  if ($("ledger-source-link")) $("ledger-source-link").href = gh(LEDGER_SOURCE);
  $("courtrefresh")?.addEventListener("click", () => renderCourt());
  initReputation();
  renderCourt();
}

if (typeof document !== "undefined" && document.getElementById("settlement-main")) boot();
