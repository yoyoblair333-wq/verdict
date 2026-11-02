"""RedFlagCourt must contain no literal zero-width or bidirectional control
characters (GitHub flags those as hidden Unicode; see the README note).
Character classes that strip them use \\u escapes instead.

judge_router.py and pattern_ledger.py are owner-deployed with literal
characters inside `_INVISIBLE_RE`; changing them would break the code pin, so
this check covers only red_flag_court.py, which is not owner-deployed yet."""
import pathlib
import re
import unicodedata

import pytest

CONTRACTS = pathlib.Path(__file__).resolve().parents[2]
SRC = CONTRACTS / "red_flag_court.py"
# EvidenceCourt (Milestone 2) follows the same rule from its first version.
SOURCES = [CONTRACTS / "red_flag_court.py", CONTRACTS / "evidence_court.py"]
BIDI = {"LRE", "RLE", "LRO", "RLO", "PDF", "LRI", "RLI", "FSI", "PDI"}


def _hidden(text):
    return [
        (text.count("\n", 0, i) + 1, f"U+{ord(c):04X}")
        for i, c in enumerate(text)
        if unicodedata.category(c) == "Cf" or unicodedata.bidirectional(c) in BIDI
    ]


@pytest.mark.parametrize("src_path", SOURCES, ids=lambda p: p.name)
def test_contract_has_no_hidden_unicode_literals(src_path):
    assert _hidden(src_path.read_text(encoding="utf-8")) == []


@pytest.mark.parametrize("src_path", SOURCES, ids=lambda p: p.name)
def test_invisible_class_still_strips_the_same_characters(src_path):
    src = src_path.read_text(encoding="utf-8")
    pattern = re.search(r'_INVISIBLE_RE = re\.compile\("(.+?)"\)', src).group(1)
    rx = re.compile(pattern.encode().decode("unicode_escape"))
    for cp in (0x200B, 0x200F, 0x202A, 0x202E, 0x2060, 0x2064, 0xFEFF):
        assert rx.sub("", f"a{chr(cp)}b") == "ab"
    assert rx.sub("", "plain text") == "plain text"
