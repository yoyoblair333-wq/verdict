// "Try to rig it." trust page (ADR-017, SPEC §9.10 claim map, V-LEGAL-12):
// the pure parts, so the node tier can test them without a browser.
//
// Every claim the page makes is one of:
//   live     read by the visitor's browser right now (RPC or raw GitHub)
//   recorded from the recorded evidence run (docs/LIVE_EVIDENCE.md)
//   tested   proven by tests; each one links to the test on GitHub
//   pending  in the §9.10 map but not proven yet ("In progress"/"Coming soon")
// Test counts are `pytest --collect-only` / `node --test` counts taken on
// 2026-10-31; ADR-017 item 4 re-checks them at every release that touches
// this page. web/test/offline.test.mjs checks every linked line still holds
// the named test, so a moved test fails the build's tests instead of
// silently pointing at the wrong code.

import { classifyTx, revertReason } from "./finality.js";

export const REPO = "yoyoblair333-wq/verdict";
export const REPO_URL = `https://github.com/${REPO}`;
export const SOURCE_PATH = "contracts/judge_router.py";
export const RAW_SOURCE_URL = `https://raw.githubusercontent.com/${REPO}/main/${SOURCE_PATH}`;
/** A file (and line) on GitHub at main. */
export const gh = (p, line) => `${REPO_URL}/blob/main/${p}${line ? `#L${line}` : ""}`;
export const GENLAYER_DOCS = "https://docs.genlayer.com/";

