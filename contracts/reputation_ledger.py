# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
VERDICT - ReputationLedger Intelligent Contract (opt-in settlement track record)
================================================================================

VERDICT v2 / Milestone 3. A companion contract to SettlementCourt
(contracts/settlement_court.py). It keeps an ERC-8004-style, ADDRESS-ONLY
"settlement track record": how often a given counterparty's work was judged
FULFILLED / PARTIAL / NOT_FULFILLED / UNDECIDED, so an agent can look up a
would-be counterparty before trusting it.

Why this is consistent with VERDICT's "no reputation" rule (REVIEW.md / DECISIONS.md):
  * OPT-IN and SELF-SOVEREIGN. A scorecard exists for an address ONLY after that
    address itself calls `set_participation(True)`. No one can be scored into the
    ledger involuntarily; the general courts (JudgeRouter / RedFlagCourt / …) are
    never fed into it. It scores *settlement outcomes an agent opted to publish*,
    not people.
  * ADDRESS-ONLY, NO PII. The ledger stores wallet addresses and bounded enum
    outcome counts. No names, no text the user wrote, no case contents. The only
    free string, `case_ref`, is charset-restricted and never judged.
  * REVOCABLE. An address can call `set_participation(False)` to stop new
    outcomes being recorded; it may also `erase_me()` to clear its live counts
    (on-chain history is immutable, and the contract says so).

Design notes (same conventions as contracts/pattern_ledger.py and judge_router.py,
GenVM v0.2.x Python SDK, same Depends hash, `[EXPECTED]` error prefix):
  * DETERMINISTIC. Reputation is arithmetic, not a judgement, so there is NO LLM
    call and NO nondet block here: every validator computes the identical state
    transition. The subjective judging happens upstream in SettlementCourt; this
    contract only tallies its already-final rulings.
  * IDEMPOTENT + REVISABLE. Each settled case is identified by `case_ref` and
    counted exactly once. If an appeal in SettlementCourt later changes a case's
    ruling, the relayer re-submits the same `case_ref` with the new outcome and
    the ledger MOVES the count from the old bucket to the new one (and adjusts the
    overturned-on-appeal tally) - never double-counts. `request_key` guards exact
    duplicate submissions.
  * owner / relayer split: only the relayer (or owner) may write outcomes; only
    the subject may opt in / out / erase itself; only the owner may admin.
