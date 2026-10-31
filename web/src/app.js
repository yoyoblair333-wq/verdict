// VERDICT live web app. Talks to the deployed JudgeRouter on GenLayer
// studionet straight from the browser with genlayer-js. Every verdict shown
// is read from the contract; nothing is simulated or computed here.

import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { transactionsStatusNumberToName } from "genlayer-js/types";
import * as C from "./config.js";
import { buildPackage, localCheck, preflight, randomRequestKey, sha256Hex } from "./lib/package.js";
import { classifyTx, revertReason, voteSummary } from "./lib/finality.js";
import { hideDecision } from "./lib/display.js";
import { h } from "./lib/dom.js";
import { groupCases, idsToFetch, isRelayerCase, provenanceLabel, receiptDisplay, RELAYER_CHIP, tierStatus, VISITOR_CHIP } from "./lib/gallery.js";

const NUM_TO_NAME = transactionsStatusNumberToName;
const TIER_NAME = { 1: "Verdict", 2: "Appeals Court", 3: "Supreme Court" };
const SURFACE_NAME = { settle: "Settle It", live: "Live Court", api: "API" };
const RUBRIC_NAME = { whos_right: "Who's right?", better_roast: "Better roast", pettiest_text: "Pettiest text", better_comeback: "Better comeback" };
const FN_LABEL = {
  open_case_package: "Open case",
  judge: "Tier 1 jury",
  appeal: "Appeal",
  confirm_verdict: "Finality attestation",
  finalize: "Close appeal window",
  revoke: "Revoke (negative test)",
};
const SAMPLES = [
  ["whos_right", "Cereal is a soup: it is a liquid with solid pieces, eaten from a bowl with a spoon.", "Cereal is not a soup. Soup is cooked and savoury; nobody has ever simmered cornflakes."],
  ["better_comeback", "\"You're always late.\" / \"I'm not late, I'm fashionably on my own schedule.\"", "\"You're always late.\" / \"And yet you keep saving me a seat.\""],
  ["pettiest_text", "Sure, take the last slice. I'll just remember it forever.", "Saw you took the last slice. I've updated the group chat rules: rule 1, ask first."],
];

const $ = (id) => document.getElementById(id);
const read = createClient({ chain: studionet, endpoint: C.RPC_URL });

// ------------------------------------------------------------- utilities

/** genlayer-js decodes calldata maps as Map and ints as bigint; make plain JSON. */
function plain(v) {
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "bigint") return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

async function view(functionName, args = []) {
  return plain(await read.readContract({ address: C.CONTRACT_ADDRESS, functionName, args }));
}

