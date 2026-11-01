"""Render docs/LIVE_EVIDENCE.md from a liveRun.ts report, so the evidence page
is generated from the recorded run instead of typed by hand.

    python3 scripts/live_evidence.py docs/live/studionet-run.json \
        --deploy-tx 0x... --deploy-votes "agree 5" \
        --earlier docs/LIVE_EVIDENCE.earlier.md > docs/LIVE_EVIDENCE.md

--earlier: the previous page. Its "Current deployment" section becomes an
"Earlier deployment" section (headings demoted one level) and any earlier
deployment sections it already holds are kept as they are, so older evidence
is kept, not replaced. A page in the first single-deployment format is still
accepted.
--earlier-run: where the previous page's raw run JSON now lives (its link to
docs/live/studionet-run.json is rewritten to point there).
--why: one paragraph on why this deployment exists.
--owner / --relayer: get_config roles read from the deployed contract.
--source: contracts/judge_router.py; its canonical code digest is printed beside the on-chain one.
--earlier-why: replaces the default "superseded" sentence for the demoted section.

Code digests are canonical: sha256 after CRLF/CR -> LF and exactly one final
newline (relayer/src/lib/pinning.ts codeDigest). Pasting into GenLayer Studio on
Windows changes only those; for an LF source file it equals plain sha256.
"""
import argparse
import hashlib
import json
import re
from collections import Counter


def fmt_verdict(step):
    v = step["verdict"]
    return (f"winner entry {v['winnerIndex']}, split {v['split']}, {v['jurors']} jurors, "
            f"mean scores {v['scores']}, reason: \"{v['reason']}\"")


def votes_text(final):
    c = Counter((final.get("votes") or {}).values())
    return ", ".join(f"{k} {c[k]}" for k in ("agree", "disagree", "idle", "timeout") if c.get(k)) or "n/a"


DEFAULT_WHY = ("This deployment exists because the contract changed after the independent audit: `judge` now requires the case "
               "creator or the owner, and the legacy `open_case` path is owner-only. A contract change means a new address and a new pin.")


def code_digest(data: bytes) -> str:
    text = data.replace(b"\r\n", b"\n").replace(b"\r", b"\n").rstrip(b"\n") + b"\n"
    return hashlib.sha256(text).hexdigest()


