"""TIER: direct. Guards added by the assurance upgrade, one test per guard.

Each test is written so it fails if its guard is removed from the contract.
"""

import copy
import hashlib
import json

import pytest

from conftest import CONTRACT, load_fixture, set_tx_time, verdict_json

VALID = load_fixture("valid-case.json")
D = VALID["packageDigest"]


def seal(pkg):
    c = json.dumps(pkg, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return c, hashlib.sha256(c.encode("utf-8")).hexdigest()


def variant(mutate, request_key=None):
    p = copy.deepcopy(VALID["package"])
    if request_key:
        p["requestKey"] = request_key
        p["identity"]["clientRef"] = request_key
    mutate(p)
    return seal(p)


def judged(direct_vm, router, winner=0, scores=(8, 4), confirm=True):
    cid = router.open_case_package(VALID["canonical"], D)
    direct_vm.mock_llm(r"VERDICT", verdict_json(winner, list(scores)))
    router.judge(cid, D)
    if confirm:
        router.confirm_verdict(cid, D, 1)
    return cid


class TestReceiptNumber:
    def test_guard_digest_match_on_judge(self, direct_vm, pkg_router):
        cid = pkg_router.open_case_package(VALID["canonical"], D)
        direct_vm.mock_llm(r"VERDICT", verdict_json(0, [8, 4]))
        for wrong in ("", "0" * 64, D[:-1] + ("0" if D[-1] != "0" else "1"), D.upper()):
            with direct_vm.expect_revert("package digest mismatch"):
                pkg_router.judge(cid, wrong)
        assert pkg_router.judge(cid, D)["status"] == "judged"

    def test_guard_digest_match_on_appeal_and_finalize(self, direct_vm, pkg_router):
        cid = judged(direct_vm, pkg_router)
        with direct_vm.expect_revert("package digest mismatch"):
            pkg_router.appeal(cid, "0" * 64, 1)
        with direct_vm.expect_revert("package digest mismatch"):
            pkg_router.finalize(cid, "")

    def test_history_and_verdict_reference_receipt_number(self, direct_vm, pkg_router):
        cid = judged(direct_vm, pkg_router)
        direct_vm.clear_mocks()
        direct_vm.mock_llm(r"VERDICT", verdict_json(1, [4, 8]))
        out = pkg_router.appeal(cid, D, 1)
        assert out["history"][0]["package_digest"] == D
        assert pkg_router.get_verdict(cid)["package_digest"] == D
        assert pkg_router.list_recent(1, "")[0]["package_digest"] == D

    def test_legacy_case_rejects_any_digest(self, direct_vm, pkg_router):
        cid = pkg_router.open_case("whos_right", ["a", "b"], "settle")
        with direct_vm.expect_revert("package digest mismatch"):
            pkg_router.judge(cid, D)


class TestIdempotency:
    def test_same_request_key_same_package_returns_same_case(self, pkg_router):
        a = pkg_router.open_case_package(VALID["canonical"], D)
        b = pkg_router.open_case_package(VALID["canonical"], D)
        assert a == b
        assert pkg_router.get_config()["next_id"] == a + 1

    def test_guard_request_key_reused_with_different_package_reverts(self, direct_vm, pkg_router):
        pkg_router.open_case_package(VALID["canonical"], D)
        c, d = variant(lambda p: p.__setitem__("rubric", "better_roast"))
        with direct_vm.expect_revert("request key reused with a different package"):
            pkg_router.open_case_package(c, d)

    def test_request_key_lookup_is_exact(self, direct_vm, pkg_router, direct_alice):
        # "...0001" exists; a prefix or extension of it must not match.
        cid = pkg_router.open_case_package(VALID["canonical"], D)
        rk = VALID["package"]["requestKey"]
        sender = direct_alice.as_hex if hasattr(direct_alice, "as_hex") else "0x" + bytes(direct_alice).hex()
        assert pkg_router.get_case_by_request_key(sender, rk) == {"case_id": cid, "package_digest": D, "status": "pending"}
        for near in (rk[:-1], rk + "1", rk.upper(), " " + rk):
            assert pkg_router.get_case_by_request_key(sender, near)["case_id"] == 0
            assert pkg_router.get_case_by_ref(sender, near) == 0

    def test_ab_does_not_match_abc(self, direct_vm, pkg_router, direct_alice):
        sender = direct_alice.as_hex if hasattr(direct_alice, "as_hex") else "0x" + bytes(direct_alice).hex()
        pkg_router.open_case("whos_right", ["a", "b"], "settle", "abc")
        assert pkg_router.get_case_by_ref(sender, "ab") == 0
        assert pkg_router.get_case_by_ref(sender, "abc") == 1


class TestAppealGuards:
    def test_guard_appeal_requires_confirmed_final_verdict(self, direct_vm, pkg_router):
        cid = judged(direct_vm, pkg_router, confirm=False)
        with direct_vm.expect_revert("verdict not confirmed final"):
            pkg_router.appeal(cid, D, 1)
        pkg_router.confirm_verdict(cid, D, 1)
        assert pkg_router.appeal(cid, D, 1)["tier"] == 2

    def test_confirm_verdict_guards(self, direct_vm, pkg_router, direct_bob):
        cid = pkg_router.open_case_package(VALID["canonical"], D)
        with direct_vm.expect_revert("no verdict to confirm"):
            pkg_router.confirm_verdict(cid, D, 1)
        direct_vm.mock_llm(r"VERDICT", verdict_json(0, [8, 4]))
        pkg_router.judge(cid, D)
        with direct_vm.expect_revert("tier mismatch"):
            pkg_router.confirm_verdict(cid, D, 2)
        with direct_vm.expect_revert("package digest mismatch"):
            pkg_router.confirm_verdict(cid, "0" * 64, 1)
        direct_vm.sender = direct_bob
        with direct_vm.expect_revert("only case creator"):
            pkg_router.confirm_verdict(cid, D, 1)

    def test_guard_from_tier_prevents_double_escalation(self, direct_vm, pkg_router):
        cid = judged(direct_vm, pkg_router)
        pkg_router.appeal(cid, D, 1)
        # A retried "appeal from tier 1" after a timeout must not escalate again.
        with direct_vm.expect_revert("tier mismatch"):
            pkg_router.appeal(cid, D, 1)
        assert pkg_router.get_case(cid)["tier"] == 2

    def test_guard_max_two_appeals_on_chain(self, direct_vm, pkg_router):
        cid = judged(direct_vm, pkg_router)
        pkg_router.appeal(cid, D, 1)
        pkg_router.confirm_verdict(cid, D, 2)
        pkg_router.appeal(cid, D, 2)
        pkg_router.confirm_verdict(cid, D, 3)
        assert pkg_router.get_case(cid)["status"] == "final"
        with direct_vm.expect_revert("cannot be appealed"):
            pkg_router.appeal(cid, D, 3)


class TestPackageShape:
    @pytest.mark.parametrize("mutate,code", [
        (lambda p: p.__setitem__("clientIp", "203.0.113.7"), "schema_invalid"),
        (lambda p: p["entries"][0].__setitem__("email", "a@b.com"), "schema_invalid"),
        (lambda p: p["identity"].__setitem__("apiKey", "dev-key"), "schema_invalid"),
        (lambda p: p.__setitem__("surface", "casino"), "schema_invalid"),
        (lambda p: p.__setitem__("schema", "verdict.case-package.v2"), "schema_invalid"),
        (lambda p: p["identity"].__setitem__("tier", 2), "schema_invalid"),
        (lambda p: p["identity"].__setitem__("caseId", 1), "schema_invalid"),
        (lambda p: p["identity"].__setitem__("clientRef", "someone-elses-ref-01"), "schema_invalid"),
        (lambda p: p["entries"][0]["provenance"].__setitem__("assurance", "notarised"), "schema_invalid"),
        (lambda p: p["entries"][0]["provenance"].__setitem__("entrySource", "host_submitted"), "schema_invalid"),
        (lambda p: p.__setitem__("entries", p["entries"][:1]), "schema_invalid"),
        (lambda p: p["moderation"].__setitem__("result", "skipped"), "moderation_not_passed"),
        (lambda p: p["destination"].__setitem__("contractAddress", "0x" + "bb" * 20), "wrong_destination"),
        (lambda p: p["destination"].__setitem__("network", "mainnet"), "schema_invalid"),
        (lambda p: p["lifetime"].__setitem__("appealWindowExpiry", "2026-12-31T00:00:00Z"), "schema_invalid"),
    ])
    def test_guard_closed_package_shape(self, direct_vm, pkg_router, mutate, code):
        c, d = variant(mutate)
        with direct_vm.expect_revert(code):
            pkg_router.open_case_package(c, d)

    def test_guard_no_pii_keys_can_reach_chain(self, direct_vm, pkg_router):
        # The closed key set is what keeps IPs/tokens/emails off-chain even
        # if a relayer bug tried to add them.
        c, d = variant(lambda p: p["disclosure"].__setitem__("email", "x@y.z"))
        with direct_vm.expect_revert("schema_invalid"):
            pkg_router.open_case_package(c, d)

    def test_non_canonical_bytes_rejected(self, direct_vm, pkg_router):
        pretty = json.dumps(VALID["package"], indent=1, ensure_ascii=False)
        d = hashlib.sha256(pretty.encode()).hexdigest()
        with direct_vm.expect_revert("not_canonical"):
            pkg_router.open_case_package(pretty, d)

    def test_float_rejected_as_not_canonical(self, direct_vm, pkg_router):
        c, d = variant(lambda p: p["identity"].__setitem__("attempt", 1.0))
        with direct_vm.expect_revert("not_canonical"):
            pkg_router.open_case_package(c, d)

    def test_unsanitised_entry_rejected(self, direct_vm, pkg_router):
        def m(p):
            t = "zero​width"
            p["entries"][0]["text"] = t
            p["entries"][0]["sha256"] = hashlib.sha256(t.encode()).hexdigest()
        c, d = variant(m)
        with direct_vm.expect_revert("not_sanitised"):
            pkg_router.open_case_package(c, d)

    def test_live_surface_requires_host_source(self, direct_vm, pkg_router):
        def m(p):
            p["surface"] = "live"
            for e in p["entries"]:
                e["provenance"] = {"entrySource": "host_submitted", "assurance": "self_asserted"}
        c, d = variant(m)
        cid = pkg_router.open_case_package(c, d)
        assert pkg_router.get_verdict(cid)["provenance"][0] == {"entry_source": "host_submitted", "assurance": "self_asserted"}

    def test_unparseable_tx_datetime_fails_closed(self, direct_vm, pkg_router):
        set_tx_time(direct_vm, "not-a-date")
        with direct_vm.expect_revert("unparseable transaction datetime"):
            pkg_router.open_case_package(VALID["canonical"], D)


class TestBooleanGates:
    def test_set_paused_requires_real_boolean(self, direct_vm, pkg_router):
        with direct_vm.expect_revert("paused must be a boolean"):
            pkg_router.set_paused(1)
        assert pkg_router.get_config()["paused"] is False


class TestAccessAudit:
    """Audit P1-2 / P1-3 (2026-10-31): judge and the legacy open path are restricted."""

    def test_guard_only_creator_or_owner_can_judge(self, direct_vm, pkg_router, direct_bob, direct_charlie):
        # pkg_router is owned by alice; bob plays the relayer (case creator); charlie is a stranger
        r = pkg_router
        direct_vm.sender = direct_bob
        cid = r.open_case_package(VALID["canonical"], D)
        direct_vm.mock_llm(r"VERDICT", verdict_json(0, [8, 4]))
        direct_vm.sender = direct_charlie
        with direct_vm.expect_revert("only case creator can judge"):
            r.judge(cid, D)
        assert r.get_case(cid)["status"] == "pending"   # the relayer's case is not stranded
        direct_vm.sender = direct_bob
        assert r.judge(cid, D)["status"] == "judged"

    def test_owner_may_judge(self, direct_vm, pkg_router, direct_alice, direct_bob):
        direct_vm.sender = direct_bob
        cid = pkg_router.open_case_package(VALID["canonical"], D)
        direct_vm.mock_llm(r"VERDICT", verdict_json(0, [8, 4]))
        direct_vm.sender = direct_alice
        assert pkg_router.judge(cid, D)["status"] == "judged"

    def test_guard_legacy_open_case_is_owner_only(self, direct_vm, pkg_router, direct_bob):
        cid = pkg_router.open_case("whos_right", ["a", "b"], "settle")
        assert cid >= 1
        before = pkg_router.get_config()["next_id"]
        direct_vm.sender = direct_bob
        with direct_vm.expect_revert("only owner"):
            pkg_router.open_case("whos_right", ["a", "b"], "settle")
        assert pkg_router.get_config()["next_id"] == before
