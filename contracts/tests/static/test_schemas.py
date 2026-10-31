"""TIER: static (no GenVM, no network). JSON Schemas vs fixtures.

Checks that the published schemas are valid draft 2020-12 and that they
classify the cross-runtime fixtures the same way the code does.
"""

import json
from pathlib import Path

import pytest

jsonschema = pytest.importorskip("jsonschema")

ROOT = Path(__file__).resolve().parents[3]


def load(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


PKG = load("schemas/case-package.v1.json")
RCPT = load("schemas/verdict-receipt.v1.json")


def test_schemas_are_valid_2020_12():
    jsonschema.Draft202012Validator.check_schema(PKG)
    jsonschema.Draft202012Validator.check_schema(RCPT)


def test_valid_fixture_matches_package_schema():
    jsonschema.validate(load("fixtures/valid-case.json")["package"], PKG)
    jsonschema.validate(load("fixtures/revoked-case.json")["package"], PKG)
    jsonschema.validate(load("fixtures/expired-case.json")["lateAction"]["package"], PKG)


@pytest.mark.parametrize("case", load("fixtures/consent-missing.json")["cases"], ids=lambda c: c["name"])
def test_consent_fixtures_fail_package_schema(case):
    assert not jsonschema.Draft202012Validator(PKG).is_valid(case["package"])


def test_status_enums_include_revoked_and_stale():
    props = RCPT["properties"]
    assert {"REVOKED", "STALE", "FINALIZED_SUCCESS"} <= set(props["finality"]["enum"])
    assert {"revoked", "stale"} <= set(props["caseStatus"]["enum"])


# --- practice court (Jailbreak the Jury) rule list -------------------------
PRACTICE = load("schemas/practice-rules.v1.json")


def test_practice_rules_schema_valid_and_shipped_list_matches():
    jsonschema.Draft202012Validator.check_schema(PRACTICE)
    jsonschema.validate(load("relayer/config/practice-rules.v1.json"), PRACTICE)


@pytest.mark.parametrize("mutate", [
    lambda c: c["rules"][0].pop("reviewed"),
    lambda c: c["rules"][0].update(note="x"),
    lambda c: c.update(period="hourly"),
    lambda c: c["rules"][0].update(house_take="x" * 281),
], ids=["unreviewed", "extra-key", "bad-period", "house-take-too-long"])
def test_practice_rules_schema_rejects(mutate):
    import copy
    c = copy.deepcopy(load("relayer/config/practice-rules.v1.json"))
    mutate(c)
    assert not jsonschema.Draft202012Validator(PRACTICE).is_valid(c)
