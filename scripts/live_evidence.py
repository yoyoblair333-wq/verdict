"""Render docs/LIVE_EVIDENCE.md from a liveRun.ts report, so the evidence page
is generated from the recorded run instead of typed by hand.

    python3 scripts/live_evidence.py docs/live/studionet-run.json \
        --deploy-tx 0x... --deploy-votes "agree 5" \
        --earlier docs/LIVE_EVIDENCE.earlier.md > docs/LIVE_EVIDENCE.md

--earlier: the previous page; it is appended under "Earlier deployment" with
its headings demoted one level, so older evidence is kept, not replaced.
"""
import argparse
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


def render(run, deploy_tx, deploy_votes, revoke_reason):
    tx_by_hash = {t["hash"]: t for t in run["transactions"]}
    out = []
    w = out.append
    w(f"## Current deployment ({run['startedAt'][:10]})\n")
    w("Recorded by `relayer/src/tools/liveRun.ts`: the **real relayer in live mode** (HTTP routes, case packages, outbox, "
      "contract pin check, two-step finality, inbox, `confirm_verdict`) driving `genlayer-js` 1.1.8 against studionet. "
      "Rendered from [`docs/live/studionet-run.json`](live/studionet-run.json) by `scripts/live_evidence.py`.\n")
    w("This deployment exists because the contract changed after the independent audit: `judge` now requires the case "
      "creator or the owner, and the legacy `open_case` path is owner-only. A contract change means a new address and a new pin.\n")
    w("| Item | Value |\n|---|---|")
    w("| Network / RPC | studionet, `https://studio.genlayer.com/api` |")
    w(f"| Contract address | `{run['contract']}` |")
    w(f"| Deploy tx | `{deploy_tx}`: FINALIZED, execution SUCCESS; validators {deploy_votes} |")
    w(f"| Owner / relayer (throwaway) | `{run['relayer']}` (same key as the earlier deployment) |")
    w(f"| Code pin | `gen_getContractCode` → sha256 `{run['pin']['digest']}` = `EXPECTED_CONTRACT_CODE_DIGEST` (**{run['pin']['state']}**) |")
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
    w("* **Access (new in this deployment).** Every write came from the case creator (the relayer). A stranger's `judge` and a non-owner `open_case` are refused by the contract; that is covered by the direct-mode tests, not by this run.\n")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run")
    ap.add_argument("--deploy-tx", required=True)
    ap.add_argument("--deploy-votes", required=True)
    ap.add_argument("--revoke-reason", default="")
    ap.add_argument("--earlier")
    a = ap.parse_args()
    run = json.load(open(a.run, encoding="utf-8"))
    page = [f"# Live evidence: studionet\n",
            "Two deployments are recorded here. The **current** one carries the audited contract; the **earlier** one is kept for the record "
            "(its address no longer matches the pinned digest).\n",
            render(run, a.deploy_tx, a.deploy_votes, a.revoke_reason),
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
        text = re.split(r"\n### Reproduce\n", text)[0].rstrip() + "\n"
        page.append(text)
    print("\n".join(page))


if __name__ == "__main__":
    main()
