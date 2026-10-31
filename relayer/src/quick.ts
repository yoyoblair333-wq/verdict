// Quick Verdict routes: the off-chain jury (ADR-013, ADR-014, ADR-015, ADR-018).
//
//   POST /quick                    Settle It, judged off-chain (5 personas)
//   POST /quick/:id/consent        a side accepts publish-onchain-v1 ("your takes become public and permanent")
//   POST /quick/:id/consent/withdraw  a side withdraws its own consent (any time before submission)
//   POST /quick/:id/publish        Publish = network check (Design §1): either side, once BOTH
//                                  have consented, re-hears the case on-chain as a fresh Tier 1
//                                  case through the existing package + judge path. Free (VERDICT
//                                  pays), max 3 per user per Los Angeles day, NOT an appeal.
//   POST /quick/:id/appeal         always refused: an unpublished Quick Verdict can't be appealed
//                                  ("Publish first"); a published one appeals at /cases/:id/appeal
//   POST /quick/:id/revoke         refused after Done (409, ADR-012 / V-QV-07)
//   POST /quick/:id/takedown       hides the card; never blocks publishing
//   POST /redflag                  Red Flag Court (redacted, no appeals)
//   GET  /practice/today           practice-court case (topic only)
//   POST /practice/attempts        Jailbreak the Jury attempt
//
// Every Quick Verdict body: mode "quick_verdict", label "Quick Verdict",
// network_checked false, rail Submitted → Jury scoring → Done, and NO receipt
// number, package digest or tx (assertQuickHonest refuses to send one).
// No route here writes to a chain except /quick/:id/publish, which hands off
// to the normal on-chain path after both consents are recorded. The on-chain
// Tier 1 ruling then replaces the preview (overruled_preview when the winner
// changed), and the normal appeal ladder applies on /cases/:id/appeal.

import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { Config } from "./config.js";
import { HttpError, wrap } from "./lib/http.js";
import { JsonlFile } from "./lib/journal.js";
import { JUROR_PERSONAS, JuryError, QUICK_JURORS, QUICK_RAIL, RUBRIC_PRESETS, resolveRubric, runPanel, type JudgeProvider } from "./lib/jury.js";
import { controlPatternHit, localCheck, matchedControlPattern, MAX_ENTRY_CHARS, moderate, normalise, policyHit, type ModerationOptions } from "./lib/moderation.js";
import { benchOutcome, currentRule, DOOR_ROASTS, PRACTICE_LABEL, PRACTICE_NOTICE, STAMPS, type PracticeConfig } from "./lib/practice.js";
import { DailyCounter, laDay, nextLaMidnight, utcDay } from "./lib/rateLimit.js";
import { measure, redact, summary } from "./lib/redact.js";
import { decideRuling, FLAG_CODES, isMoneyOffer, LEGIT_STANDING, RULING_COPY, runRedFlagPanel, STILL_TO_CHECK } from "./lib/redflag.js";
import { validateVerdictPayload } from "./lib/verdict.js";
import { patternLlmFrom, submitPattern, type PatternChainPort, type PatternConfig, type PatternOutcome } from "./lib/pattern.js";
import type { Ruling } from "./lib/redflag.js";

/** Reads the digest needs (PatternLedgerClient implements it). */
export interface PatternReader {
  topPatternsSince(since: string, n: number): Promise<unknown>;
}

/** Scam Pattern Ledger wiring (Design §2, ADR-020). SHADOW unless both gates say live. */
export interface PatternWiring {
  cfg: PatternConfig;
  /** One shared counter per process: 5 per user per LA day. */
  limiter: DailyCounter;
  /** Live mode only. */
  chain?: PatternChainPort;
  /** Optional: the weekly digest reads the ledger (works in SHADOW too). */
  reader?: PatternReader;
}

/** Ledger outcome -> HTTP status. Content problems are answers, never 500s. */
export const PATTERN_HTTP: Readonly<Record<PatternOutcome["status"], number>> = {
  skipped: 422,
  rate_limited: 429,
  summary_failed: 502,
  rejected_locally: 422,
  shadow: 202,
  submitted: 202,
  submit_failed: 502,
};
const PATTERN_RULINGS: readonly Ruling[] = ["SCAM", "SUS", "LOOKS LEGIT"];