const short = (s, n = 10) => (s && s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-6)}` : s ?? "");
const letter = (i) => String.fromCharCode(65 + i);
const score = (x) => (typeof x === "number" ? (x / 10).toFixed(1) : "–");
const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z").replace(/:\d\dZ$/, " UTC");
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key) ?? "null");
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  } catch {
    return value === undefined ? null : value;
  }
}

function rubricLabel(c) {
  const hit = Object.entries(RUBRIC_NAME).find(([, name]) => c.rubric?.startsWith(name.replace("?", "")) || c.rubric?.startsWith(name));
  return hit ? hit[1] : "Custom rubric";
}

// ------------------------------------------------------------ app state

const state = {
  config: null,
  pin: null, // {state, digest}
  source: null, // {kind: "live"|"snapshot", at}
  evidence: {}, // caseId -> [{fn, hash}]
  hidden: [], // [{id, reason}]: operator list (src/hidden-cases.json) + recorded takedowns
  pinned: [], // evidence case ids (evidence.json): always fetched by id and listed first
  cases: [],
  nextBefore: 1, // "Load older" cursor: ids below this are not fetched yet
};

const myCases = () => store(C.MY_CASES_KEY) ?? [];
function saveMyCase(entry) {
  const all = myCases().filter((c) => c.requestKey !== entry.requestKey);
  all.unshift(entry);
  store(C.MY_CASES_KEY, all.slice(0, 50));
}

function txsForCase(c) {
  const out = [...(state.evidence[c.id] ?? [])];
  for (const m of myCases()) {
    if (m.caseId === c.id && m.contract?.toLowerCase() === C.CONTRACT_ADDRESS.toLowerCase()) {
      for (const t of m.txs ?? []) if (!out.some((o) => o.hash === t.hash)) out.push({ ...t, mine: true });
    }
  }
  return out;
}

// ------------------------------------------------------------- read mode

async function loadEvidence() {
  try {
    const r = await fetch("evidence.json", { cache: "no-cache" });
    if (r.ok) {
      const j = await r.json();
      if (j.contract?.toLowerCase() === C.CONTRACT_ADDRESS.toLowerCase()) {
        state.evidence = j.cases ?? {};
        state.hidden = Array.isArray(j.hidden) ? j.hidden : [];
        state.pinned = Array.isArray(j.pinned) ? j.pinned : Object.keys(state.evidence).map(Number);
      }
    }
  } catch {
    /* evidence index is optional */
  }
}

async function checkPin() {
  try {
    const code = await read.getContractCode(C.CONTRACT_ADDRESS);
    const digest = await sha256Hex(code);
    return { state: digest === C.CONTRACT_CODE_DIGEST ? "match" : "mismatch", digest };
  } catch (e) {
    return { state: "error", detail: e.message };
  }
}

/** Evidence cases by id first, then the newest page by id (never list_recent's
 * 50-newest window, which spam could fill: AUDIT-2 P1-7, ADR-023 item 5). */
async function loadLive() {
  const config = await view("get_config");
  const { pinned, page, nextBefore } = idsToFetch(config.next_id, state.pinned, undefined, C.PAGE_SIZE);
  const cases = [];
  for (const id of [...pinned, ...page]) cases.push(await view("get_case", [id]));
  return { config, cases, nextBefore };
}

async function loadOlder() {
  const btn = $("older");
  if (btn) btn.disabled = true;
  try {
    const { page, nextBefore } = idsToFetch(state.config?.next_id, state.pinned, state.nextBefore, C.PAGE_SIZE);
    for (const id of page) state.cases.push(await view("get_case", [id]));
    state.nextBefore = nextBefore;
  } catch (e) {
    console.warn("older page failed", e);
  }
  renderCases();
}

async function loadSnapshot() {
  const r = await fetch("snapshot.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(`no snapshot (${r.status})`);
  const j = await r.json();
  if (j.contract?.toLowerCase() !== C.CONTRACT_ADDRESS.toLowerCase()) throw new Error("snapshot is for another contract");
  return j;
}

async function refresh() {
  const src = $("source");
  src.dataset.state = "loading";
  src.textContent = "Reading the network…";
  $("refresh").disabled = true;
  try {
    const [live, pin] = await Promise.all([loadLive(), checkPin()]);
    state.config = live.config;
    state.cases = live.cases;
    state.nextBefore = live.nextBefore;
    state.pin = pin;
    state.source = { kind: "live", at: new Date().toISOString() };
  } catch (e) {
    console.warn("live read failed", e);
    try {
      const snap = await loadSnapshot();
      state.config = snap.config;
      state.cases = snap.cases;
      state.nextBefore = 1; // a snapshot has no older pages
      state.pin = snap.pin ?? null;
      state.source = { kind: "snapshot", at: snap.snapshotAt, error: e.message };
    } catch (e2) {
      state.source = { kind: "error", error: e.message };
    }
  }
  $("refresh").disabled = false;
  renderSource();
  renderFacts();
  renderCases();
  renderWriteGate();
}

function renderSource() {
  const src = $("source");
  const s = state.source;
  if (s.kind === "live") {
    src.dataset.state = "live";
    src.textContent = `Live · read ${new Date(s.at).toLocaleTimeString()}`;
    src.title = `Read from ${C.RPC_URL} by this browser`;
  } else if (s.kind === "snapshot") {
    src.dataset.state = "snapshot";
    src.textContent = `Snapshot · taken ${fmtTime(s.at)}`;
    src.title = `Live RPC unreachable from this browser (${s.error}). Showing the build-time snapshot read from the same contract.`;
  } else {
    src.dataset.state = "error";
    src.textContent = "Network unreachable";
    src.title = s.error ?? "";
  }
}

function renderFacts() {
  const f = $("facts");
  f.replaceChildren();
  const add = (dt, ...dd) => f.append(h("dt", {}, dt), h("dd", {}, ...dd));
  add("Network", C.NETWORK_LABEL);
  add("Address", h("a", { href: C.EXPLORER_ADDRESS(C.CONTRACT_ADDRESS), target: "_blank", rel: "noopener" }, h("code", {}, C.CONTRACT_ADDRESS)));
  add("Deploy tx", h("a", { href: C.EXPLORER_TX(C.DEPLOY_TX), target: "_blank", rel: "noopener" }, h("code", {}, short(C.DEPLOY_TX, 12))));
  if (state.source?.kind === "error") {
    add("Status", h("span", { class: "pin-bad" }, `Could not reach ${C.RPC_URL}: ${state.source.error}`));
    return;
  }
  const p = state.pin;
  if (p?.state === "match") add("Code pin", h("span", { class: "pin-ok" }, "Match "), h("code", {}, short(p.digest, 8)), " = sha256 of contracts/judge_router.py");
  else if (p?.state === "mismatch") add("Code pin", h("span", { class: "pin-bad" }, "MISMATCH "), h("code", {}, short(p.digest, 8)));
  else add("Code pin", h("span", { class: "pin-bad" }, "Not checked"), p?.detail ? ` (${p.detail})` : "");
  const cfg = state.config ?? {};
  add("Owner", h("code", {}, cfg.owner ?? "–"));
  add("Cases", String(Math.max(0, (cfg.next_id ?? 1) - 1)), cfg.paused ? " · PAUSED" : " · open");
  add("Juries", Object.entries(cfg.tier_jurors ?? {}).map(([t, n]) => `${TIER_NAME[t] ?? `Tier ${t}`} ${n}`).join(" · "));
  add("Source", state.source.kind === "live" ? `Live RPC, ${C.RPC_URL}` : `Build-time snapshot (${fmtTime(state.source.at)}). Live RPC failed: ${state.source.error}`);
}

function statusChips(c, relayerCase) {
  const chips = [h("span", { class: `chip ${relayerCase ? "relayer" : "visitor"}`, "data-origin": relayerCase ? "relayer" : "visitor" }, relayerCase ? RELAYER_CHIP : VISITOR_CHIP)];
  chips.push(h("span", { class: `chip ${c.status === "final" ? "final" : ""}`, title: "On-chain status (get_case)" }, c.status));
  chips.push(h("span", { class: "chip" }, `${TIER_NAME[c.tier] ?? `Tier ${c.tier}`} · ${c.jurors}`));
  const ts = tierStatus(c, relayerCase);
  if (ts) chips.push(h("span", { class: "chip tierstatus", title: ts.title }, ts.text));
  return chips;
}

function txItem(t) {
  const st = h("span", { class: "st" });
  const li = h(
    "li",
    {},
    h("span", { class: "row" }, h("span", { class: "fn" }, t.fn), h("span", {}, FN_LABEL[t.fn] ?? ""), t.mine ? h("span", { class: "chip" }, "signed in this browser") : null),
    h("code", {}, t.hash),
    h(
      "span",
      { class: "row" },
      h("a", { href: C.EXPLORER_TX(t.hash), target: "_blank", rel: "noopener" }, "Explorer"),
      h("button", { class: "link", type: "button", onclick: () => checkTx(t.hash, st) }, "Check status live"),
      st,
    ),
  );
  li.dataset.hash = t.hash;
  return { li, st };
}

async function checkTx(hash, st) {
  st.className = "st";
  st.textContent = "checking…";
  try {
    const tx = await read.getTransaction({ hash });
    const c = classifyTx(tx, NUM_TO_NAME);
    const votes = voteSummary(tx);
    const why = c.execution === "ERROR" ? revertReason(tx) : "";
    st.className = `st ${c.finality === "FINALIZED_SUCCESS" ? "ok" : c.finality === "FINALIZED_ERROR" ? "bad" : ""}`;
    st.textContent = `${c.chainStatus} · ${c.execution}${votes ? ` · validators ${votes}` : ""}${why ? ` · ${why}` : ""}`;
  } catch (e) {
    st.className = "st bad";
    st.textContent = `RPC error: ${e.message}`;
  }
}

/** "Receipt 1a2b…9f0e" with the full packageDigest one tap away (ADR-024 item 7). */
function receiptEl(digest) {
  const r = receiptDisplay(digest);
  if (!r) return h("span", {}, "Receipt ", h("code", {}, "(legacy case, no package)"));
  return h("details", { class: "receipt" }, h("summary", {}, r.label, " ", h("code", {}, r.short)), h("code", { class: "full" }, r.full));
}

// Every chain string below goes through h(), which appends text nodes and
// uses setAttribute: nothing from the chain is ever parsed as HTML.
function caseCard(c) {
  const hide = hideDecision(c, state.hidden);
  const relayerCase = isRelayerCase(c, C.RELAYER_ADDRESS);
  const n = c.entries?.length ?? 0;
  const judged = c.winner_index >= 0;
  const body = h("div", { class: "casebody" });
  body.append(h("p", { class: "rubric" }, h("b", {}, hide ? "Text hidden" : rubricLabel(c)), ` · ${SURFACE_NAME[c.surface] ?? c.surface} · opened ${fmtTime(c.created_at)}`));
  if (hide) body.append(h("p", { class: "hiddennote", "data-hidden": hide.kind }, h("b", {}, hide.label), h("br"), hide.note));

  if (c.status === "revoked") {
    body.append(h("p", { class: "reason" }, `Revoked by side ${letter(c.revoked_by)}: the takes were cleared from contract state.`));
  } else if (judged) {
    body.append(
      ...[h("div", { class: "verdictline" },
        h("span", { class: "split" }, c.split),
        h("span", { class: "who" }, `Take ${letter(c.winner_index)} wins`, h("small", {}, `${c.jurors} jurors · ${TIER_NAME[c.tier]}`)),
      ),
      hide ? null : h("p", { class: "reason" }, `“${c.reason}”`)].filter(Boolean),
    );
  } else {
    body.append(h("p", { class: "reason" }, c.status === "stale" ? "Expired before it was judged." : "Waiting for the jury."));
  }

  if (n > 0) {
    body.append(
      h("div", { class: "entries" },
        c.entries.map((text, i) =>
          h("div", { class: `entry ${judged && i === c.winner_index ? "win" : ""}` },
            h("span", { class: "lt" }, letter(i)),
            hide ? h("span", { class: "tx muted" }, "Text hidden") : h("span", { class: "tx" }, text),
            judged ? h("span", { class: "sc" }, score(c.scores?.[i]), h("small", {}, "mean")) : null,
          ),
        ),
      ),
    );
  }

  if (judged && Array.isArray(c.juror_votes)) {
    body.append(
      h("div", { class: "bench", "aria-label": "Juror votes" },
        c.juror_votes.map((v, i) => h("span", { class: "seat" }, c.juror_names?.[i] ?? `Juror ${i + 1}`, h("b", {}, letter(v)))),
      ),
    );
  }

  const ladder = [...(c.history ?? []).map((x) => ({ ...x, cur: false })), ...(judged ? [{ tier: c.tier, split: c.split, winner_index: c.winner_index, reason: c.reason, at: c.updated_at, cur: true }] : [])];
  if (ladder.length > 1) {
    body.append(
      h("ol", { class: "ladder", "aria-label": "Tier history" },
        ladder.map((x) =>
          h("li", { class: x.cur ? "cur" : "" },
            h("b", {}, `${TIER_NAME[x.tier] ?? `Tier ${x.tier}`} · ${x.split} for ${letter(x.winner_index)}`),
            hide ? null : h("span", { class: "r" }, x.reason),
          ),
        ),
      ),
    );
  }

  body.append(
    h("div", { class: "meta" },
      receiptEl(c.package_digest),
      h("span", {}, relayerCase ? "Creator (the VERDICT relayer) " : "Creator (visitor's testnet account) ", h("code", {}, c.creator)),
      h("span", { class: "prov" }, provenanceLabel(c.provenance, relayerCase)),
    ),
  );

  const txs = txsForCase(c);
  const det = h("details", { open: txs.length > 0 ? true : null }, h("summary", {}, `Transactions (${txs.length})`));
  if (txs.length === 0) {
    det.append(h("p", { class: "meta" }, "No transaction hashes indexed for this case. The contract does not store them; only the evidence run and cases signed in this browser are indexed."));
  } else {
    const ul = h("ul", { class: "txs" });
    const items = txs.map(txItem);
    items.forEach((x) => ul.append(x.li));
    det.append(ul);
    // Check the latest jury transaction automatically: that is the one the verdict above came from.
    const lastJury = [...txs.keys()].reverse().find((i) => txs[i].fn === "judge" || txs[i].fn === "appeal");
    if (lastJury !== undefined) checkTx(txs[lastJury].hash, items[lastJury].st);
  }
  body.append(det);

  const card = h("article", { class: `case ${relayerCase ? "" : "visitorcase"}`, "data-case-id": c.id, "data-origin": relayerCase ? "relayer" : "visitor" },
    h("div", { class: "casehead" }, h("span", { class: "no" }, `Case #${c.id}`), h("span", { class: "chips" }, hide ? h("span", { class: "chip" }, "hidden") : null, statusChips(c, relayerCase))),
    body,
  );
  return card;
}

