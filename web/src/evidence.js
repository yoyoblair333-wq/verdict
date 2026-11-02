// Evidence Court (Milestone 2). Loaded only when the feature flag is on:
// `?evidence=1` in the URL, or EVIDENCE_ENABLED in config.js.
// Talks to contracts/evidence_court.py straight from the browser with the
// page's own testnet burner. Each side may cite up to two https links; every
// GenLayer validator fetches them itself, the juror panel labels each page,
// and the contract counts the labels to reach the ruling.

import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { transactionsStatusNumberToName } from "genlayer-js/types";
import * as C from "./config.js";
import { classifyTx, revertReason, voteSummary } from "./lib/finality.js";
import { classifyError, readTimeoutMs, withTimeout } from "./lib/errors.js";
import { linkProblem } from "./lib/evidencelinks.js";
import { renderDispute, TIER_NAME } from "./lib/evidencecard.js";
import { h } from "./lib/dom.js";

const $ = (id) => document.getElementById(id);
const NUM_TO_NAME = transactionsStatusNumberToName;
const PAGES = "https://yoyoblair333-wq.github.io/verdict/evidence/";
const SAMPLE = {
  question: "Is the Riverside Community Garden fall plant swap on Saturday or on Sunday?",
  a: "The plant swap is on Saturday, November 8, as first announced.",
  b: "It moved to Sunday, November 9, because of the marathon road closure.",
};
const SAMPLES = {
  notice: { a: [], b: [`${PAGES}garden-notice.html`] },
  injection: { a: [`${PAGES}injection-notice.html`], b: [`${PAGES}garden-notice.html`] },
};
const LINK_IDS = ["ev-a1", "ev-a2", "ev-b1", "ev-b2"];
const STAGES = ["submitted", "judging", "agreeing", "final"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s) => (s && s.length > 22 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s ?? "");

let read;
let write;
let account;
let busy = false;
let lastId = 0;
let burnerPersisted = true;
let pending = null;

function plain(v) {
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "bigint") return Number(v);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}
const view = async (fn, args = []) => plain(await withTimeout(read.readContract({ address: C.EVIDENCE_ADDRESS, functionName: fn, args }), readTimeoutMs(), "Reading the court"));

function burnerAccount() {
  try {
    const b = JSON.parse(localStorage.getItem(C.BURNER_KEY) ?? "null");
    if (b && /^0x[0-9a-fA-F]{64}$/.test(b.privateKey)) return createAccount(b.privateKey);
  } catch { /* storage unavailable */ }
  const fresh = { privateKey: generatePrivateKey(), label: "testnet only, no value", network: C.NETWORK, createdAt: new Date().toISOString() };
  try {
    localStorage.setItem(C.BURNER_KEY, JSON.stringify(fresh));
  } catch {
    burnerPersisted = false;
  }
  return createAccount(fresh.privateKey);
}

function setRail(stage, bad = false) {
  const rail = $("ev-rail");
  rail.hidden = false;
  const idx = STAGES.indexOf(stage);
  for (const li of rail.children) {
    const i = STAGES.indexOf(li.dataset.k);
    li.className = i < idx || (i === idx && stage === "final" && !bad) ? "done" : i === idx ? (bad ? "bad" : "now") : "";
  }
}
function stageOf(c) {
  if (c.finality === "FINALIZED_SUCCESS") return "final";
  if (c.chainStatus === "ACCEPTED" || c.chainStatus === "FINALIZED") return "agreeing";
  if (["PROPOSING", "COMMITTING", "REVEALING", "PENDING"].includes(c.chainStatus)) return "judging";
  return "submitted";
}
const status = (msg) => ($("ev-status").textContent = msg);

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

async function waitFor(hash, what) {
  const { c, tx } = await track(hash, (s) => {
    setRail(stageOf(s));
    status(`${what}: ${s.chainStatus.toLowerCase()}…`);
  });
  pending = c.finality === "STALE" ? { hash, what } : null;
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
  const hash = await write.writeContract({ address: C.EVIDENCE_ADDRESS, functionName: fn, args, value: 0n });
  $("ev-log").append(h("li", {}, `${what}: sent `, h("a", { href: C.EXPLORER_TX(hash), target: "_blank", rel: "noopener" }, h("code", {}, short(hash)))));
  return waitFor(hash, what);
}

async function recheck(after) {
  if (busy || !pending) return;
  busy = true;
  $("ev-err").replaceChildren();
  const p = pending;
  try {
    await waitFor(p.hash, p.what);
    await after?.();
  } catch (e) {
    $("ev-err").replaceChildren(errBox(classifyError(e, e.outcome ?? {}), retryFor(e, () => recheck(after), after)));
  } finally {
    busy = false;
    $("ev-send").disabled = false;
    await redrawResult();
    renderRecent();
  }
}
const retryFor = (e, onRetry, after) => (e.outcome?.finality === "STALE" ? () => recheck(after) : onRetry);

function disputeCard(d, mine) {
  const card = renderDispute(d);
  if (mine && !busy && d.status === "judged" && d.tier < 3) {
    card.append(h("div", { class: "rfacts" }, h("button", { class: "cta", type: "button", onclick: () => act("appeal", [d.id], `Appeal to ${TIER_NAME[d.tier + 1]}`, d.id) }, `Appeal to ${d.tier === 1 ? "3" : "5"} jurors (links fetched again)`)));
  }
  return card;
}