/** Red Flag Court input limit: 1,000 code points (ADR-014 item 9 amends
 * ADR-007 for Red Flag Court only). Counted after redaction, with each
 * redaction pill as one character. Every on-chain entry stays <= 280. */
export const RED_FLAG_MAX_CHARS = 1000;

/** Submit-time notice. It discloses that publishing is possible, so these
 * consent records satisfy ADR-013 item 5 (notice-v1 / public-onchain-v1 do not). */
export const QUICK_NOTICE_VERSION = "quick-v2";
export const QUICK_NOTICE =
  "Quick Verdict: the jury judges your takes privately. Nothing is published, and it is not checked by the network. " +
  "If you both choose Publish, the case is re-heard on the network and both takes become public and permanent; each of you is asked first. 18+ only.";
/** Submit-time notice versions whose consent records disclosed possible publication
 * (quick-v1 disclosed "publication on appeal", which is still publication with both sides asked). */
export const PUBLISH_DISCLOSING_NOTICES = new Set(["quick-v1", QUICK_NOTICE_VERSION]);
/** Publish-time notice BOTH sides must accept (Design §1). */
export const PUBLISH_NOTICE_VERSION = "publish-onchain-v1";
export const PUBLISH_NOTICE =
  "Your takes become public and permanent. Publishing re-hears this case on a public blockchain with a fresh 5-juror panel, " +
  "and the network's ruling replaces this preview. It can't be erased. 18+ only.";
/** Free publishes per user per Los Angeles day (VERDICT pays the fee). */
export const PUBLISH_DAILY_CAP_DEFAULT = 3;
/** A publish request that the other side hasn't agreed to lapses after 72 hours (ADR-021 item 6). */
export const PUBLISH_REQUEST_TTL_MS = 72 * 3600 * 1000;
export const PUBLISH_REQUEST_EXPIRED = "The other side didn't agree to go public.";
/** A preview's share control: previews are shared only privately, with the two sides (ADR-021 item 7). */
export const PREVIEW_SHARE = "Publish to share";
export const PUBLISH_FIRST = "Publish first: a Quick Verdict is a private preview and can't be appealed until the network has ruled on it.";

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
  /** Publish-time consent (PUBLISH_NOTICE_VERSION), per side. Withdrawable until submission. */
  publishConsent: boolean[];
  /** Per-side publish consent record (V-PUB-03): notice version and time; null = none. */
  publishConsentRecords?: Array<{ notice: string; at: string } | null>;
  /** Side that last tapped Publish while waiting for the other side's consent; null if none. */
  publishRequestedBy?: number | null;
  /** When that request was made; it lapses after PUBLISH_REQUEST_TTL_MS (ADR-021 item 6). */
  publishRequestedAt?: string | null;
  /** Set when a request lapsed; shown to the requester once, then cleared. */
  publishRequestExpiredFor?: number | null;
  hidden: boolean;
  /** On-chain case id once published; null while it is still a private preview. */
  caseId: number | null;
}

/** Older store rows (pre-publish) used `appealConsent`; consents given under the
 * appeal-onchain-v1 notice are NOT carried over: publish asks both sides again. */
