# Guard mutation sweep: deletes each safety guard in turn and checks that the
# test suite then FAILS ("KILLED"). Restores every file afterwards.
#   python3 scripts/mutation_check.py [name ...]
# Needs `make setup` first; relayer mutants run `npm test`, contract mutants pytest.
import subprocess, sys, pathlib
R=pathlib.Path(__file__).resolve().parents[1]
muts=[
 ("relayer","relayer/src/app.ts",'if (obj.consent !== true) {','if (false) {',"consent"),
 ("relayer","relayer/src/app.ts",'if (obj.adult_confirmed !== true) {','if (false) {',"18+"),
 ("relayer","relayer/src/app.ts",'if (side === current.winner_index) throw','if (false) throw',"losing-side"),
 ("relayer","relayer/src/app.ts",'if (m.appeals >= cfg.maxAppealsPerCase) throw','if (false) throw',"max-appeals"),
 ("relayer","relayer/src/app.ts",'if (cls.finality !== "FINALIZED_SUCCESS") {\n      await onFailure','if (false) {\n      await onFailure',"finalized-gate"),
 ("relayer","relayer/src/lib/finality.ts",'finality: execution === "SUCCESS" ? "FINALIZED_SUCCESS" : "FINALIZED_ERROR"','finality: "FINALIZED_SUCCESS"',"execution-success"),
 ("relayer","relayer/src/app.ts",'if (m.finalizedTier !== current.tier || m.confirmedTier !== current.tier || current.confirmed_tier !== current.tier) {','if (false) {',"appeal-needs-final"),
 ("relayer","relayer/src/app.ts",'if (!digestEquals(current.package_digest, m.packageDigest)) throw new HttpError(409, "receipt number mismatch between relayer and chain");\n    if (current.status !== "pending")','if (current.status !== "pending")',"digest-match"),
 ("relayer","relayer/src/app.ts",'    if (expired(m)) {\n      expireInBackground','    if (false) {\n      expireInBackground',"expiry"),
 ("relayer","relayer/src/app.ts",'    if (m.revoked) return; // withdrawn','    // removed',"revocation"),
 ("relayer","relayer/src/app.ts",'const live = cfg.mode === "live";','const live = true;',"shadow"),
 ("relayer","relayer/src/lib/moderation.ts",'[/\\b[\\w.+-]+@[\\w-]+\\.[\\w.-]+\\b/, "contains an email address"],','',"no-pii"),
 ("relayer","relayer/src/app.ts",'else if (credits.spend(payer, price)) paidWith = "credit";','else if (true) paidWith = "credit";',"credit-debit"),
 ("relayer","relayer/src/lib/pipeline.ts",'    await this.requirePin();\n','',"pin"),
 ("relayer","relayer/src/lib/package.ts",'if (!digestEquals(digest, claimedDigest as string)) fail("digest_mismatch", "package digest");','',"pkg-digest-ts"),
 ("contract","contracts/judge_router.py",'    if not isinstance(disclosure, dict) or disclosure.get("consent") is not True:\n        _pkg_fail("consent_required", "disclosure.consent must be true")\n','',"consent-py"),
 ("contract","contracts/judge_router.py",'    if _sha256_hex(canonical) != package_digest:\n        _pkg_fail("digest_mismatch", "package digest")\n','',"digest-py"),
 ("contract","contracts/judge_router.py",'        self._require_digest(case, package_digest)\n        self._require_live(case)\n        if case.status != STATUS_PENDING:','        self._require_live(case)\n        if case.status != STATUS_PENDING:',"judge-digest-py"),
 ("contract","contracts/judge_router.py",'        if self._past_deadline(case):\n            raise gl.vm.UserError(f"{ERR_EXPECTED} case expired")','        pass',"expiry-py"),
 ("contract","contracts/judge_router.py",'        if case.status == STATUS_REVOKED:\n            raise gl.vm.UserError(f"{ERR_EXPECTED} case revoked")','        pass',"revoked-py"),
 ("contract","contracts/judge_router.py",'        if sc < 0 or sc > MAX_SCORE:\n            raise ValueError("score out of range")','        pass',"score-range-py"),
 ("contract","contracts/judge_router.py",'        if from_tier != 0 and from_tier != tier:','        if False:',"from-tier-py"),
 ("contract","contracts/judge_router.py",'    _exact_keys(pkg, PACKAGE_KEYS, "package")\n','',"closed-keys-py"),
 ("contract","contracts/judge_router.py",'        if case.status == STATUS_FINAL or int(case.confirmed_tier) >= 1:','        if case.status == STATUS_FINAL:',"revoke-after-confirm-py"),
 ("contract","contracts/judge_router.py",'        if case.package_digest != "" and int(case.confirmed_tier) != tier:','        if False:',"appeal-needs-confirm-py"),
 ("relayer","relayer/src/app.ts",'if (m.finalizedTier >= 1 || current.confirmed_tier >= 1 || current.status === "final" || current.status === "appealed" || current.tier !== 1) {','if (current.status === "final") {',"revoke-window"),
 ("relayer","relayer/src/app.ts",'    await rereadDigest(id, m, "judge");','',"reread-judge"),
 ("relayer","relayer/src/app.ts",'      if (clock().getTime() > Date.parse(d.expiresAt)) {','      if (false) {',"draft-deadline"),
 ("relayer","relayer/src/lib/moderation.ts",'      return { ok: false, status: 503, reason: `moderation provider unavailable','      return { ok: true, status: 503, reason: `moderation provider unavailable',"provider-fail-closed"),
 ("relayer","relayer/src/app.ts",'const credits = deps.credits ?? new FileCredits(cfg.creditsPath);','const credits = deps.credits ?? new (class { b=0; balance(){return 0} spend(){return false} grant(){} })();',"durable-credits-default"),
 ("relayer","relayer/src/app.ts",'    const { twitchTimer: _t, ...data } = m;\n    store.saveCase(id, data as CaseMeta);','    void store;',"durable-state"),
 # --- Quick Verdict / Red Flag Court / practice court (2026-10-31, second round) ---
 ("relayer","relayer/src/lib/redflag.ts",'if (label === "legit" && tally.scam > 0) {','if (false) {',"rf-no-legit-with-scam"),
 ("relayer","relayer/src/lib/redflag.ts",'if (label === "legit" && moneyOffer) {','if (false) {',"rf-money-sus"),
 ("relayer","relayer/src/lib/redact.ts",'  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+/g },\n','',"redact-email"),
 ("relayer","relayer/src/lib/redact.ts",'  { kind: "handle", re: /(^|[^\\w@])@[A-Za-z0-9_.]{2,30}/g, keep: 1 },\n','',"redact-handle"),
 ("relayer","relayer/src/lib/redact.ts",'  { kind: "number", re: /\\b\\d{6,}\\b/g },\n','',"redact-long-number"),
 ("relayer","relayer/src/lib/redact.ts",'(?:${TLD})\\b(?:\\/[^\\s<>"]*)?`, "gi") },','(?:nomatch)\\b`, "gi") },',"redact-bare-link"),
 ("relayer","relayer/src/lib/redact.ts",'  { kind: "phone", re: /(?:\\+\\d{1,3}[\\s.-]?)?\\(?\\b\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}\\b|\\+\\d{1,3}(?:[\\s.-]?\\d{2,4}){2,4}\\b/g },\n','',"redact-phone"),
 ("relayer","relayer/src/lib/redact.ts",'    counts.name += 1;\n    return lead + TAGS.name;','    return whole;',"redact-name"),
 ("relayer","relayer/src/lib/redact.ts",'  { kind: "number", re: /\\b(?:\\d[ -]?){12,18}\\d\\b/g, sensitive: true },','  { kind: "number", re: /\\b(?:\\d[ -]?){12,18}\\d\\b/g },',"redact-card-warning"),
 ("relayer","app/index.html","  {kind:'link', re:new RegExp(","  {kind:'link', re:/$^/g, _x:new RegExp(","app-index-redact-link"),
 ("relayer","app/artifact.html","  if(label === 'legit' && tally.scam > 0){","  if(false){","app-artifact-no-legit-with-scam"),
 ("relayer","relayer/src/quick.ts",'      const red = redact(body.message);','      const red = { ...redact(""), text: body.message };',"rf-relayer-redact"),
 ("relayer","relayer/src/quick.ts",'if (!exactTrue(body.redaction, "user_approved")) {','if (false) {',"rf-approval"),
 ("relayer","relayer/src/quick.ts",'if (len > RED_FLAG_MAX_CHARS) throw','if (false) throw',"rf-limit"),
 ("relayer","relayer/src/quick.ts",'if (policyHit(text) !== null || EXTORTION_RE.test(normalise(text))) {','if (false) {',"rf-helpline"),
 ("relayer","relayer/src/quick.ts",'      if (controlPatternHit(text)) {','      if (false) {',"rf-door"),
 ("relayer","relayer/src/quick.ts",'if (redFlagCap.take(acct, clock()) < 0) throw','if (false) throw',"rf-cap"),
 ("relayer","relayer/src/lib/jury.ts",'export const QUICK_RAIL = ["Submitted", "Jury scoring", "Done"] as const;','export const QUICK_RAIL = ["Submitted", "Jury scoring", "Network checking", "Finalized"] as const;',"qv-rail"),
 ("relayer","relayer/src/quick.ts",'label: "Quick Verdict", venue: "quick_verdict", network_checked: false,','label: "Quick Verdict", venue: "quick_verdict", network_checked: true,',"qv-not-network-checked"),
 ("relayer","relayer/src/lib/jury.ts",'    if (sc < 0 || sc > MAX_SCORE) throw new JuryError("score out of range");\n','',"qv-score-range"),
 ("relayer","relayer/src/quick.ts",'if (!exactTrue(d, "consent")) throw','if (false) throw',"qv-consent"),
 ("relayer","relayer/src/quick.ts",'if (side === q.verdict.winnerIndex) throw','if (false) throw',"qv-loser-only"),
 ("relayer","relayer/src/quick.ts",'if (!q.appealConsent[other]) throw','if (false) throw',"qv-both-consent"),
 ("relayer","relayer/src/quick.ts",'if (!q.consentNotice.every((n) => APPEAL_DISCLOSING_NOTICES.has(n))) {','if (false) {',"qv-notice-version"),
 ("relayer","relayer/src/quick.ts",'      const charge = ctx.chargeFirstAppeal(req);','      const charge = { paidWith: "free", priceCents: 0, refund() {} };',"qv-charge"),
 ("relayer","relayer/src/app.ts",'      appeals: o.fromQuick ? 1 : 0,','      appeals: 0,',"qv-one-appeal-left"),
 ("relayer","relayer/src/app.ts",'nextTier >= 3 || m.fromQuick ? cfg','nextTier >= 3 ? cfg',"qv-tier2-price"),
 ("relayer","relayer/src/quick.ts",'      if (pattern >= 0) {','      if (false) {',"jb-door"),
 ("relayer","relayer/src/lib/practice.ts",'  if (votes.some((v) => v === 0)) return "moved_a_juror";\n','',"jb-moved-seals"),
 ("relayer","relayer/src/quick.ts",'        sealed.append({','        void ({',"jb-sealed-store"),
 ("relayer","relayer/src/quick.ts",'          ...frame, rail: [...QUICK_RAIL], outcome, stamp: STAMPS[outcome], sealed: true, split: null, bench: null,','          ...frame, rail: [...QUICK_RAIL], outcome, stamp: STAMPS[outcome], sealed: true, split: v.split, bench: v.votes, take: clean,',"jb-sealed-no-echo"),
 ("relayer","relayer/src/quick.ts",'if (left < 0) throw','if (false) throw',"jb-cap"),
 ("relayer","relayer/src/quick.ts",'        practiceCap.refund(acct); // a mistrial','        // a mistrial',"jb-mistrial-refund"),
 ("relayer","relayer/src/lib/practice.ts",'      bad(`rule ${x.id}: not reviewed (reviewed.by and reviewed.at are required)`);','      void 0;',"jb-reviewed-rules"),
 ("relayer","relayer/src/lib/rateLimit.ts",'    const d = this.dayKey(now);','    const d = utcDay(now);',"jb-la-clock"),
 # --- independent audit fixes (AUDIT-ENGINEERING.md, 2026-10-31) ---
 ("contract","contracts/judge_router.py",'        self._require_creator_or_owner(case, "judge")\n','',"judge-creator-py"),
 ("contract","contracts/judge_router.py",'        self._require_owner()\n        ref_key = ""','        ref_key = ""',"legacy-open-owner-py"),
 ("relayer","relayer/src/app.ts",'      for (const k of VERDICT_FIELDS) delete view[k];\n','',"read-strip-unfinal"),
 ("relayer","relayer/src/app.ts",'        if (!v.verdictFinal) continue;\n','',"gallery-final-only"),
 ("relayer","relayer/src/config.ts",'if (mode === "shadow" && (v === "" || ZERO_KEY.test(v))) {','if (false) {',"shadow-ephemeral-key"),
 ("relayer","relayer/src/app.ts",'app.use(express.json({ limit: "16kb" }));','app.use(express.json({ limit: "10mb" }));',"body-limit"),
 ("relayer","relayer/src/lib/webhook.ts",'createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");','"00";',"webhook-hmac"),
 ("relayer","relayer/src/lib/genlayer.ts",'      value: 0n, // never','      value: 1n, // never',"value-zero"),
]
only=sys.argv[1:]
for kind,f,old,new,name in muts:
    if only and name not in only: continue
    p=R/f; orig=p.read_text(encoding="utf-8")
    if old not in orig: print(f"{name}: PATTERN NOT FOUND"); continue
    p.write_text(orig.replace(old,new,1),encoding="utf-8")
    try:
        if kind=="relayer":
            r=subprocess.run("npm test",shell=True,cwd=R/"relayer",capture_output=True,text=True)
        else:
            r=subprocess.run(f"{sys.executable} -m pytest -q -x",shell=True,cwd=R/"contracts",capture_output=True,text=True)
        print(f"{name}: {'KILLED (tests fail)' if r.returncode!=0 else 'SURVIVED'}")
    finally:
        p.write_text(orig,encoding="utf-8")