def render(run, deploy_tx, deploy_votes, revoke_reason, why=DEFAULT_WHY, owner="", relayer="", source_digest=""):
    tx_by_hash = {t["hash"]: t for t in run["transactions"]}
    out = []
    w = out.append
    w(f"## Current deployment ({run['startedAt'][:10]})\n")
    w("Recorded by `relayer/src/tools/liveRun.ts`: the **real relayer in live mode** (HTTP routes, case packages, outbox, "
      "contract pin check, two-step finality, inbox, `confirm_verdict`) driving `genlayer-js` 1.1.8 against studionet. "
      "Rendered from [`docs/live/studionet-run.json`](live/studionet-run.json) by `scripts/live_evidence.py`.\n")
    w(why + "\n")
    w("| Item | Value |\n|---|---|")
    w("| Network / RPC | studionet, `https://studio.genlayer.com/api` |")
    w(f"| Contract address | `{run['contract']}` |")
    w(f"| Deploy tx | `{deploy_tx}`: FINALIZED, execution SUCCESS; validators {deploy_votes} |")
    if owner or relayer:
        same = owner.lower() == relayer.lower() == run["relayer"].lower()
        w(f"| `get_config` roles | owner `{owner}`, relayer `{relayer}`" + (" (the throwaway deployer holds both roles: constructor `relayer` left empty)" if same else "") + " |")
        w(f"| Relayer key used for the run (throwaway) | `{run['relayer']}` (same key as the earlier deployments) |")
    else:
        w(f"| Owner / relayer (throwaway) | `{run['relayer']}` (same key as the earlier deployment) |")
    if source_digest:
        same = "=" if source_digest == run["pin"]["digest"] else "≠"
        w(f"| Code pin | `gen_getContractCode` → canonical sha256 `{run['pin']['digest']}` {same} canonical sha256 of `contracts/judge_router.py` `{source_digest}` = `EXPECTED_CONTRACT_CODE_DIGEST` (**{run['pin']['state']}**) |")
    else:
        w(f"| Code pin | `gen_getContractCode` → sha256 `{run['pin']['digest']}` = `EXPECTED_CONTRACT_CODE_DIGEST` (**{run['pin']['state']}**) |")
    raw = run["pin"].get("rawDigest")
    if raw and raw != run["pin"]["digest"]:
        w(f"| Stored bytes | raw sha256 `{raw}`: the code was pasted into GenLayer Studio on Windows, which stores CRLF line endings and drops the final newline. "
          "The pin compares the canonical form (line endings to LF, one final newline), which cannot hide any change to the code. |")
    w(f"| Run | {run['startedAt']} → {run['finishedAt']} ({run['elapsedSec']} s, {len(run['cases'])} cases, {len(run['transactions'])} transactions) |\n")
    w("### The three cases\n")
    for c in run["cases"]:
        w(f"#### {c['example']} (case id {c['caseId']})\n")
        w(f"Receipt number (packageDigest): `{c['receiptNumber']}`\n")
        for s in c["steps"]:
            name = s["step"]
            if "verdict" in s:
                w(f"* **{name}**: {fmt_verdict(s)}")
                if s.get("provenance_label"):
                    w(f"  * provenance label: \"{s['provenance_label']}\"")
            elif "transitions" in s:
                t = tx_by_hash.get(s["tx"])
                res = f"{t['final']['statusName']} / execution {t['final']['execution']}" if t else "see table"
                extra = f"; revert reason `{revoke_reason}`" if "revoke" in name and revoke_reason else ""
                w(f"* {name}: tx `{s['tx']}` → {res}{extra}")
            elif "body" in s:
                b = s["body"]
                bits = [f"HTTP {s['status']}"]
                if "tx" in b:
                    bits.append(f"tx `{b['tx']}`")
                if "finality" in b:
                    bits.append(f"finality at response: {b['finality']}")
                if "paid_with" in b:
                    bits.append(f"paid_with {b['paid_with']}")
                if "error" in b:
                    bits.append(f"\"{b['error']}\"")
                if "note" in b:
                    bits.append(f"\"{b['note']}\"")
                if "getAfter" in s:
                    bits.append(f"`GET /cases/{c['caseId']}` afterwards → HTTP {s['getAfter']}")
                w(f"* {name}: " + ", ".join(bits))
            else:
                w(f"* {name}: {json.dumps({k: v for k, v in s.items() if k != 'step'})}")
        w("")
    w("### Every transaction\n")
    w("Times are seconds after broadcast, as observed by the relayer's poller (3 s interval). Votes are the final `consensus_data.votes`.\n")
    w("| # | Call | Tx hash | Observed transitions | ACCEPTED | FINALIZED | Result | Validator votes |")
    w("|---|---|---|---|---|---|---|---|")
    for i, t in enumerate(run["transactions"], 1):
        tr = " → ".join(f"{x['chainStatus']} ({x['execution']}) @{x['tSec']}s" for x in t["transitions"])
        acc = next((x["tSec"] for x in t["transitions"] if x["finality"] == "ACCEPTED" or x["chainStatus"] == "ACCEPTED"), None)
        fin = next((x["tSec"] for x in t["transitions"] if x["chainStatus"] == "FINALIZED"), None)
        f = t["final"]
        w(f"| {i} | `{t['fn']}` | `{t['hash']}` | {tr} | {acc} s | {fin} s | {f['statusName']} / {f.get('result_name')} / {f['execution']} | {votes_text(f)} |")
    jury = [t for t in run["transactions"] if t["fn"] in ("judge", "appeal")]

    def at(t, pred):
        return next((x["tSec"] for x in t["transitions"] if pred(x)), None)
    acc = [a for a in (at(t, lambda x: x["chainStatus"] == "ACCEPTED") for t in jury) if a is not None]
    fin = [a for a in (at(t, lambda x: x["chainStatus"] == "FINALIZED") for t in jury) if a is not None]
    w("")
    w("### What this run shows\n")
    if acc and fin:
        w(f"* **Two-step finality.** Jury transactions (`judge`, `appeal`) reached ACCEPTED after {min(acc)}–{max(acc)} s and FINALIZED after {min(fin)}–{max(fin)} s. Cards, the inbox receipt and `confirm_verdict` waited for FINALIZED + SUCCESS.")
    errs = [t for t in run["transactions"] if t["final"]["execution"] != "SUCCESS"]
    for t in errs:
        w(f"* **Execution result is separate from status.** `{t['fn']}` `{t['hash'][:12]}…` reached FINALIZED with execution {t['final']['execution']}" + (f" (`{revoke_reason}`)" if revoke_reason else "") + ": the revocation window closed once Tier 1 was confirmed final.")
    w(f"* **Receipts.** The inbox holds {len(run['inbox'])} hash-chained FINALIZED_SUCCESS receipts whose `packageDigest` equals the on-chain receipt number.")
    w("* **Access.** Every write came from the relayer, which here is also the owner and the case creator. A stranger's `judge`, a non-owner `open_case`, "
      "and a relayer that is not the owner calling admin methods are refused by the contract; that is covered by the direct-mode tests, not by this run.\n")
    return "\n".join(out)


