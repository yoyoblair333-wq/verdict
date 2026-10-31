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
 # --- Publish = network check (Design §1, ADR-019/021; replaces the appeal-onto-chain mutants) ---
 ("relayer","relayer/src/quick.ts",'      if (!q.publishConsent[other]) {','      if (false) {',"pub-both-consent"),
 ("relayer","relayer/src/quick.ts",'    if (nv !== PUBLISH_NOTICE_VERSION) {','    if (false) {',"pub-notice-version"),
 ("relayer","relayer/src/quick.ts",'if (!q.consentNotice.every((n) => PUBLISH_DISCLOSING_NOTICES.has(n))) {','if (false) {',"pub-disclosing-notice"),
 ("relayer","relayer/src/quick.ts",'      if (left < 0) throw new HttpError(429, `that\'s ${cfg.quick.publishDailyCap} free publishes','      if (false) throw new HttpError(429, `that\'s ${cfg.quick.publishDailyCap} free publishes',"pub-cap"),
 ("relayer","relayer/src/quick.ts",'  const publishCap = new DailyCounter(cfg.quick.publishDailyCap, laDay);','  const publishCap = new DailyCounter(cfg.quick.publishDailyCap);',"pub-la-clock"),
 ("relayer","relayer/src/quick.ts",'    const judged = await ctx.judgeOpened(id, () => publishCap.refund(acct));','    const judged = await ctx.judgeOpened(id);',"pub-tier1-refund"),
 ("relayer","relayer/src/quick.ts",'      q.publishConsent[side] = false;\n      q.publishConsentRecords![side] = null;','      q.publishConsentRecords![side] = null;',"pub-withdraw"),
 ("relayer","relayer/src/quick.ts",'    if (clock().getTime() - Date.parse(q.publishRequestedAt) < PUBLISH_REQUEST_TTL_MS) return false;','    return false;',"pub-request-expiry"),
 ("relayer","relayer/src/quick.ts",'      if (!q || side < 0) throw new HttpError(404, "quick verdict not found");','      if (!q) throw new HttpError(404, "quick verdict not found");',"pub-private-link"),
 ("relayer","relayer/src/quick.ts",'      throw new HttpError(409, PUBLISH_FIRST, { code: "publish_first"','      res.status(202).json({}); return; throw new HttpError(409, PUBLISH_FIRST, { code: "publish_first"',"pub-publish-first"),
 ("relayer","relayer/src/quick.ts",'function notPublished(q: QuickCase): void {\n    if (q.caseId !== null) throw','function notPublished(q: QuickCase): void {\n    if (false) throw',"pub-once"),
 ("relayer","relayer/src/app.ts",'      appeals: 0, // publishing a Quick Verdict is not an appeal','      appeals: o.preview ? 1 : 0,',"pub-not-an-appeal"),
 ("relayer","relayer/src/app.ts",'    const overruled = tier1 !== null && tier1.winnerIndex !== m.preview.winnerIndex;','    const overruled = false;',"pub-overruled-flag"),
 ("relayer","relayer/src/quick.ts",'        noticeVersion: PUBLISH_NOTICE_VERSION, // the package','        noticeVersion: "public-onchain-v1", // the package',"pub-package-notice"),
 ("relayer","relayer/src/app.ts",'const freeAppeals = new DailyCounter(cfg.freeAppealsPerDay === 0 ? -1 : cfg.freeAppealsPerDay, laDay);','const freeAppeals = new DailyCounter(cfg.freeAppealsPerDay === 0 ? -1 : cfg.freeAppealsPerDay);',"free-appeal-la-clock"),
 ("relayer","relayer/src/app.ts",'const price = nextTier >= 3 ? cfg.appealPriceCents.tier3 : cfg.appealPriceCents.tier2;','const price = cfg.appealPriceCents.tier2;',"tier3-price"),
 # --- ADR-022 publish budget, queue and fee measurement ---
 ("relayer","relayer/src/config.ts",'  if (cents > PUBLISH_BUDGET_CEILING_CENTS) {','  if (false) {',"budget-ceiling"),
 ("relayer","relayer/src/config.ts",'publishBudgetCentsMonth: publishBudget(int("PUBLISH_BUDGET_CENTS_MONTH", PUBLISH_BUDGET_DEFAULT_CENTS)),','publishBudgetCentsMonth: int("PUBLISH_BUDGET_CENTS_MONTH", PUBLISH_BUDGET_DEFAULT_CENTS),',"budget-ceiling-at-boot"),
 ("relayer","relayer/src/quick.ts",'      if (cfg.mode === "live" && !budget.tryReserve()) {','      if (false) {',"budget-reserve"),
 ("relayer","relayer/src/lib/publishBudget.ts",'    if (this.s.queue.length > 0 || !this.fits()) return false;','    if (!this.fits()) return false;',"budget-no-queue-jump"),
 ("relayer","relayer/src/lib/publishBudget.ts",'    const e = this.s.queue.shift()!;','    const e = this.s.queue.pop()!;',"budget-fifo"),
 ("relayer","relayer/src/lib/publishBudget.ts",'      this.s.spentCents = 0;\n      this.persist();','      this.persist();',"budget-monthly-reset"),
 ("relayer","relayer/src/app.ts",'    save: (s) => store.saveMeta("publish_budget", s),','    save: () => {},',"budget-durable"),
 ("relayer","relayer/src/quick.ts",'      const e = budget.cancel(q.id);\n      if (!e)','      const e = undefined as ReturnType<typeof budget.cancel>;\n      if (!e)',"queue-cancel"),
 ("relayer","relayer/src/quick.ts",'      const queued = budget.cancel(q.id); // both consents','      const queued = undefined as ReturnType<typeof budget.cancel>; // both consents',"queue-withdraw-leaves"),
 ("relayer","relayer/src/quick.ts",'        res.status(202).json({ ...queuedBody(q, position), publishes_left_today: left });','        res.status(202).json({ ...queuedBody(q, position), publishes_left_today: left, footer: "Checked by GenLayer · Finalized" });',"queue-no-early-claim"),
 ("relayer","relayer/src/app.ts",'      requireAdmin(req);\n      const last','      const last',"fees-admin-only"),
 ("relayer","relayer/src/lib/pipeline.ts",'    await this.recordFee(opKey, hash, final.finality);\n','',"fees-recorded"),
 ("relayer","relayer/src/lib/fees.ts",'    if (used !== undefined && used !== null && price !== undefined && price !== null) return','    if (false) return',"fees-measured"),
 # --- Scam Pattern Ledger routes and contract ---
 ("relayer","relayer/src/quick.ts",'      if (body.optIn !== true) throw','      if (false) throw',"pl-route-opt-in"),
 ("relayer","relayer/src/app.ts",'      limiter: new DailyCounter(pcfg.dailyCap, laDay),','      limiter: new DailyCounter(0, laDay),',"pl-route-cap"),
 ("contract","contracts/pattern_ledger.py",'        self._require_submitter()\n        if self.paused:','        if self.paused:',"pl-submitter-py"),
 ("contract","contracts/pattern_ledger.py",'    def set_relayer(self, relayer: str) -> None:\n        self._require_owner()\n','    def set_relayer(self, relayer: str) -> None:\n',"pl-set-relayer-owner-py"),
 # --- owner / relayer split on JudgeRouter (creator earns fees: Blair deploys) ---
 ("contract","contracts/judge_router.py",'        if sender != case.creator and sender != self.owner and sender != self.relayer:','        if sender != case.creator and sender != self.owner:',"jr-relayer-role-py"),
 ("contract","contracts/judge_router.py",'        if sender != case.creator and sender != self.owner and sender != self.relayer:\n            raise','        if False:\n            raise',"jr-operator-gate-py"),
 ("contract","contracts/judge_router.py",'        """Owner only: point the relayer role at a new hot key (or rotate it)."""\n        self._require_owner()\n','        """Owner only: point the relayer role at a new hot key (or rotate it)."""\n',"jr-set-relayer-owner-py"),
 ("contract","contracts/judge_router.py",'        self._require_creator_or_owner(case, "revoke")','        self._require_operator(case, "revoke")',"jr-revoke-not-relayer-py"),
 ("contract","contracts/judge_router.py",'        self.relayer = Address(relayer) if relayer != "" else gl.message.sender_address','        self.relayer = Address(relayer) if relayer != "" else Address("0x" + "00" * 20)',"jr-default-relayer-py"),
 # --- CI root cause: the direct tier must load the pinned GenVM SDK ---
 ("contract","contracts/tests/direct/conftest.py",'sdk_version=sdk_version or GENVM_VERSION','sdk_version=sdk_version',"sdk-pin"),
 ("relayer","relayer/src/quick.ts",'      if (pattern >= 0) {','      if (false) {',"jb-door"),
 ("relayer","relayer/src/lib/practice.ts",'  if (votes.some((v) => v === 0)) return "moved_a_juror";\n','',"jb-moved-seals"),
 ("relayer","relayer/src/quick.ts",'        sealed.append({','        void ({',"jb-sealed-store"),
 ("relayer","relayer/src/quick.ts",'          ...frame, rail: [...QUICK_RAIL], outcome, stamp: STAMPS[outcome], sealed: true, split: null, bench: null,','          ...frame, rail: [...QUICK_RAIL], outcome, stamp: STAMPS[outcome], sealed: true, split: v.split, bench: v.votes, take: clean,',"jb-sealed-no-echo"),
 ("relayer","relayer/src/quick.ts",'if (left < 0) throw','if (false) throw',"jb-cap"),
 ("relayer","relayer/src/quick.ts",'        practiceCap.refund(acct); // a mistrial','        // a mistrial',"jb-mistrial-refund"),
 ("relayer","relayer/src/lib/practice.ts",'      bad(`rule ${x.id}: not reviewed (reviewed.by and reviewed.at are required)`);','      void 0;',"jb-reviewed-rules"),
 ("relayer","relayer/src/lib/rateLimit.ts",'    const d = this.dayKey(now);','    const d = utcDay(now);',"jb-la-clock"),
 # --- independent audit fixes (AUDIT-ENGINEERING.md, 2026-10-31) ---
 ("contract","contracts/judge_router.py",'        self._require_operator(case, "judge")\n','',"judge-creator-py"),
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
