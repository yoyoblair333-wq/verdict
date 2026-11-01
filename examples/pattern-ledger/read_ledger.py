"""PatternLedger read-only client example (Python, genlayer-py).

genlayer-py is not listed directly in contracts/requirements.txt; it is
installed as a dependency of the pinned genlayer-test==0.29.2 (it resolved to
genlayer-py 0.16.3 when this example was run). No private key is needed: a
throwaway account is generated in memory and only used as the `from` address
of gen_call reads.

Usage, from the repo root:
  python3 -m venv contracts/.venv && contracts/.venv/bin/pip install -r contracts/requirements.txt
  contracts/.venv/bin/python examples/pattern-ledger/read_ledger.py [address]
Behind a proxy, set REQUESTS_CA_BUNDLE (and HTTPS_PROXY) as usual for `requests`.
"""
import json
import sys
from datetime import datetime, timedelta, timezone

from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

ADDRESS = sys.argv[1] if len(sys.argv) > 1 else "0x59C6047571bCE66828C733330fc9B5C88afEaE4D"

client = create_client(chain=studionet, account=create_account())


def read(fn, args=None):
    return client.read_contract(address=ADDRESS, function_name=fn, args=args or [])


cfg = read("get_config")
print("get_config:", json.dumps({k: cfg[k] for k in ("schema", "owner", "relayer", "paused", "next_id",
                                                     "dedup_candidates", "max_summary_chars")}, indent=2))
print(f"  {len(cfg['flag_codes'])} flag codes, categories: {', '.join(cfg['categories'])}")

recent = read("list_recent", [5])
print(f"\nlist_recent(5): {len(recent)} pattern(s)")
for p in recent:
    print(f"  #{p['id']} [{p['category']}] x{p['sightings']}  {','.join(p['flag_codes'])}")

if recent:
    p = read("get_pattern", [recent[-1]["id"]])
    print(f"\nget_pattern({p['id']}) history:")
    for h in p["history"]:
        print(f"  {h['at']}  {h['kind']:<8} {','.join(h['flag_codes'])}")

since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
top = read("top_patterns_since", [since, 5])
print(f'\ntop_patterns_since("{since}", 5):')
for r in top:
    print(f"  #{r['id']} sightings_since={r['sightings_since']} total={r['sightings']}")
