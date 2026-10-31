// Quick Verdict routes: the off-chain jury (ADR-013, ADR-014, ADR-015, ADR-018).
//
//   POST /quick                    Settle It, judged off-chain (5 personas)
//   POST /quick/:id/consent        a side consents to publication on appeal (notice appeal-onchain-v1)
//   POST /quick/:id/appeal         losing side appeals onto the chain: fresh on-chain Tier 1
//                                  case through the existing package + judge path; counts as
//                                  that side's first appeal (daily free appeal or $1.99)
//   POST /quick/:id/revoke         refused after Done (409, ADR-012 / V-QV-07)
//   POST /quick/:id/takedown       hides the card; never blocks the appeal
//   POST /redflag                  Red Flag Court (redacted, no appeals)
//   GET  /practice/today           practice-court case (topic only)
//   POST /practice/attempts        Jailbreak the Jury attempt
//
// Every Quick Verdict body: mode "quick_verdict", label "Quick Verdict",
// network_checked false, rail Submitted → Jury scoring → Done, and NO receipt
// number, package digest or tx (assertQuickHonest refuses to send one).
// No route here writes to a chain except /quick/:id/appeal, which hands off
// to the normal on-chain path after both consents are recorded.

import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { Config } from "./config.js";
import { HttpError, wrap } from "./lib/http.js";
import { JsonlFile } from "./lib/journal.js";
import { JUROR_PERSONAS, JuryError, QUICK_JURORS, QUICK_RAIL, RUBRIC_PRESETS, resolveRubric, runPanel, type JudgeProvider } from "./lib/jury.js";
import { controlPatternHit, localCheck, matchedControlPattern, MAX_ENTRY_CHARS, moderate, normalise, policyHit, type ModerationOptions } from "./lib/moderation.js";
import { benchOutcome, currentRule, DOOR_ROASTS, PRACTICE_LABEL, PRACTICE_NOTICE, STAMPS, type PracticeConfig } from "./lib/practice.js";
import { DailyCounter, laDay, utcDay } from "./lib/rateLimit.js";
import { measure, redact, summary } from "./lib/redact.js";
import { decideRuling, FLAG_CODES, isMoneyOffer, LEGIT_STANDING, RULING_COPY, runRedFlagPanel, STILL_TO_CHECK } from "./lib/redflag.js";
import { validateVerdictPayload } from "./lib/verdict.js";

/** Red Flag Court input limit: 1,000 code points (ADR-014 item 9 amends
 * ADR-007 for Red Flag Court only). Counted after redaction, with each
 * redaction pill as one character. Every on-chain entry stays <= 280. */
export const RED_FLAG_MAX_CHARS = 1000;

/** Submit-time notice. It discloses publication on appeal, so these consent
 * records satisfy ADR-013 item 5 (notice-v1 / public-onchain-v1 do not). */
export const QUICK_NOTICE_VERSION = "quick-v1";
export const QUICK_NOTICE =
  "Quick Verdict: the jury judges your takes privately. Nothing is published, and it is not checked by the network. " +
  "If the losing side appeals it onto the chain, both takes become public and permanent, and each of you is asked again first. 18+ only.";
/** Notice versions whose consent records disclosed publication on appeal. */
export const APPEAL_DISCLOSING_NOTICES = new Set([QUICK_NOTICE_VERSION]);
/** Appeal-time notice both sides must accept (ADR-018 item 1). */
export const APPEAL_NOTICE_VERSION = "appeal-onchain-v1";
export const APPEAL_NOTICE =
  "Appealing onto the chain publishes both takes on a public blockchain. They can't be erased. A fresh 5-juror case is then judged on-chain. 18+ only.";