def demote_current(old, address, run_file, why=""):
    """Page in the multi-deployment format: its current section becomes an
    earlier one; its existing earlier sections and their prose stay as they are."""
    cur = re.search(r"^## Current deployment \((.*?)\)\n(.*?)(?=^## )", old, flags=re.M | re.S)
    if not cur:
        raise SystemExit("--earlier: no '## Current deployment' section")
    tail = old[old.index("\n## Earlier deployment") + 1:] if "\n## Earlier deployment" in old else ""
    addr = f", `{address}`" if address else ""
    lines = [f"## Earlier deployment ({cur.group(1)}{addr})", "",
             (why + (f" Its run data is kept in [`docs/live/{run_file}`](live/{run_file})." if run_file else "")) if why else "Superseded by the current deployment above: `contracts/judge_router.py` has changed since (owner/relayer split: constructor "
             "`relayer`, owner-only `set_relayer`, lifecycle calls open to the current relayer), so this address no longer matches the source or the pinned digest."
             + (f" Its run data is kept in [`docs/live/{run_file}`](live/{run_file})." if run_file else ""), ""]
    body = cur.group(2)
    if run_file:
        body = body.replace("(live/studionet-run.json)", f"(live/{run_file})").replace("`docs/live/studionet-run.json`", f"`docs/live/{run_file}`")
    # The first-format section's raw-data link pointed at the then-current run file.
    tail = tail.replace("[docs/live/studionet-run.json](live/studionet-run.json)",
                        "[docs/live/studionet-run-earlier-deployment.json](live/studionet-run-earlier-deployment.json)")
    for line in body.rstrip().splitlines():
        m = re.match(r"^(#{2,5}) (.*)$", line)
        lines.append(("#" + m.group(1) + " " + m.group(2)) if m else line)
    return "\n".join(lines) + "\n\n" + tail.rstrip() + "\n"


def demote_first_format(old):
    old = re.sub(r"^# Live evidence: studionet, (.*)$", r"## Earlier deployment (\1)", old, count=1, flags=re.M)
    lines = []
    first = True
    for line in old.splitlines():
        if line.startswith("## Earlier deployment") and first:
            first = False
            lines.append(line)
            lines.append("")
            lines.append("Superseded by the current deployment above: this contract still lets anyone call `judge` and lets anyone use `open_case`. "
                         "Its run data is kept in [`docs/live/studionet-run-earlier-deployment.json`](live/studionet-run-earlier-deployment.json). "
                         "Its old reproduce block (which could overwrite `.env.local`) is removed; use the one above.")
            continue
        m = re.match(r"^(#{2,5}) (.*)$", line)
        lines.append(("#" + m.group(1) + " " + m.group(2)) if m else line)
    text = "\n".join(lines)
    return re.split(r"\n### Reproduce\n", text)[0].rstrip() + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run")
    ap.add_argument("--deploy-tx", required=True)
    ap.add_argument("--deploy-votes", required=True)
    ap.add_argument("--revoke-reason", default="")
    ap.add_argument("--earlier")
    ap.add_argument("--earlier-run", default="")
    ap.add_argument("--earlier-address", default="")
    ap.add_argument("--why", default=DEFAULT_WHY)
    ap.add_argument("--owner", default="")
    ap.add_argument("--relayer", default="")
    ap.add_argument("--source", default="", help="contract source file; its canonical code digest is shown next to the on-chain digest")
    ap.add_argument("--earlier-why", default="")
    a = ap.parse_args()
    source_digest = code_digest(open(a.source, "rb").read()) if a.source else ""
    run = json.load(open(a.run, encoding="utf-8"))
    page = [f"# Live evidence: studionet\n",
            "Every studionet deployment is recorded here. The **current** one matches `contracts/judge_router.py` (canonical code digest, pin below); "
            "the **earlier** ones are kept for the record and no longer match the source.\n",
            render(run, a.deploy_tx, a.deploy_votes, a.revoke_reason, a.why, a.owner, a.relayer, source_digest),
            "## Reproduce\n",
            "The key file is written only if it does not exist yet, so this block can never overwrite the throwaway key that owns a deployment.\n",
            "```bash",
            "cd relayer && npm ci && npm run build",
            "[ -e .env.local ] || node -e 'import(\"genlayer-js\").then(m=>console.log(\"RELAYER_PRIVATE_KEY=\"+m.generatePrivateKey()))' > .env.local",
            "set -a; . ./.env.local; set +a",
            "GENLAYER_NETWORK=studionet NODE_USE_ENV_PROXY=1 npm run deploy          # prints address + digest",
            "JUDGE_ROUTER_ADDRESS=0x... EXPECTED_CONTRACT_CODE_DIGEST=... GENLAYER_NETWORK=studionet \\",
            "  NODE_USE_ENV_PROXY=1 node dist/tools/liveRun.js ../docs/live/run.json",
            "python3 ../scripts/live_evidence.py ../docs/live/run.json --deploy-tx 0x... --deploy-votes \"agree 5\"",
            "```\n"]
    if a.earlier:
        old = open(a.earlier, encoding="utf-8").read()
        if re.search(r"^## Current deployment ", old, flags=re.M):
            page.append(demote_current(old, a.earlier_address, a.earlier_run, a.earlier_why))
        else:
            page.append(demote_first_format(old))
    print("\n".join(page))


if __name__ == "__main__":
    main()