function renderCases() {
  const box = $("cases");
  box.replaceChildren();
  if (state.source?.kind === "error") {
    box.append(h("p", { class: "empty" }, "The network could not be reached and no snapshot is available. Try Refresh."));
    return;
  }
  if (state.cases.length === 0) {
    box.append(h("p", { class: "empty" }, "No cases on this contract yet."));
    return;
  }
  const g = groupCases(state.cases, state.pinned, C.RELAYER_ADDRESS);
  if (g.evidence.length) {
    box.append(h("h3", { class: "group", id: "evidence-h" }, "Evidence cases (pinned)"),
      h("p", { class: "meta" }, "The recorded runs in docs/LIVE_EVIDENCE.md, fetched by id so newer cases can never push them off this page."));
    const ev = h("div", { class: "group", "data-group": "evidence" });
    g.evidence.forEach((c) => ev.append(caseCard(c)));
    box.append(ev);
  }
  if (g.relayer.length) {
    box.append(h("h3", { class: "group" }, "Opened by the VERDICT relayer"));
    const rl = h("div", { class: "group", "data-group": "relayer" });
    g.relayer.forEach((c) => rl.append(caseCard(c)));
    box.append(rl);
  }
  const vis = h("details", { class: "visitors", id: "visitors", "data-group": "visitor" },
    h("summary", {}, `Visitor cases (${g.visitor.length}) · not moderated by VERDICT`),
    h("p", { class: "meta" }, "Anyone can open a case on this contract with their own testnet account. Their consent, 18+, moderation and provenance labels are their own claims; VERDICT checked none of them. Text that trips the display filter is hidden, but the filter is not moderation."),
  );
  g.visitor.forEach((c) => vis.append(caseCard(c)));
  box.append(vis);
  if (state.source?.kind === "live" && state.nextBefore > 1) {
    box.append(h("button", { class: "btn2 small", id: "older", type: "button", onclick: () => loadOlder() }, "Load older cases"));
  }
}

