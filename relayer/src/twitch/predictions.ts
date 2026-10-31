// Twitch Prediction resolver for Live Court.
//
// Helix endpoints (https://dev.twitch.tv/docs/api/predictions/ and
// https://dev.twitch.tv/docs/api/reference/#create-prediction / #end-prediction):
//   POST  https://api.twitch.tv/helix/predictions   create  (2..10 outcomes)
//   PATCH https://api.twitch.tv/helix/predictions   end: status RESOLVED | CANCELED | LOCKED
// Scope: channel:manage:predictions (user access token of the broadcaster).
// Headers: Authorization: Bearer <user token>, Client-Id: <app client id>.
// Predictions are only available to Twitch Partners and Affiliates.
//
// Channel Points have no cash value; VERDICT never attaches money to a case.

import type { Config } from "../config.js";

const HELIX = "https://api.twitch.tv/helix/predictions";

// Conservative limits (Twitch reference: title <= 45 chars, outcome title
// <= 25 chars, prediction_window 30..1800 s). Verify before deploy.
const TITLE_MAX = 45;
const OUTCOME_MAX = 25;
const WINDOW_MIN = 30;
const WINDOW_MAX = 1800;

export interface TwitchPrediction {
  id: string;
  status: "ACTIVE" | "RESOLVED" | "CANCELED" | "LOCKED";
  outcomes: Array<{ id: string; title: string }>;
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

export class TwitchPredictions {
  private readonly cfg: Config["twitch"];

  constructor(cfg: Config["twitch"]) {
    this.cfg = cfg;
  }

  get enabled(): boolean {
    return Boolean(this.cfg.clientId && this.cfg.broadcasterId && this.cfg.userAccessToken);
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.cfg.userAccessToken}`,
      "client-id": this.cfg.clientId,
      "content-type": "application/json",
    };
  }

  private async call(method: "POST" | "PATCH", body: Record<string, unknown>): Promise<TwitchPrediction> {
    if (!this.enabled) throw new Error("Twitch integration not configured");
    const res = await fetch(HELIX, {
      method,
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      // 401 -> token expired/missing scope; 400 -> bad outcome id or one already active.
      throw new Error(`Twitch ${method} predictions failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const json = JSON.parse(text) as { data?: TwitchPrediction[] };
    const p = json.data?.[0];
    if (!p) throw new Error("Twitch returned no prediction");
    return p;
  }

  /** One outcome per entry, in entry-index order. Labels default to
   * "A", "B", ... because entries themselves are usually too long. */
  async create(caseId: number, title: string, labels: string[]): Promise<TwitchPrediction> {
    if (labels.length < 2 || labels.length > 10) throw new Error("Twitch predictions need 2 to 10 outcomes");
    const window = Math.min(WINDOW_MAX, Math.max(WINDOW_MIN, this.cfg.predictionWindowSec));
    return this.call("POST", {
      broadcaster_id: this.cfg.broadcasterId,
      title: clip(title || `VERDICT case #${caseId}: who wins?`, TITLE_MAX),
      outcomes: labels.map((l) => ({ title: clip(l, OUTCOME_MAX) })),
      prediction_window: window,
    });
  }

  /** Resolve with the outcome matching the jury's winner_index. */
  async resolve(predictionId: string, outcomes: TwitchPrediction["outcomes"], winnerIndex: number): Promise<TwitchPrediction> {
    const winner = outcomes[winnerIndex];
    if (!winner) throw new Error(`winner_index ${winnerIndex} has no matching Twitch outcome`);
    return this.call("PATCH", {
      broadcaster_id: this.cfg.broadcasterId,
      id: predictionId,
      status: "RESOLVED",
      winning_outcome_id: winner.id,
    });
  }

  /** Refund everyone's Channel Points (e.g. the jury failed to reach consensus). */
  async cancel(predictionId: string): Promise<TwitchPrediction> {
    return this.call("PATCH", {
      broadcaster_id: this.cfg.broadcasterId,
      id: predictionId,
      status: "CANCELED",
    });
  }

  /** Stop new predictions while the jury deliberates. */
  async lock(predictionId: string): Promise<TwitchPrediction> {
    return this.call("PATCH", {
      broadcaster_id: this.cfg.broadcasterId,
      id: predictionId,
      status: "LOCKED",
    });
  }
}
