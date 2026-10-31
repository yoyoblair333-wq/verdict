// Redaction for Red Flag Court (and any Quick Verdict text that comes from a
// non-participant). Redact, don't reject: a pasted scam text almost always has
// a phone number or a link, so the moderation PII screen would bounce it.
//
// The SAME rules run twice:
//   1. in the browser, before anything leaves the device
//      (app/index.html + app/artifact.html, <script id="redact-core">), and
//   2. here, in the relayer, on whatever arrives (the browser copy may be
//      missing or modified, and API callers skip it).
// Both copies are checked against fixtures/redaction.json, and a differential
// test runs every fixture and sample through both and compares the output.
//
// Best effort. Heuristics miss names and over-redact capitalised words. That
// is why Red Flag Court is off-chain and private (VERIFY resolution 1): a miss
// here is never published. Links are removed whole and never opened.
//
// Redaction is idempotent: redact(redact(x).text).text === redact(x).text, so
// the relayer pass over browser-redacted text changes nothing.

export type RedactKind = "email" | "link" | "handle" | "secret" | "number" | "phone" | "company" | "name";

/** Pill text shown in the app and what the jury reads in place of the item. */
export const TAGS: Readonly<Record<RedactKind, string>> = {
  email: "[email hidden]",
  link: "[link hidden · not opened]",
  handle: "[handle hidden]",
  secret: "[secret hidden]",
  number: "[number hidden]",
  phone: "[phone hidden]",
  company: "[company hidden]",
  name: "[name hidden]",
};

export interface RedactResult {
  text: string;
  counts: Record<RedactKind, number>;
  /** A card number, SSN-shaped number or password was removed. */
  sensitive: boolean;
  /** Shown to the user when `sensitive` (08 §4.6). */
  warning: string | null;
}

export const SENSITIVE_WARNING = "That looks like private account info. We removed it. Never share that anywhere.";

const NAME_STOP = new Set([
  "There", "Team", "Everyone", "All", "Sir", "Madam", "Customer", "User", "Friend", "Dear", "Hi", "Hey", "Hello",
  "Good", "The", "Your", "You", "We", "Our", "Me", "Not", "Just", "Here", "Back", "Sorry", "Glad", "Happy",
  "Thanks", "Thank", "Regards", "Love", "Cheers", "Reminder", "Security", "Support", "Valued", "Winner", "Mom", "Dad",
  "Mr", "Mrs", "Ms", "Dr", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Tue", "Mon", "Wed", "Thu", "Fri", "Sat", "Sun",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
]);

