"""Shared helpers for the direct-mode tier (real GenVM SDK, LLM mocked)."""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
CONTRACT = str(ROOT / "contracts" / "judge_router.py")
FIXTURES = ROOT / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def set_tx_time(vm, ts: str) -> None:
    # gltest 0.29 direct mode: warp() patches datetime.now() but does not
    # refresh gl.message_raw['datetime'], which is the deterministic tx
    # timestamp the contract reads. Set both.
    vm.warp(ts)
    sys.modules["genlayer.gl"].message_raw["datetime"] = ts


def pin_contract_address(hex_addr: str) -> None:
    # Direct mode derives the contract address from the file path, so it
    # differs per machine. Fixtures are built for a fixed address; point
    # gl.message.contract_address at it (the SDK keeps it across sender changes).
    gl = sys.modules["genlayer.gl"]
    from genlayer.py.types import Address
    gl.message = gl.message._replace(contract_address=Address(hex_addr))


def verdict_json(winner, scores, reason="Sharper and more specific."):
    return json.dumps({"winner_index": winner, "scores": scores, "reason": reason})


@pytest.fixture
def pkg_router(direct_vm, direct_deploy, direct_alice):
    """A router deployed at the fixtures' contract address, clock at fixtures' `now`."""
    direct_vm.sender = direct_alice
    r = direct_deploy(CONTRACT)
    fx = load_fixture("valid-case.json")
    pin_contract_address(fx["contractAddress"])
    set_tx_time(direct_vm, fx["now"])
    return r
