// "Try to rig it." (ADR-017, SPEC §9.10, V-LEGAL-12). Every property this
// page asserts is either read live by the visitor's browser (GenLayer
// studionet RPC, raw.githubusercontent.com), taken from the recorded evidence
// run, or linked to the test that proves it. When a live read fails, the
// section falls back to the build-time snapshot.json and says so.
// All text goes through h() (text nodes only; lib/dom.js).

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { transactionsStatusNumberToName } from "genlayer-js/types";
import * as C from "./config.js";
import { h } from "./lib/dom.js";
import { codeDigest, sha256Hex } from "./lib/package.js";
import {
  APPEAL_TESTS, cleanSummary, compareCode, DOES_NOT_PROVE, gh, GARBLED_TESTS, GENLAYER_DOCS, INJECTION_TESTS, juryChecks, KIND_LABEL, NOT_YET,
  RAW_SOURCE_URL, REVOKE_TESTS, revokeChecks, sha256Bytes, shortAddr, SOURCE_PATH, summarizeTx, tally, testCount, trustPlan, VALIDATOR_TESTS,
} from "./lib/trust.js";

const read = createClient({ chain: studionet, endpoint: C.RPC_URL });
const $ = (id) => document.getElementById(id);
const TIER1 = "Tier 1 jury";

const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso ?? "") : d.toISOString().replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, " UTC");
};

// ---------------------------------------------------------------- pieces

const liveKind = (src) => (src.kind === "live" ? "live" : src.kind === "snapshot" ? "snapshot" : "unchecked");
const proof = (kind, text) => h("span", { class: "proof", "data-kind": kind }, text ?? KIND_LABEL[kind]);
const req = (id) => h("a", { class: "req", href: gh("docs/SPEC.md"), target: "_blank", rel: "noopener", title: "SPEC requirement" }, id);
const txLink = (hash) => h("a", { href: C.EXPLORER_TX(hash), target: "_blank", rel: "noopener" }, "Explorer");

/** One claim line: label, sentence, requirement ids, optional proof links. */
function claim(kind, text, reqs = [], links = null) {
  return h("li", { class: "claim", "data-kind": kind },
    proof(kind),
    h("span", { class: "ctext" }, text, reqs.length ? h("span", { class: "reqs" }, " ", reqs.flatMap((r, i) => (i ? [" ", req(r)] : [req(r)]))) : null),
    links,
  );
}

function testList(refs) {
  return h("ul", { class: "tests" },
    refs.map((r) => h("li", { "data-test-path": r.path },
      h("a", { href: r.url, target: "_blank", rel: "noopener" }, h("code", {}, `${r.path}:${r.line}`)),
      h("span", { class: "n" }, `${r.count} ${r.count === 1 ? "test" : "tests"}`),
      h("span", { class: "w" }, r.what),
    )));
}

function testedBy(refs) {
  return h("details", { class: "testedby" }, h("summary", {}, `Proven by ${testCount(refs)} tests (links)`), testList(refs));
}

function setSource(section, src) {
  const el = document.querySelector(`.source[data-for="${section}"]`);
  if (!el) return;
  el.dataset.state = src.kind;
  if (src.kind === "live") {
    el.textContent = `Live · read ${new Date(src.at).toLocaleTimeString()}`;
    el.title = src.title ?? "Read by this browser just now";
  } else if (src.kind === "snapshot") {
    el.textContent = `Snapshot · taken ${fmtTime(src.at)}`;
    el.title = `The live read failed in this browser (${src.error}). Showing the build-time snapshot of the same data.`;
  } else {
    el.textContent = "Could not read";
    el.title = src.error ?? "";
  }
}

const check = (ok, yes, no) => h("li", { class: ok ? "ok" : "bad", "data-ok": ok ? "1" : "0" }, h("b", {}, ok ? "✓ " : "✗ "), ok ? yes : no);

// --------------------------------------------------------------- loading

let snapshotP = null;
function snapshot() {
  snapshotP ??= fetch("snapshot.json", { cache: "no-cache" }).then(async (r) => {
    if (!r.ok) throw new Error(`no snapshot (${r.status})`);
    const j = await r.json();
    if (String(j.contract).toLowerCase() !== C.CONTRACT_ADDRESS.toLowerCase()) throw new Error("snapshot is for another contract");
    return j;
  });
  return snapshotP;
}

