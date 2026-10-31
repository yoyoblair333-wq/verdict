"""TIER: direct. Cross-runtime fixtures (../../../fixtures/*.json).

The relayer runs the same files in relayer/test/unit/fixtures.test.ts.
"""

import json

import pytest

from conftest import load_fixture, pin_contract_address, set_tx_time, verdict_json

VALID = load_fixture("valid-case.json")


def reject_cases(name):
    return [pytest.param(c, id=c["name"]) for c in load_fixture(name)["cases"]]


class TestValidCase:
    def test_valid_package_opens_and_stores_receipt_number(self, pkg_router):
        cid = pkg_router.open_case_package(VALID["canonical"], VALID["packageDigest"])
        c = pkg_router.get_case(cid)
        assert c["package_digest"] == VALID["packageDigest"]
        assert c["request_key"] == VALID["package"]["requestKey"]
        assert c["entries"] == [e["text"] for e in VALID["package"]["entries"]]
        assert c["provenance"] == [
            {"entry_source": "participant_submitted", "assurance": "verified_participant"},
            {"entry_source": "participant_submitted", "assurance": "self_asserted"},
        ]
        assert c["appeal_deadline"] == VALID["package"]["lifetime"]["appealWindowExpiry"]

    def test_fixture_canonical_matches_python_serialiser(self):
        import hashlib
        canon = json.dumps(VALID["package"], sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        assert canon == VALID["canonical"]
        assert hashlib.sha256(canon.encode()).hexdigest() == VALID["packageDigest"]


class TestRejectFixtures:
    @pytest.mark.parametrize("case", reject_cases("tampered-digest.json"))
    def test_guard_digest_match_tampered(self, direct_vm, pkg_router, case):
        with direct_vm.expect_revert(case["expect"]["contractRevert"]):
            pkg_router.open_case_package(case["canonical"], case["packageDigest"])
        assert pkg_router.get_config()["next_id"] == 1

    @pytest.mark.parametrize("case", reject_cases("consent-missing.json"))
    def test_guard_consent_and_18plus_exact_true(self, direct_vm, pkg_router, case):
        with direct_vm.expect_revert(case["expect"]["contractRevert"]):
            pkg_router.open_case_package(case["canonical"], case["packageDigest"])
        assert pkg_router.get_config()["next_id"] == 1

    @pytest.mark.parametrize("case", reject_cases("injection-attempt.json"))
    def test_injection_package_rejected(self, direct_vm, pkg_router, case):
        with direct_vm.expect_revert(case["expect"]["contractRevert"]):
            pkg_router.open_case_package(case["canonical"], case["packageDigest"])

    @pytest.mark.parametrize("text", load_fixture("injection-attempt.json")["texts"])
    def test_injection_texts_rejected(self, direct_vm, pkg_router, text):
        with direct_vm.expect_revert("instructions aimed at the judge"):
            pkg_router.open_case("whos_right", [text, "normal take"], "settle")

    @pytest.mark.parametrize("text", load_fixture("injection-attempt.json")["benign"])
    def test_benign_texts_allowed(self, pkg_router, text):
        assert pkg_router.open_case("whos_right", [text, "normal take"], "settle") >= 1

    @pytest.mark.parametrize("case", reject_cases("expired-case.json"))
    def test_guard_expiry_submission_deadline(self, direct_vm, pkg_router, case):
        with direct_vm.expect_revert(case["expect"]["contractRevert"]):
            pkg_router.open_case_package(case["canonical"], case["packageDigest"])


class TestMalformedLLM:
    FX = load_fixture("malformed-llm.json")

    @pytest.mark.parametrize("item", FX["jurorOutputs"], ids=lambda i: i["name"])
    def test_guard_malformed_juror_output_is_bounded_failure(self, direct_vm, pkg_router, item):
        cid = pkg_router.open_case_package(VALID["canonical"], VALID["packageDigest"])
        direct_vm.mock_llm(r"VERDICT", item["raw"])
        with direct_vm.expect_revert("[LLM_ERROR]"):
            pkg_router.judge(cid, VALID["packageDigest"])
        c = pkg_router.get_case(cid)
        assert c["status"] == "pending" and c["winner_index"] == -1

    @pytest.mark.parametrize("item", FX["leaderPayloads"], ids=lambda i: i["name"])
    def test_validator_rejects_malformed_leader_payload(self, direct_vm, pkg_router, item):
        cid = pkg_router.open_case_package(VALID["canonical"], VALID["packageDigest"])
        direct_vm.mock_llm(r"VERDICT", verdict_json(0, [8, 4]))
        pkg_router.judge(cid, VALID["packageDigest"])
        assert direct_vm.run_validator(leader_result=item["payload"]) is False

    def test_validator_accepts_the_valid_payload(self, direct_vm, pkg_router):
        # Control for the test above: the same harness accepts a good payload.
        cid = pkg_router.open_case_package(VALID["canonical"], VALID["packageDigest"])
        direct_vm.mock_llm(r"VERDICT", verdict_json(0, [8, 4]))
        pkg_router.judge(cid, VALID["packageDigest"])
        assert direct_vm.run_validator(leader_result=self.FX["validLeaderPayload"]) is True


class TestExpiredFixture:
    FX = load_fixture("expired-case.json")

    def test_guard_expiry_no_judge_after_window_then_stale(self, direct_vm, pkg_router):
        la = self.FX["lateAction"]
        set_tx_time(direct_vm, la["openAt"])
        cid = pkg_router.open_case_package(la["canonical"], la["packageDigest"])
        set_tx_time(direct_vm, la["actAt"])
        direct_vm.mock_llm(r"VERDICT", verdict_json(0, [8, 4]))
        with direct_vm.expect_revert(la["expect"]["judgeRevert"]):
            pkg_router.judge(cid, la["packageDigest"])
        pkg_router.expire(cid, la["packageDigest"])
        assert pkg_router.get_case(cid)["status"] == la["expect"]["statusAfterExpire"]
        with direct_vm.expect_revert("case expired"):
            pkg_router.judge(cid, la["packageDigest"])

    def test_expire_refused_before_deadline(self, direct_vm, pkg_router):
        la = self.FX["lateAction"]
        cid = pkg_router.open_case_package(la["canonical"], la["packageDigest"])
        with direct_vm.expect_revert("case not expired"):
            pkg_router.expire(cid, la["packageDigest"])

    def test_guard_expiry_no_appeal_after_window(self, direct_vm, pkg_router):
        la = self.FX["lateAction"]
        cid = pkg_router.open_case_package(la["canonical"], la["packageDigest"])
        direct_vm.mock_llm(r"VERDICT", verdict_json(0, [8, 4]))
        pkg_router.judge(cid, la["packageDigest"])
        pkg_router.confirm_verdict(cid, la["packageDigest"], 1)
        set_tx_time(direct_vm, la["actAt"])
        with direct_vm.expect_revert("appeal window expired"):
            pkg_router.appeal(cid, la["packageDigest"], 1)


class TestRevokedFixture:
    FX = load_fixture("revoked-case.json")

    def _judged(self, direct_vm, router):
        cid = router.open_case_package(self.FX["canonical"], self.FX["packageDigest"])
        direct_vm.mock_llm(r"VERDICT", verdict_json(0, [8, 4]))
        router.judge(cid, self.FX["packageDigest"])
        return cid

    def test_guard_revocation_blocks_everything_and_clears_state(self, direct_vm, pkg_router):
        d = self.FX["packageDigest"]
        cid = self._judged(direct_vm, pkg_router)
        pkg_router.revoke(cid, d, self.FX["revocation"]["side"])
        c = pkg_router.get_case(cid)
        assert c["status"] == self.FX["expect"]["status"]
        assert c["entries"] == self.FX["expect"]["entriesAfter"]
        assert c["rubric"] == "" and c["reason"] == "" and c["history"] == []
        assert c["revoked_by"] == 1
        for call in (lambda: pkg_router.appeal(cid, d, 1), lambda: pkg_router.finalize(cid, d)):
            with direct_vm.expect_revert(self.FX["expect"]["actionRevert"]):
                call()

    def test_revoke_allowed_after_judge_before_confirmation(self, direct_vm, pkg_router):
        d = self.FX["packageDigest"]
        cid = self._judged(direct_vm, pkg_router)
        assert pkg_router.get_case(cid)["confirmed_tier"] == 0
        pkg_router.revoke(cid, d, 1)
        assert pkg_router.get_case(cid)["status"] == "revoked"

    def test_revoke_pending_case_blocks_judge(self, direct_vm, pkg_router):
        d = self.FX["packageDigest"]
        cid = pkg_router.open_case_package(self.FX["canonical"], d)
        pkg_router.revoke(cid, d, 0)
        with direct_vm.expect_revert("case revoked"):
            pkg_router.judge(cid, d)

    def test_final_case_cannot_be_revoked(self, direct_vm, pkg_router):
        d = self.FX["packageDigest"]
        cid = self._judged(direct_vm, pkg_router)
        pkg_router.finalize(cid, d)
        with direct_vm.expect_revert(self.FX["expect"]["finalRevokeRevert"]):
            pkg_router.revoke(cid, d, 1)

    def test_guard_revocation_closed_once_tier1_confirmed_final(self, direct_vm, pkg_router):
        d = self.FX["packageDigest"]
        cid = self._judged(direct_vm, pkg_router)
        pkg_router.confirm_verdict(cid, d, 1)
        with direct_vm.expect_revert(self.FX["expect"]["finalRevokeRevert"]):
            pkg_router.revoke(cid, d, 0)
        assert pkg_router.get_case(cid)["status"] == "judged"

    def test_guard_winner_cannot_kill_pending_appeal(self, direct_vm, pkg_router):
        # Entry 0 won Tier 1; entry 1 appealed. Even if the Tier 2 verdict is
        # not yet confirmed, the case can no longer be revoked by anyone.
        d = self.FX["packageDigest"]
        cid = self._judged(direct_vm, pkg_router)
        pkg_router.confirm_verdict(cid, d, 1)
        direct_vm.clear_mocks()
        direct_vm.mock_llm(r"VERDICT", verdict_json(1, [4, 8]))
        pkg_router.appeal(cid, d, 1)
        for side in (0, 1):
            with direct_vm.expect_revert("off-chain takedown"):
                pkg_router.revoke(cid, d, side)
        assert pkg_router.get_case(cid)["status"] == "appealed"

    def test_revoke_needs_matching_digest_creator_and_side(self, direct_vm, pkg_router, direct_bob):
        d = self.FX["packageDigest"]
        cid = self._judged(direct_vm, pkg_router)
        with direct_vm.expect_revert("package digest mismatch"):
            pkg_router.revoke(cid, "0" * 64, 1)
        with direct_vm.expect_revert("bad side"):
            pkg_router.revoke(cid, d, 2)
        direct_vm.sender = direct_bob
        with direct_vm.expect_revert("only case creator"):
            pkg_router.revoke(cid, d, 1)