export const QUICK_FOOTER = "Five AI juror personas · Quick Verdict · Not network-checked";
export const REDFLAG_FOOTER = "Five AI juror personas · Quick Verdict · Not network-checked · We never open links.";
export const REDFLAG_NOTICE = "Your message is checked privately. Only the share card you choose to post is public, and it never shows the message.";
export const HELP_LINE =
  "The jury won't rule on this one. If someone is threatening you or you're in danger, contact local emergency services. In the US you can call or text 988 any time.";

const EXTORTION_RE = /\b(?:(?:i|we)\s+have\s+(?:your|ur)\s+(?:photos?|pics?|pictures?|videos?)|send\s+(?:them|it|these)\s+to\s+(?:your|ur)\s+(?:contacts|family|friends|boss)|sextortion)\b/i;

const FORBIDDEN_KEYS = /^(receipt|receipt_number|receiptNumber|package_digest|packageDigest|tx|txHash|inbox_record|finality|explorer|record_url)$/;
const FALSE_CLAIM = /(?<![Nn]ot )(network[- ]checked|checked by (?:the|a) network|finalized|\bVR-[0-9A-F]{4}|nobody controls)/i;

/** Throws if a Quick Verdict / practice body would claim a network check or carry a receipt (V-QV-02). */
export function assertQuickHonest(body: unknown, path = "body"): void {
  if (Array.isArray(body)) {
    body.forEach((v, i) => assertQuickHonest(v, `${path}[${i}]`));
    return;
  }
  if (typeof body === "string") {
    if (FALSE_CLAIM.test(body)) throw new Error(`quick verdict ${path} makes a network/receipt claim: ${body}`);
    return;
  }
  if (typeof body !== "object" || body === null) return;
  for (const [k, v] of Object.entries(body)) {
    if (FORBIDDEN_KEYS.test(k)) throw new Error(`quick verdict carries forbidden key ${path}.${k}`);
    if (k === "network_checked" && v !== false) throw new Error("quick verdict must say network_checked: false");
    assertQuickHonest(v, `${path}.${k}`);
  }
}

function quickFrame(extra: Record<string, unknown>): Record<string, unknown> {
  return { mode: "quick_verdict", label: "Quick Verdict", venue: "quick_verdict", network_checked: false, rail: [...QUICK_RAIL], status: "done", ...extra };
}

interface QuickCase {
  id: string;
  rubric: string;
  entries: [string, string];
  sideTokenHashes: string[];
  verdict: { winnerIndex: number; scores: number[]; jurorVotes: number[]; split: string; reason: string; jurors: 5 };
  createdAt: string;
  expiresAt: string;
  /** Submit-time consent notice version, per side. */
  consentNotice: string[];
  /** Appeal-time consent (APPEAL_NOTICE_VERSION), per side. */
  appealConsent: boolean[];
  hidden: boolean;
  caseId: number | null;
}

export interface Charge {
  paidWith: string;
  priceCents: number;
  refund(): void;
}

