// Outbound webhook delivery with HMAC-SHA256 signing.
// Receivers verify: hex(hmac_sha256(secret, `${timestamp}.${rawBody}`)) === X-Verdict-Signature
// and reject timestamps older than ~5 minutes to stop replays.

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export interface WebhookEvent {
  event: "case.opened" | "case.judged" | "case.appealed" | "case.failed" | "case.revoked" | "case.stale";
  case_id: number;
  data: unknown;
}

/** Reject obvious SSRF targets. A production deployment should also resolve
 * DNS and re-check the resolved address. */
export function validateCallbackUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    // Not swallowed: an unparseable URL is rejected (fail closed).
    return "callback_url is not a valid URL";
  }
  if (u.protocol !== "https:") return "callback_url must be https";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return "callback_url host not allowed";
  }
  if (isIP(host)) {
    if (
      /^(10\.|127\.|0\.|169\.254\.|192\.168\.)/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
      host === "::1" ||
      host === "::" ||
      /^::ffff:/i.test(host) || // IPv4-mapped IPv6 (e.g. [::ffff:7f00:1] = 127.0.0.1)
      /^f[cd]/i.test(host) ||
      /^fe80/i.test(host)
    ) {
      return "callback_url host not allowed";
    }
  }
  return null;
}

export async function deliverWebhook(
  url: string,
  payload: WebhookEvent,
  secret: string,
  timeoutMs: number,
): Promise<void> {
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "verdict-relayer/0.1",
    "x-verdict-event": payload.event,
    "x-verdict-timestamp": ts,
  };
  if (secret) {
    headers["x-verdict-signature"] = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return;
      if (res.status < 500 && res.status !== 429) return; // receiver rejected; do not retry
    } catch {
      // Justified: a network error / timeout is retried below; after the last
      // attempt we log and give up (webhooks are notifications, not state).
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  console.warn(`[webhook] giving up on ${new URL(url).host} for case ${payload.case_id}`);
}