// ------------------------------------------------------------ write mode

function getBurner() {
  let b = store(C.BURNER_KEY);
  if (!b || typeof b.privateKey !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(b.privateKey)) {
    b = { privateKey: generatePrivateKey(), label: "testnet only, no value", network: C.NETWORK, createdAt: new Date().toISOString() };
    store(C.BURNER_KEY, b);
  }
  return b;
}

let burner = null;
let account = null;
let write = null;

function initBurner() {
  burner = getBurner();
  account = createAccount(burner.privateKey);
  write = createClient({ chain: studionet, endpoint: C.RPC_URL, account });
  renderBurner();
}

function renderBurner() {
  const persisted = store(C.BURNER_KEY)?.privateKey === burner.privateKey;
  $("burner").replaceChildren(
    h("span", { class: "lbl" }, "Burner account · testnet only, no value"),
    h("span", {}, "Address ", h("code", {}, account.address)),
    h("span", { class: "meta" }, persisted
      ? "Generated in this browser and kept in its localStorage. It only signs studionet transactions and holds nothing of value. Clearing site data deletes it."
      : "Browser storage is unavailable, so this burner lasts until you close the tab."),
    h("button", {
      class: "link", type: "button",
      onclick: () => {
        if (!confirm("Make a new burner account? Cases opened by the old one can no longer be judged or appealed from this browser.")) return;
        try { localStorage.removeItem(C.BURNER_KEY); } catch { /* storage unavailable */ }
        initBurner();
      },
    }, "Make a new burner"),
  );
}

