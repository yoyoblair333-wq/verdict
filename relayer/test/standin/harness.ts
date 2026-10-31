// STAND-IN harness: real relayer HTTP app + FakeChain + fake Twitch + temp journals.

import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildApp, type Deps, type VerdictApp } from "../../src/app.js";
import type { Config } from "../../src/config.js";
import { InMemoryCredits } from "../../src/lib/credits.js";
import { Inbox, Outbox } from "../../src/lib/journal.js";
import type { WebhookEvent } from "../../src/lib/webhook.js";
import { CODE_DIGEST, CONTRACT, FakeChain } from "./fakeChain.js";

export const SECRETS = {
  apiKey: "dev-key-SECRET-7f3a",
  adminToken: "admin-SECRET-91c2",
  webhookSecret: "whsec-SECRET-5d10",
  twitchToken: "twitch-SECRET-0be4",
  privateKey: `0x${"11".repeat(32)}`,
};

export function baseConfig(dir: string, over: Partial<Config> = {}): Config {
  return {
    mode: "live",
    port: 0,
    network: "studionet",
    rpcUrl: undefined,
    contractAddress: CONTRACT,
    expectedContractCodeDigest: CODE_DIGEST,
    allowUnverifiedContract: false,
    relayerPrivateKey: SECRETS.privateKey as `0x${string}`,
    outboxPath: path.join(dir, "outbox.jsonl"),
    inboxPath: path.join(dir, "inbox.jsonl"),
    statePath: path.join(dir, "state.jsonl"),
    creditsPath: path.join(dir, "credits.jsonl"),
    draftTtlSec: 3600,
    submissionTtlSec: 900,
    caseLifetimeSec: 86400,
    acceptTimeoutMs: 2000,
    finalityTimeoutMs: 2000,
    pollIntervalMs: 1,
    moderationPolicyVersion: "verdict-local-2026-10-31",
    moderationAckLocalOnly: true,
    noticeVersion: "public-onchain-v1",
    apiKeys: new Set([SECRETS.apiKey]),
    perIpDailyCap: 50,
    perKeyDailyCap: 100,
    perKeyDailyActionCap: 100,
    maxAppealsPerCase: 2,
    freeAppealsPerDay: 1,
    appealPriceCents: { tier2: 199, tier3: 499 },
    adminToken: SECRETS.adminToken,
    webhookSecret: SECRETS.webhookSecret,
    webhookTimeoutMs: 1000,
    trustProxy: false,
    quick: {
      dailyCap: 10,
      practiceDailyCap: 10,
      publishDailyCap: 3,
      ttlSec: 86400,
      practiceRulesPath: path.join(dir, "practice-rules.json"),
      storePath: path.join(dir, "quick.jsonl"),
      redTeamPath: path.join(dir, "redteam.jsonl"),
      sealedPath: path.join(dir, "sealed.jsonl"),
      accountKeySecret: "acct-SECRET-3e77",
    },
    twitch: { clientId: "c", broadcasterId: "b", userAccessToken: SECRETS.twitchToken, predictionWindowSec: 120, appealWindowMs: 0 },
    ...over,
  };
}

export interface Harness {
  app: VerdictApp;
  base: string;
  chain: FakeChain;
  cfg: Config;
  dir: string;
  twitchCalls: string[];
  webhooks: WebhookEvent[];
  credits: InMemoryCredits;
  outbox: Outbox;
  inbox: Inbox;
  clock: { now: Date };
  close(): void;
  post(p: string, body: unknown, headers?: Record<string, string>): Promise<{ status: number; json: Record<string, any> }>;
  get(p: string, headers?: Record<string, string>): Promise<{ status: number; json: Record<string, any> }>;
}

export async function harness(
  over: Partial<Config> = {},
  chain = new FakeChain(),
  extra: { dir?: string; moderationProvider?: Deps["moderationProvider"]; credits?: Deps["credits"]; defaultCredits?: boolean; judgeProvider?: Deps["judgeProvider"]; practice?: Deps["practice"] } = {},
): Promise<Harness> {
  const dir = extra.dir ?? mkdtempSync(path.join(tmpdir(), "verdict-test-"));
  const cfg = baseConfig(dir, over);
  const clock = { now: new Date("2026-10-31T12:00:00Z") };
  const twitchCalls: string[] = [];
  const webhooks: WebhookEvent[] = [];
  const twitch: Deps["twitch"] = {
    enabled: true,
    async create(_id, _title, labels) {
      twitchCalls.push(`create:${labels.length}`);
      return { id: "pred1", status: "ACTIVE", outcomes: labels.map((_, i) => ({ id: `o${i}`, title: `o${i}` })) };
    },
    async lock(id) {
      twitchCalls.push(`lock:${id}`);
      return { id, status: "LOCKED", outcomes: [] };
    },
    async resolve(id, outcomes, w) {
      twitchCalls.push(`resolve:${id}:${outcomes[w]!.id}`);
      return { id, status: "RESOLVED", outcomes };
    },
    async cancel(id) {
      twitchCalls.push(`cancel:${id}`);
      return { id, status: "CANCELED", outcomes: [] };
    },
  };
  const credits = (extra.credits as InMemoryCredits | undefined) ?? new InMemoryCredits();
  const outbox = new Outbox(cfg.outboxPath, () => clock.now);
  const inbox = new Inbox(cfg.inboxPath);
  const app = buildApp({
    cfg, chain, twitch, outbox, inbox,
    ...(extra.defaultCredits ? {} : { credits }),
    clock: () => clock.now,
    sleep: () => new Promise<void>((r) => setImmediate(r)), // yield to I/O between polls
    webhook: async (_url, ev) => void webhooks.push(ev),
    ...(extra.moderationProvider ? { moderationProvider: extra.moderationProvider } : {}),
    ...(extra.judgeProvider ? { judgeProvider: extra.judgeProvider } : {}),
    ...(extra.practice ? { practice: extra.practice } : {}),
  });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, p: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(base + p, {
      method,
      headers: { "content-type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, json: (await r.json()) as Record<string, any> };
  };
  return {
    app, base, chain, cfg, dir, twitchCalls, webhooks, credits, outbox, inbox, clock,
    close: () => void server.close(),
    post: (p, body, headers) => call("POST", p, body, headers),
    get: (p, headers) => call("GET", p, undefined, headers),
  };
}

export const KEY = { "x-api-key": SECRETS.apiKey };
export const CONSENT = { consent: true, adult_confirmed: true };
export const tok = (t: string) => ({ ...KEY, "x-side-token": t });

export function caseBody(over: Record<string, unknown> = {}) {
  return { rubric: "whos_right", entries: ["Tabs are better.", "Spaces are better."], surface: "settle", disclosure: CONSENT, ...over };
}

/** Open + judge + wait for finality. Returns id and both side tokens. */
export async function openAndJudge(h: Harness, over: Record<string, unknown> = {}) {
  const o = await h.post("/cases", caseBody(over), KEY);
  if (o.status !== 201) throw new Error(`open failed ${o.status} ${JSON.stringify(o.json)}`);
  const [t0, t1] = o.json.side_tokens as string[];
  const j = await h.post(`/cases/${o.json.id}/judge`, {}, tok(t0!));
  await h.app.idle();
  return { id: o.json.id as number, t0: t0!, t1: t1!, open: o, judge: j };
}
