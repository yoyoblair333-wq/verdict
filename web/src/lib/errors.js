// Plain-language error states for the live page. Every failure the page can
// hit falls into one of a few kinds, each with a sentence a non-crypto visitor
// can act on and a retry label. Pure module: unit-tested offline.

export const DEFAULT_READ_TIMEOUT_MS = 20000;

/** Read timeout; tests may lower it with `window.VERDICT_READ_TIMEOUT_MS`. */
export function readTimeoutMs() {
  const v = typeof globalThis !== "undefined" ? Number(globalThis.VERDICT_READ_TIMEOUT_MS) : NaN;
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_READ_TIMEOUT_MS;
}

export class SlowError extends Error {
  constructor(label, ms) {
    super(`${label} took longer than ${Math.round(ms / 1000)} s`);
    this.code = "SLOW";
  }
}

/** Reject with SlowError if `p` has not settled within `ms`. */
export function withTimeout(p, ms, label = "The network") {
  let t;
  return Promise.race([
    p,
    new Promise((_, rej) => {
      t = setTimeout(() => rej(new SlowError(label, ms)), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

const OFFLINE = /failed to fetch|networkerror|fetch failed|load failed|network request failed|err_|econn|enotfound|eai_again|socket hang up|\b50[234]\b|bad gateway|service unavailable|gateway time-?out|unknown rpc error/i;
const SLOW = /timed? ?out|timeout|took longer than/i;
const FUNDS = /insufficient funds|out of gas|gas required exceeds|intrinsic gas|not enough (gen|balance)|exceeds balance/i;

/**
 * Classify an error (or a tracked tx outcome) into a plain-language state.
 * `outcome` may carry {finality, execution, reason} from the tx tracker.
 */
export function classifyError(err, outcome = {}) {
  const msg = String(err?.message ?? err ?? "");
  if (outcome.finality === "STALE" || err?.code === "STALE") {
    return {
      kind: "stale",
      message: "Your transaction was sent, but the network has not finalized it after 15 minutes. It may still finish. Nothing is lost: check it again.",
      retry: "Check again",
    };
  }
  if (outcome.execution === "ERROR" || err?.code === "REFUSED") {
    const why = outcome.reason || msg.replace(/^.*?:\s*/, "");
    return {
      kind: "refused",
      message: `The contract refused this request${why ? `: ${why}` : ""}. That is a final answer from the network, not a connection problem.`,
      retry: "Edit and try again",
    };
  }
  if (FUNDS.test(msg)) {
    return {
      kind: "funds",
      message: "Your throwaway testnet account could not pay the network fee. Test GEN has no real value. Make a new burner (link above) or try again in a minute.",
      retry: "Try again",
    };
  }
  if (err?.code === "SLOW" || SLOW.test(msg)) {
    return {
      kind: "slow",
      message: "The GenLayer test network is answering slowly right now. Nothing was lost. Try again in a moment.",
      retry: "Try again",
    };
  }
  if (OFFLINE.test(msg) || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    return {
      kind: "offline",
      message: "Your browser can't reach the GenLayer test network right now. Check your connection, then try again.",
      retry: "Try again",
    };
  }
  return {
    kind: "unknown",
    message: `Something went wrong${msg ? ` (${msg.slice(0, 160)})` : ""}. Try again; if it keeps happening, the network may be busy.`,
    retry: "Try again",
  };
}