async function readTx(hash) {
  return summarizeTx(await read.getTransaction({ hash }), transactionsStatusNumberToName);
}

/** Live summaries for every hash, else the snapshot's. */
async function loadTxs(hashes) {
  try {
    const out = {};
    for (const hsh of hashes) out[hsh] = await readTx(hsh);
    return { txs: out, src: { kind: "live", at: new Date().toISOString(), title: `getTransaction over ${C.RPC_URL}, by this browser` } };
  } catch (e) {
    console.warn("live tx read failed", e);
    try {
      const s = await snapshot();
      const out = {};
      for (const hsh of hashes) {
        const x = cleanSummary(s.trust?.txs?.[hsh]);
        if (!x) throw new Error(`snapshot has no ${hsh}`);
        out[hsh] = x;
      }
      return { txs: out, src: { kind: "snapshot", at: s.trust?.at ?? s.snapshotAt, error: e.message } };
    } catch (e2) {
      return { txs: null, src: { kind: "error", error: `${e.message}; ${e2.message}` } };
    }
  }
}

async function liveCode() {
  const [code, gh] = await Promise.all([
    read.getContractCode(C.CONTRACT_ADDRESS),
    fetch(RAW_SOURCE_URL, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
      const buf = await r.arrayBuffer();
      return { digest: await codeDigest(new TextDecoder().decode(buf)), raw: await sha256Bytes(buf), bytes: buf.byteLength };
    }),
  ]);
  return { chain: { digest: await codeDigest(code), raw: await sha256Hex(code), chars: code.length }, github: gh };
}

async function loadCode() {
  try {
    return { ...(await liveCode()), src: { kind: "live", at: new Date().toISOString(), title: `gen_getContractCode over ${C.RPC_URL} and ${RAW_SOURCE_URL}, both hashed by this browser` } };
  } catch (e) {
    console.warn("live code read failed", e);
    try {
      const s = await snapshot();
      const chain = typeof s.pin?.digest === "string" ? s.pin.digest : "";
      const github = typeof s.trust?.github?.digest === "string" ? s.trust.github.digest : "";
      if (!chain || !github) throw new Error("snapshot has no code digests");
      const raw = (x) => (typeof x === "string" ? x : undefined);
      return { chain: { digest: chain, raw: raw(s.pin?.rawDigest) }, github: { digest: github, raw: raw(s.trust?.github?.rawDigest) }, src: { kind: "snapshot", at: s.trust?.at ?? s.snapshotAt, error: e.message } };
    } catch (e2) {
      return { chain: null, github: null, src: { kind: "error", error: `${e.message}; ${e2.message}` } };
    }
  }
}

async function loadConfig() {
  try {
    const cfg = await read.readContract({ address: C.CONTRACT_ADDRESS, functionName: "get_config", args: [] });
    const g = (k) => (cfg instanceof Map ? cfg.get(k) : cfg?.[k]);
    return { owner: String(g("owner") ?? ""), relayer: String(g("relayer") ?? ""), paused: g("paused") === true, live: true };
  } catch {
    try {
      const s = await snapshot();
      return { owner: String(s.config?.owner ?? ""), relayer: String(s.config?.relayer ?? ""), paused: s.config?.paused === true, live: false };
    } catch {
      return null;
    }
  }
}

// --------------------------------------------------------------- render

function voteList(s) {
  return h("ul", { class: "votes", "aria-label": "Validator votes" },
    s.votes.map((v) => h("li", { "data-vote": v.vote },
      h("code", { title: v.address }, shortAddr(v.address)),
      h("b", {}, v.vote),
      v.address.toLowerCase() === s.leader.toLowerCase() && s.leader ? h("small", {}, "leader") : null,
    )));
}

