"""TIER: live (real network, READ-ONLY). Skipped unless GENLAYER_LIVE=1.

Required env:
  GENLAYER_LIVE=1
  GENLAYER_RPC_URL                 e.g. https://studio.genlayer.com/api
  JUDGE_ROUTER_ADDRESS             deployed contract (0x + 40 hex)
  EXPECTED_CONTRACT_CODE_DIGEST    sha256 of contracts/judge_router.py as deployed

These tests never send a transaction. Write-path checks (finality, revert
shapes, datetime format) are listed in REVIEW.md "still needs a live-testnet
check" and should be run by hand on Studio/Bradbury.
"""

import base64
import hashlib
import json
import os
import urllib.request

import pytest

LIVE = os.environ.get("GENLAYER_LIVE") == "1"
pytestmark = pytest.mark.skipif(not LIVE, reason="live tier: set GENLAYER_LIVE=1 and RPC env vars")


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(os.environ["GENLAYER_RPC_URL"], data=body,
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        out = json.loads(r.read())
    if "error" in out:
        raise RuntimeError(out["error"])
    return out["result"]


def test_deployed_code_matches_pinned_digest():
    addr = os.environ["JUDGE_ROUTER_ADDRESS"]
    try:
        code_b64 = rpc("gen_getContractCode", [addr])
    except RuntimeError:
        code_b64 = rpc("gen_getContractCode", [{"address": addr}])
    code = base64.b64decode(code_b64)
    assert hashlib.sha256(code).hexdigest() == os.environ["EXPECTED_CONTRACT_CODE_DIGEST"]
