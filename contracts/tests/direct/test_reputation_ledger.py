"""
TIER: direct (real GenVM Python SDK in-process). No LLM: ReputationLedger is
fully DETERMINISTIC, so there is no nondet block and nothing to mock - every
validator computes the identical state transition.

Direct-mode tests for ReputationLedger (contracts/reputation_ledger.py), the
VERDICT v2 opt-in, address-only settlement track record that SettlementCourt
feeds through the relayer bridge.

Run:  cd contracts && python -m pytest tests/direct/test_reputation_ledger.py -v
"""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
CONTRACT = str(ROOT / "contracts" / "reputation_ledger.py")

RK1 = "rk_rep_test_00000001"
RK2 = "rk_rep_test_00000002"
RK3 = "rk_rep_test_00000003"


def set_tx_time(vm, ts):
    vm.warp(ts)
    sys.modules["genlayer.gl"].message_raw["datetime"] = ts


def to_hex(addr):
    if hasattr(addr, "as_hex"):
        return addr.as_hex.lower()
    return "0x" + bytes(addr).hex()


@pytest.fixture
def ledger(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Owner = alice, relayer = bob; subject = charlie."""
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT, to_hex(direct_bob))
    set_tx_time(direct_vm, "2026-11-02T09:00:00Z")
    return c


def opt_in(vm, subject, on=True):
    vm.sender = subject
    return  # caller invokes the contract method; kept for symmetry


# ------------------------------------------------------------- opt-in gate

class TestOptIn:
    def test_record_declined_until_subject_opts_in(self, direct_vm, ledger, direct_bob, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_bob  # relayer
        out = ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)
        assert out["recorded"] is False and out["reason"] == "subject_not_opted_in"
        sc = ledger.get_scorecard(subj)
        assert sc["total_cases"] == 0 and sc["opted_in"] is False
        assert ledger.get_config()["subjects"] == 0

    def test_late_opt_in_then_same_submission_records(self, direct_vm, ledger, direct_bob, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_bob
        assert ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)["recorded"] is False
        # subject opts in AFTER the first (declined) attempt; the same request_key
        # must still be accepted (the decline did not consume it).
        direct_vm.sender = direct_charlie
        assert ledger.set_participation(True)["opted_in"] is True
        direct_vm.sender = direct_bob
        out = ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)
        assert out["recorded"] is True and out["scorecard"]["fulfilled"] == 1

    def test_only_subject_opts_itself_in(self, direct_vm, ledger, direct_charlie):
        direct_vm.sender = direct_charlie
        assert ledger.is_opted_in(to_hex(direct_charlie)) is False
        ledger.set_participation(True)
        assert ledger.is_opted_in(to_hex(direct_charlie)) is True


# -------------------------------------------------------------- recording

class TestRecord:
    def test_record_after_opt_in(self, direct_vm, ledger, direct_bob, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        out = ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)
        assert out["recorded"] is True and out["bucket"] == "fulfilled" and out["revised"] is False
        sc = ledger.get_scorecard(subj)
        assert sc["fulfilled"] == 1 and sc["decided_cases"] == 1 and sc["total_cases"] == 1
        assert sc["score"] == 100 and sc["opted_in"] is True
        assert ledger.get_config()["subjects"] == 1
        assert [c["address"].lower() for c in ledger.list_recent(10)] == [subj]

    def test_score_math_across_buckets(self, direct_vm, ledger, direct_bob, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        ledger.record_outcome(subj, "fulfilled", "c-f", False, RK1)
        ledger.record_outcome(subj, "partial", "c-p", False, RK2)
        ledger.record_outcome(subj, "not_fulfilled", "c-n", False, RK3)
        ledger.record_outcome(subj, "undecided", "c-u", False, "rk_rep_test_00000004")
        sc = ledger.get_scorecard(subj)
        assert (sc["fulfilled"], sc["partial"], sc["not_fulfilled"], sc["undecided"]) == (1, 1, 1, 1)
        # decided excludes undecided: (100 + 50) // 3 = 50
        assert sc["decided_cases"] == 3 and sc["total_cases"] == 4 and sc["score"] == 50

    def test_only_relayer_or_owner_records(self, direct_vm, ledger, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie  # subject, not staff
        ledger.set_participation(True)
        with direct_vm.expect_revert("only relayer or owner"):
            ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)

    @pytest.mark.parametrize("outcome", ["won", "FULFILLED", ""])
    def test_bad_outcome_rejected(self, direct_vm, ledger, direct_bob, direct_charlie, outcome):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        with direct_vm.expect_revert("unknown outcome"):
            ledger.record_outcome(subj, outcome, "case-1", False, RK1)

    @pytest.mark.parametrize("rk", ["short", "has space here now!!", "x" * 65])
    def test_bad_request_key_rejected(self, direct_vm, ledger, direct_bob, direct_charlie, rk):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        with direct_vm.expect_revert("bad request_key"):
            ledger.record_outcome(subj, "fulfilled", "case-1", False, rk)

    def test_bad_case_ref_rejected(self, direct_vm, ledger, direct_bob, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        with direct_vm.expect_revert("case_ref must be"):
            ledger.record_outcome(subj, "fulfilled", "has space", False, RK1)

    def test_bad_address_rejected(self, direct_vm, ledger, direct_bob):
        direct_vm.sender = direct_bob
        with direct_vm.expect_revert("address must be 0x"):
            ledger.record_outcome("0xnothex", "fulfilled", "case-1", False, RK1)


# ------------------------------------------------- idempotency + revision

class TestIdempotencyAndRevision:
    def test_same_request_key_same_record_is_replay(self, direct_vm, ledger, direct_bob, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)
        again = ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)
        assert again["replayed"] is True
        assert ledger.get_scorecard(subj)["fulfilled"] == 1  # not double-counted

    def test_same_request_key_different_record_rejected(self, direct_vm, ledger, direct_bob, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)
        with direct_vm.expect_revert("request key reused with a different record"):
            ledger.record_outcome(subj, "partial", "case-1", False, RK1)

    def test_appeal_revision_moves_the_count(self, direct_vm, ledger, direct_bob, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)
        # An appeal later overturns the same case to not_fulfilled: a NEW request_key
        # carrying the new record MOVES the count rather than adding one.
        out = ledger.record_outcome(subj, "not_fulfilled", "case-1", True, RK2)
        assert out["revised"] is True
        sc = ledger.get_scorecard(subj)
        assert sc["fulfilled"] == 0 and sc["not_fulfilled"] == 1 and sc["total_cases"] == 1
        assert sc["appeals_overturned"] == 1
        case = ledger.get_case("case-1")
        assert case["bucket"] == "not_fulfilled" and case["overturned"] is True

    def test_same_caseref_same_outcome_new_key_is_noop(self, direct_vm, ledger, direct_bob, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)
        out = ledger.record_outcome(subj, "fulfilled", "case-1", False, RK2)
        assert out["revised"] is False
        assert ledger.get_scorecard(subj)["fulfilled"] == 1  # still one

    def test_caseref_locked_to_one_subject(self, direct_vm, ledger, direct_bob, direct_charlie, direct_alice):
        subj = to_hex(direct_charlie)
        other = to_hex(direct_alice)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_alice
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)
        with direct_vm.expect_revert("case_ref already recorded for a different subject"):
            ledger.record_outcome(other, "fulfilled", "case-1", False, RK2)


# ------------------------------------------------- opt-out, erase, admin

class TestOptOutEraseAdmin:
    def test_opt_out_stops_new_but_keeps_counts(self, direct_vm, ledger, direct_bob, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)
        direct_vm.sender = direct_charlie
        ledger.set_participation(False)
        direct_vm.sender = direct_bob
        out = ledger.record_outcome(subj, "partial", "case-2", False, RK2)
        assert out["recorded"] is False and out["reason"] == "subject_not_opted_in"
        # The already-recorded count survives an opt-out.
        assert ledger.get_scorecard(subj)["fulfilled"] == 1

    def test_erase_me_clears_counts_and_opts_out(self, direct_vm, ledger, direct_bob, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)
        direct_vm.sender = direct_charlie
        assert ledger.erase_me()["erased"] is True
        sc = ledger.get_scorecard(subj)
        assert sc["total_cases"] == 0 and sc["opted_in"] is False

    def test_erase_then_revise_old_case_does_not_corrupt_counts(self, direct_vm, ledger, direct_bob, direct_charlie):
        # Regression test for the erase/revision corruption an adversarial review
        # found: erasing between recordings must not let a later revision of a
        # pre-erase case subtract from counts that no longer include it.
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        ledger.record_outcome(subj, "fulfilled", "old", True, RK1)   # fulfilled=1, overturned=1
        direct_vm.sender = direct_charlie
        ledger.erase_me()                                            # counts wiped, generation bumped
        ledger.set_participation(True)
        direct_vm.sender = direct_bob
        ledger.record_outcome(subj, "fulfilled", "new", True, RK2)   # fresh gen: fulfilled=1, overturned=1
        # Revising the PRE-ERASE case must add a fresh count, never subtract the
        # post-erase "new" case's count.
        out = ledger.record_outcome(subj, "partial", "old", False, RK3)
        assert out["revised"] is False  # treated as a fresh (new-generation) contribution
        sc = ledger.get_scorecard(subj)
        assert (sc["fulfilled"], sc["partial"], sc["not_fulfilled"]) == (1, 1, 0)
        assert sc["appeals_overturned"] == 1  # the "new" case's overturned flag survives
        assert sc["decided_cases"] == 2 and sc["score"] == 75

    def test_paused_blocks_recording(self, direct_vm, ledger, direct_alice, direct_bob, direct_charlie):
        subj = to_hex(direct_charlie)
        direct_vm.sender = direct_charlie
        ledger.set_participation(True)
        direct_vm.sender = direct_alice
        ledger.set_paused(True)
        direct_vm.sender = direct_bob
        with direct_vm.expect_revert("paused"):
            ledger.record_outcome(subj, "fulfilled", "case-1", False, RK1)

    def test_admin_is_owner_only(self, direct_vm, ledger, direct_alice, direct_charlie):
        direct_vm.sender = direct_charlie
        with direct_vm.expect_revert("only owner"):
            ledger.set_paused(True)
        with direct_vm.expect_revert("only owner"):
            ledger.set_relayer(to_hex(direct_charlie))
        direct_vm.sender = direct_alice
        ledger.set_relayer(to_hex(direct_charlie))  # owner can
        assert ledger.get_config()["relayer"].lower() == to_hex(direct_charlie)

    def test_config_and_unknown_case(self, ledger, direct_alice, direct_bob):
        cfg = ledger.get_config()
        assert cfg["schema"] == "verdict.reputation-ledger.v1"
        assert cfg["owner"].lower() == to_hex(direct_alice)
        assert cfg["relayer"].lower() == to_hex(direct_bob)
        assert cfg["outcomes"] == ["fulfilled", "partial", "not_fulfilled", "undecided"]
        assert ledger.get_case("never-seen")["recorded"] is False