function renderWriteGate() {
  const g = $("writegate");
  g.replaceChildren();
  let why = "";
  if (state.source?.kind !== "live") why = "Write mode needs the live network; it is unreachable from this browser right now.";
  else if (state.pin?.state !== "match") why = "Write mode is off: the deployed contract code does not match the pinned digest.";
  else if (state.config?.paused) why = "The contract owner has paused new cases.";
  if (why) g.append(h("p", { class: "gate" }, why));
  $("submit").disabled = !!why || running;
}

// status rail
const STAGES = ["submitted", "scoring", "checking", "final"];
function setRail(stage, bad = false) {
  const idx = STAGES.indexOf(stage);
  for (const li of $("rail").children) {
    const i = STAGES.indexOf(li.dataset.k);
    li.className = i < idx || (i === idx && stage === "final" && !bad) ? "done" : i === idx ? (bad ? "bad" : "now") : "";
  }
}
function railNote(t) {
  $("railnote").textContent = t;
}
function log(msg, extra) {
  const li = h("li", {}, h("time", {}, new Date().toLocaleTimeString()), msg);
  if (extra) li.append(" ", extra);
  $("log").append(li);
}

async function send(fn, args) {
  const hash = await write.writeContract({ address: C.CONTRACT_ADDRESS, functionName: fn, args, value: 0n });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("the network returned no transaction hash");
  return hash;
}