function juryCard(item, s) {
  const k = juryChecks(s, C.CONTRACT_ADDRESS, C.RELAYER_ADDRESS);
  return h("article", { class: "txcard", "data-hash": item.hash, "data-finality": s.finality },
    h("div", { class: "txhead" },
      h("span", { class: "no" }, `Case #${item.caseId}`),
      h("span", {}, TIER1),
      h("span", { class: `chip ${k.finalized ? "final" : ""}` }, `${s.chainStatus} · ${s.execution}`),
      s.consensus ? h("span", { class: "chip" }, s.consensus) : null,
    ),
    h("code", { class: "hash" }, item.hash),
    h("ul", { class: "checks" },
      check(k.finalized, "FINALIZED with execution SUCCESS", `Not finalized with SUCCESS (${s.finality})`),
      check(k.toContract, "Sent to the VERDICT contract", `Sent to ${s.to || "an unknown address"}, not the VERDICT contract`),
      check(k.fromRelayer, "Signed by the VERDICT relayer (an evidence case)", "Not signed by the VERDICT relayer"),
      check(k.agreeMajority, `Majority agreed: ${tally(s.votes)}`, `No agreeing majority: ${tally(s.votes) || "no votes recorded"}`),
    ),
    voteList(s),
    h("p", { class: "row" }, txLink(item.hash), h("a", { href: "./#record" }, "See the case")),
  );
}

function renderNetwork(plan, res) {
  const box = $("network-body");
  box.replaceChildren();
  setSource("network", res.src);
  box.append(h("p", { class: "lede" },
    "Three real Tier 1 jury transactions from the recorded evidence run, read with getTransaction. A disagreeing validator is part of the record: the verdict stood because the majority agreed."));
  if (!res.txs) {
    box.append(h("p", { class: "pin-bad" }, `The network could not be reached and no snapshot is available: ${res.src.error}`));
  } else {
    const grid = h("div", { class: "txgrid" });
    for (const item of plan.jury) grid.append(juryCard(item, res.txs[item.hash]));
    box.append(grid);
  }
  box.append(h("ul", { class: "claims" },
    claim(liveKind(res.src), "These jury transactions are final on studionet, and the network recorded every validator's vote.", ["V-FUN-13"]),
    claim("tested", "A validator accepts the leader's verdict only if each of its own mean scores is within 2 points and it picks the same winner (or, on a close call, the leader's pick is within 1 point of its top).", ["V-FUN-07"], testedBy(VALIDATOR_TESTS)),
    claim("tested", "A garbled juror answer fails the jury. It is never patched into a verdict.", ["V-FUN-06"], testedBy(GARBLED_TESTS)),
    claim("tested", "Appeals go to 7 jurors, then 9, and the earlier tiers are kept.", ["V-FUN-05", "V-FUN-09"], testedBy(APPEAL_TESTS)),
    claim("pending", "Votes reveal only once the result can't change.", ["V-SEC-16"]),
  ));
  box.append(h("p", { class: "note" }, "Scope: on-chain cases only. Quick Verdicts and the games are not checked by the network and say so."));
}

/** The unnormalised hash, shown only when it differs from the compared one. */
function rawNote(side) {
  return side?.raw && side.raw !== side.digest ? h("small", { class: "raw" }, h("br"), `raw bytes: ${side.raw}`) : "";
}