/** Wording banned on this page and everywhere else (ADR-017 item 1, V-LEGAL-09). */
export const BANNED = [/can[’']?t be rigged/i, /cannot be rigged/i, /unhackable/i, /nobody can rig/i, /injection[- ]proof/i];

export const KIND_LABEL = {
  live: "Live",
  snapshot: "Snapshot",
  unchecked: "Not checked",
  recorded: "Recorded",
  tested: "Proven by tests",
  pending: "In progress",
};

// --------------------------------------------------------------- the tests
// {path, line, anchor, count, what}. `anchor` must appear on `line` of `path`.

const T = (path, line, anchor, count, what) => ({ path, line, anchor, count, what, url: gh(path, line) });

/** V-FUN-07: how a validator decides whether to accept the leader's verdict. */
export const VALIDATOR_TESTS = [
  T("contracts/tests/direct/test_judge_router.py", 258, "class TestValidator", 12,
    "A validator re-runs the panel and accepts only within 2 points per mean score and the same winner (or a close call within 1 point). Forged splits, winners nobody voted for, leader errors and the validator's own failed AI call are all rejected."),
];

/** V-FUN-06: a garbled juror answer fails the jury instead of being patched in. */
export const GARBLED_TESTS = [
  T("contracts/tests/direct/test_judge_router.py", 248, "def test_malformed_llm_output_reverts", 5, "Malformed juror output reverts the jury; nothing is clamped into a verdict."),
  T("contracts/tests/direct/test_fixtures.py", 72, "class TestMalformedLLM", 18, "Shared malformed-output fixture: every bad juror answer is a bounded failure, every bad leader payload is rejected by validators."),
  T("relayer/test/unit/fixtures.test.ts", 62, 'test("malformed-llm:', 1, "The relayer rejects the same malformed payloads."),
];

/** V-SEC-04: the injection screen. */
export const INJECTION_TESTS = [
  T("contracts/tests/direct/test_judge_router.py", 105, "class TestInjectionHardening", 16,
    "9 notes to the judge refused, zero-width smuggling refused, the rubric checked too, ordinary words and 3 former false positives allowed, and entries wrapped as UNTRUSTED data after fixed rules."),
  T("contracts/tests/direct/test_fixtures.py", 53, "def test_injection_package_rejected", 11, "The shared injection fixture: 1 case package and 10 texts refused by the contract."),
  T("contracts/tests/direct/test_fixtures.py", 63, "def test_benign_texts_allowed", 4, "Benign look-alike texts from the same fixture still get in."),
  T("relayer/test/unit/lib.test.ts", 32, 'test("sanitiseText mirrors the contract', 1, "The relayer's sanitiser: NFKC, invisible and control characters removed."),
  T("relayer/test/unit/lib.test.ts", 162, 'test("local moderation pre-check mirrors the contract', 1, "The relayer's copy of the contract's patterns, run before any gas is spent."),
  T("relayer/test/unit/fixtures.test.ts", 56, 'test("injection-attempt:', 1, "The relayer refuses every text in the same shared fixture."),
  T("relayer/test/standin/guards.test.ts", 40, 'test("guard: moderation and injection screen run before gas', 1, "A refused take never reaches the chain."),
  T("web/test/offline.test.mjs", 246, 'test("browser (offline): hostile chain strings render as text', 1, "This site shows chain text as text, never as HTML."),
];

/** V-FUN-05, V-FUN-09: the 5 / 7 / 9 ladder. */
export const APPEAL_TESTS = [
  T("contracts/tests/direct/test_judge_router.py", 338, "class TestAppeal", 5, "Tier 1 → Appeals Court (7 jurors) → Supreme Court (9 jurors), history kept; no appeal while pending; finalize closes appeals."),
  T("contracts/tests/direct/test_package_guards.py", 102, "class TestAppealGuards", 4, "Appeals need a confirmed final verdict, can't escalate twice from one tier, and stop after two."),
];

/** V-FUN-12: after a verdict is confirmed final, nobody can revoke the case. */
export const REVOKE_TESTS = [
  T("contracts/tests/direct/test_fixtures.py", 175, "def test_guard_revocation_closed_once_tier1_confirmed_final", 1, "Once Tier 1 is confirmed final, revoke reverts and the case stays open for appeal."),
  T("contracts/tests/direct/test_fixtures.py", 183, "def test_guard_winner_cannot_kill_pending_appeal", 1, "With an appeal under way, neither side can revoke."),
  T("contracts/tests/direct/test_fixtures.py", 132, "class TestRevokedFixture", 7, "All seven revoke rules: when it is allowed, when it is refused, and that it needs the right digest, creator and side."),
  T("contracts/tests/direct/test_package_guards.py", 102, "class TestAppealGuards", 4, "Appeals need a confirmed final verdict, can't escalate twice from one tier, and stop after two."),
  T("relayer/test/standin/guards.test.ts", 383, "test(\"guard: a winner can never kill the loser's pending appeal", 1, "The relayer refuses the winner's revoke (409) and never sends it."),
];

export const ALL_TEST_REFS = [...VALIDATOR_TESTS, ...GARBLED_TESTS, ...APPEAL_TESTS, ...INJECTION_TESTS, ...REVOKE_TESTS];
export const testCount = (refs) => refs.reduce((n, r) => n + r.count, 0);

/** SPEC §9.10 rows that are NOT proven yet, with the requirement that gates them. */
export const NOT_YET = [
  { claim: "Votes reveal only once the result can't change.", status: "In progress", req: "V-SEC-16", why: "Record views are not yet rendered only from finalized receipt records." },
  { claim: "The relayer and the contract run exactly the same filter.", status: "In progress", req: "V-SEC-05", why: "They match today, but by hand; the cross-runtime check that enforces it is not finished." },
  { claim: "Steering the jury costs points.", status: "Not claimed", req: "V-SEC-04", why: "No test can show it, so we don't say it. Takes do go in only as quoted data." },
  { claim: "Both sides' consent is recorded.", status: "Coming soon", req: "V-PRIV-02, V-PRIV-03", why: "Per-side consent records are not built." },
  { claim: "Nobody publishes your take without your own tap.", status: "In progress", req: "V-PUB-18", why: "Not proven end to end yet." },
  { claim: "Publishing re-hears the case and the network's ruling counts, even when it overrules the preview.", status: "In progress", req: "V-PUB-09", why: "Partly tested; not signed off." },
  { claim: "You can cancel until the first verdict is final; after that we hide it.", status: "Coming soon", req: "V-PRIV-07", why: "The cancel half is tested (below); the hiding half is not built." },
  { claim: "Pattern records never hold the message or the sender.", status: "In progress", req: "V-PL-02", why: "Partly tested; its gate has not passed." },
  { claim: "Jailbreak the Jury runs in a private practice court; only opted-in finalists are re-checked on testnet; we show caught attempts, never working tricks.", status: "Coming soon", req: "V-JB-01, V-JB-06, V-JB-07, V-JB-11", why: "Not built as specified yet." },
];

/** What a finalized, network-checked case does not prove (playbook §7 §5, SPEC §8, ADR-023). */
export const DOES_NOT_PROVE = [
  { t: "That the verdict is right.", d: "It is an AI opinion, for entertainment. The network checks that validators reached the same verdict, not that the verdict is fair or true." },
  { t: "Which AI model each validator actually ran.", d: "A transaction records a model-routing setting for each validator, not the model that answered. We can't check the real model mix, so we don't claim one." },
  { t: "Who picks the validators.", d: "That is GenLayer's process, not something this page can test. Read how it works in the GenLayer docs." },
  { t: "Who wrote a take.", d: "The receipt number proves which exact takes were judged, not who typed them." },
  { t: "That our prompts are neutral.", d: "They are public: the code check below proves the contract runs the published prompts and juror personas. Read them and judge for yourself." },
  { t: "That a screenshot is real.", d: "Only the chain is. Check the case and its transactions here or on the explorer." },
  { t: "That a visitor case was moderated.", d: "Anyone can open a case with their own testnet account. Its consent, 18+ and moderation labels are the opener's claims; VERDICT checked none of them." },
  { t: "That the operator can't step in.", d: "The contract owner can pause it, which stops new cases, juries and appeals. On relayer cases only VERDICT's keys can send the jury or an appeal: the contract stops a winner, not the operator. On this testnet deployment the owner is the wallet that deployed the contract and the relayer is a separate key; both are VERDICT's." },
  { t: "Anything about mainnet.", d: "This is GenLayer's studionet test network. No real value, no money, no tokens." },
  { t: "That Quick Verdicts or the games were checked.", d: "They run off the network, carry no receipt, and say so." },
];

// ------------------------------------------------------- live chain reads

/** "0x5D9E…6dA8" */
export const shortAddr = (a) => (typeof a === "string" && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : String(a ?? ""));
const str = (v) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const VOTE_ORDER = { agree: 0, disagree: 1 };

/**
 * The parts of a genlayer-js getTransaction result the page shows. The same
 * shape is stored in snapshot.json, so live and fallback render the same way.
 */
export function summarizeTx(tx, numToName) {
  const c = classifyTx(tx, numToName);
  const votes = tx?.consensus_data?.votes;
  const rows = votes && typeof votes === "object"
    ? Object.entries(votes).map(([address, vote]) => ({ address: str(address), vote: str(vote) }))
    : [];
  rows.sort((a, b) => (VOTE_ORDER[a.vote] ?? 2) - (VOTE_ORDER[b.vote] ?? 2) || a.address.localeCompare(b.address));
  return {
    hash: str(tx?.hash),
    chainStatus: c.chainStatus,
    execution: c.execution,
    finality: c.finality,
    consensus: str(tx?.result_name),
    to: str(tx?.to_address),
    from: str(tx?.from_address),
    leader: str(tx?.consensus_data?.leader_receipt?.[0]?.node_config?.address),
    votes: rows,
    reason: c.execution === "ERROR" ? revertReason(tx) : "",
  };
}

/** A snapshot's stored summary, with every field forced to the expected type. */
export function cleanSummary(s) {
  if (!s || typeof s !== "object") return null;
  return {
    hash: str(s.hash), chainStatus: str(s.chainStatus), execution: str(s.execution), finality: str(s.finality),
    consensus: str(s.consensus), to: str(s.to), from: str(s.from), leader: str(s.leader), reason: str(s.reason),
    votes: Array.isArray(s.votes) ? s.votes.map((v) => ({ address: str(v?.address), vote: str(v?.vote) })) : [],
  };
}

/** "agree 3 · disagree 1 · idle 1" */
export function tally(votes) {
  const n = {};
  for (const v of votes ?? []) n[v.vote] = (n[v.vote] ?? 0) + 1;
  return Object.entries(n).sort((a, b) => (VOTE_ORDER[a[0]] ?? 2) - (VOTE_ORDER[b[0]] ?? 2)).map(([k, x]) => `${k} ${x}`).join(" · ");
}

const sameAddr = (a, b) => typeof a === "string" && typeof b === "string" && a !== "" && a.toLowerCase() === b.toLowerCase();

/** Checks a jury tx must pass for the page to call it network-checked. */
export function juryChecks(s, contract, relayer) {
  return {
    finalized: s.finality === "FINALIZED_SUCCESS",
    toContract: sameAddr(s.to, contract),
    fromRelayer: sameAddr(s.from, relayer),
    agreeMajority: s.votes.filter((v) => v.vote === "agree").length * 2 > s.votes.length,
  };
}

/** The revoke negative test passes only as FINALIZED + ERROR with the expected reason. */
export function revokeChecks(s, contract, expectReason) {
  return {
    finalizedError: s.chainStatus === "FINALIZED" && s.execution === "ERROR",
    toContract: sameAddr(s.to, contract),
    reasonMatches: typeof expectReason === "string" && expectReason !== "" && s.reason.includes(expectReason),
  };
}

// ------------------------------------------------------------- code check

export async function sha256Bytes(buf) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const HEX64 = /^[0-9a-f]{64}$/;
/** match only when the deployed code and GitHub main hash the same. */
export function compareCode(chain, github, pinned) {
  const ok = (x) => typeof x === "string" && HEX64.test(x);
  if (!ok(chain) || !ok(github)) return { state: "incomplete", pinnedToo: false };
  return { state: chain === github ? "match" : "differ", pinnedToo: chain === github && chain === pinned };
}

// ------------------------------------------------------- which txs to read

const HASH = /^0x[0-9a-fA-F]{64}$/;
/** evidence.json's `trust` block (written by scripts/build.mjs), validated. */
export function trustPlan(ev) {
  const t = ev?.trust;
  const jury = Array.isArray(t?.jury) ? t.jury.filter((x) => HASH.test(x?.hash ?? "") && Number.isSafeInteger(x?.caseId)).slice(0, 3) : [];
  const revoke = HASH.test(t?.revoke?.hash ?? "") && Number.isSafeInteger(t?.revoke?.caseId) ? t.revoke : null;
  return { jury, revoke, expectRevoke: typeof t?.expectRevoke === "string" ? t.expectRevoke : "" };
}
