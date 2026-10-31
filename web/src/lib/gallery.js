// Gallery trust model for the public page (ADR-023, AUDIT-2 P1-7). Pure
// functions only: the offline test tier runs them under node with no network.
//
// open_case_package is open to any sender, so consent, 18+, moderation and
// provenance on a case are whatever its opener wrote. The page therefore:
//   - gives relayer-verified wording ONLY to cases whose creator is the
//     configured VERDICT relayer address;
//   - labels every other case as a visitor case with self-reported labels;
//   - shows confirmed_tier as on-chain status, attributed to who set it;
//   - pins the evidence cases (by id) first, and pages through the rest by id,
//     so newer spam can never push the evidence off the page.

export const VISITOR_LINE = "Opened by a visitor's testnet account. Self-reported labels not verified.";
export const VISITOR_CHIP = "Visitor case · not moderated by VERDICT";
export const RELAYER_CHIP = "Opened by the VERDICT relayer";

const lc = (s) => (typeof s === "string" ? s.toLowerCase() : "");

/** True only when the case's creator is the configured relayer address. */
export function isRelayerCase(c, relayerAddress) {
  return /^0x[0-9a-f]{40}$/.test(lc(relayerAddress)) && lc(c?.creator) === lc(relayerAddress);
}

const letter = (i) => String.fromCharCode(65 + i);

/** Provenance text. Relayer-checked wording appears only on relayer cases. */
export function provenanceLabel(prov, relayerCase) {
  if (!relayerCase) {
    const says = Array.isArray(prov) && prov.some((p) => p?.assurance === "verified_participant") ? " The opener's package says verified (not checked)." : "";
    return `${VISITOR_LINE}${says} The receipt proves which takes were judged, not who wrote them or that the verdict is correct.`;
  }
  if (!Array.isArray(prov) || prov.length === 0) return "Provenance not recorded; authorship not verified.";
  const one = (p) => {
    const src = p.entry_source ?? p.entrySource;
    if (src === "participant_submitted" && p.assurance === "verified_participant") return "submitted by the participant holding that side's link (checked by the VERDICT relayer)";
    if (src === "participant_submitted") return "submitted through Settle It; authorship not verified";
    if (src === "host_submitted") return "relayed by the stream host; authorship not verified";
    if (src === "api_client_submitted") return "submitted by an API client; authorship not verified";
    return "source unknown; not verified";
  };
  const labels = prov.map(one);
  const body = labels.every((l) => l === labels[0]) ? `All takes ${labels[0]}` : labels.map((l, i) => `Entry ${letter(i)}: ${l}`).join(". ");
  return `${body}. The receipt proves which takes were judged, not that the verdict is correct.`;
}

/** The confirmed_tier chip, labelled as on-chain status and attributed. null if none. */
export function tierStatus(c, relayerCase) {
  const t = Number(c?.confirmed_tier);
  if (!Number.isInteger(t) || t <= 0) return null;
  return relayerCase
    ? { text: `On-chain status: Tier ${t} confirmed by the relayer`, title: "confirm_verdict sent by the VERDICT relayer after it saw this tier's jury transaction reach FINALIZED + SUCCESS. Check the jury transaction below for the network's own answer." }
    : { text: `On-chain status: creator says Tier ${t} final`, title: "confirm_verdict was sent by the case's own creator, not checked by VERDICT. Check the jury transaction for the network's own answer." };
}

/** Receipt display (ADR-024 item 7): "Receipt" + first 4 and last 4 hex; full value kept. Never VR-. */
export function receiptDisplay(digest) {
  const hex = String(digest ?? "").replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex)) return null;
  const short = hex.length > 8 ? `${hex.slice(0, 4)}…${hex.slice(-4)}` : hex;
  return { label: "Receipt", short, full: hex, text: `Receipt ${short}` };
}

/**
 * Which case ids to fetch. Pinned (evidence) ids always; then one page of the
 * newest ids below `before` (exclusive), skipping pinned ones.
 *   nextId: get_config().next_id   before: page cursor (defaults to nextId)
 * Returns {pinned, page, nextBefore} where nextBefore <= 1 means no older page.
 */
export function idsToFetch(nextId, pinnedIds, before, size) {
  const top = Math.max(1, Number(nextId) || 1);
  const pinned = [...new Set((pinnedIds ?? []).map(Number).filter((n) => Number.isSafeInteger(n) && n >= 1 && n < top))].sort((a, b) => a - b);
  const start = Math.min(Number(before ?? top) || top, top);
  const page = [];
  let id = start - 1;
  for (; id >= 1 && page.length < size; id--) if (!pinned.includes(id)) page.push(id);
  return { pinned, page, nextBefore: id + 1 };
}

/** Splits fetched cases into the page's three groups, each newest first except
 * evidence (by id). Pinned ids come from the evidence index, never from chain data. */
export function groupCases(cases, pinnedIds, relayerAddress) {
  const pinned = new Set((pinnedIds ?? []).map(Number));
  const seen = new Set();
  const out = { evidence: [], relayer: [], visitor: [] };
  for (const c of cases) {
    if (!c || seen.has(Number(c.id))) continue;
    seen.add(Number(c.id));
    if (pinned.has(Number(c.id))) out.evidence.push(c);
    else if (isRelayerCase(c, relayerAddress)) out.relayer.push(c);
    else out.visitor.push(c);
  }
  out.evidence.sort((a, b) => a.id - b.id);
  out.relayer.sort((a, b) => b.id - a.id);
  out.visitor.sort((a, b) => b.id - a.id);
  return out;
}