function renderCode(res) {
  const box = $("code-body");
  box.replaceChildren();
  setSource("code", res.src);
  if (!res.chain || !res.github) {
    box.append(h("p", { class: "pin-bad" }, `Could not compute both hashes: ${res.src.error}`));
    return;
  }
  const cmp = compareCode(res.chain.digest, res.github.digest, C.CONTRACT_CODE_DIGEST);
  box.append(
    h("div", { class: `verdictbox ${cmp.state}`, "data-code": cmp.state },
      h("span", { class: "big" }, cmp.state === "match" ? "Match" : cmp.state === "differ" ? "Differ" : "Unchecked"),
      h("span", {}, cmp.state === "match"
        ? "The contract at this address runs the exact bytes of contracts/judge_router.py on GitHub main."
        : cmp.state === "differ"
          ? "The deployed code and GitHub main are not the same file right now. Don't trust this page's other claims until they match."
          : "One of the two hashes is missing."),
    ),
    h("dl", { class: "facts digests" },
      h("dt", {}, "Deployed"), h("dd", {}, h("code", { "data-digest": "chain" }, res.chain.digest), h("small", {}, ` sha256 of gen_getContractCode at ${C.CONTRACT_ADDRESS}`), rawNote(res.chain)),
      h("dt", {}, "GitHub"), h("dd", {}, h("code", { "data-digest": "github" }, res.github.digest), h("small", {}, " sha256 of "), h("a", { href: gh(SOURCE_PATH), target: "_blank", rel: "noopener" }, `${SOURCE_PATH} at main`), rawNote(res.github)),
      h("dt", {}, "Pinned"), h("dd", {}, h("code", {}, C.CONTRACT_CODE_DIGEST), h("small", {}, cmp.pinnedToo ? " the digest this site was built with (also matches)" : " the digest this site was built with")),
    ),
    h("p", { class: "note", "data-note": "line-endings" }, "Both sides are hashed after turning Windows line endings into plain ones and keeping one final newline, because pasting a file into GenLayer Studio on Windows changes those. That can't hide any change to the code itself."),
    h("p", { class: "meta" }, "Check it yourself in a terminal:"),
    h("pre", { class: "cmd" }, h("code", {}, `curl -s ${RAW_SOURCE_URL} | sha256sum`)),
    h("ul", { class: "claims" },
      claim(liveKind(res.src), "Same code: the prompts, the juror personas, the filter and the validator rule above are the ones in the public source.", ["V-OPS-09"]),
    ),
    h("p", { class: "note" }, "This proves which code runs, not that the code is fair. ", h("a", { href: gh(SOURCE_PATH, 465), target: "_blank", rel: "noopener" }, "Read the fixed rules"), " and decide."),
  );
}

function renderAppeals(plan, res, ev) {
  const box = $("appeals-body");
  box.replaceChildren();
  setSource("appeals", res.src);
  box.append(h("p", { class: "lede" },
    "Once a tier's verdict is confirmed final, nobody can revoke the case, so the winning side can't cancel it to stop the losing side's appeal."));
  const s = res.txs?.[plan.revoke?.hash];
  if (!plan.revoke || !s) {
    box.append(h("p", { class: "pin-bad" }, `The revoke transaction could not be read: ${res.src.error ?? "not in the evidence index"}`));
  } else {
    const k = revokeChecks(s, C.CONTRACT_ADDRESS, plan.expectRevoke);
    box.append(h("article", { class: "txcard", "data-hash": plan.revoke.hash, "data-revoke": k.finalizedError && k.reasonMatches ? "refused" : "unexpected" },
      h("div", { class: "txhead" },
        h("span", { class: "no" }, `Case #${plan.revoke.caseId}`),
        h("span", {}, "revoke after the verdict was final"),
        h("span", { class: `chip ${k.finalizedError ? "refused" : ""}` }, `${s.chainStatus} · ${s.execution}`),
      ),
      h("code", { class: "hash" }, plan.revoke.hash),
      h("p", { class: "revert" }, h("small", {}, "Revert reason, as the network returns it"), h("code", { "data-reason": "" }, s.reason || "(none returned)")),
      h("ul", { class: "checks" },
        check(k.finalizedError, "The network finalized it as an ERROR: the revoke did not happen", `Expected FINALIZED · ERROR, got ${s.chainStatus} · ${s.execution}`),
        check(k.toContract, "Sent to the VERDICT contract", "Not sent to the VERDICT contract"),
        check(k.reasonMatches, "The reason is the contract's own refusal", "The reason is not the contract's refusal"),
      ),
      h("p", { class: "row" }, txLink(plan.revoke.hash), h("a", { href: gh("docs/LIVE_EVIDENCE.md"), target: "_blank", rel: "noopener" }, "Evidence log")),
    ));
  }
  const rr = ev?.trust?.relayerRevoke;
  box.append(h("ul", { class: "claims" },
    claim(liveKind(res.src), "The case's own creator key sent revoke straight to the contract after Tier 1 was confirmed final, and the contract refused it.", ["V-FUN-12"]),
    rr ? claim("recorded", `Through VERDICT, the winning side's revoke on case #${rr.caseId} got HTTP ${rr.status}: "${rr.error}"`, ["V-FUN-12"],
      h("a", { class: "plain", href: gh("docs/live/studionet-run.json"), target: "_blank", rel: "noopener" }, "Recorded run (JSON)")) : null,
    claim("tested", "The appeal still goes ahead after a refused revoke, and with an appeal under way neither side can revoke.", ["V-FUN-09", "V-FUN-12"], testedBy(REVOKE_TESTS)),
  ));
}

