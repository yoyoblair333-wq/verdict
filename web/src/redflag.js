// Red Flag Court on-chain preview (Milestone 1). Loaded only when the feature
// flag is on: `?redflag=1` in the URL, or REDFLAG_ENABLED in config.js.
// Talks to contracts/red_flag_court.py straight from the browser with the
// page's own testnet burner. The pasted message is redacted HERE, the visitor
// sees the exact text that will be published, and only that text is sent.

import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { transactionsStatusNumberToName } from "genlayer-js/types";
import * as C from "./config.js";
import { classifyTx, revertReason, voteSummary } from "./lib/finality.js";
import { classifyError, readTimeoutMs, withTimeout } from "./lib/errors.js";
import { categoryLabel, flagLabel } from "./lib/ledger.js";
import { redactForChain } from "./lib/chainredact.js";
import { h } from "./lib/dom.js";

const $ = (id) => document.getElementById(id);
const NUM_TO_NAME = transactionsStatusNumberToName;
const TIER_NAME = { 1: "First look (1 analyst)", 2: "Appeal panel (3 analysts)", 3: "Final panel (5 analysts)" };
const LABEL_TEXT = { SCAM: "Scam", SUS: "Suspicious", LEGIT: "Looks legit" };
const SAMPLE = "URGENT: your parcel is on hold. Pay the 1.99 redelivery fee at parcel-help.co/pay within 1 hour or it goes back to the sender.";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s) => (s && s.length > 22 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s ?? "");

let read;
let write;
let account;
let busy = false;
let lastId = 0;
let burnerPersisted = true;
// A sent transaction the network has not finalized yet. "Check again" re-tracks
// THIS hash instead of sending a second transaction.
let pending = null;
const MAX_CHARS = 600;
const STAGES = ["submitted", "judging", "agreeing", "final"];

function setRail(stage, bad = false) {
  const rail = $("rf-rail");
  if (!rail) return;
  rail.hidden = false;
  const idx = STAGES.indexOf(stage);
  for (const li of rail.children) {
    const i = STAGES.indexOf(li.dataset.k);
    li.className = i < idx || (i === idx && stage === "final" && !bad) ? "done" : i === idx ? (bad ? "bad" : "now") : "";
  }
}

/** Map a tracked status to a rail stage. */
function stageOf(c) {
  if (c.finality === "FINALIZED_SUCCESS") return "final";
  if (c.chainStatus === "ACCEPTED" || c.chainStatus === "FINALIZED") return "agreeing";
  if (["PROPOSING", "COMMITTING", "REVEALING", "PENDING"].includes(c.chainStatus)) return "judging";
  return "submitted";
}

/** Re-draw the visitor's own result once nothing is in flight (shows its actions). */
async function redrawResult() {
  if (!lastId) return;
  try {
    $("rf-result").replaceChildren(checkCard(await view("get_check", [lastId]), true));
  } catch { /* the recent list shows the error */ }
}

function plain(v) {
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "bigint") return Number(v);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}
const view = async (fn, args = []) => plain(await withTimeout(read.readContract({ address: C.REDFLAG_ADDRESS, functionName: fn, args }), readTimeoutMs(), "Reading the court"));

/** The page's shared testnet burner (same storage format as app.js); made here if missing. */
function burnerAccount() {
  try {
    const b = JSON.parse(localStorage.getItem(C.BURNER_KEY) ?? "null");
    if (b && /^0x[0-9a-fA-F]{64}$/.test(b.privateKey)) return createAccount(b.privateKey);
  } catch { /* storage unavailable */ }
  const fresh = { privateKey: generatePrivateKey(), label: "testnet only, no value", network: C.NETWORK, createdAt: new Date().toISOString() };
  try {
    localStorage.setItem(C.BURNER_KEY, JSON.stringify(fresh));
  } catch {
    burnerPersisted = false; // works for this tab only
  }
  return createAccount(fresh.privateKey);
}

function errBox(info, onRetry) {
  return h("div", { class: "errbox", role: "alert", "data-kind": info.kind }, h("p", {}, info.message),
    onRetry ? h("button", { class: "btn2 small", type: "button", onclick: onRetry }, info.retry) : null);
}