"""

import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone

from genlayer import *


# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #

ERR_EXPECTED = "[EXPECTED]"

LEDGER_SCHEMA_ID = "verdict.reputation-ledger.v1"

# The bounded outcome buckets, mirroring SettlementCourt's rulings.
OUTCOMES = ("fulfilled", "partial", "not_fulfilled", "undecided")

REQUEST_KEY_RE = re.compile(r"[A-Za-z0-9_-]{16,64}")
CASE_REF_RE = re.compile(r"[A-Za-z0-9_-]{1,80}")
TS_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z")

MAX_LIST = 50
VIEW_SCAN_LIMIT = 1000

# Zero-width / bidi characters (same ranges as judge_router.py _INVISIBLE_RE):
# case_ref is charset-checked anyway, but we strip these defensively first so a
# disguised separator can never slip through the CASE_REF_RE fullmatch.
_INVISIBLE_RE = re.compile("[\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2064\\ufeff]")


# --------------------------------------------------------------------------- #
# Storage records
# --------------------------------------------------------------------------- #

@allow_storage
@dataclass
class Scorecard:
    address: str              # subject wallet, as_hex
    fulfilled: u32
    partial: u32
    not_fulfilled: u32
    undecided: u32
    appeals_overturned: u32   # of this subject's cases, how many were overturned on appeal
    first_seen: str           # YYYY-MM-DDTHH:MM:SSZ
    last_seen: str


@allow_storage
@dataclass
class CaseOutcome:
    subject: str              # subject wallet, as_hex
    bucket: str               # one of OUTCOMES
    overturned: bool          # the final ruling differs from the first-tier ruling
    gen: u32                  # the subject's erase-generation when this was recorded


# --------------------------------------------------------------------------- #
# Pure helpers (deterministic)
# --------------------------------------------------------------------------- #

def _fail(msg: str):
    raise gl.vm.UserError(f"{ERR_EXPECTED} {msg}")


def _clean_ref(raw) -> str:
    if not isinstance(raw, str):
        _fail("case_ref must be text")
    text = unicodedata.normalize("NFKC", raw)
    text = _INVISIBLE_RE.sub("", text).strip()
    if not CASE_REF_RE.fullmatch(text):
        _fail("case_ref must be 1..80 chars of [A-Za-z0-9_-]")
    return text


def _normalise_ts(raw: str) -> str:
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except Exception:
        _fail("unparseable transaction datetime")
    if dt.tzinfo is None:
        _fail("transaction datetime has no timezone")
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _addr_hex(raw) -> str:
    """Accept a 0x-prefixed 40-hex address; return its canonical as_hex. Never guess."""
    if not isinstance(raw, str):
        _fail("address must be text")
    value = raw.strip()
    if len(value) != 42 or value[:2].lower() != "0x" or any(c not in "0123456789abcdefABCDEF" for c in value[2:]):
        _fail("address must be 0x + 40 hex chars")
    return Address(value).as_hex


def _fingerprint(subject: str, bucket: str, case_ref: str, overturned: bool) -> str:
    return json.dumps({"s": subject, "b": bucket, "c": case_ref, "o": overturned},
                      sort_keys=True, separators=(",", ":"))


# --------------------------------------------------------------------------- #
# Contract
# --------------------------------------------------------------------------- #

class ReputationLedger(gl.Contract):
    owner: Address
    relayer: Address
    paused: bool
    next_index: u256                      # 1-based index of distinct subjects, for list_recent
    scorecards: TreeMap[str, Scorecard]   # subject as_hex -> Scorecard
    participation: TreeMap[str, bool]     # subject as_hex -> opted in?
    generations: TreeMap[str, u32]        # subject as_hex -> erase-generation (bumped by erase_me)
    index: TreeMap[u256, str]             # insertion order -> subject as_hex
    cases: TreeMap[str, CaseOutcome]      # case_ref -> recorded outcome (idempotency + revision)
    request_keys: TreeMap[str, str]       # request_key -> fingerprint (exact-duplicate guard)

    def __init__(self, relayer: str = ""):
        self.owner = gl.message.sender_address
        self.relayer = Address(relayer) if relayer != "" else gl.message.sender_address
        self.paused = False
        self.next_index = u256(1)

    # ------------------------------------------------------------------ utils
    def _now(self) -> str:
        return _normalise_ts(gl.message_raw["datetime"])

    def _require_owner(self) -> None:
        if gl.message.sender_address != self.owner:
            _fail("only owner")

    def _require_submitter(self) -> None:
        sender = gl.message.sender_address
        if sender != self.relayer and sender != self.owner:
            _fail("only relayer or owner")

    def _blank(self, subject: str, now: str) -> Scorecard:
        return Scorecard(address=subject, fulfilled=u32(0), partial=u32(0),
                         not_fulfilled=u32(0), undecided=u32(0), appeals_overturned=u32(0),
                         first_seen=now, last_seen=now)

    def _bump(self, card: Scorecard, bucket: str, delta: int) -> None:
        # delta is +1 or -1; counts never go below zero.
        cur = int(getattr(card, bucket))
        nxt = cur + delta
        if nxt < 0:
            nxt = 0
        setattr(card, bucket, u32(nxt))

    def _to_dict(self, card: Scorecard) -> dict:
        f, p, n, u = int(card.fulfilled), int(card.partial), int(card.not_fulfilled), int(card.undecided)
        total = f + p + n + u
        # A simple, honest score: share of decided cases that were fulfilled or
        # partial, as a 0..100 integer; "decided" excludes undecided cases.
        decided = f + p + n
        score = ((f * 100 + p * 50) // decided) if decided > 0 else 0
        return {
            "address": card.address,
            "fulfilled": f, "partial": p, "not_fulfilled": n, "undecided": u,
            "appeals_overturned": int(card.appeals_overturned),
            "total_cases": total, "decided_cases": decided, "score": score,
            "first_seen": card.first_seen, "last_seen": card.last_seen,
        }

    # ------------------------------------------------------ participation (subject)
    @gl.public.write
    def set_participation(self, on: bool) -> dict:
        """The SUBJECT opts its own address in or out. Opt-in is required before
        any outcome is recorded; opting out stops new outcomes (kept counts stay
        until erase_me())."""
        if not isinstance(on, bool):
            _fail("participation must be a boolean")
        subject = gl.message.sender_address.as_hex
        self.participation[subject] = on
        return {"address": subject, "opted_in": on}

    @gl.public.write
    def erase_me(self) -> dict:
        """The SUBJECT clears its live scorecard counts and opts out. On-chain
        transaction history is immutable and cannot be erased - this only clears
        the current queryable state."""
        subject = gl.message.sender_address.as_hex
        if subject in self.scorecards:
            now = self._now()
            self.scorecards[subject] = self._blank(subject, now)
        self.participation[subject] = False
        # Bump the generation so any case_ref recorded before this erase is treated
        # as belonging to a past life: a later revision of it adds a fresh count
        # instead of subtracting from counts that no longer include it.
        cur = int(self.generations[subject]) if subject in self.generations else 0
        self.generations[subject] = u32(cur + 1)
        return {"address": subject, "erased": True}

    # ------------------------------------------------------------- write (relayer)
    @gl.public.write
    def record_outcome(self, subject: str, outcome: str, case_ref: str,
                       overturned_on_appeal: bool, request_key: str) -> dict:
        """Record (or revise) one settled case's outcome for `subject` (relayer or
        owner only, deterministic). Counts each `case_ref` once; a later call with
        the same `case_ref` and a different outcome MOVES the count. Returns
        {recorded, reason?, subject, bucket, replayed, revised}."""
        self._require_submitter()
        if self.paused:
            _fail("paused")
        if not isinstance(outcome, str) or outcome not in OUTCOMES:
            _fail("unknown outcome")
        if not isinstance(overturned_on_appeal, bool):
            _fail("overturned_on_appeal must be a boolean")
        if not isinstance(request_key, str) or not REQUEST_KEY_RE.fullmatch(request_key):
            _fail("bad request_key")
        subject_hex = _addr_hex(subject)
        ref = _clean_ref(case_ref)
        fingerprint = _fingerprint(subject_hex, outcome, ref, overturned_on_appeal)

        # Exact-duplicate guard: same request_key must carry the same record.
        if request_key in self.request_keys:
            if self.request_keys[request_key] != fingerprint:
                _fail("request key reused with a different record")
            card = self.scorecards[subject_hex] if subject_hex in self.scorecards else None
            return {"recorded": True, "subject": subject_hex, "bucket": outcome,
                    "replayed": True, "revised": False,
                    "scorecard": self._to_dict(card) if card is not None else None}

        # Opt-in gate: never score an address that did not opt in. Not an error -
        # the settlement flow continues; the ledger simply declines. We do NOT
        # consume the request_key here, so if the subject opts in later the same
        # (case_ref, request_key) submission can still be recorded rather than
        # being silently swallowed as a replay.
        if not (subject_hex in self.participation and self.participation[subject_hex]):
            return {"recorded": False, "reason": "subject_not_opted_in",
                    "subject": subject_hex, "bucket": outcome, "replayed": False, "revised": False}

        now = self._now()
        if subject_hex not in self.scorecards:
            self.scorecards[subject_hex] = self._blank(subject_hex, now)
            self.index[self.next_index] = subject_hex
            self.next_index = u256(int(self.next_index) + 1)
        card = self.scorecards[subject_hex]
        cur_gen = int(self.generations[subject_hex]) if subject_hex in self.generations else 0

        revised = False
        if ref in self.cases:
            prev = self.cases[ref]
            if prev.subject != subject_hex:
                _fail("case_ref already recorded for a different subject")
            if int(prev.gen) != cur_gen:
                # The subject erased since this case_ref was last recorded: its old
                # counts are gone from the live card, so this is a FRESH count in
                # the new generation - never subtract from the current counts.
                self._bump(card, outcome, +1)
                if overturned_on_appeal:
                    self._bump_overturned(card, +1)
            elif prev.bucket == outcome and bool(prev.overturned) == overturned_on_appeal:
                # No change (a different request_key but identical effect): record
                # the key and return without touching counts.
                self.cases[ref] = CaseOutcome(subject=subject_hex, bucket=outcome,
                                              overturned=overturned_on_appeal, gen=u32(cur_gen))
                self.request_keys[request_key] = fingerprint
                return {"recorded": True, "subject": subject_hex, "bucket": outcome,
                        "replayed": False, "revised": False, "scorecard": self._to_dict(card)}
            else:
                # Same-generation revision: move the count from old bucket to new.
                self._bump(card, prev.bucket, -1)
                self._bump(card, outcome, +1)
                if bool(prev.overturned) and not overturned_on_appeal:
                    self._bump_overturned(card, -1)
                elif (not bool(prev.overturned)) and overturned_on_appeal:
                    self._bump_overturned(card, +1)
                revised = True
        else:
            self._bump(card, outcome, +1)
            if overturned_on_appeal:
                self._bump_overturned(card, +1)

        card.last_seen = now
        self.cases[ref] = CaseOutcome(subject=subject_hex, bucket=outcome,
                                      overturned=overturned_on_appeal, gen=u32(cur_gen))
        self.scorecards[subject_hex] = card
        self.request_keys[request_key] = fingerprint
        return {"recorded": True, "subject": subject_hex, "bucket": outcome,
                "replayed": False, "revised": revised, "scorecard": self._to_dict(card)}

    def _bump_overturned(self, card: Scorecard, delta: int) -> None:
        cur = int(card.appeals_overturned) + delta
        if cur < 0:
            cur = 0
        card.appeals_overturned = u32(cur)

    # ---------------------------------------------------------------- admin
    @gl.public.write
    def set_relayer(self, relayer: str) -> None:
        self._require_owner()
        self.relayer = Address(relayer)

    @gl.public.write
    def set_paused(self, paused: bool) -> None:
        self._require_owner()
        if not isinstance(paused, bool):
            _fail("paused must be a boolean")
        self.paused = paused

    @gl.public.write
    def transfer_ownership(self, new_owner: str) -> None:
        self._require_owner()
        self.owner = Address(new_owner)

    # ----------------------------------------------------------------- views
    @gl.public.view
    def get_scorecard(self, address: str) -> dict:
        key = _addr_hex(address)
        if key not in self.scorecards:
            return {"address": key, "fulfilled": 0, "partial": 0, "not_fulfilled": 0,
                    "undecided": 0, "appeals_overturned": 0, "total_cases": 0,
                    "decided_cases": 0, "score": 0, "first_seen": "", "last_seen": "",
                    "opted_in": bool(key in self.participation and self.participation[key])}
        d = self._to_dict(self.scorecards[key])
        d["opted_in"] = bool(key in self.participation and self.participation[key])
        return d

    @gl.public.view
    def is_opted_in(self, address: str) -> bool:
        key = _addr_hex(address)
        return bool(key in self.participation and self.participation[key])

    @gl.public.view
    def get_case(self, case_ref: str) -> dict:
        ref = _clean_ref(case_ref)
        if ref not in self.cases:
            return {"case_ref": ref, "subject": "", "bucket": "", "overturned": False, "recorded": False}
        c = self.cases[ref]
        return {"case_ref": ref, "subject": c.subject, "bucket": c.bucket,
                "overturned": bool(c.overturned), "recorded": True}

    @gl.public.view
    def list_recent(self, n: int) -> list:
        """Most recently first-seen subjects (by insertion index), newest first."""
        limit = max(1, min(MAX_LIST, int(n)))
        out = []
        idx = int(self.next_index) - 1
        scanned = 0
        while idx >= 1 and len(out) < limit and scanned < VIEW_SCAN_LIMIT:
            key = u256(idx)
            if key in self.index:
                subj = self.index[key]
                if subj in self.scorecards:
                    out.append(self._to_dict(self.scorecards[subj]))
            idx -= 1
            scanned += 1
        return out

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "schema": LEDGER_SCHEMA_ID,
            "owner": self.owner.as_hex,
            "relayer": self.relayer.as_hex,
            "paused": self.paused,
            "subjects": int(self.next_index) - 1,
            "outcomes": list(OUTCOMES),
        }