function upgrade(r: QuickCase & { appealConsent?: boolean[] }): QuickCase {
  if (!Array.isArray(r.publishConsent)) r.publishConsent = [false, false];
  if (!Array.isArray(r.publishConsentRecords)) r.publishConsentRecords = [null, null];
  delete r.appealConsent;
  return r;
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
  /** Opens the published case on-chain; `preview` lets the card flag an overruled preview. */
  openCase: (o: {
    requestKey: string;
    rubric: string;
    surface: "settle";
    entries: Array<{ text: string; assurance: "self_asserted" }>;
    sideTokenHashes: string[];
    preview: { quickId: string; winnerIndex: number };
    noticeVersion: string;
  }) => Promise<{ status: number; body: Record<string, unknown> }>;
  /** Starts Tier 1; onTier1Failed runs if that Tier 1 ends without a ruling (FINALIZED_ERROR, STALE, ...). */
  judgeOpened: (id: number, onTier1Failed?: () => void) => Promise<Record<string, unknown>>;
  pattern?: PatternWiring;
  shadowLabel: string;
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
  for (const r of store.readAll() as QuickCase[]) cases.set(r.id, upgrade(r));
  const save = (q: QuickCase) => store.append(q);
  // Settle It Quick Verdicts keep UTC like the rest of Settle It; the games reset at 00:00 LA (ADR-018 item 3).
  const settleCap = new DailyCounter(cfg.quick.dailyCap, utcDay);
  const redFlagCap = new DailyCounter(cfg.quick.dailyCap, laDay);
  const practiceCap = new DailyCounter(cfg.quick.practiceDailyCap, laDay);
  // Publishing is free but capped per user per LA day (Design §1).
  const publishCap = new DailyCounter(cfg.quick.publishDailyCap, laDay);

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

  /** Publish-time consent: exact-true consent + 18+ and the publish notice version. */
  function requirePublishConsent(body: Record<string, unknown>): void {
    ctx.requireDisclosure(body);
    const nv = (body.disclosure as Record<string, unknown>).notice_version;
    if (nv !== PUBLISH_NOTICE_VERSION) {
      throw new HttpError(422, `disclosure.notice_version must be ${PUBLISH_NOTICE_VERSION}`, { code: "notice_version_required", notice: PUBLISH_NOTICE, notice_version: PUBLISH_NOTICE_VERSION });
    }
  }

  function notPublished(q: QuickCase): void {
    if (q.caseId !== null) throw new HttpError(409, "already published; appeals go to the on-chain case", { code: "already_published", case_id: q.caseId, appeal_path: `/cases/${q.caseId}/appeal` });
  }

  /** Record this side's own consent (its token, never the other side's): notice version + time. */
  function consent(q: QuickCase, side: number): void {
    q.publishConsent[side] = true;
    q.publishConsentRecords![side] = { notice: PUBLISH_NOTICE_VERSION, at: clock().toISOString() };
  }

  const awaiting = (q: QuickCase) => q.publishConsent.flatMap((c, i) => (c ? [] : [i]));

  /** Lapse a publish request the other side never agreed to (72 h). Returns true if it just lapsed. */
  function lapse(q: QuickCase): boolean {
    if (q.publishRequestedBy === null || q.publishRequestedBy === undefined || !q.publishRequestedAt) return false;
    if (q.publishConsent.every(Boolean)) return false;
    if (clock().getTime() - Date.parse(q.publishRequestedAt) < PUBLISH_REQUEST_TTL_MS) return false;
    q.publishRequestExpiredFor = q.publishRequestedBy;
    q.publishRequestedBy = null;
    q.publishRequestedAt = null;
    save(q);
    return true;
  }

  function publishStatus(q: QuickCase, side: number): Record<string, unknown> {
    lapse(q);
    if (q.caseId !== null) return { status: "published", case_id: q.caseId, appeal_path: `/cases/${q.caseId}/appeal` };
    const left = awaiting(q);
    if (q.publishRequestExpiredFor === side) return { status: "expired", awaiting_sides: left, message: PUBLISH_REQUEST_EXPIRED };
    if (q.publishRequestedBy !== null && q.publishRequestedBy !== undefined) {
      return { status: left.length ? "waiting" : "ready", requested_by: q.publishRequestedBy, awaiting_sides: left, request_expires_at: new Date(Date.parse(q.publishRequestedAt!) + PUBLISH_REQUEST_TTL_MS).toISOString() };
    }
    return { status: left.length ? "private" : "ready", awaiting_sides: left };
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
        publishConsent: [false, false],
        publishConsentRecords: [null, null],
        publishRequestedBy: null,
        publishRequestedAt: null,
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
          appealable: false,
          appeal: PUBLISH_FIRST,
          share: PREVIEW_SHARE,
          publish: {
            who: "Either side. Both sides must first accept the publish notice; until then Publish waits.",
            consent_path: `/quick/${q.id}/consent`,
            withdraw_path: `/quick/${q.id}/consent/withdraw`,
            publish_path: `/quick/${q.id}/publish`,
            notice: PUBLISH_NOTICE,
            notice_version: PUBLISH_NOTICE_VERSION,
            cost: `free (VERDICT pays the fee); ${cfg.quick.publishDailyCap} per user per Los Angeles day; not an appeal`,
            then: "The network's Tier 1 ruling replaces this preview. After that the losing side may appeal: Tier 2 (daily free appeal or $1.99), then Tier 3 ($4.99). Max 2.",
          },
        }),
      );
    }),
  );

  // The preview's private link: its two sides only (ADR-021 item 7, V-PUB-01).
  // Without a valid side token it does not exist (404). Once published, the
  // preview is no longer shown as the result (V-PUB-08): it points at the case.
  app.get(
    "/quick/:id",
    wrap(async (req, res) => {
      const q = typeof req.params.id === "string" ? cases.get(req.params.id) : undefined;
      const side = q ? ctx.sideForToken(q.sideTokenHashes, req.header("x-side-token") ?? undefined) : -1;
      if (!q || side < 0) throw new HttpError(404, "quick verdict not found");
      res.setHeader("cache-control", "private, no-store");
      if (q.caseId !== null) {
        send(res, 200, quickFrame({ quick_id: q.id, side, published: true, case_id: q.caseId, verdict: null, note: "This case was published. The network's ruling is the result: see the on-chain case." }));
        return;
      }
      send(res, 200, quickFrame({
        quick_id: q.id, side, published: false, visibility: "private to the two sides", hidden: q.hidden, expires_at: q.expiresAt,
        verdict: q.verdict, footer: QUICK_FOOTER, share: PREVIEW_SHARE, appealable: false, appeal: PUBLISH_FIRST,
        publish: publishStatus(q, side),
      }));
    }),
  );

  // Publish state for one side: private / waiting / ready / expired / published.
  app.get(
    "/quick/:id/publish",
    wrap(async (req, res) => {
      const { q, side } = quickSide(req);
      res.json(publishStatus(q, side));
    }),
  );

  // Either side accepts the publish notice (Design §1). Nothing is published yet.
  app.post(
    "/quick/:id/consent",
    wrap(async (req, res) => {
      const { q, side } = quickSide(req);
      notPublished(q);
      lapse(q);
      requirePublishConsent((req.body ?? {}) as Record<string, unknown>);
      consent(q, side);
      save(q);
      const left = awaiting(q);
      res.json({
        consented: true, side, awaiting_sides: left, publish_requested: q.publishRequestedBy !== null && q.publishRequestedBy !== undefined,
        status: left.length === 0 ? "ready" : "waiting",
        note: left.length === 0 ? "Both sides consented. Nothing is published until a side taps Publish." : "Waiting for the other side to accept. Nothing is published yet.",
      });
    }),
  );

  // A side withdraws its own consent, any time before submission.
  app.post(
    "/quick/:id/consent/withdraw",
    wrap(async (req, res) => {
      const { q, side } = quickSide(req);
      if (q.caseId !== null) throw new HttpError(409, "already submitted to the network; consent can no longer be withdrawn", { code: "already_published", case_id: q.caseId });
      q.publishConsent[side] = false;
      q.publishConsentRecords![side] = null;
      if (q.publishRequestedBy === side) {
        q.publishRequestedBy = null; // the requester cancels its own request
        q.publishRequestedAt = null;
      }
      save(q);
      res.json({ consented: false, side, awaiting_sides: awaiting(q), status: "private", note: "Your consent is withdrawn. Nothing was published." });
    }),
  );

  // Publish = network check (Design §1, supersedes ADR-018 item 1).
  app.post(
    "/quick/:id/publish",
    wrap(async (req, res) => {
      const { q, side } = quickSide(req);
      notPublished(q);
      if (clock().getTime() > Date.parse(q.expiresAt)) throw new HttpError(410, "this Quick Verdict has expired and can no longer be published");
      if (!q.consentNotice.every((n) => PUBLISH_DISCLOSING_NOTICES.has(n))) {
        throw new HttpError(409, "a side consented on a notice that did not disclose publication", { code: "notice_not_disclosing" });
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (lapse(q) || q.publishRequestExpiredFor === side) {
        // The other side never agreed within 72 h: tell the requester, once, and start over.
        q.publishRequestExpiredFor = null;
        q.publishConsent[side] = false;
        save(q);
        throw new HttpError(409, PUBLISH_REQUEST_EXPIRED, { code: "publish_request_expired", status: "expired" });
      }
      if (body.disclosure !== undefined || !q.publishConsent[side]) {
        requirePublishConsent(body); // the publishing side accepts the publish notice now
        consent(q, side);
      }
      const other = 1 - side;
      if (!q.publishConsent[other]) {
        if (q.publishRequestedBy !== side) {
          q.publishRequestedBy = side;
          q.publishRequestedAt = clock().toISOString(); // the 72 h clock starts at the first tap
        }
        save(q);
        // Publish waits: it does not go ahead without the other side.
        throw new HttpError(409, "waiting for the other side to accept the publish notice; nothing was published", {
          code: "waiting_for_other_side", status: "waiting", awaiting_sides: [other], consent_path: `/quick/${q.id}/consent`,
        });
      }
      save(q);
      const mod = await moderate([q.rubric, ...q.entries], ctx.modOpts);
      if (!mod.ok) throw new HttpError(mod.status ?? 422, mod.reason ?? "entry rejected by moderation");
      ctx.quota(req, "action");
      const acct = accountKey(req);
      const left = publishCap.take(acct, clock());
      if (left < 0) throw new HttpError(429, `that's ${cfg.quick.publishDailyCap} free publishes today; publishing reopens at midnight Pacific`, { code: "publish_cap", resets_at: nextLaMidnight(clock()).toISOString() });
      let opened;
      try {
        opened = await ctx.openCase({
          requestKey: randomBytes(16).toString("hex"),
          rubric: q.rubric,
          surface: "settle",
          entries: q.entries.map((text) => ({ text, assurance: "self_asserted" as const })),
          sideTokenHashes: q.sideTokenHashes, // the same side tokens work on the on-chain case
          preview: { quickId: q.id, winnerIndex: q.verdict.winnerIndex },
          noticeVersion: PUBLISH_NOTICE_VERSION, // the package records the publish notice (V-PUB-05)
        });
      } catch (e) {
        publishCap.refund(acct); // nothing was opened
        throw e;
      }
      if (opened.status !== 201) {
        publishCap.refund(acct); // nothing was published (refused, or a SHADOW test run)
        res.status(opened.status).json({ ...opened.body, from_quick_verdict: q.id, published: false, price_cents: 0 });
        return;
      }
      const id = opened.body.id as number;
      q.caseId = id;
      q.publishRequestedBy = null;
      q.publishRequestedAt = null;
      save(q);
      // No ruling (FINALIZED_ERROR, STALE, ...) restores the allowance: a technical refund (V-PUB-06).
      const judged = await ctx.judgeOpened(id, () => publishCap.refund(acct));
      res.status(202).json({
        ...opened.body, published: true, tier: 1, appeals_used: 0, appeals_left: cfg.maxAppealsPerCase,
        next_appeal: { tier: 2, jurors: 7, free_or_cents: cfg.appealPriceCents.tier2 }, judge: judged,
        price_cents: 0, paid_with: "free publish (VERDICT pays)", publishes_left_today: left, from_quick_verdict: q.id,
        preview_winner_index: q.verdict.winnerIndex,
        note: "Published. The network re-hears the case; its ruling replaces the preview once finalized.",
      });
    }),
  );

  // An unpublished Quick Verdict can never be appealed ("Publish first").
  app.post(
    "/quick/:id/appeal",
    wrap(async (req, res) => {
      const { q } = quickSide(req);
      void res;
      notPublished(q);
      throw new HttpError(409, PUBLISH_FIRST, { code: "publish_first", publish_path: `/quick/${q.id}/publish` });
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
      res.json({ hidden: true, note: "Card hidden. Both sides can still choose to publish." });
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

  // ------------------------------------------- Scam Pattern Ledger (opt-in)
  // "Help warn others" after a SCAM or SUS ruling (default off). The browser
  // re-sends its own redacted text; the relayer redacts it twice more and holds
  // it only for this request (ADR-021 item 8). Only an abstract pattern record
  // can reach the chain: never the message, the sender or the user.
  app.post(
    "/redflag/warn",
    wrap(async (req, res) => {
      const pw = ctx.pattern;
      if (!pw) throw new HttpError(503, "the pattern ledger is not configured", { code: "pattern_unavailable" });
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (body.optIn !== true) throw new HttpError(422, "optIn must be exactly true: warning others is opt-in", { code: "opt_in_required" });
      if (typeof body.text !== "string" || body.text.trim() === "") throw new HttpError(400, "text must be the redacted message, as a non-empty string");
      if (measure(redact(body.text).text) > RED_FLAG_MAX_CHARS) throw new HttpError(400, `text exceeds ${RED_FLAG_MAX_CHARS} characters`);
      if (typeof body.ruling !== "string" || !PATTERN_RULINGS.includes(body.ruling as Ruling)) throw new HttpError(400, "ruling must be SCAM, SUS or LOOKS LEGIT");
      if (!Array.isArray(body.flags) || !body.flags.every((f) => typeof f === "string") || body.flags.length > 32) throw new HttpError(400, "flags must be an array of flag codes");
      const provider = needProvider();
      const out = await submitPattern(
        {
          mode: pw.cfg.mode,
          llm: patternLlmFrom(provider),
          ...(pw.chain ? { chain: pw.chain } : {}),
          limiter: pw.limiter,
          userKey: accountKey(req),
          clock,
        },
        { ruling: body.ruling as Ruling, flags: body.flags as string[], text: body.text },
        true,
      );
      const status = PATTERN_HTTP[out.status];
      switch (out.status) {
        case "skipped":
          res.status(status).json({ status: out.status, reason: out.reason, code: `pattern_${out.reason}` });
          return;
        case "rate_limited":
          res.status(status).json({ status: out.status, code: "pattern_cap", error: `that's ${pw.cfg.dailyCap} warnings today; it reopens at midnight Pacific` });
          return;
        case "summary_failed":
          res.status(status).json({ status: out.status, error: "we couldn't write a safe summary of this pattern; nothing was recorded" });
          return;
        case "rejected_locally":
          res.status(status).json({ status: out.status, reason: out.reason, error: "the summary failed the privacy screen; nothing was recorded" });
          return;
        case "shadow":
          res.status(status).json({ status: out.status, mode: "shadow", label: ctx.shadowLabel, would_submit: { category: out.request.category, flag_codes: out.request.flagCodes, summary: out.request.summary } });
          return;
        case "submitted":
          res.status(status).json({ status: out.status, category: out.request.category, flag_codes: out.request.flagCodes, summary: out.request.summary, request_key: out.request.requestKey, tx: out.tx, note: "Thanks. The network checks the pattern before it's recorded." });
          return;
        case "submit_failed":
          res.status(status).json({ status: out.status, error: "the pattern couldn't be sent to the network; nothing was recorded" });
          return;
      }
    }),
  );

  // Weekly "Scams going around" digest, read from the ledger (Design §2 views).
  app.get(
    "/redflag/digest",
    wrap(async (req, res) => {
      const reader = ctx.pattern?.reader;
      if (!reader) throw new HttpError(503, "the pattern ledger digest is not configured", { code: "pattern_unavailable" });
      const days = Math.min(30, Math.max(1, Number(req.query.days ?? 7) || 7));
      const n = Math.min(20, Math.max(1, Number(req.query.n ?? 10) || 10));
      const since = new Date(clock().getTime() - days * 86400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
      let patterns: unknown;
      try {
        patterns = await reader.topPatternsSince(since, n);
      } catch (e) {
        throw new HttpError(502, `the pattern ledger could not be read: ${(e as Error).message}`);
      }
      res.json({ title: "Scams going around", since, days, mode: ctx.pattern!.cfg.mode, patterns: Array.isArray(patterns) ? patterns : [], proof_line: "Recorded on GenLayer" });
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