async function redrawResult() {
  if (!lastId) return;
  try {
    $("ev-result").replaceChildren(disputeCard(await view("get_dispute", [lastId]), true));
  } catch { /* the recent list shows the error */ }
}

async function act(fn, args, what, id) {
  if (busy) return;
  busy = true;
  $("ev-err").replaceChildren();
  try {
    await sendAndWait(fn, args, what);
    lastId = id;
  } catch (e) {
    $("ev-err").replaceChildren(errBox(classifyError(e, e.outcome ?? {}), retryFor(e, () => act(fn, args, what, id), async () => { lastId = id; })));
  } finally {
    busy = false;
    await redrawResult();
    renderRecent();
  }
}

function linksFor(side) {
  return LINK_IDS.filter((id) => id.startsWith(`ev-${side}`)).map((id) => $(id).value.trim()).filter(Boolean);
}

/** Show, under each link box, why the contract would refuse it. */
function checkLinks() {
  let bad = "";
  const seen = new Set();
  for (const id of LINK_IDS) {
    const v = $(id).value.trim();
    let why = v ? linkProblem(v) : "";
    if (!why && v) {
      if (seen.has(v.toLowerCase())) why = "the same link is cited twice";
      seen.add(v.toLowerCase());
    }
    $(`${id}-err`).textContent = why ? `Would be refused: ${why}.` : "";
    $(id).setAttribute("aria-invalid", String(!!why));
    if (why && !bad) bad = why;
  }
  return bad;
}

function fill(kind) {
  $("ev-q").value = SAMPLE.question;
  $("ev-ca").value = SAMPLE.a;
  $("ev-cb").value = SAMPLE.b;
  const s = SAMPLES[kind];
  $("ev-a1").value = s.a[0] ?? "";
  $("ev-a2").value = s.a[1] ?? "";
  $("ev-b1").value = s.b[0] ?? "";
  $("ev-b2").value = s.b[1] ?? "";
  checkLinks();
}

async function onSend(ev) {
  ev.preventDefault();
  if (busy) return;
  $("ev-err").replaceChildren();
  const formErr = $("ev-formerr");
  formErr.textContent = "";
  const q = $("ev-q").value.trim();
  const a = $("ev-ca").value.trim();
  const b = $("ev-cb").value.trim();
  if (q.length < 5 || a.length < 5 || b.length < 5) return (formErr.textContent = "Fill in the question and both claims.");
  const bad = checkLinks();
  if (bad) return (formErr.textContent = `Fix the evidence links first (${bad}).`);
  if (!$("ev-consent").checked) return (formErr.textContent = "Please tick the publishing consent box.");
  if (!$("ev-adult").checked) return (formErr.textContent = "18+ only.");
  busy = true;
  $("ev-send").disabled = true;
  $("ev-log").replaceChildren();
  const requestKey = `web_${crypto.getRandomValues(new Uint8Array(12)).reduce((s, x) => s + x.toString(16).padStart(2, "0"), "")}`;
  const lookup = async () => {
    const found = await view("get_dispute_by_request_key", [account.address, requestKey]);
    if (!found.dispute_id) throw new Error("the new dispute is not visible yet; try again in a minute");
    lastId = found.dispute_id;
  };
  try {
    await sendAndWait("open_dispute", [q, a, b, linksFor("a"), linksFor("b"), requestKey, true, true], "Ask the Evidence Court");
    await lookup();
  } catch (e) {
    $("ev-err").replaceChildren(errBox(classifyError(e, e.outcome ?? {}), retryFor(e, () => $("ev-form").requestSubmit(), lookup)));
  } finally {
    busy = false;
    $("ev-send").disabled = false;
    await redrawResult();
    renderRecent();
  }
}

async function renderRecent() {
  const box = $("ev-recent");
  try {
    const list = await view("list_recent", [10]);
    box.replaceChildren(...(list.length ? list.map((d) => disputeCard(d, account && d.creator?.toLowerCase() === account.address.toLowerCase())) : [h("p", { class: "empty" }, "No disputes yet.")]));
  } catch (e) {
    box.replaceChildren(errBox(classifyError(e), () => renderRecent()));
  }
}

export function init() {
  const sec = $("evidence");
  if (!sec || !C.EVIDENCE_ADDRESS) return;
  sec.hidden = false;
  $("nav-evidence")?.removeAttribute("hidden");
  read = createClient({ chain: studionet, endpoint: C.RPC_URL });
  account = burnerAccount();
  write = createClient({ chain: studionet, endpoint: C.RPC_URL, account });
  $("ev-addr").replaceChildren(h("a", { href: C.EXPLORER_ADDRESS(C.EVIDENCE_ADDRESS), target: "_blank", rel: "noopener" }, h("code", {}, C.EVIDENCE_ADDRESS)));
  for (const id of LINK_IDS) $(id).addEventListener("input", checkLinks);
  $("ev-sample").addEventListener("click", () => fill("notice"));
  $("ev-sample-inj").addEventListener("click", () => fill("injection"));
  $("ev-form").addEventListener("submit", onSend);
  $("ev-burner").textContent = burnerPersisted
    ? `Signed by this browser's testnet account ${short(account.address)} (no real value).`
    : "Browser storage is off, so this tab uses a temporary testnet account that disappears when you close it.";
  if (location.hash === "#evidence") sec.scrollIntoView();
  renderRecent();
}