// Ordered rules. Each regex is global; `sensitive` marks items that trigger the warning.
type Rule = { kind: RedactKind; re: RegExp; keep?: 1; sensitive?: true };
const TLD = "com|net|org|io|co|app|xyz|info|biz|me|ly|gg|link|site|online|top|shop|club|live|vip|us|uk|ru|cn|cc|tk|ml";
const RULES: Rule[] = [
  // email before links (an email contains a domain)
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g },
  // links: scheme, www., or a bare domain with a common TLD; the whole link goes
  { kind: "link", re: new RegExp(String.raw`\b(?:https?:\/\/|www\.)[^\s<>"]+|\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:${TLD})\b(?:\/[^\s<>"]*)?`, "gi") },
  // @handles (not emails: those are gone already)
  { kind: "handle", re: /(^|[^\w@])@[A-Za-z0-9_.]{2,30}/g, keep: 1 },
  // passwords / PINs written out
  { kind: "secret", re: /\b(password|passcode|passwd|pwd|pin)(\s*(?:is|:|=)\s*)(?!\[)\S+/gi, keep: 1, sensitive: true },
  // card-shaped (13-19 digits, spaces/dashes allowed) and SSN-shaped numbers
  { kind: "number", re: /\b(?:\d[ -]?){12,18}\d\b/g, sensitive: true },
  { kind: "number", re: /\b\d{3}-\d{2}-\d{4}\b/g, sensitive: true },
  // phone numbers (NANP and +international)
  { kind: "phone", re: /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\+\d{1,3}(?:[\s.-]?\d{2,4}){2,4}\b/g },
  // any other long number: codes, account, tracking
  { kind: "number", re: /\b\d{6,}\b/g },
  // company / brand candidates: Capitalised words + a company word
  { kind: "company", re: /\b(?:[A-Z][A-Za-z0-9&'’]*\s+){1,3}(?:Inc|LLC|Ltd|Corp|Corporation|Bank|Group|Capital|Holdings|Exchange|Wallet|Pay|Finance|Financial|Investments?|Trading|Logistics|Express|Delivery|Shipping)\b/g },
];

// Likely names: a Capitalised word (or two) after a greeting/intro/sign-off,
// a title, or a dash sign-off at the start of a line.
const NAME_AFTER = /\b((?:[Hh]i|[Hh]ey|[Hh]ello|[Dd]ear|[Tt]his is|I'm|I’m|I am|[Mm]y name is|[Ff]rom|[Rr]egards,?|[Tt]hanks,?|[Cc]heers,?|[Ll]ove,?|[Ss]incerely,?|Mr\.?|Mrs\.?|Ms\.?|Dr\.?)\s+)((?!(?:Mr|Mrs|Ms|Dr)\b)[A-Z][a-z'’]+(?:\s+[A-Z][a-z'’]+)?)\b/g;
const NAME_SIGNOFF = /(^|\n)(\s*[-–—~]\s*)([A-Z][a-z'’]+)\b/g;

const emptyCounts = (): Record<RedactKind, number> => ({ email: 0, link: 0, handle: 0, secret: 0, number: 0, phone: 0, company: 0, name: 0 });

export function redact(input: string): RedactResult {
  const counts = emptyCounts();
  let sensitive = false;
  let text = input.normalize("NFKC");
  for (const r of RULES) {
    text = text.replace(r.re, (...m: string[]) => {
      counts[r.kind] += 1;
      if (r.sensitive) sensitive = true;
      return (r.keep ? (m[1] ?? "") + (r.kind === "secret" ? (m[2] ?? "") : "") : "") + TAGS[r.kind];
    });
  }
  text = text.replace(NAME_AFTER, (whole: string, lead: string, name: string) => {
    const first = name.split(/\s+/)[0]!;
    if (NAME_STOP.has(first)) return whole;
    counts.name += 1;
    return lead + TAGS.name;
  });
  text = text.replace(NAME_SIGNOFF, (whole: string, nl: string, dash: string, name: string) => {
    if (NAME_STOP.has(name)) return whole;
    counts.name += 1;
    return nl + dash + TAGS.name;
  });
  return { text, counts, sensitive, warning: sensitive ? SENSITIVE_WARNING : null };
}

const TAG_RE = new RegExp(Object.values(TAGS).map((t) => t.replace(/[[\]·]/g, (c) => `\\${c}`)).join("|"), "g");

/** Length in code points, with every redaction pill counted as one character
 * (so redaction never pushes a message over the limit). */
export function measure(text: string): number {
  return [...text.replace(TAG_RE, "•")].length;
}

/** Plain-language summary, e.g. "Hid 2 links, 1 phone number, 1 name." */
export function summary(counts: Record<RedactKind, number>): string {
  const words: Record<RedactKind, [string, string]> = {
    link: ["link", "links"], phone: ["phone number", "phone numbers"], email: ["email", "emails"], handle: ["handle", "handles"],
    number: ["long number", "long numbers"], name: ["name", "names"], company: ["company name", "company names"], secret: ["password", "passwords"],
  };
  const order: RedactKind[] = ["link", "phone", "email", "handle", "number", "secret", "company", "name"];
  const parts = order.filter((k) => counts[k] > 0).map((k) => `${counts[k]} ${words[k][counts[k] === 1 ? 0 : 1]}`);
  return parts.length ? `Hid ${parts.join(", ")}.` : "Nothing needed hiding.";
}