/** Poll a tx until `until` ("ACCEPTED" or "FINAL"); onStatus sees every change. */
async function track(hash, until, onStatus) {
  const end = Date.now() + C.TX_TIMEOUT_MS;
  let last = "";
  let c = { finality: "PENDING", chainStatus: "NOT_FOUND", execution: "UNKNOWN" };
  let tx = null;
  for (;;) {
    try {
      tx = await read.getTransaction({ hash });
      c = classifyTx(tx, NUM_TO_NAME);
    } catch (e) {
      console.warn("getTransaction", e.message); // an RPC error is not an answer: retry
    }
    const key = `${c.chainStatus}/${c.execution}`;
    if (key !== last) {
      last = key;
      onStatus?.(c, tx);
    }
    if (c.finality === "FINALIZED_SUCCESS" || c.finality === "FINALIZED_ERROR") return { c, tx };
    if (until === "ACCEPTED" && c.finality === "ACCEPTED") return { c, tx };
    if (Date.now() > end) return { c: { ...c, finality: "STALE" }, tx };
    await sleep(C.POLL_MS);
  }
}

function txLink(hash) {
  return h("a", { href: C.EXPLORER_TX(hash), target: "_blank", rel: "noopener" }, h("code", {}, short(hash, 10)));
}

let running = false;
let current = null; // {requestKey, caseId, digest, txs, tier}

function persist() {
  saveMyCase({ ...current, contract: C.CONTRACT_ADDRESS, account: account.address, updatedAt: new Date().toISOString() });
}

