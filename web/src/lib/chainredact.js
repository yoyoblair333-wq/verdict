// Redaction for the ON-CHAIN Red Flag Court (Milestone 1, contracts/red_flag_court.py).
// Runs in the browser before anything leaves the device:
//   1. the relayer's own redaction rules (relayer/src/lib/redact.ts, the same
//      file, bundled by esbuild), then
//   2. the contract's placeholders ([LINK], [NUMBER], [AMOUNT], [EMAIL],
//      [HANDLE], [NAME]) in place of the relayer's pill text, then
//   3. amounts, any leftover digit, "@" and bare domains, because the contract
//      refuses all of them (same screen as PatternLedger), and finally
//   4. `screen`, a copy of the contract's `_pii_reason`, so the page can say
//      exactly why a text would be refused before the visitor signs anything.
// Best effort: heuristics can miss a person's name. The contract also asks
// its analyst panel, and refuses the check if the majority says the text
// still identifies a private person.

import { redact, TAGS } from "../../../relayer/src/lib/redact.ts";

const TO_CHAIN = {
  link: "[LINK]",
  email: "[EMAIL]",
  handle: "[HANDLE]",
  secret: "[NUMBER]",
  number: "[NUMBER]",
  phone: "[NUMBER]",
  company: "[NAME]",
  name: "[NAME]",
};

const TLD = "com|net|org|io|co|app|xyz|info|biz|me|ly|gg|link|site|online|top|shop|club|live|vip|us|uk|ru|cn|cc|tk|ml";
const URL_RES = [
  /[a-z][a-z0-9+.-]*:\/\//i,
  /\bwww\./i,
  new RegExp(`\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLD})\\b`, "i"),
  new RegExp(`\\bdot\\s+(?:${TLD})\\b`, "i"),
];

/** Copy of red_flag_court._pii_reason / pattern_ledger._pii_reason: "" = passes. */
export function screen(text) {
  for (const ch of text) if (/\p{N}/u.test(ch)) return "digits";
  if (text.includes("@")) return "email_or_handle";
  for (const ch of text) if (/\p{Sc}/u.test(ch)) return "amount";
  for (const r of URL_RES) if (r.test(text)) return "url";
  return "";
}

const AMOUNT_RE = /\p{Sc}\s?\p{N}[\p{N},.]*|\p{N}[\p{N},.]*\s?(?:dollars?|usd|eur|euros?|pounds?|gbp|bucks|k)\b/giu;

/** Redact a pasted message for the public court. Returns {text, removed, issue}. */
export function redactForChain(input) {
  const r = redact(String(input ?? ""));
  let t = r.text;
  for (const [kind, tag] of Object.entries(TAGS)) t = t.split(tag).join(TO_CHAIN[kind] ?? "[NUMBER]");
  t = t.replace(AMOUNT_RE, "[AMOUNT]");
  t = t.replace(/\p{N}+(?:[.,:/-]\p{N}+)*/gu, "[NUMBER]");
  t = t.replace(/\p{Sc}/gu, "[AMOUNT]");
  t = t.replace(/\S*@\S*/g, "[HANDLE]");
  for (const re of URL_RES.slice(2)) t = t.replace(new RegExp(re.source, "gi"), "[LINK]");
  t = t.replace(/\b(?:https?|ftp):\/\/\S+/gi, "[LINK]").replace(/\bwww\.\S+/gi, "[LINK]");
  t = t.replace(/\s+/g, " ").trim();
  const removed = (t.match(/\[(LINK|NUMBER|AMOUNT|EMAIL|HANDLE|NAME)\]/g) ?? []).length;
  return { text: t, removed, sensitive: !!r.sensitive, warning: r.warning ?? null, issue: screen(t) };
}
