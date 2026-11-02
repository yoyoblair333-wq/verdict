// Evidence Court (Milestone 2): the browser copy of contracts/evidence_court.py
// `_url_problem`, so the page can say why a link would be refused BEFORE the
// visitor signs anything. Both are tested against fixtures/evidence-urls.json.
// The contract is the authority: it re-checks every link on-chain.

const HOST_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const PATH_RE = /^[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/;
const PRIVATE_TLDS = new Set(["localhost", "local", "internal", "lan", "home", "corp", "intranet"]);
// The link-relevant subset of the contract's INJECTION_PATTERNS (a URL is
// shown to the jurors); the contract runs the full list.
const LINK_INJECTION = [
  /ignore\s+(all\s+|any\s+|the\s+|your\s+|these\s+)?(previous|prior|above|earlier|other)?\s*(instructions|rules|prompts?|guidelines)/i,
  /disregard\s+(all\s+|any\s+|the\s+|your\s+)?(previous|prior|above|earlier|other)?\s*(instructions|rules|prompts?|guidelines|evidence)/i,
  /(system|developer)\s*(prompt|message|instruction)/i,
  /\byou\s+are\s+now\b/i,
  /\bjailbreak\b/i,
  /SUPPORTS_[AB]\b/i,
  /panel_verdict/i,
  /\b(rule|decide|vote|find|side)\s+(in\s+favou?r\s+of|for|with)\s+(side\s+|party\s+)?["']?[AB]["']?(?![A-Za-z0-9])/i,
];

/** "" if the contract would accept the link, else its reason text. */
export function linkProblem(url) {
  if (typeof url !== "string") return "not text";
  if (url.length > 300) return "too long";
  if (url !== url.trim() || /[\p{C}\p{Z}]/u.test(url)) return "spaces or control characters";
  if (!url.startsWith("https://")) return "must start with https://";
  const rest = url.slice("https://".length);
  let cut = rest.length;
  for (const sep of "/?#") {
    const i = rest.indexOf(sep);
    if (i >= 0 && i < cut) cut = i;
  }
  const host = rest.slice(0, cut);
  const tail = rest.slice(cut);
  if (host.includes("@")) return "credentials in the link";
  if (host.startsWith("[")) return "an IP address";
  if (host.includes(":")) return "a port number";
  const h = host.toLowerCase();
  if (!HOST_RE.test(h)) return "bad host";
  if (/^[0-9.]+$/.test(h)) return "an IP address";
  const labels = h.split(".");
  if (PRIVATE_TLDS.has(labels.at(-1)) || labels.includes("localhost")) return "a private host";
  if (/^\d+$/.test(labels.at(-1))) return "an IP address";
  if (!PATH_RE.test(tail)) return "unsupported characters";
  const spaced = url.replace(/%20|[-_/+.%=&?#]/g, " ");
  if (LINK_INJECTION.some((r) => r.test(spaced))) return "instructions in the link";
  return "";
}

/** Plain-language names for the on-chain labels. */
export const LABEL_TEXT = {
  SUPPORTS_A: "Supports side A",
  SUPPORTS_B: "Supports side B",
  IRRELEVANT: "Irrelevant",
  UNREACHABLE: "Unreachable",
};
export const RULING_TEXT = { A: "Side A is right", B: "Side B is right", UNPROVEN: "Unproven" };

/** One line saying how the ruling was reached (it is code, not a model's say-so). */
export function decidedLine(d) {
  const sa = Number(d.support_a ?? 0);
  const sb = Number(d.support_b ?? 0);
  if (d.decided_by === "evidence") {
    return `Decided by the evidence: ${sb > sa ? sb : sa} verified link${(sb > sa ? sb : sa) === 1 ? "" : "s"} for side ${d.ruling} against ${sb > sa ? sa : sb} for the other side. The contract counts the labels; no model writes the ruling.`;
  }
  const n = (d.evidence ?? []).length;
  return n
    ? `No link settled it (${sa} for A, ${sb} for B), so the ruling is the juror panel's majority view of the arguments.`
    : "No evidence links were cited, so the ruling is the juror panel's majority view of the arguments.";
}