/** Run one jury transaction (judge or appeal) with the live rail, then attest finality. */
async function juryStep(fn, args, label) {
  setRail("submitted");
  railNote(`Signing ${fn} with your burner…`);
  const hash = await send(fn, args);
  current.txs.push({ fn, hash, at: new Date().toISOString() });
  persist();
  log(`${label}: sent`, txLink(hash));
  setRail("scoring");
  railNote("The leader validator is running the jurors; other validators will re-run them.");
  const { c, tx } = await track(hash, "FINAL", (s) => {
    log(`${fn}: ${s.chainStatus} (${s.execution})`);
    if (s.finality === "ACCEPTED") {
      setRail("checking");
      railNote("Accepted by the validators. Waiting for the finality window to close (a GenLayer appeal could still change it).");
    } else if (s.finality === "PENDING") {
      setRail("scoring");
    }
  });
  if (c.finality !== "FINALIZED_SUCCESS") {
    setRail(c.finality === "STALE" ? "checking" : "scoring", true);
    const why = c.execution === "ERROR" ? revertReason(tx) : c.chainStatus;
    railNote(c.finality === "STALE" ? "Still not final after 15 minutes. Check the transaction later." : `The network did not finalize a verdict: ${why}`);
    throw new Error(`${fn} ended ${c.chainStatus}/${c.execution}${why ? `: ${why}` : ""}`);
  }
  setRail("final");
  const votes = voteSummary(tx);
  railNote(`Finalized · execution SUCCESS${votes ? ` · validators ${votes}` : ""}`);
  log(`${fn}: FINALIZED · SUCCESS${votes ? ` · validators ${votes}` : ""}`);
  const kase = await view("get_case", [current.caseId]);
  current.tier = kase.tier;
  persist();
  renderRunResult(kase);
  // Attest on-chain that this tier's verdict reached FINALIZED + SUCCESS (unlocks the appeal).
  log("Signing confirm_verdict (finality attestation)…");
  const ch = await send("confirm_verdict", [current.caseId, current.digest, kase.tier]);
  current.txs.push({ fn: "confirm_verdict", hash: ch, at: new Date().toISOString() });
  persist();
  log("confirm_verdict: sent", txLink(ch));
  const cr = await track(ch, "FINAL", (s) => log(`confirm_verdict: ${s.chainStatus} (${s.execution})`));
  if (cr.c.finality !== "FINALIZED_SUCCESS") log(`confirm_verdict did not finalize (${cr.c.chainStatus}); the appeal stays locked.`);
  const after = await view("get_case", [current.caseId]);
  renderRunResult(after);
  return after;
}

function renderRunResult(kase) {
  const box = $("runresult");
  box.replaceChildren(caseCard(kase));
  const canAppeal = kase.tier < 3 && kase.confirmed_tier === kase.tier && (kase.status === "judged" || kase.status === "appealed");
  if (canAppeal && !running) {
    const next = kase.tier + 1;
    box.append(
      h("button", { class: "cta", type: "button", style: "margin-top:14px", onclick: () => runAppeal(kase) },
        `Appeal to the ${TIER_NAME[next]} (${state.config?.tier_jurors?.[next] ?? ""} jurors)`),
      h("p", { class: "sub" }, "Re-heard on-chain by a bigger panel. Your burner signs it."),
    );
  }
}

async function runAppeal(kase) {
  if (running) return;
  running = true;
  renderWriteGate();
  $("runresult").querySelectorAll("button.cta").forEach((b) => (b.disabled = true));
  try {
    await juryStep("appeal", [current.caseId, current.digest, kase.tier], `Appeal to ${TIER_NAME[kase.tier + 1]}`);
  } catch (e) {
    log(`Stopped: ${e.message}`);
  } finally {
    running = false;
    renderWriteGate();
    const k = await view("get_case", [current.caseId]).catch(() => null);
    if (k) renderRunResult(k);
    refresh();
  }
}

