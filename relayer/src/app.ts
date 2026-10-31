// HTTP surface of the relayer. Users never hold a wallet: the relayer's
// account signs every transaction and pays gas.
//
// Order of checks on every write path (fail closed):
//   input shape -> consent/18+ (exact boolean true) -> moderation -> quota ->
//   case package build + self-verification (schema, digests, lifetime) ->
//   [shadow: log and stop] -> contract pin check -> outbox -> gas.
// Twitch calls, credit debits and cards all happen AFTER those checks, and
// cards / Twitch resolution only on FINALIZED_SUCCESS (lib/finality.ts).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { HttpError, wrap } from "./lib/http.js";
import type { JudgeProvider } from "./lib/jury.js";
import type { PracticeConfig } from "./lib/practice.js";
import { registerQuickRoutes, type PatternReader } from "./quick.js";
import { PatternLedgerClient, patternConfigFromEnv, type PatternChainPort, type PatternConfig } from "./lib/pattern.js";
import type { Config } from "./config.js";
import { digestEquals } from "./lib/canonical.js";
import { FileCredits, type CreditStore } from "./lib/credits.js";
import type { CaseOutcome, Classification } from "./lib/finality.js";
import type { CaseView, ChainPort } from "./lib/genlayer.js";
import { Inbox, Outbox, type OpIntent, type Receipt, type ReceiptBody } from "./lib/journal.js";
import { MAX_ENTRY_CHARS, moderate, type ModerationProvider } from "./lib/moderation.js";
import { StateStore } from "./lib/state.js";
import { FeesJournal } from "./lib/fees.js";
import { PublishBudget, type BudgetSnapshot } from "./lib/publishBudget.js";
import {
  buildPackage,
  PRESETS,
  provenanceLabel,
  SURFACES,
  verifyPackage,
  type Assurance,
  type PackageEntry,
  type Surface,
} from "./lib/package.js";
import { Pipeline, PipelineError, type ReconcileEntry } from "./lib/pipeline.js";
import { DailyCounter, laDay } from "./lib/rateLimit.js";
import { validateCaseVerdict } from "./lib/verdict.js";
import { deliverWebhook, validateCallbackUrl, type WebhookEvent } from "./lib/webhook.js";
import type { TwitchPrediction, TwitchPredictions } from "./twitch/predictions.js";

/** User-facing label on every SHADOW (dry-run) result (ADR-021 item 5; SPEC §6.6 v1.3). */
export const SHADOW_LABEL = "Test run · Not public yet";
/** Approved card line (ADR-019 item 8 as widened by ADR-021 item 1): any on-chain
 * card whose verdict reached FINALIZED_SUCCESS; never a Quick Verdict or practice card. */
export const FINALIZED_LINE = "Checked by GenLayer · Finalized";

export const CONSENT_NOTICE =
  "Your take will be published on a public blockchain and cannot be erased. You can withdraw before the verdict is final " +
  "(the text is then cleared from the contract's current state, but transaction history keeps it) or ask us to hide a final case " +
  "from VERDICT's gallery and cards. 18+ only.";

interface CaseMeta {
  requestKey: string;
  packageDigest: string;
  surface: Surface;
  nEntries: number;
  appealWindowExpiry: string;
  provenance: PackageEntry["provenance"][];
  callbackUrl?: string;
  twitch?: TwitchPrediction;
  twitchTimer?: ReturnType<typeof setTimeout>;
  appeals: number;
  /** Opened by publishing a Quick Verdict (Design §1, Publish = network check).
   * Publishing is not an appeal: the case starts with 0 appeals used, and its
   * Tier 1 ruling replaces the preview. winnerIndex is the preview's winner. */
  preview?: { quickId: string; winnerIndex: number };
  /** sha256(hex) of each side's token, index = entry index. Plaintext is returned once. */
  sideTokenHashes: string[];
  /** Tier of the last verdict seen FINALIZED_SUCCESS; 0 = none yet. */
  finalizedTier: number;
  /** Tier whose finality the chain recorded via confirm_verdict; 0 = none. */
  confirmedTier: number;
  outcome: CaseOutcome;
  revoked: boolean;
  hidden: boolean;
  receipts: Receipt[];
}