function renderInjection() {
  const box = $("injection-body");
  box.replaceChildren(
    h("p", { class: "lede" }, "Hidden characters, notes to the judge, takes that try to act as instructions, garbled answers. It's a filter, not a force field; that's why attacking it is a game. None of this is proven live on this page: it is proven by the tests below, which run on every change."),
    h("ul", { class: "claims" },
      claim("tested", "Hidden characters (zero-width, bidi, control) are cleaned out before judging.", ["V-SEC-04"]),
      claim("tested", "Notes to the judge (\"ignore previous instructions\", fake score JSON, fake delimiters) are refused at the door, in the contract and before gas in the relayer.", ["V-SEC-04"]),
      claim("tested", "Takes reach the jury only as quoted, UNTRUSTED data after fixed rules.", ["V-SEC-04"]),
      claim("tested", "Everyday words like \"ignore\" or \"pick me up at 10\" still get in.", ["V-SEC-04"]),
      claim("pending", "The relayer and contract run exactly the same filter (they match today, kept in sync by hand).", ["V-SEC-05"]),
    ),
    h("h3", { class: "testsh" }, `The ${testCount(INJECTION_TESTS)} tests behind these claims`),
    testList(INJECTION_TESTS),
    h("p", { class: "note" }, "Known gap: look-alike letters from other alphabets (a Cyrillic \"і\" in \"іgnore\") are not folded, so they can slip past the phrase list. The quoting and fixed rules are the backstop. ",
      h("a", { href: gh("contracts/judge_router.py", 128), target: "_blank", rel: "noopener" }, "See the patterns")),
  );
}

function renderLimits(cfg) {
  const box = $("limits-body");
  box.replaceChildren(
    h("ul", { class: "noproof" }, DOES_NOT_PROVE.map((x) =>
      h("li", {}, h("b", {}, x.t), " ", x.d,
        x.t.startsWith("Who picks") ? [" ", h("a", { href: GENLAYER_DOCS, target: "_blank", rel: "noopener" }, "GenLayer docs")] : null,
        x.t.startsWith("That the operator") && cfg ? h("span", { class: "cfg", "data-live": cfg.live ? "1" : "0" }, " ",
          proof(cfg.live ? "live" : "snapshot"),
          ` Owner ${shortAddr(cfg.owner)}, relayer ${shortAddr(cfg.relayer)}, ${cfg.paused ? "paused" : "not paused"}.`) : null,
      ))),
    h("h3", { class: "testsh" }, "Not proven yet"),
    h("p", { class: "meta" }, "From the claim map in SPEC §9.10. This page claims none of these until its test passes."),
    h("div", { class: "notyet" }, NOT_YET.map((x) =>
      h("div", { class: "ny" },
        h("span", { class: "proof", "data-kind": "pending" }, x.status),
        h("b", {}, x.claim),
        h("span", { class: "meta" }, x.why, " ", req(x.req)),
      ))),
  );
}

// ------------------------------------------------------------------ boot

async function main() {
  renderInjection();
  renderLimits(null);
  let ev = null;
  try {
    const r = await fetch("evidence.json", { cache: "no-cache" });
    if (r.ok) ev = await r.json();
  } catch {
    /* handled below */
  }
  if (!ev || String(ev.contract).toLowerCase() !== C.CONTRACT_ADDRESS.toLowerCase()) {
    for (const s of ["network", "appeals"]) setSource(s, { kind: "error", error: "evidence.json missing or for another contract" });
    $("network-body").replaceChildren(h("p", { class: "pin-bad" }, "The evidence index is missing, so this page doesn't know which transactions to read."));
    $("appeals-body").replaceChildren();
  }
  const plan = trustPlan(ev);
  const hashes = [...plan.jury.map((j) => j.hash), ...(plan.revoke ? [plan.revoke.hash] : [])];
  const [txs, code, cfg] = await Promise.all([hashes.length ? loadTxs(hashes) : null, loadCode(), loadConfig()]);
  if (txs) {
    renderNetwork(plan, txs);
    renderAppeals(plan, txs, ev);
  }
  renderCode(code);
  renderLimits(cfg);
  document.body.dataset.ready = "1";
}

main();