async function track(hash, onStatus) {
  const end = Date.now() + C.TX_TIMEOUT_MS;
  let last = "";
  for (;;) {
    let tx = null;
    let c = { finality: "PENDING", chainStatus: "NOT_FOUND", execution: "UNKNOWN" };
    try {
      tx = await withTimeout(read.getTransaction({ hash }), readTimeoutMs(), "Reading the transaction");
      c = classifyTx(tx, NUM_TO_NAME);
    } catch { /* retry */ }
    const k = `${c.chainStatus}/${c.execution}`;
    if (k !== last) { last = k; onStatus?.(c); }
    if (c.finality === "FINALIZED_SUCCESS" || c.finality === "FINALIZED_ERROR") return { c, tx };
    if (Date.now() > end) return { c: { ...c, finality: "STALE" }, tx };
    await sleep(C.POLL_MS);
  }
}

function status(msg) {
  $("rf-status").textContent = msg;
}

async function waitFor(hash, what) {
  const { c, tx } = await track(hash, (s) => {
    setRail(stageOf(s));
    status(`${what}: ${s.chainStatus.toLowerCase()}…`);
  });
  if (c.finality === "STALE") pending = { hash, what };
  else pending = null;
  if (c.finality !== "FINALIZED_SUCCESS") {
    setRail(stageOf(c), c.finality !== "STALE");
    const e = new Error(`${what}: ${c.chainStatus}`);
    e.outcome = { finality: c.finality, execution: c.execution, reason: c.execution === "ERROR" ? revertReason(tx) : "" };
    throw e;
  }
  const v = voteSummary(tx);
  setRail("final");
  status(`${what}: final${v ? ` · validators ${v}` : ""}`);
  return hash;
}

async function sendAndWait(fn, args, what) {
  setRail("submitted");
  const hash = await write.writeContract({ address: C.REDFLAG_ADDRESS, functionName: fn, args, value: 0n });
  $("rf-log").append(h("li", {}, `${what}: sent `, h("a", { href: C.EXPLORER_TX(hash), target: "_blank", rel: "noopener" }, h("code", {}, short(hash)))));
  return waitFor(hash, what);
}

/** Re-check a stale transaction without sending a new one. */
async function recheck(after) {
  if (busy || !pending) return;
  busy = true;
  $("rf-err").replaceChildren();
  const p = pending;
  try {
    await waitFor(p.hash, p.what);
    await after?.();
  } catch (e) {
    $("rf-err").replaceChildren(errBox(classifyError(e, e.outcome ?? {}), retryFor(e, () => recheck(after), after)));
  } finally {
    busy = false;
    $("rf-send").disabled = false;
    await redrawResult();
    renderRecent();
  }
}

/** Stale -> re-track the same hash; anything else -> the caller's retry. */
function retryFor(e, onRetry, after) {
  return e.outcome?.finality === "STALE" ? () => recheck(after) : onRetry;
}

function checkCard(c, mine) {
  const card = h("article", { class: `case rfcheck`, "data-check-id": c.id, "data-label": c.label },
    h("div", { class: "casehead" }, h("span", { class: "no" }, `Check #${c.id}`), h("span", { class: "chip" }, TIER_NAME[c.tier] ?? `Tier ${c.tier}`)),
    h("div", { class: "rfbody" },
      h("p", { class: `rflabel rf-${c.label}` }, LABEL_TEXT[c.label] ?? c.label),
      h("p", { class: "meta" }, `Analyst votes: ${(c.votes ?? []).map((v) => LABEL_TEXT[v] ?? v).join(" · ")}. GenLayer validators re-ran the panel and agreed on this label.`),
      c.reason ? h("p", { class: "reason" }, c.reason) : null,
      (c.flag_codes ?? []).length ? h("div", { class: "chips" }, c.flag_codes.map((f) => h("span", { class: "chip" }, flagLabel(f)))) : null,
      h("details", {}, h("summary", {}, "The redacted message, as published"), h("p", { class: "quote" }, c.text)),
      c.pattern_summary ? h("p", { class: "meta" }, `Pattern (${categoryLabel(c.category)}): ${c.pattern_summary}`) : null,
      c.shared_pattern_id ? h("p", { class: "meta" }, `Shared to the Scam Pattern Ledger as pattern #${c.shared_pattern_id}.`) : c.share_opt_in ? h("p", { class: "meta" }, "Opted in to help warn others: waiting for the VERDICT relayer to submit the pattern to the ledger.") : null,
    ));
  if (mine && !busy) {
    const acts = h("div", { class: "rfacts" });
    if (c.status === "judged" && c.tier < 3) {
      acts.append(h("button", { class: "cta", type: "button", onclick: () => act("appeal", [c.id], `Appeal to ${TIER_NAME[c.tier + 1]}`, c.id) }, `Not sure? Appeal to ${c.tier === 1 ? "3" : "5"} analysts`));
    }
    if (c.label !== "LEGIT" && c.pattern_summary && !c.share_opt_in) {
      acts.append(h("button", { class: "btn2 small", type: "button", onclick: () => act("set_share", [c.id, true], "Opt in to warn others", c.id) }, "Help warn others (share the abstract pattern)"));
    }
    card.append(acts);
  }
  return card;
}

