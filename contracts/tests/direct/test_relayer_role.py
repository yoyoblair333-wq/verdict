"""Owner vs relayer split on JudgeRouter (same split as pattern_ledger.py).

The OWNER deploys (Blair's wallet: the contract's creator on GenLayer). The
RELAYER is the hot key: it may open and run cases, never the admin functions,
and never revoke a case it did not open.
"""

import pytest

from conftest import CONTRACT, load_fixture, pin_contract_address, set_tx_time, verdict_json


def to_hex(addr):
    return (addr.as_hex if hasattr(addr, "as_hex") else "0x" + bytes(addr).hex()).lower()


@pytest.fixture
def split(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Owner = alice deploys with relayer = bob. Clock and address as the fixtures expect."""
    direct_vm.sender = direct_alice
    r = direct_deploy(CONTRACT, 0, to_hex(direct_bob))
    fx = load_fixture("valid-case.json")
    pin_contract_address(fx["contractAddress"])
    set_tx_time(direct_vm, fx["now"])
    return r


def open_valid(direct_vm, r, sender):
    fx = load_fixture("valid-case.json")
    direct_vm.sender = sender
    return r.open_case_package(fx["canonical"], fx["packageDigest"]), fx["packageDigest"]


def test_default_relayer_is_the_deployer(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    r = direct_deploy(CONTRACT)
    cfg = r.get_config()
    assert cfg["owner"].lower() == cfg["relayer"].lower() == to_hex(direct_alice)


def test_relayer_runs_the_lifecycle_on_cases_it_opened(direct_vm, split, direct_alice, direct_bob):
    cfg = split.get_config()
    assert cfg["owner"].lower() == to_hex(direct_alice)
    assert cfg["relayer"].lower() == to_hex(direct_bob)
    cid, dg = open_valid(direct_vm, split, direct_bob)
    direct_vm.mock_llm(r"VERDICT", verdict_json(0, [8, 4]))
    split.judge(cid, dg)
    split.confirm_verdict(cid, dg, 1)
    split.appeal(cid, dg, 1)
    split.confirm_verdict(cid, dg, 2)
    split.finalize(cid, dg)
    assert split.get_case(cid)["status"] == "final"


def test_a_rotated_relayer_keeps_running_cases_the_old_key_opened(direct_vm, split, direct_alice, direct_bob, direct_charlie):
    cid, dg = open_valid(direct_vm, split, direct_bob)
    direct_vm.sender = direct_alice
    split.set_relayer(to_hex(direct_charlie))
    assert split.get_config()["relayer"].lower() == to_hex(direct_charlie)
    direct_vm.sender = direct_charlie
    direct_vm.mock_llm(r"VERDICT", verdict_json(1, [3, 9]))
    split.judge(cid, dg)                     # charlie is neither creator nor owner
    split.confirm_verdict(cid, dg, 1)
    split.appeal(cid, dg, 1)
    split.confirm_verdict(cid, dg, 2)
    split.finalize(cid, dg)
    # the old key lost the role but stays the case's creator
    assert split.get_case(cid)["status"] == "final"


def test_a_stranger_cannot_run_a_case(direct_vm, split, direct_bob, direct_charlie):
    cid, dg = open_valid(direct_vm, split, direct_bob)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only case creator"):
        split.judge(cid, dg)
    direct_vm.sender = direct_bob
    direct_vm.mock_llm(r"VERDICT", verdict_json(0, [8, 4]))
    split.judge(cid, dg)
    direct_vm.sender = direct_charlie
    for call in (lambda: split.confirm_verdict(cid, dg, 1), lambda: split.appeal(cid, dg, 1), lambda: split.finalize(cid, dg)):
        with direct_vm.expect_revert("only case creator"):
            call()


def test_admin_is_owner_only_never_the_relayer(direct_vm, split, direct_bob, direct_charlie):
    direct_vm.sender = direct_bob
    for call in (
        lambda: split.set_relayer(to_hex(direct_charlie)),
        lambda: split.set_daily_limit(1),
        lambda: split.set_paused(True),
        lambda: split.transfer_ownership(to_hex(direct_bob)),
        lambda: split.open_case("whos_right", ["a take", "b take"], "settle"),
    ):
        with direct_vm.expect_revert("only owner"):
            call()


def test_relayer_role_does_not_extend_to_revoke(direct_vm, split, direct_alice, direct_bob, direct_charlie):
    cid, dg = open_valid(direct_vm, split, direct_bob)
    direct_vm.sender = direct_alice
    split.set_relayer(to_hex(direct_charlie))
    direct_vm.sender = direct_charlie   # current relayer, but did not open this case
    with direct_vm.expect_revert("only case creator"):
        split.revoke(cid, dg, 0)
    direct_vm.sender = direct_bob       # the creator may (the relayer checked the side token)
    split.revoke(cid, dg, 0)
    assert split.get_case(cid)["status"] == "revoked"
