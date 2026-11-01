// Scam Pattern Ledger helpers (PatternLedger, read-only on this page).
// Pure functions so the offline tests can check them without a network.

const CATEGORY_LABEL = {
  delivery: "Parcel / delivery",
  "account-lock": "Locked account",
  romance: "Romance",
  job: "Job offer",
  prize: "Prize / giveaway",
  investment: "Investment",
  impersonation: "Impersonation",
  other: "Other",
};

const FLAG_LABEL = {
  urgency: "Urgency",
  too_good_to_be_true: "Too good to be true",
  upfront_payment: "Pay up front",
  crypto_only: "Crypto only",
  off_platform_move: "Move off the platform",
  link_pressure: "Pushes a link",
  code_request: "Asks for a code",
  stranger_friendly: "Overly friendly stranger",
  pay_to_get_paid: "Pay to get paid",
  impersonation_claim: "Claims to be someone",
  secrecy: "Asks for secrecy",
  guaranteed_returns: "Guaranteed returns",
  cant_meet: "Can't meet or call",
  threat_of_loss: "Threat of loss",
  talks_to_the_ai: "Talks to the AI",
  money_offer: "Offers money",
};

export const categoryLabel = (c) => CATEGORY_LABEL[c] ?? String(c ?? "");
export const flagLabel = (f) => FLAG_LABEL[f] ?? String(f ?? "").replace(/_/g, " ");

/** `since` for top_patterns_since: `days` before `now`, as YYYY-MM-DDTHH:MM:SSZ. */
export function sinceIso(now, days) {
  const d = new Date(now.getTime() - days * 86400000);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Plain words for who may write, from get_config (never a visitor). */
export function writersLine(cfg, ownerAddress, relayerAddress) {
  const eq = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
  const owner = eq(cfg?.owner, ownerAddress) ? "the owner's wallet" : `the owner ${cfg?.owner ?? "(unknown)"}`;
  const relayer = eq(cfg?.relayer, relayerAddress) ? "the VERDICT relayer" : `the relayer ${cfg?.relayer ?? "(unknown)"}`;
  return `Only ${owner} and ${relayer} can add patterns. Visitors can read the ledger but cannot write to it, so this page never offers a write.`;
}

/** Recorded submission outcome as a short label for the status check. */
export function submissionLabel(s) {
  if (!s) return "";
  if (/pii|identif/i.test(`${s.label} ${s.intent}`) || s.expected === "ERROR") return "Rejected as designed (identifying data)";
  if (/dedup|same pattern|sighting/i.test(`${s.label} ${s.intent}`)) return "Counted as a repeat sighting";
  return "New pattern stored";
}