async function act(fn, args, what, id) {
  if (busy) return;
  busy = true;
  $("rf-err").replaceChildren();
  try {
    await sendAndWait(fn, args, what);
    lastId = id;
  } catch (e) {
    $("rf-err").replaceChildren(errBox(classifyError(e, e.outcome ?? {}), retryFor(e, () => act(fn, args, what, id), async () => { lastId = id; })));
  } finally {
    busy = false;
    await redrawResult();
    renderRecent();
  }
}

function updatePreview() {
  const r = redactForChain($("rf-text").value);
  $("rf-preview").textContent = r.text || "(nothing yet)";
  $("rf-removed").textContent = r.text ? `${r.removed} detail${r.removed === 1 ? "" : "s"} removed${r.warning ? `. ${r.warning}` : ""}` : "";
  const bad = r.issue ? `This text would still be refused (${r.issue}). Edit it and remove the detail by hand.` : "";
  $("rf-issue").textContent = bad;
  const n = [...r.text].length;
  const cnt = $("rf-count");
  if (cnt) {
    cnt.textContent = `${n} / ${MAX_CHARS} characters after redaction`;
    cnt.dataset.over = String(n > MAX_CHARS);
  }
  return r;
}

async function onSend(ev) {
  ev.preventDefault();
  if (busy) return;
  $("rf-err").replaceChildren();
  const r = updatePreview();
  const formErr = $("rf-formerr");
  formErr.textContent = "";
  if (!$("rf-consent").checked) return (formErr.textContent = "Please tick the publishing consent box.");
  if (!$("rf-adult").checked) return (formErr.textContent = "18+ only.");
  if ([...r.text].length < 10) return (formErr.textContent = "Paste a longer message (at least 10 characters).");
  if ([...r.text].length > MAX_CHARS) return (formErr.textContent = `Too long: ${MAX_CHARS} characters at most after redaction.`);
  if (r.issue) return (formErr.textContent = $("rf-issue").textContent);
  busy = true;
  $("rf-send").disabled = true;
  $("rf-log").replaceChildren();
  const requestKey = `web_${crypto.getRandomValues(new Uint8Array(12)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")}`;
  const lookup = async () => {
    const found = await view("get_check_by_request_key", [account.address, requestKey]);
    if (!found.check_id) throw new Error("the new check is not visible yet; try again in a minute");
    lastId = found.check_id;
  };
  try {
    await sendAndWait("open_check", [r.text, requestKey, true, true], "Ask the court");
    await lookup();
  } catch (e) {
    $("rf-err").replaceChildren(errBox(classifyError(e, e.outcome ?? {}), retryFor(e, () => $("rf-form").requestSubmit(), lookup)));
  } finally {
    busy = false;
    $("rf-send").disabled = false;
    await redrawResult();
    renderRecent();
  }
}

async function renderRecent() {
  const box = $("rf-recent");
  try {
    const list = await view("list_recent", [10]);
    box.replaceChildren(...(list.length ? list.map((c) => checkCard(c, account && c.creator?.toLowerCase() === account.address.toLowerCase())) : [h("p", { class: "empty" }, "No checks yet.")]));
  } catch (e) {
    box.replaceChildren(errBox(classifyError(e), () => renderRecent()));
  }
}

export function init() {
  const sec = $("redflag");
  if (!sec || !C.REDFLAG_ADDRESS) return;
  sec.hidden = false;
  $("nav-redflag")?.removeAttribute("hidden");
  read = createClient({ chain: studionet, endpoint: C.RPC_URL });
  account = burnerAccount();
  if (account) write = createClient({ chain: studionet, endpoint: C.RPC_URL, account });
  $("rf-addr").replaceChildren(h("a", { href: C.EXPLORER_ADDRESS(C.REDFLAG_ADDRESS), target: "_blank", rel: "noopener" }, h("code", {}, C.REDFLAG_ADDRESS)));
  $("rf-text").addEventListener("input", updatePreview);
  $("rf-sample").addEventListener("click", () => { $("rf-text").value = SAMPLE; updatePreview(); });
  $("rf-form").addEventListener("submit", onSend);
  $("rf-burner").textContent = burnerPersisted
    ? `Signed by this browser's testnet account ${short(account.address)} (no real value).`
    : "Browser storage is off, so this tab uses a temporary testnet account that disappears when you close it.";
  updatePreview();
  renderRecent();
}