interface Draft {
  id: string;
  requestKey: string;
  rubric: string;
  slots: Array<{ text: string; assurance: Assurance } | null>;
  sideTokenHashes: string[];
  callbackUrl?: string;
  /** Opponent submission deadline: unfilled slots after this kill the draft. */
  expiresAt: string;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");
const newRequestKey = () => randomBytes(16).toString("hex");

/** Which side (entry index) does this token belong to? -1 if none.
 * Compares sha256 digests with timingSafeEqual; every stored hash is checked. */
export function sideForToken(hashes: string[], token: string | undefined): number {
  if (typeof token !== "string" || token === "") return -1;
  const h = Buffer.from(sha256(token), "hex");
  let found = -1;
  hashes.forEach((stored, i) => {
    if (timingSafeEqual(h, Buffer.from(stored, "hex"))) found = i;
  });
  return found;
}

export interface Deps {
  cfg: Config;
  chain: ChainPort;
  twitch: Pick<TwitchPredictions, "enabled" | "create" | "resolve" | "cancel" | "lock">;
  webhook?: (url: string, ev: WebhookEvent) => Promise<void>;
  credits?: CreditStore;
  outbox?: Outbox;
  inbox?: Inbox;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  moderationProvider?: ModerationProvider;
  state?: StateStore<CaseMeta, Draft>;
  /** Quick Verdict judge (LLM behind an interface). Absent -> Quick Verdict routes answer 503. */
  judgeProvider?: JudgeProvider;
  /** Reviewed practice-court rule list. Absent -> practice routes answer 503. */
  practice?: PracticeConfig;
  /** Scam Pattern Ledger. Defaults: config from env; chain + reader from PatternLedgerClient. */
  patternConfig?: PatternConfig;
  patternChain?: PatternChainPort;
  patternReader?: PatternReader;
}

export type VerdictApp = Express & {
  /** Resolves when every background finality tracker has settled (tests, shutdown). */
  idle(): Promise<void>;
  reconcile(): Promise<ReconcileEntry[]>;
  pipeline: Pipeline;
};

function parseId(raw: unknown): number {
  if (typeof raw !== "string" || !/^[1-9]\d{0,15}$/.test(raw)) throw new HttpError(400, "invalid case id");
  return Number(raw);
}

/** Consent and 18+ must be exactly boolean true. Missing, "true", 1 -> refused. */
function requireDisclosure(body: Record<string, unknown>): void {
  const d = body.disclosure;
  const obj = typeof d === "object" && d !== null && !Array.isArray(d) ? (d as Record<string, unknown>) : {};
  if (obj.consent !== true) {
    throw new HttpError(422, "disclosure.consent must be true: entries become public, permanent on-chain data", { code: "consent_required", notice: CONSENT_NOTICE });
  }
  if (obj.adult_confirmed !== true) {
    throw new HttpError(422, "disclosure.adult_confirmed must be true (18+ only)", { code: "adult_confirmation_required" });
  }
}

function requireSurface(raw: unknown): Surface {
  const s = SURFACES.find((x) => x === raw);
  if (!s) throw new HttpError(400, "surface must be settle | live | api");
  return s;
}

function checkEntryText(e: unknown): string {
  if (typeof e !== "string" || e.trim() === "" || [...e].length > MAX_ENTRY_CHARS) {
    throw new HttpError(400, `each entry must be 1 to ${MAX_ENTRY_CHARS} characters`);
  }
  return e;
}

export function buildApp(deps: Deps): VerdictApp {
  const { cfg, chain, twitch } = deps;
  const clock = deps.clock ?? (() => new Date());
  const sendWebhook =
    deps.webhook ?? ((url: string, ev: WebhookEvent) => deliverWebhook(url, ev, cfg.webhookSecret, cfg.webhookTimeoutMs));
  const outbox = deps.outbox ?? new Outbox(cfg.outboxPath, clock);
  const inbox = deps.inbox ?? new Inbox(cfg.inboxPath);
  const fees = new FeesJournal(cfg.feesPath);
  const pipeline = new Pipeline({ cfg, chain, outbox, clock, fees, ...(deps.sleep ? { sleep: deps.sleep } : {}) });
  const live = cfg.mode === "live";

  // Off-chain metadata. In-memory for the reference implementation.
  // Durable (file-backed) off-chain state: survives restarts.
  const store = deps.state ?? new StateStore<CaseMeta, Draft>(cfg.statePath);
  const loaded = store.load();
  const meta = loaded.cases;
  const drafts = loaded.drafts;
  // Global monthly publish budget + FIFO queue, durable in the state store (ADR-022).
  const publishBudget = new PublishBudget({
    capCents: cfg.quick.publishBudgetCentsMonth,
    estimateCents: cfg.quick.publishFeeEstimateCents,
    clock,
    load: () => loaded.meta.get("publish_budget") as BudgetSnapshot | undefined,
    save: (s) => store.saveMeta("publish_budget", s),
  });
  const persist = (id: number) => {
    const m = meta.get(id);
    if (!m) return;
    const { twitchTimer: _t, ...data } = m;
    store.saveCase(id, data as CaseMeta);
  };
  const modOpts = { ackLocalOnly: cfg.moderationAckLocalOnly, ...(deps.moderationProvider ? { provider: deps.moderationProvider } : {}) };
  const ipCases = new DailyCounter(cfg.perIpDailyCap);
  const keyCases = new DailyCounter(cfg.perKeyDailyCap);
  const ipActions = new DailyCounter(cfg.perIpDailyCap * 4);
  const keyActions = new DailyCounter(cfg.perKeyDailyActionCap);
  // The daily free appeal covers Tier 2 OR Tier 3 and resets at 00:00 Los Angeles,
  // like every consumer allowance (ADR-021 items 3 and 4).
  const freeAppeals = new DailyCounter(cfg.freeAppealsPerDay === 0 ? -1 : cfg.freeAppealsPerDay, laDay);
  const credits = deps.credits ?? new FileCredits(cfg.creditsPath);

  const tasks = new Set<Promise<unknown>>();
  function bg(p: Promise<unknown>): void {
    const t = p.catch((e) => console.error("[relayer] background task failed:", (e as Error).message));
    tasks.add(t);
    void t.finally(() => tasks.delete(t));
  }

  const app = express() as unknown as VerdictApp;
  app.disable("x-powered-by");
  if (cfg.trustProxy) app.set("trust proxy", 1);
  app.use(express.json({ limit: "16kb" }));

  function quota(req: Request, bucket: "case" | "action"): void {
    const key = req.header("x-api-key");
    if (key !== undefined) {
      if (!cfg.apiKeys.has(key)) throw new HttpError(401, "invalid API key");
      const counter = bucket === "case" ? keyCases : keyActions;
      if (counter.take(key) < 0) throw new HttpError(429, `daily API key ${bucket} cap reached`);
      return;
    }
    const ip = req.ip ?? "unknown";
    const counter = bucket === "case" ? ipCases : ipActions;
    if (counter.take(ip) < 0) throw new HttpError(429, "daily cap reached for this IP");
  }

  function payerId(req: Request): string {
    const key = req.header("x-api-key");
    return key ? `key:${key}` : `ip:${req.ip ?? "unknown"}`;
  }

  function requireSide(req: Request, id: number): { m: CaseMeta; side: number } {
    const m = meta.get(id); // exact numeric key
    if (!m) throw new HttpError(404, "case not opened through this relayer");
    const side = sideForToken(m.sideTokenHashes, req.header("x-side-token") ?? undefined);
    if (side < 0) throw new HttpError(403, "a valid side token (x-side-token) is required");
    return { m, side };
  }

  function notify(id: number, event: WebhookEvent["event"], data: unknown): void {
    const url = meta.get(id)?.callbackUrl;
    if (url) bg(sendWebhook(url, { event, case_id: id, data }));
  }

  const expired = (m: CaseMeta) => clock().getTime() > Date.parse(m.appealWindowExpiry);

  /** After every write: the chain must still carry this case's receipt number. */
  async function rereadDigest(id: number, m: CaseMeta, stage: string): Promise<CaseView> {
    const c = await chain.getCase(id);
    if (!digestEquals(c.package_digest, m.packageDigest)) {
      m.outcome = "FINALIZED_ERROR";
      persist(id);
      notify(id, "case.failed", { stage, error: "on-chain receipt number does not match this case's package" });
      throw new HttpError(502, `receipt number mismatch after ${stage}`);
    }
    return c;
  }

  /** Record on-chain that this tier's verdict is FINALIZED_SUCCESS. This
   * closes revocation and unlocks the next appeal (contract confirm_verdict). */
  async function confirmOnChain(id: number, m: CaseMeta, tier: number): Promise<void> {
    if (!live) return;
    const intent: OpIntent = { opKey: `${m.requestKey}:confirm:${tier}`, kind: "confirm", requestKey: m.requestKey, packageDigest: m.packageDigest, caseId: id, fn: "confirm_verdict", args: [id, m.packageDigest, tier], fromTier: tier };
    const r = await pipeline.submit(intent);
    if (r.expectedError !== null || (r.accepted.finality !== "ACCEPTED" && r.accepted.finality !== "FINALIZED_SUCCESS")) {
      console.error(`[relayer] confirm_verdict for case ${id} tier ${tier} failed (${r.expectedError ?? r.accepted.finality}); reconcile will retry`);
      return;
    }
    const c = await chain.getCase(id);
    if (digestEquals(c.package_digest, m.packageDigest) && c.confirmed_tier >= tier) {
      m.confirmedTier = Math.max(m.confirmedTier, tier);
      persist(id);
    }
    bg(pipeline.awaitFinal(intent.opKey, r.hash));
  }

  // ------------------------------------------------------------- Twitch

  async function twitchCall(label: string, fn: () => Promise<TwitchPrediction>, m: CaseMeta): Promise<void> {
    if (!live || !m.twitch || !twitch.enabled) return; // shadow mode never touches Twitch
    try {
      const p = await fn();
      m.twitch = { ...m.twitch, status: p.status };
    } catch (e) {
      // Justified: Twitch is a display side effect. A failed call never
      // changes a verdict; it is logged for the operator.
      console.error(`[twitch] ${label} failed:`, (e as Error).message);
    }
  }

  function clearTwitchTimer(m: CaseMeta): void {
    if (m.twitchTimer) clearTimeout(m.twitchTimer);
    m.twitchTimer = undefined;
  }

  async function resolveTwitchNow(id: number, winnerIndex: number): Promise<void> {
    const m = meta.get(id);
    if (!m?.twitch || m.twitch.status === "RESOLVED" || m.revoked) return;
    clearTwitchTimer(m);
    const tw = m.twitch;
    await twitchCall(`resolve case ${id}`, () => twitch.resolve(tw.id, tw.outcomes, winnerIndex), m);
  }

  /** Only ever called for a FINALIZED_SUCCESS verdict. The Prediction stays
   * LOCKED while the case can still be appealed and resolves once. */
  async function settleTwitch(c: CaseView, m: CaseMeta): Promise<void> {
    if (!m.twitch || m.revoked) return;
    clearTwitchTimer(m);
    const final = c.status === "final" || c.tier >= 3 || m.appeals >= cfg.maxAppealsPerCase;
    if (final || cfg.twitch.appealWindowMs === 0) {
      await resolveTwitchNow(c.id, c.winner_index);
      return;
    }
    const timer = setTimeout(() => bg(resolveTwitchNow(c.id, c.winner_index)), cfg.twitch.appealWindowMs);
    timer.unref?.();
    m.twitchTimer = timer;
  }

  async function cancelTwitch(m: CaseMeta, why: string): Promise<void> {
    clearTwitchTimer(m);
    const tw = m.twitch;
    if (!tw || tw.status === "RESOLVED" || tw.status === "CANCELED") return;
    await twitchCall(`cancel (${why})`, () => twitch.cancel(tw.id), m);
  }

  // ------------------------------------------------------------ receipts

  function receiptBody(m: CaseMeta, c: CaseView | null, op: ReceiptBody["op"], tx: string | null, finality: ReceiptBody["finality"]): ReceiptBody {
    const prov = m.provenance.map((p) => ({ entrySource: p.entrySource, assurance: p.assurance }));
    const tier = (c?.tier ?? 1) as 1 | 2 | 3;
    return {
      caseId: c?.id ?? 0,
      requestKey: m.requestKey,
      packageDigest: m.packageDigest,
      op,
      txHash: tx,
      finality,
      caseStatus: (c?.status ?? "stale") as ReceiptBody["caseStatus"],
      tier,
      verdict:
        finality === "FINALIZED_SUCCESS" && c
          ? { winnerIndex: c.winner_index, scores: c.scores, jurorVotes: c.juror_votes, split: c.split, reason: c.reason, jurors: c.jurors as 5 | 7 | 9 }
          : null,
      provenance: prov,
      provenanceLabel: provenanceLabel(prov),
      destination: { network: cfg.network, contractAddress: cfg.contractAddress },
      observedAt: clock().toISOString(),
    };
  }

  /** Published Quick Verdicts: the network's Tier 1 ruling replaces the preview.
   * overruled_preview is true when the network's Tier 1 winner differs from the
   * preview's; later tiers keep that flag (it describes the publish moment). */
  function publishedFields(r: Receipt, m: CaseMeta | undefined): Record<string, unknown> {
    if (!m?.preview || !r.verdict) return {};
    const tier1 = m.receipts.find((x) => x.tier === 1 && x.verdict !== null)?.verdict ?? (r.tier === 1 ? r.verdict : null);
    const overruled = tier1 !== null && tier1.winnerIndex !== m.preview.winnerIndex;
    return {
      published_from_quick: m.preview.quickId,
      preview_winner_index: m.preview.winnerIndex,
      overruled_preview: overruled,
      // The line is about Tier 1 only; later tiers say UPHELD / OVERTURNED (V-PUB-09).
      ...(overruled && r.tier === 1 ? { overruled_line: "The network overruled the preview." } : {}),
    };
  }

  function card(r: Receipt) {
    return {
      ...publishedFields(r, meta.get(r.caseId)),
      ...(r.finality === "FINALIZED_SUCCESS" && r.verdict ? { footer: FINALIZED_LINE } : {}),
      receipt_number: r.packageDigest,
      case_id: r.caseId,
      tier: r.tier,
      status: r.caseStatus,
      verdict: r.verdict,
      provenance: r.provenance,
      provenance_label: r.provenanceLabel,
      tx: r.txHash,
      inbox_record: r.recordHash,
    };
  }

  // ------------------------------------------------------- finality tracking

  /** Background: wait for FINALIZED, then (and only then) import + card + Twitch. */
  async function trackVerdict(id: number, op: "judge" | "appeal", opKey: string, hash: string, onFailure: (why: string, cls?: Classification) => Promise<void>): Promise<void> {
    const m = meta.get(id)!;
    const cls = await pipeline.awaitFinal(opKey, hash);
    m.outcome = m.revoked ? "REVOKED" : cls.finality;
    persist(id);
    if (cls.finality !== "FINALIZED_SUCCESS") {
      await onFailure(`transaction ${cls.finality} (${cls.chainStatus})`, cls);
      return;
    }
    if (m.revoked) return; // withdrawn while in flight: no card, no Twitch
    const c = await chain.getCase(id);
    if (!digestEquals(c.package_digest, m.packageDigest)) {
      await onFailure("on-chain receipt number does not match this case's package");
      return;
    }
    const v = validateCaseVerdict(c);
    if (!v.ok) {
      await onFailure(`invalid verdict: ${v.reason}`);
      return;
    }
    const rec = inbox.append(receiptBody(m, c, op, hash, "FINALIZED_SUCCESS"));
    m.receipts.push(rec);
    m.finalizedTier = c.tier;
    persist(id);
    await settleTwitch(c, m);
    notify(id, op === "judge" ? "case.judged" : "case.appealed", card(rec));
    await confirmOnChain(id, m, c.tier);
  }

  async function trackSimple(id: number, op: "revoke" | "expire", opKey: string, hash: string): Promise<void> {
    const m = meta.get(id)!;
    const cls = await pipeline.awaitFinal(opKey, hash);
    if (cls.finality !== "FINALIZED_SUCCESS") {
      console.error(`[relayer] ${op} for case ${id} ended ${cls.finality}; reconcile will retry`);
      return;
    }
    const c = await chain.getCase(id);
    const want = op === "revoke" ? "revoked" : "stale";
    if (c.status !== want || !digestEquals(c.package_digest, m.packageDigest)) {
      console.error(`[relayer] ${op} for case ${id} finalized but case is ${c.status}`);
      return;
    }
    const rec = inbox.append(receiptBody(m, c, op, hash, op === "revoke" ? "REVOKED" : "STALE"));
    m.receipts.push(rec);
    persist(id);
    notify(id, op === "revoke" ? "case.revoked" : "case.stale", { receipt_number: m.packageDigest, case_id: id, inbox_record: rec.recordHash });
  }

  function expireInBackground(id: number, m: CaseMeta): void {
    m.outcome = "STALE";
    persist(id);
    bg(cancelTwitch(m, "expired"));
    const intent: OpIntent = { opKey: `${m.requestKey}:expire`, kind: "expire", requestKey: m.requestKey, packageDigest: m.packageDigest, caseId: id, fn: "expire", args: [id, m.packageDigest] };
    if (!live) {
      pipeline.shadow(intent);
      return;
    }
    bg(
      (async () => {
        const r = await pipeline.submit(intent);
        await trackSimple(id, "expire", intent.opKey, r.hash);
      })(),
    );
  }

  // ------------------------------------------------------------- open flow

  interface OpenInput {
    requestKey: string;
    rubric: string;
    surface: Surface;
    entries: Array<{ text: string; assurance: Assurance }>;
    sideTokenHashes: string[];
    callbackUrl?: string;
    twitchReq?: { title?: string; labels?: string[] };
    preview?: { quickId: string; winnerIndex: number };
    /** Notice the sides accepted for this package; default cfg.noticeVersion. */
    noticeVersion?: string;
  }

  async function openCase(o: OpenInput): Promise<{ status: number; body: Record<string, unknown> }> {
    const built = buildPackage({
      requestKey: o.requestKey,
      rubric: o.rubric,
      surface: o.surface,
      entries: o.entries,
      moderationPolicyVersion: cfg.moderationPolicyVersion + (cfg.moderationAckLocalOnly ? "+local-only" : ""),
      noticeVersion: o.noticeVersion ?? cfg.noticeVersion,
      network: cfg.network,
      contractAddress: cfg.contractAddress,
      contractCodeDigest: cfg.expectedContractCodeDigest,
      now: clock(),
      submissionTtlSec: cfg.submissionTtlSec,
      caseLifetimeSec: cfg.caseLifetimeSec,
    });
    // Self-verification with the same checks the contract runs: a package
    // the contract would reject never costs gas.
    const v = verifyPackage(built.canonical, built.digest, {
      now: clock(),
      contractAddress: cfg.contractAddress,
      network: cfg.network,
      contractCodeDigest: cfg.expectedContractCodeDigest,
    });
    if (!v.ok) throw new HttpError(422, `case package rejected: ${v.code}`, { code: v.code });
    const intent: OpIntent = {
      opKey: `${o.requestKey}:open`,
      kind: "open",
      requestKey: o.requestKey,
      packageDigest: v.digest,
      caseId: null,
      fn: "open_case_package",
      args: [v.canonical, v.digest],
      submissionDeadline: v.pkg.lifetime.submissionDeadline,
    };
    const provenance = v.pkg.entries.map((e) => e.provenance);
    if (!live) {
      pipeline.shadow(intent);
      if (o.surface === "live" && o.twitchReq) console.log(`[shadow] would create a Twitch Prediction with ${o.entries.length} outcomes`);
      return {
        status: 202,
        body: {
          mode: "shadow",
          label: SHADOW_LABEL,
          request_key: o.requestKey,
          package_digest: v.digest,
          provenance,
          provenance_label: provenanceLabel(provenance),
          would_submit: { function: intent.fn, args: [`<canonical package, ${v.canonical.length} chars>`, v.digest] },
        },
      };
    }
    const r = await pipeline.submit(intent);
    if (r.expectedError !== null) throw new HttpError(422, r.expectedError, { tx: r.hash, finality: r.accepted.finality });
    if (r.accepted.finality !== "ACCEPTED" && r.accepted.finality !== "FINALIZED_SUCCESS") {
      throw new HttpError(502, `open_case_package did not reach ACCEPTED (${r.accepted.finality})`, { tx: r.hash, request_key: o.requestKey });
    }
    const found = await chain.getCaseByRequestKey(o.requestKey);
    if (!found || found.case_id === 0 || !digestEquals(found.package_digest, v.digest)) {
      throw new HttpError(502, "case not found on-chain for this request key and digest", { tx: r.hash, request_key: o.requestKey });
    }
    const id = found.case_id;
    const m: CaseMeta = {
      requestKey: o.requestKey,
      packageDigest: v.digest,
      surface: o.surface,
      nEntries: o.entries.length,
      appealWindowExpiry: v.pkg.lifetime.appealWindowExpiry,
      provenance,
      appeals: 0, // publishing a Quick Verdict is not an appeal
      ...(o.preview ? { preview: { quickId: o.preview.quickId, winnerIndex: o.preview.winnerIndex } } : {}),
      sideTokenHashes: o.sideTokenHashes,
      finalizedTier: 0,
      confirmedTier: 0,
      outcome: r.accepted.finality,
      revoked: false,
      hidden: false,
      receipts: [],
      ...(o.callbackUrl ? { callbackUrl: o.callbackUrl } : {}),
    };
    meta.set(id, m);
    bg(pipeline.awaitFinal(intent.opKey, r.hash));
    if (o.surface === "live" && o.twitchReq && twitch.enabled) {
      const tw = o.twitchReq;
      const labels =
        Array.isArray(tw.labels) && tw.labels.length === o.entries.length ? tw.labels.map(String) : o.entries.map((_, i) => `Entry ${String.fromCharCode(65 + i)}`);
      try {
        m.twitch = await twitch.create(id, typeof tw.title === "string" ? tw.title : "", labels);
      } catch (e) {
        // Justified: a missing Prediction only means no stream overlay.
        console.error(`[twitch] create failed for case ${id}:`, (e as Error).message);
      }
    }
    persist(id);
    notify(id, "case.opened", { tx: r.hash, receipt_number: v.digest });
    return {
      status: 201,
      body: {
        id,
        tx: r.hash,
        status: "pending",
        finality: r.accepted.finality,
        request_key: o.requestKey,
        package_digest: v.digest,
        provenance,
        provenance_label: provenanceLabel(provenance),
        twitch_prediction_id: m.twitch?.id ?? null,
      },
    };
  }

  // ------------------------------------------------------------- judge flow

  async function startJudge(id: number, m: CaseMeta, onTier1Failed?: () => void): Promise<{ hash: string; accepted: Classification; done: Promise<void> } | { shadow: Record<string, unknown> }> {
    if (m.revoked) throw new HttpError(409, "case revoked", { finality: "REVOKED" });
    const current = await chain.getCase(id);
    if (!digestEquals(current.package_digest, m.packageDigest)) throw new HttpError(409, "receipt number mismatch between relayer and chain");
    if (current.status !== "pending") throw new HttpError(409, `case is ${current.status}; only pending cases can be judged`);
    if (expired(m)) {
      expireInBackground(id, m);
      throw new HttpError(409, "case expired", { finality: "STALE" });
    }
    const intent: OpIntent = { opKey: `${m.requestKey}:judge`, kind: "judge", requestKey: m.requestKey, packageDigest: m.packageDigest, caseId: id, fn: "judge", args: [id, m.packageDigest] };
    if (!live) {
      pipeline.shadow(intent);
      return { shadow: { mode: "shadow", label: SHADOW_LABEL, would_submit: { function: "judge", args: intent.args } } };
    }
    if (m.twitch) {
      const tw = m.twitch;
      await twitchCall(`lock case ${id}`, () => twitch.lock(tw.id), m);
    }
    const onFailure = async (why: string) => {
      onTier1Failed?.(); // e.g. restore a publish allowance: no ruling was delivered
      await cancelTwitch(m, "judging failed");
      notify(id, "case.failed", { stage: "judge", error: why });
    };
    let r;
    try {
      r = await pipeline.submit(intent);
    } catch (e) {
      await onFailure((e as Error).message);
      throw e;
    }
    m.outcome = r.accepted.finality;
    persist(id);
    const done = trackVerdict(id, "judge", intent.opKey, r.hash, onFailure);
    bg(done);
    if (r.expectedError !== null) throw new HttpError(422, r.expectedError, { tx: r.hash, finality: r.accepted.finality });
    await rereadDigest(id, m, "judge");
    return { hash: r.hash, accepted: r.accepted, done };
  }

  // ---------------------------------------------------------------- routes

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, mode: cfg.mode, network: cfg.network, contract: cfg.contractAddress, relayer: chain.relayerAddress });
  });

  // POST /cases { rubric, entries[] (string | null), surface, disclosure: {consent: true, adult_confirmed: true}, callback_url?, twitch? }
  // A null entry makes this a DRAFT (Settle It only): each side fills its own
  // slot with its side token, and those entries are recorded verified_participant.
  app.post(
    "/cases",
    wrap(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const { rubric, entries } = body;
      const surface = requireSurface(body.surface);
      if (typeof rubric !== "string" || rubric.trim() === "" || rubric.length > 200) {
        throw new HttpError(400, "rubric must be a preset key or text <= 200 chars");
      }
      if (!Array.isArray(entries) || entries.length < 2 || entries.length > 10) {
        throw new HttpError(400, "entries must be an array of 2 to 10 strings (or null slots for a draft)");
      }
      // SPEC V-FUN-02 / V-FUN-03: consumer surfaces use preset rubrics only;
      // Settle It is always exactly two sides.
      if (surface !== "api" && !PRESETS.has(rubric.trim().toLowerCase())) throw new HttpError(400, "custom rubrics are only accepted on surface api");
      if (surface === "settle" && entries.length !== 2) throw new HttpError(400, "Settle It cases have exactly 2 sides");
      const isDraft = entries.some((e) => e === null);
      if (isDraft && surface !== "settle") throw new HttpError(400, "only Settle It cases can be drafts");
      const texts = entries.map((e) => (e === null ? null : checkEntryText(e)));
      let callbackUrl: string | undefined;
      if (body.callback_url !== undefined) {
        if (typeof body.callback_url !== "string") throw new HttpError(400, "callback_url must be a string");
        const err = validateCallbackUrl(body.callback_url);
        if (err) throw new HttpError(400, err);
        callbackUrl = body.callback_url;
      }
      requireDisclosure(body);
      const mod = await moderate([rubric, ...texts.filter((t): t is string => t !== null)], modOpts);
      if (!mod.ok) throw new HttpError(mod.status ?? 422, mod.reason ?? "entry rejected by moderation");
      quota(req, "case");

      const sideTokens = entries.map(() => newToken());
      const sideTokenHashes = sideTokens.map(sha256);
      const requestKey = newRequestKey();

      if (isDraft) {
        const d: Draft = {
          id: randomBytes(12).toString("base64url"),
          requestKey,
          rubric,
          slots: texts.map((t) => (t === null ? null : { text: t, assurance: "self_asserted" as const })),
          sideTokenHashes,
          ...(callbackUrl ? { callbackUrl } : {}),
          expiresAt: new Date(clock().getTime() + cfg.draftTtlSec * 1000).toISOString(),
        };
        drafts.set(d.id, d);
        store.saveDraft(d.id, d);
        res.status(201).json({ draft_id: d.id, expires_at: d.expiresAt, request_key: requestKey, side_tokens: sideTokens, open_slots: texts.flatMap((t, i) => (t === null ? [i] : [])), notice: CONSENT_NOTICE });
        return;
      }

      const out = await openCase({
        requestKey,
        rubric,
        surface,
        entries: (texts as string[]).map((text) => ({ text, assurance: "self_asserted" as const })),
        sideTokenHashes,
        ...(callbackUrl ? { callbackUrl } : {}),
        ...(typeof body.twitch === "object" && body.twitch !== null ? { twitchReq: body.twitch as { title?: string; labels?: string[] } } : {}),
      });
      res.status(out.status).json(out.status === 201 ? { ...out.body, side_tokens: sideTokens } : out.body);
    }),
  );

  // POST /drafts/:draft/entries   header x-side-token; { text, disclosure }
  app.post(
    "/drafts/:draft/entries",
    wrap(async (req, res) => {
      const d = typeof req.params.draft === "string" ? drafts.get(req.params.draft) : undefined;
      if (!d) throw new HttpError(404, "draft not found");
      if (clock().getTime() > Date.parse(d.expiresAt)) {
        drafts.delete(d.id);
        store.saveDraft(d.id, null);
        throw new HttpError(410, "draft expired: the other side did not submit in time", { finality: "STALE" });
      }
      const side = sideForToken(d.sideTokenHashes, req.header("x-side-token") ?? undefined);
      if (side < 0) throw new HttpError(403, "a valid side token (x-side-token) is required");
      const body = (req.body ?? {}) as Record<string, unknown>;
      const text = checkEntryText(body.text);
      requireDisclosure(body); // each side consents for its own take
      if (d.slots[side] !== null) throw new HttpError(409, "this side's entry is already in");
      const mod = await moderate([d.rubric, text], modOpts);
      if (!mod.ok) throw new HttpError(mod.status ?? 422, mod.reason ?? "entry rejected by moderation");
      d.slots[side] = { text, assurance: "verified_participant" };
      store.saveDraft(d.id, d);
      if (d.slots.some((s) => s === null)) {
        res.status(202).json({ draft_id: d.id, filled: side, open_slots: d.slots.flatMap((s, i) => (s === null ? [i] : [])) });
        return;
      }
      drafts.delete(d.id);
      store.saveDraft(d.id, null);
      const out = await openCase({
        requestKey: d.requestKey,
        rubric: d.rubric,
        surface: "settle",
        entries: d.slots as Array<{ text: string; assurance: Assurance }>,
        sideTokenHashes: d.sideTokenHashes,
        ...(d.callbackUrl ? { callbackUrl: d.callbackUrl } : {}),
      });
      res.status(out.status).json(out.body);
    }),
  );

  // POST /cases/:id/judge   header x-side-token (either side)
  app.post(
    "/cases/:id/judge",
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const { m } = requireSide(req, id);
      quota(req, "action");
      const r = await startJudge(id, m);
      if ("shadow" in r) {
        res.status(202).json(r.shadow);
        return;
      }
      res.status(202).json({ tx: r.hash, finality: r.accepted.finality, final: false, verdict_final: false, receipt_number: m.packageDigest });
    }),
  );

  // POST /cases/:id/appeal   header x-side-token: the LOSING side's token.
  // Max 2 (Tier 2 then Tier 3, final). 1 free per payer per UTC day, then
  // prepaid credit. Only against a FINALIZED_SUCCESS verdict.
  app.post(
    "/cases/:id/appeal",
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const { m, side } = requireSide(req, id);
      const claimed = (req.body as { side?: unknown } | undefined)?.side;
      if (claimed !== undefined && claimed !== side) throw new HttpError(400, "side does not match the side token");
      if (m.revoked) throw new HttpError(409, "case revoked", { finality: "REVOKED" });
      quota(req, "action");
      const current = await chain.getCase(id);
      if (!digestEquals(current.package_digest, m.packageDigest)) throw new HttpError(409, "receipt number mismatch between relayer and chain");
      if (current.status !== "judged" && current.status !== "appealed") {
        throw new HttpError(409, `case is ${current.status}; only judged cases can be appealed`);
      }
      if (current.tier >= 3) throw new HttpError(409, "already at the Supreme Court");
      if (m.finalizedTier !== current.tier || m.confirmedTier !== current.tier || current.confirmed_tier !== current.tier) {
        throw new HttpError(409, "the current verdict is not final yet", { finality: m.outcome });
      }
      if (side === current.winner_index) throw new HttpError(403, "the winning side cannot appeal");
      if (m.appeals >= cfg.maxAppealsPerCase) throw new HttpError(429, "appeal limit reached for this case");
      if (expired(m)) throw new HttpError(409, "appeal window expired", { finality: "STALE" });

      const payer = payerId(req);
      const nextTier = current.tier + 1;
      // Tier 2: daily free appeal or $1.99; Tier 3 (Supreme Court): $4.99. A
      // published Quick Verdict follows the same ladder (publishing is not an appeal).
      const price = nextTier >= 3 ? cfg.appealPriceCents.tier3 : cfg.appealPriceCents.tier2;
      const intent: OpIntent = {
        opKey: `${m.requestKey}:appeal:${nextTier}`,
        kind: "appeal",
        requestKey: m.requestKey,
        packageDigest: m.packageDigest,
        caseId: id,
        fn: "appeal",
        args: [id, m.packageDigest, current.tier],
        fromTier: current.tier,
      };
      if (!live) {
        pipeline.shadow(intent);
        res.status(202).json({ mode: "shadow", label: SHADOW_LABEL, would_submit: { function: "appeal", args: intent.args }, would_charge: { free_or_cents: price } });
        return;
      }
      // Payment, after every check above.
      let paidWith: "free" | "credit";
      if (freeAppeals.take(payer, clock()) >= 0) paidWith = "free";
      else if (credits.spend(payer, price)) paidWith = "credit";
      else throw new HttpError(402, `today's free appeal is used; this appeal needs ${price} cents of prepaid credit`);
      const refund = () => {
        // Technical refund only (the transaction failed; no verdict exists).
        if (paidWith === "free") freeAppeals.refund(payer);
        else credits.grant(payer, price);
      };

      m.appeals += 1;
      persist(id);
      clearTwitchTimer(m); // hold the Prediction while the appeal runs
      const onFailure = async (why: string, cls?: Classification) => {
        m.appeals -= 1;
        persist(id);
        // Refund only when the chain says the appeal did not execute.
        if (!cls || cls.execution === "ERROR" || cls.chainStatus === "CANCELED" || cls.finality === "FINALIZED_ERROR") refund();
        if (m.finalizedTier === current.tier) await settleTwitch(current, m); // re-arm on the standing verdict
        notify(id, "case.failed", { stage: "appeal", error: why });
      };
      let r;
      try {
        r = await pipeline.submit(intent);
      } catch (e) {
        await onFailure((e as Error).message);
        throw e;
      }
      m.outcome = r.accepted.finality;
      bg(trackVerdict(id, "appeal", intent.opKey, r.hash, onFailure));
      if (r.expectedError !== null) throw new HttpError(422, r.expectedError, { tx: r.hash, finality: r.accepted.finality });
      await rereadDigest(id, m, "appeal");
      res.status(202).json({ tx: r.hash, finality: r.accepted.finality, final: false, verdict_final: false, paid_with: paidWith, credit_balance_cents: credits.balance(payer), receipt_number: m.packageDigest });
    }),
  );

  // POST /cases/:id/revoke   header x-side-token (either side). Before final only.
  app.post(
    "/cases/:id/revoke",
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const { m, side } = requireSide(req, id);
      if (m.revoked) {
        res.json({ revoked: true, finality: "REVOKED" });
        return;
      }
      const current = await chain.getCase(id);
      if (!digestEquals(current.package_digest, m.packageDigest)) throw new HttpError(409, "receipt number mismatch between relayer and chain");
      // Revocation closes once the Tier 1 verdict is FINALIZED_SUCCESS: after
      // that a winner could otherwise kill the loser's appeal. Takedown only.
      if (m.finalizedTier >= 1 || current.confirmed_tier >= 1 || current.status === "final" || current.status === "appealed" || current.tier !== 1) {
        throw new HttpError(409, "the verdict is final; request a takedown instead (POST /cases/:id/takedown)");
      }
      if (current.status !== "pending" && current.status !== "judged") {
        throw new HttpError(409, `case is ${current.status}; it cannot be revoked`);
      }
      const intent: OpIntent = { opKey: `${m.requestKey}:revoke`, kind: "revoke", requestKey: m.requestKey, packageDigest: m.packageDigest, caseId: id, fn: "revoke", args: [id, m.packageDigest, side] };
      if (!live) {
        pipeline.shadow(intent);
        res.status(202).json({ mode: "shadow", label: SHADOW_LABEL, would_submit: { function: "revoke", args: intent.args } });
        return;
      }
      // Suppress cards / Twitch at once, even for verdicts still in flight.
      m.revoked = true;
      m.outcome = "REVOKED";
      persist(id);
      await cancelTwitch(m, "consent withdrawn");
      const r = await pipeline.submit(intent);
      if (r.expectedError !== null) throw new HttpError(422, r.expectedError, { tx: r.hash });
      bg(trackSimple(id, "revoke", intent.opKey, r.hash));
      res.status(202).json({
        revoked: true,
        finality: "REVOKED",
        tx: r.hash,
        note: "Entry texts are cleared from the contract's current state, but transaction history keeps them: on-chain data cannot be erased.",
      });
    }),
  );

  // POST /cases/:id/takedown   header x-side-token. Off-chain hide flag only.
  app.post(
    "/cases/:id/takedown",
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const { m } = requireSide(req, id);
      m.hidden = true;
      persist(id);
      res.json({
        hidden: true,
        note: "Hidden from VERDICT's gallery and cards. The text remains in the public blockchain's history and cannot be erased.",
      });
    }),
  );

  function requireAdmin(req: Request): void {
    if (!cfg.adminToken) throw new HttpError(404, "not found");
    const auth = req.header("authorization") ?? "";
    const want = Buffer.from(sha256(`Bearer ${cfg.adminToken}`), "hex");
    if (!timingSafeEqual(Buffer.from(sha256(auth), "hex"), want)) throw new HttpError(401, "unauthorized");
  }

  // GET /ops/fees  admin only: measured fee per on-chain tx (ADR-022 item 4) + the publish budget.
  app.get(
    "/ops/fees",
    wrap(async (req, res) => {
      requireAdmin(req);
      const last = Math.min(200, Math.max(1, Number(req.query.last ?? 20) || 20));
      res.setHeader("cache-control", "no-store");
      res.json({ ...fees.summary(last), publish_budget: publishBudget.status() });
    }),
  );

  // POST /credits/grant  { payer, cents }  (Authorization: Bearer ADMIN_TOKEN)
  app.post(
    "/credits/grant",
    wrap(async (req, res) => {
      requireAdmin(req);
      const { payer, cents } = (req.body ?? {}) as { payer?: unknown; cents?: unknown };
      if (typeof payer !== "string" || payer === "" || typeof cents !== "number" || !Number.isInteger(cents) || cents <= 0) {
        throw new HttpError(400, "body must be { payer: string, cents: positive integer }");
      }
      credits.grant(payer, cents);
      res.json({ payer, credit_balance_cents: credits.balance(payer) });
    }),
  );

  // Verdict fields are shown only for a FINALIZED_SUCCESS verdict (audit P1-3).
  // Before that the case shows "Network checking" and no winner.
  const VERDICT_FIELDS = ["winner_index", "scores", "juror_votes", "split", "reason", "history"] as const;
  function publicView(c: CaseView, m: CaseMeta): { case: Record<string, unknown>; verdictFinal: boolean } {
    const last = m.receipts[m.receipts.length - 1];
    const verdictFinal = m.finalizedTier > 0 && m.finalizedTier === c.tier && last?.verdict !== null && last !== undefined;
    const view: Record<string, unknown> = { ...c };
    if (!verdictFinal) {
      for (const k of VERDICT_FIELDS) delete view[k];
      view.rail_step = c.status === "pending" ? "Submitted" : "Network checking";
    }
    return { case: view, verdictFinal };
  }

  // GET /cases/:id   only cases this relayer opened through a consented package.
  app.get(
    "/cases/:id",
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const m = meta.get(id);
      if (!m) throw new HttpError(404, "case not opened through this relayer");
      if (m.hidden || m.revoked) throw new HttpError(410, "this case was withdrawn or taken down", { finality: m.revoked ? "REVOKED" : m.outcome });
      const c = await chain.getCase(id);
      if (c.status === "revoked") throw new HttpError(410, "this case was withdrawn", { finality: "REVOKED" });
      if (!c.package_digest || !digestEquals(c.package_digest, m.packageDigest)) throw new HttpError(404, "case not opened through this relayer");
      const v = publicView(c, m);
      const last = m.receipts[m.receipts.length - 1];
      res.json({
        case: v.case,
        verdict_final: v.verdictFinal,
        finality: m.outcome ?? null,
        card: v.verdictFinal && last ? card(last) : null,
        provenance_label: provenanceLabel(c.provenance ?? []),
        twitch_prediction_id: m.twitch?.id ?? null,
      });
    }),
  );

  // GET /cases?limit=20&surface=settle  public gallery: relayer-opened, consented
  // package cases only, and only once their verdict is FINALIZED_SUCCESS.
  app.get(
    "/cases",
    wrap(async (req, res) => {
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20) || 20));
      const surface = typeof req.query.surface === "string" && SURFACES.some((s) => s === req.query.surface) ? req.query.surface : "";
      const rows = (await chain.listRecent(limit, surface)) as Array<CaseView>;
      const out = [];
      for (const r of rows) {
        const m = meta.get(r.id);
        if (!m || m.hidden || m.revoked || r.status === "revoked") continue;
        if (!r.package_digest || !digestEquals(r.package_digest, m.packageDigest)) continue;
        const v = publicView(r, m);
        if (!v.verdictFinal) continue;
        out.push(v.case);
      }
      res.json({ cases: out });
    }),
  );

  // POST /judge  one-shot for n8n / MCP: open + judge, waits for finality.
  app.post(
    "/judge",
    wrap(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const { rubric, entries } = body;
      if (typeof rubric !== "string" || rubric.trim() === "" || rubric.length > 200 || !Array.isArray(entries)) {
        throw new HttpError(400, "body must be { rubric: string, entries: string[], disclosure: {...} }");
      }
      if (entries.length < 2 || entries.length > 10) throw new HttpError(400, "entries must be 2 to 10 strings");
      const texts = entries.map(checkEntryText);
      requireDisclosure(body);
      const mod = await moderate([rubric, ...texts], modOpts);
      if (!mod.ok) throw new HttpError(mod.status ?? 422, mod.reason ?? "entry rejected by moderation");
      quota(req, "case");
      quota(req, "action");
      const opened = await openCase({
        requestKey: newRequestKey(),
        rubric,
        surface: "api",
        entries: texts.map((text) => ({ text, assurance: "self_asserted" as const })),
        sideTokenHashes: texts.map(() => sha256(newToken())),
      });
      if (opened.status !== 201) {
        res.status(opened.status).json(opened.body);
        return;
      }
      const id = opened.body.id as number;
      const m = meta.get(id)!;
      const r = await startJudge(id, m);
      if ("shadow" in r) {
        res.status(202).json(r.shadow);
        return;
      }
      await r.done;
      const last = m.receipts[m.receipts.length - 1];
      if (m.outcome !== "FINALIZED_SUCCESS" || !last?.verdict) {
        res.status(202).json({ id, tx: r.hash, finality: m.outcome, verdict: null, receipt_number: m.packageDigest });
        return;
      }
      res.json({ ...card(last), id, finality: "FINALIZED_SUCCESS" });
    }),
  );

  // Scam Pattern Ledger (ADR-020): SHADOW unless PATTERN_LEDGER_MODE=live AND VERDICT_MODE=live.
  const pcfg = deps.patternConfig ?? patternConfigFromEnv(process.env, cfg.mode);
  let ledger: PatternLedgerClient | undefined;
  const ledgerClient = (): PatternLedgerClient | undefined => {
    if (!ledger && pcfg.address) ledger = new PatternLedgerClient({ network: cfg.network, rpcUrl: cfg.rpcUrl, address: pcfg.address, privateKey: cfg.relayerPrivateKey });
    return ledger;
  };
  const patternChain = deps.patternChain ?? (pcfg.mode === "live" ? ledgerClient() : undefined);
  const patternReader = deps.patternReader ?? ledgerClient();

  // Quick Verdict (off-chain): Settle It quick + publish, Red Flag Court (+ pattern ledger), practice court.
  registerQuickRoutes(app, {
    shadowLabel: SHADOW_LABEL,
    publishBudget,
    pattern: {
      cfg: pcfg,
      limiter: new DailyCounter(pcfg.dailyCap, laDay), // 5 per user per LA day (ADR-021 item 4)
      ...(patternChain ? { chain: patternChain } : {}),
      ...(patternReader ? { reader: patternReader } : {}),
    },
    cfg,
    clock,
    provider: deps.judgeProvider,
    practice: deps.practice,
    modOpts,
    quota,
    requireDisclosure,
    sideForToken,
    openCase: (o) => openCase(o),
    judgeOpened: async (id, onTier1Failed) => {
      const r = await startJudge(id, meta.get(id)!, onTier1Failed);
      if ("shadow" in r) return r.shadow;
      return { tx: r.hash, finality: r.accepted.finality, final: false, verdict_final: false };
    },
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...err.extra });
      return;
    }
    if (err instanceof PipelineError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "invalid JSON body" });
      return;
    }
    // body-parser errors carry their own status (413 over the 16 kB limit, 415 bad charset)
    const bp = err as { type?: unknown; status?: unknown };
    if (typeof bp.type === "string" && typeof bp.status === "number" && bp.status >= 400 && bp.status < 500) {
      res.status(bp.status).json({ error: bp.type === "entity.too.large" ? "request body over 16 kB" : "bad request body" });
      return;
    }
    console.error("[relayer] unhandled:", err);
    res.status(500).json({ error: "internal error" });
  });

  return Object.assign(app, {
    pipeline,
    reconcile: () => pipeline.reconcile(),
    async idle() {
      while (tasks.size) await Promise.allSettled([...tasks]);
    },
  });
}
