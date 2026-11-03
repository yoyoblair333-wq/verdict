# GenLayer portal — Milestone submission form (paste-ready)

> Builder > Milestones. **Do not** reuse any evidence link from an earlier
> submission. All evidence links below are NEW (the v2 GitHub diff); none was
> cited in VERDICT's project submission, Milestone 1 or Milestone 2.
> Prepared 2026-11-02. Portal allows only one milestone *per project* in review
> at a time (see "Linked project" below).

---

## Linked project

**Decision pending (yours).** This milestone's work is VERDICT v2, but VERDICT
Milestone 1 is still in review, so the portal will not accept a second VERDICT
milestone until M1 clears.

- If VERDICT Milestone 1 has CLEARED → link to **VERDICT** (correct home; the
  evidence repo is VERDICT's).
- If it has NOT cleared → link to **DelayProof** or **JusticeUpgrade** (both
  accepted) to use this week's remaining slot. Note: the evidence repo is
  `yoyoblair333-wq/verdict`, so a steward may question a VERDICT diff filed
  under a different project — flag accepted by Blair.

## Title

VERDICT v2 — SettlementCourt + opt-in ReputationLedger ("did they hold up their end?")

## Description  (922 characters)

VERDICT v2 adds a new verdict domain beyond the scam court. SettlementCourt (new Intelligent Contract) judges handshake/freelance agreements: a claimant lists the promised deliverables, an AI jury labels each kept/broken/disputed, and the contract DERIVES one overall ruling (FULFILLED/PARTIAL/NOT_FULFILLED/UNDECIDED) from the per-deliverable majority, and that derivation, not the model's prose, is what GenLayer validators agree on. Appeal ladder 3->5->7 jurors; an upheld appeal is a public, non-monetary cost. No money, no escrow. A companion ReputationLedger (new contract) is an ERC-8004-style, opt-in, address-only, deterministic track record: scored only after the address itself opts in, erasable, appeal-revisable. A deterministic relayer bridge carries final rulings across. Same SDK conventions, anti-injection + PII gates, 66 new direct-mode tests, genvm-lint + typecheck clean, adversarially cross-reviewed.

## Evidence links  (all NEW / unused; live once the v2 commit is pushed)

1. Repo — https://github.com/yoyoblair333-wq/verdict
2. v2 commit — https://github.com/yoyoblair333-wq/verdict/commit/64cc18327526dfdedecc24fb97530f6277eee8ac
3. SettlementCourt contract — https://github.com/yoyoblair333-wq/verdict/blob/64cc18327526dfdedecc24fb97530f6277eee8ac/contracts/settlement_court.py
4. ReputationLedger contract — https://github.com/yoyoblair333-wq/verdict/blob/64cc18327526dfdedecc24fb97530f6277eee8ac/contracts/reputation_ledger.py
5. Milestone 3 writeup — https://github.com/yoyoblair333-wq/verdict/blob/64cc18327526dfdedecc24fb97530f6277eee8ac/docs/MILESTONE_3.md

## Why no on-chain / Explorer link

Every VERDICT contract already on GenLayer studionet was cited in an earlier
submission, so none can be reused here:
- JudgeRouter `0xEe9AB3e45005E97dA53BFE570412f30D6F2C1e64` (project submission)
- PatternLedger `0x59C6047571bCE66828C733330fc9B5C88afEaE4D`
- RedFlagCourt `0x997E686B2A5A83e1C8f8E9F15CCB487b1893DDb0` (Milestone 1)
- EvidenceCourt `0x893aF11134BA268f922aB454DDd53123DF82A3E5` (Milestone 2)

The two new v2 contracts are intentionally NOT deployed (no spend). This is a
code-contribution milestone; the GitHub diff above is the evidence. Both new
contracts pass `genvm-lint check` + `typecheck` and 66 direct-mode tests, so they
are deploy-ready whenever a fresh on-chain link is wanted.

## Captcha

reCAPTCHA ("I'm not a robot") — left for Blair to tick. Do not submit.