export interface QuickCtx {
  cfg: Config;
  clock: () => Date;
  provider: JudgeProvider | undefined;
  practice: PracticeConfig | undefined;
  modOpts: ModerationOptions;
  quota: (req: Request, bucket: "case" | "action") => void;
  requireDisclosure: (body: Record<string, unknown>) => void;
  sideForToken: (hashes: string[], token: string | undefined) => number;
  /** First appeal: daily free appeal, else Appeals Court price from credit (402 if neither). */
  chargeFirstAppeal: (req: Request) => Charge;
  openCase: (o: {
    requestKey: string;
    rubric: string;
    surface: "settle";
    entries: Array<{ text: string; assurance: "self_asserted" }>;
    sideTokenHashes: string[];
  }) => Promise<{ status: number; body: Record<string, unknown> }>;
  judgeOpened: (id: number) => Promise<Record<string, unknown>>;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const exactTrue = (obj: unknown, key: string): boolean =>
  typeof obj === "object" && obj !== null && !Array.isArray(obj) && (obj as Record<string, unknown>)[key] === true;

export function registerQuickRoutes(app: Express, ctx: QuickCtx): void {
  const { cfg, clock } = ctx;
  const store = new JsonlFile(cfg.quick.storePath);
  const redTeam = new JsonlFile(cfg.quick.redTeamPath);
  const sealed = new JsonlFile(cfg.quick.sealedPath);
  const cases = new Map<string, QuickCase>();
  for (const r of store.readAll() as QuickCase[]) cases.set(r.id, r);
  const save = (q: QuickCase) => store.append(q);
  // Settle It Quick Verdicts keep UTC like the rest of Settle It; the games reset at 00:00 LA (ADR-018 item 3).
  const settleCap = new DailyCounter(cfg.quick.dailyCap, utcDay);
  const redFlagCap = new DailyCounter(cfg.quick.dailyCap, laDay);
  const practiceCap = new DailyCounter(cfg.quick.practiceDailyCap, laDay);

  /** HMAC(identity): counters never hold a raw IP or API key (V-PRIV-09). */
  function accountKey(req: Request): string {
    const key = req.header("x-api-key");
    const id = key ? `key:${key}` : `ip:${req.ip ?? "unknown"}`;
    return createHmac("sha256", cfg.quick.accountKeySecret).update(`${laDay(clock())}|${id}`).digest("hex");
  }

  function needProvider(): JudgeProvider {
    if (!ctx.provider) throw new HttpError(503, "no Quick Verdict judge provider configured", { code: "quick_verdict_unavailable" });
    return ctx.provider;
  }

  function send(res: Response, status: number, body: Record<string, unknown>): void {
    assertQuickHonest(body);
    res.status(status).json(body);
  }

  function quickSide(req: Request): { q: QuickCase; side: number } {
    const q = typeof req.params.id === "string" ? cases.get(req.params.id) : undefined;
    if (!q) throw new HttpError(404, "quick verdict not found");
    const side = ctx.sideForToken(q.sideTokenHashes, req.header("x-side-token") ?? undefined);
    if (side < 0) throw new HttpError(403, "a valid side token (x-side-token) is required");
    return { q, side };
  }

  /** Appeal-time consent: exact-true consent + 18+ and the appeal notice version. */
  function requireAppealConsent(body: Record<string, unknown>): void {
    ctx.requireDisclosure(body);
    const nv = (body.disclosure as Record<string, unknown>).notice_version;
    if (nv !== APPEAL_NOTICE_VERSION) {
      throw new HttpError(422, `disclosure.notice_version must be ${APPEAL_NOTICE_VERSION}`, { code: "notice_version_required", notice: APPEAL_NOTICE, notice_version: APPEAL_NOTICE_VERSION });
    }
  }

  // ------------------------------------------------ Settle It Quick Verdict
  app.post(
    "/quick",
    wrap(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const { rubric, entries } = body;
      if (typeof rubric !== "string" || !(rubric.trim().toLowerCase() in RUBRIC_PRESETS)) throw new HttpError(400, "rubric must be a preset key");
      if (!Array.isArray(entries) || entries.length !== 2) throw new HttpError(400, "Settle It cases have exactly 2 sides");
      const texts = entries.map((e) => {
        if (typeof e !== "string" || e.trim() === "" || [...e].length > MAX_ENTRY_CHARS) throw new HttpError(400, `each entry must be 1 to ${MAX_ENTRY_CHARS} characters`);
        return e;
      }) as [string, string];
      const d = body.disclosure;
      if (!exactTrue(d, "consent")) throw new HttpError(422, "disclosure.consent must be true", { code: "consent_required", notice: QUICK_NOTICE, notice_version: QUICK_NOTICE_VERSION });
      if (!exactTrue(d, "adult_confirmed")) throw new HttpError(422, "disclosure.adult_confirmed must be true (18+ only)", { code: "adult_confirmation_required" });
      // Same moderation as an on-chain case, so a later appeal can't fail on content.
      const mod = await moderate([rubric, ...texts], ctx.modOpts);
      if (!mod.ok) throw new HttpError(mod.status ?? 422, mod.reason ?? "entry rejected by moderation");
      const provider = needProvider();
      const acct = accountKey(req);
      if (settleCap.take(acct, clock()) < 0) throw new HttpError(429, "daily Quick Verdict cap reached");
      let panel;
      try {
        panel = await runPanel(provider, resolveRubric(rubric), texts.map((t) => normalise(t).trim()));
      } catch (e) {
        if (!(e instanceof JuryError)) throw e;
        settleCap.refund(acct);
        throw new HttpError(502, "the jury could not rule (a juror answer was broken); nothing was counted", { outcome: "no_ruling" });
      }
      const v = panel.verdict;
      const chk = validateVerdictPayload(v, 2, QUICK_JURORS);
      if (!chk.ok) {
        settleCap.refund(acct);
        throw new HttpError(502, `invalid quick verdict: ${chk.reason}`, { outcome: "no_ruling" });
      }
      const sideTokens = [randomBytes(24).toString("base64url"), randomBytes(24).toString("base64url")];
      const now = clock();
      const q: QuickCase = {
        id: randomBytes(12).toString("base64url"),
        rubric: rubric.trim().toLowerCase(),
        entries: texts,
        sideTokenHashes: sideTokens.map(sha256),
        verdict: { winnerIndex: v.winner_index, scores: v.scores, jurorVotes: v.votes, split: v.split, reason: v.reason, jurors: 5 },
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + cfg.quick.ttlSec * 1000).toISOString(),
        consentNotice: [QUICK_NOTICE_VERSION, QUICK_NOTICE_VERSION],
        appealConsent: [false, false],
        hidden: false,
        caseId: null,
      };
      cases.set(q.id, q);
      save(q);
      send(
        res,
        201,
        quickFrame({
          quick_id: q.id,
          side_tokens: sideTokens,
          expires_at: q.expiresAt,
          verdict: q.verdict,
          bench: panel.results.map((r, j) => ({ juror: JUROR_PERSONAS[j]![0], title: JUROR_PERSONAS[j]![1], vote: r.winner_index, reason: r.reason })),
          footer: QUICK_FOOTER,
          appeal_onto_chain: {
            who: "The losing side. Both sides must first accept the appeal notice.",
            consent_path: `/quick/${q.id}/consent`,
            appeal_path: `/quick/${q.id}/appeal`,
            notice: APPEAL_NOTICE,
            notice_version: APPEAL_NOTICE_VERSION,
            counts_as: "appeal 1 of 2 (daily free appeal, else $1.99); one more appeal (Tier 2, $4.99) is left after it, so it never reaches the Supreme Court",
          },
        }),
      );
    }),
  );

  // Either side records its consent to publication on appeal.
  app.post(
    "/quick/:id/consent",
    wrap(async (req, res) => {
      const { q, side } = quickSide(req);
      if (q.caseId !== null) throw new HttpError(409, "already appealed onto the chain", { case_id: q.caseId });
      requireAppealConsent((req.body ?? {}) as Record<string, unknown>);
      q.appealConsent[side] = true;
      save(q);
      res.json({ consented: true, side, awaiting_sides: q.appealConsent.flatMap((c, i) => (c ? [] : [i])), note: "Nothing is published until the losing side appeals and both sides have consented." });
    }),
  );

  // The losing side appeals onto the chain (ADR-018 item 1, V-QV-05).
  app.post(
    "/quick/:id/appeal",
    wrap(async (req, res) => {
      const { q, side } = quickSide(req);
      if (side === q.verdict.winnerIndex) throw new HttpError(403, "the winning side cannot appeal");
      if (q.caseId !== null) throw new HttpError(409, "already appealed onto the chain", { case_id: q.caseId });
      if (clock().getTime() > Date.parse(q.expiresAt)) throw new HttpError(410, "the appeal window for this Quick Verdict has closed");
      if (!q.consentNotice.every((n) => APPEAL_DISCLOSING_NOTICES.has(n))) {
        throw new HttpError(409, "a side consented on a notice that did not disclose publication on appeal", { code: "notice_not_disclosing" });
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      requireAppealConsent(body); // the appealing side accepts the appeal notice now
      q.appealConsent[side] = true;
      save(q);
      const other = 1 - side;
      if (!q.appealConsent[other]) throw new HttpError(409, "the other side hasn't consented to publication; the appeal is refused", { code: "other_side_not_consented" });
      const mod = await moderate([q.rubric, ...q.entries], ctx.modOpts);
      if (!mod.ok) throw new HttpError(mod.status ?? 422, mod.reason ?? "entry rejected by moderation");
      ctx.quota(req, "action");
      const charge = ctx.chargeFirstAppeal(req);
      let opened;
      try {
        opened = await ctx.openCase({
          requestKey: randomBytes(16).toString("hex"),
          rubric: q.rubric,
          surface: "settle",
          entries: q.entries.map((text) => ({ text, assurance: "self_asserted" as const })),
          sideTokenHashes: q.sideTokenHashes, // the same side tokens work on the on-chain case
        });
      } catch (e) {
        charge.refund(); // technical refund: nothing was opened
        throw e;
      }
      if (opened.status !== 201) {
        if (opened.status >= 400) charge.refund();
        res.status(opened.status).json({ ...opened.body, from_quick_verdict: q.id, paid_with: charge.paidWith });
        return;
      }
      const id = opened.body.id as number;
      q.caseId = id;
      save(q);
      const judged = await ctx.judgeOpened(id);
      res.status(202).json({ ...opened.body, tier: 1, appeals_used: 1, appeals_left: 1, next_appeal_cents: cfg.appealPriceCents.tier3, judge: judged, paid_with: charge.paidWith, price_cents: charge.priceCents, from_quick_verdict: q.id, note: "This is now an on-chain case. Its card appears once the network finalizes it." });
    }),
  );

  // After Done: revocation refused, takedown available (ADR-012 via ADR-013 item 6).
  app.post(
    "/quick/:id/revoke",
    wrap(async (req, res) => {
      quickSide(req);
      void res;
      throw new HttpError(409, "the Quick Verdict is done; request a takedown instead (POST /quick/:id/takedown)");
    }),
  );
  app.post(
    "/quick/:id/takedown",
    wrap(async (req, res) => {
      const { q } = quickSide(req);
      q.hidden = true;
      save(q);
      res.json({ hidden: true, note: "Card hidden. The losing side can still appeal onto the chain." });
    }),
  );

  // -------------------------------------------------------- Red Flag Court
  app.post(
    "/redflag",
    wrap(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (!exactTrue(body.disclosure, "adult_confirmed")) throw new HttpError(422, "disclosure.adult_confirmed must be true (18+ only)", { code: "adult_confirmation_required" });
      if (!exactTrue(body.redaction, "user_approved")) {
        throw new HttpError(422, "redaction.user_approved must be true: check the cleaned-up version first", { code: "redaction_approval_required", notice: REDFLAG_NOTICE });
      }
      if (typeof body.message !== "string" || body.message.trim() === "") throw new HttpError(400, "message must be a non-empty string");
      // Redact again here, before moderation and the LLM call: the browser copy may be missing or modified.
      const red = redact(body.message);
      const text = red.text.trim();
      const len = measure(text);
      if (len > RED_FLAG_MAX_CHARS) throw new HttpError(400, `message exceeds ${RED_FLAG_MAX_CHARS} characters; paste the sketchiest part`, { length: len });
      const redaction = { counts: red.counts, summary: summary(red.counts), sensitive: red.sensitive, warning: red.warning };
      if (policyHit(text) !== null || EXTORTION_RE.test(normalise(text))) {
        send(res, 200, quickFrame({ court: "Red Flag Court", outcome: "declined", ruling: null, help: HELP_LINE, redaction, appealable: false }));
        return;
      }
      const provider = needProvider();
      const acct = accountKey(req);
      if (redFlagCap.take(acct, clock()) < 0) throw new HttpError(429, "daily Red Flag Court cap reached");
      const money = isMoneyOffer(text);
      const common = { court: "Red Flag Court", redacted_text: text, redaction, appealable: false, footer: REDFLAG_FOOTER };
      if (controlPatternHit(text)) {
        // The message talks to the AI. No juror read it: no tally, no bench.
        const flags = ["talks_to_the_ai", ...(money ? ["money_offer"] : [])];
        send(res, 200, quickFrame({
          ...common, outcome: "stopped_at_door", ruling: "SUS", stamp: "SUS", tally: null, tally_text: null, bench: null,
          flags: flags.map((c) => ({ code: c, label: FLAG_CODES[c] })),
          subline: "This message contains instructions aimed at an AI, so the jury didn't read it.", next_step: RULING_COPY.SUS.next,
        }));
        return;
      }
      let votes;
      try {
        votes = await runRedFlagPanel(provider, text);
      } catch (e) {
        if (!(e instanceof JuryError)) throw e;
        redFlagCap.refund(acct);
        throw new HttpError(502, "the jury could not rule (a juror answer was broken); nothing was counted", { outcome: "no_ruling" });
      }
      const r = decideRuling(votes, money);
      // Nothing about the message is stored (V-RF-13).
      send(res, 200, quickFrame({
        ...common,
        outcome: "ruled",
        ruling: r.ruling,
        stamp: r.ruling,
        tally: r.tally,
        tally_text: r.tallyText,
        forced_by: r.forcedBy,
        flags: r.flags.map((c) => ({ code: c, label: FLAG_CODES[c] })),
        what_still_to_check: r.ruling === "LOOKS LEGIT" ? STILL_TO_CHECK : [],
        standing_line: r.ruling === "LOOKS LEGIT" ? LEGIT_STANDING : null,
        subline: RULING_COPY[r.ruling].subline,
        next_step: RULING_COPY[r.ruling].next,
        bench: votes.map((v, j) => ({ juror: JUROR_PERSONAS[j]![0], vote: v.label, line: v.reason })),
      }));
    }),
  );

  // ------------------------------------------------------- practice court
  function needPractice(): PracticeConfig {
    if (!ctx.practice) throw new HttpError(503, "practice court is not configured", { code: "practice_unavailable" });
    return ctx.practice;
  }

  app.get("/practice/today", (_req, res) => {
    const p = ctx.practice;
    if (!p) {
      res.status(503).json({ error: "practice court is not configured" });
      return;
    }
    const { rule, caseNo, periodKey } = currentRule(p, clock());
    // Only the topic leaves the relayer; the rule text and house take never do.
    send(res, 200, { court: "Practice court", network_checked: false, label: PRACTICE_LABEL, case_no: caseNo, period: p.period, period_key: periodKey, resets: "00:00 America/Los_Angeles", topic: rule.topic, attempts_per_day: cfg.quick.practiceDailyCap, notice: PRACTICE_NOTICE });
  });

  app.post(
    "/practice/attempts",
    wrap(async (req, res) => {
      const p = needPractice();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const take = body.take;
      if (typeof take !== "string" || take.trim() === "" || [...take].length > MAX_ENTRY_CHARS) throw new HttpError(400, `take must be 1 to ${MAX_ENTRY_CHARS} characters`);
      if (!exactTrue(body.disclosure, "consent")) throw new HttpError(422, "disclosure.consent must be true", { code: "consent_required", notice: PRACTICE_NOTICE });
      if (!exactTrue(body.disclosure, "adult_confirmed")) throw new HttpError(422, "disclosure.adult_confirmed must be true (18+ only)", { code: "adult_confirmation_required" });
      const provider = needProvider();
      const acct = accountKey(req);
      const left = practiceCap.take(acct, clock());
      if (left < 0) throw new HttpError(429, "that's 10 attempts today; the court reopens at midnight Pacific", { attempts_left: 0 });
      const { rule, caseNo, periodKey } = currentRule(p, clock());
      const clean = normalise(take).trim();
      const frame = { court: "Practice court", network_checked: false, label: PRACTICE_LABEL, case_no: caseNo, topic: rule.topic, attempts_left: left };
      const acctHash = sha256(acct);

      // 1. The door: relayer blocklist. No jury runs, so no split and no bench.
      const pattern = matchedControlPattern(clean);
      if (pattern >= 0) {
        redTeam.append({ at: clock().toISOString(), outcome: "stopped_at_door", rule_id: rule.id, period: periodKey, account: acctHash, pattern, text: clean });
        const roast = DOOR_ROASTS[pattern % DOOR_ROASTS.length]!;
        send(res, 200, { ...frame, rail: ["Submitted", "Done"], outcome: "stopped_at_door", stamp: STAMPS.stopped_at_door, split: null, bench: null, roast: { juror: roast.juror, label: `${roast.juror}'s take on your attempt`, line: roast.line } });
        return;
      }
      // 2. Rules of play (PII, threats): Blocked, no score, no card, attempt refunded.
      const chk = localCheck(clean, "Take", MAX_ENTRY_CHARS);
      if (!chk.ok) {
        practiceCap.refund(acct);
        throw new HttpError(422, (chk.reason ?? "take rejected").replace(/; entries are public and permanent\.$/, ". Text only, no real names or contact details."), { outcome: "blocked" });
      }
      // 3. The bench: the real five-persona panel, player = entry 0, house = entry 1.
      let panel;
      try {
        panel = await runPanel(provider, rule.rubric, [clean, rule.house_take]);
      } catch (e) {
        if (!(e instanceof JuryError)) throw e;
        practiceCap.refund(acct); // a mistrial doesn't use up an attempt
        send(res, 200, { ...frame, attempts_left: left + 1, rail: [...QUICK_RAIL], outcome: "mistrial", stamp: STAMPS.mistrial, split: null, bench: null, line: "A juror's answer came back broken, so there's no ruling. It doesn't use up an attempt." });
        return;
      }
      const v = panel.verdict;
      const outcome = benchOutcome(v.winner_index, v.votes, clean);
      if (outcome === "got_through" || outcome === "moved_a_juror") {
        // Sealed: private patch queue only. No take, no split, no bench in the response (V-JB-04).
        sealed.append({ at: clock().toISOString(), outcome, rule_id: rule.id, period: periodKey, account: acctHash, text: clean, votes: v.votes, scores: v.scores });
        send(res, 200, {
          ...frame, rail: [...QUICK_RAIL], outcome, stamp: STAMPS[outcome], sealed: true, split: null, bench: null,
          line: outcome === "got_through" ? "You made the jury break today's rule. We keep your method private until we fix the hole." : "You moved the jury. We keep your method private until we fix the hole.",
        });
        return;
      }
      const forPlayer = v.votes.filter((x) => x === 0).length;
      redTeam.append({ at: clock().toISOString(), outcome, rule_id: rule.id, period: periodKey, account: acctHash, pattern: null, text: clean, votes: v.votes });
      send(res, 200, {
        ...frame,
        rail: [...QUICK_RAIL],
        outcome,
        stamp: STAMPS[outcome],
        split: { player: forPlayer, house: v.votes.length - forPlayer, text: v.split },
        bench: panel.results.map((r, j) => ({ juror: JUROR_PERSONAS[j]![0], vote: r.winner_index === 0 ? "you" : "house", reason: r.reason })),
        ...(outcome === "overruled" ? { hint: "Fair arguments can't win today. The rule is in the way." } : {}),
      });
    }),
  );
}