async function onSubmit(ev) {
  ev.preventDefault();
  if (running) return;
  const err = $("formerr");
  err.textContent = "";
  const rubric = new FormData($("caseform")).get("rubric");
  const a = $("ta").value;
  const b = $("tb").value;
  const consent = $("consent").checked;
  const adult = $("adult").checked;
  if (!consent) return (err.textContent = "Please tick the publishing consent box.");
  if (!adult) return (err.textContent = "VERDICT is 18+ only.");
  const bad = localCheck(a, "Take A") ?? localCheck(b, "Take B");
  if (bad) return (err.textContent = bad);

  running = true;
  renderWriteGate();
  $("run").hidden = false;
  $("log").replaceChildren();
  $("runresult").replaceChildren();
  setRail("submitted");
  try {
    const requestKey = randomRequestKey();
    const built = await buildPackage({
      requestKey, rubric, surface: C.SURFACE, entries: [a, b],
      moderationPolicyVersion: C.MODERATION_POLICY_VERSION, noticeVersion: C.NOTICE_VERSION,
      consent, adultConfirmed: adult,
      network: C.NETWORK, contractAddress: C.CONTRACT_ADDRESS, contractCodeDigest: C.CONTRACT_CODE_DIGEST,
      now: new Date(), submissionTtlSec: C.SUBMISSION_TTL_SEC, caseLifetimeSec: C.CASE_LIFETIME_SEC,
    });
    const pf = await preflight(built, C.CONTRACT_ADDRESS, new Date());
    if (pf) throw new Error(pf);
    log("Case package built.", receiptEl(built.digest));
    current = { requestKey, digest: built.digest, caseId: 0, txs: [], tier: 1 };

    railNote("Signing open_case_package with your burner…");
    const oh = await send("open_case_package", [built.canonical, built.digest]);
    current.txs.push({ fn: "open_case_package", hash: oh, at: new Date().toISOString() });
    persist();
    log("open_case_package: sent", txLink(oh));
    railNote("Waiting for the validators to accept the new case…");
    const o = await track(oh, "ACCEPTED", (s) => log(`open_case_package: ${s.chainStatus} (${s.execution})`));
    if (o.c.finality !== "ACCEPTED" && o.c.finality !== "FINALIZED_SUCCESS") {
      setRail("submitted", true);
      const why = o.c.execution === "ERROR" ? revertReason(o.tx) : o.c.chainStatus;
      railNote(`The contract refused the case: ${why}`);
      throw new Error(`open_case_package ended ${o.c.chainStatus}/${o.c.execution}${why ? `: ${why}` : ""}`);
    }
    // Case id from the contract's own index (sender + requestKey).
    let found = { case_id: 0 };
    for (let i = 0; i < 20 && !found.case_id; i++) {
      found = await view("get_case_by_request_key", [account.address, requestKey]).catch(() => ({ case_id: 0 }));
      if (!found.case_id) await sleep(C.POLL_MS);
    }
    if (!found.case_id || found.package_digest !== built.digest) throw new Error("the new case is not visible on the contract yet; try Refresh in a minute");
    current.caseId = found.case_id;
    persist();
    log(`Case #${found.case_id} is on-chain.`);

    await juryStep("judge", [current.caseId, current.digest], "Tier 1 jury");
  } catch (e) {
    console.error(e);
    log(`Stopped: ${e.message}`);
    if (!$("railnote").textContent) railNote(e.message);
  } finally {
    running = false;
    renderWriteGate();
    if (current?.caseId) {
      const k = await view("get_case", [current.caseId]).catch(() => null);
      if (k) renderRunResult(k);
    }
    refresh();
  }
}

// ------------------------------------------------------------------ boot

function wireForm() {
  for (const id of ["ta", "tb"]) {
    const ta = $(id);
    const out = document.querySelector(`.count[data-for="${id}"]`);
    const upd = () => (out.textContent = `${[...ta.value].length} / 280`);
    ta.addEventListener("input", upd);
    upd();
  }
  let s = 0;
  $("sample").addEventListener("click", () => {
    const [r, a, b] = SAMPLES[s++ % SAMPLES.length];
    document.querySelector(`input[name="rubric"][value="${r}"]`).checked = true;
    $("ta").value = a;
    $("tb").value = b;
    for (const id of ["ta", "tb"]) $(id).dispatchEvent(new Event("input"));
  });
  $("caseform").addEventListener("submit", onSubmit);
  $("refresh").addEventListener("click", () => refresh());
}

wireForm();
initBurner();
renderWriteGate();
loadEvidence().then(refresh);
