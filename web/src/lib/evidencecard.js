// Evidence Court (Milestone 2): the ruling view. Pure DOM rendering of a
// get_dispute() result: the ruling, how it was reached, and every cited link
// with its on-chain label, injection flag and verified excerpt. No network,
// so the offline tests render the recorded live run with it.

import { decidedLine, LABEL_TEXT, RULING_TEXT } from "./evidencelinks.js";
import { h } from "./dom.js";

export const TIER_NAME = { 1: "First hearing (1 juror)", 2: "Appeal panel (3 jurors)", 3: "Final panel (5 jurors)" };

/** One cited link and what the court made of it. */
export function evidenceItem(e) {
  const host = (() => { try { return new URL(e.url).host; } catch { return e.url; } })();
  return h("li", { class: "evitem", "data-label": e.label, "data-injection": String(!!e.injection) },
    h("div", { class: "evhead" },
      h("span", { class: "evid" }, `${e.id} · cited by side ${e.side}`),
      h("span", { class: `chip ev-${e.label}` }, LABEL_TEXT[e.label] ?? e.label),
      e.injection ? h("span", { class: "chip refused" }, "Injection flagged") : null),
    h("a", { class: "evurl", href: e.url, target: "_blank", rel: "noopener nofollow ugc" }, host, h("code", {}, e.url.slice(e.url.indexOf(host) + host.length) || "/")),
    e.injection
      ? h("p", { class: "meta" }, `This page tried to instruct the court (${e.injection_reason}). Its text was withheld from the jurors, so it could not decide anything.`)
      : e.label === "UNREACHABLE"
        ? h("p", { class: "meta" }, `The validators could not read this page (${e.fetch.replace("_", " ")}), so it counts for nobody.`)
        : null,
    e.excerpt ? h("blockquote", { class: "quote" }, `“${e.excerpt}”`) : null,
    e.excerpt ? h("p", { class: "meta" }, "Excerpt checked word for word against the page each validator fetched.") : null,
    (e.votes ?? []).length > 1 ? h("p", { class: "meta" }, `Juror labels: ${e.votes.map((v) => LABEL_TEXT[v] ?? v).join(" · ")}`) : null);
}

export function renderDispute(d) {
  const card = h("article", { class: "case evdispute", "data-dispute-id": d.id, "data-ruling": d.ruling, "data-decided-by": d.decided_by },
    h("div", { class: "casehead" }, h("span", { class: "no" }, `Dispute #${d.id}`), h("span", { class: "chip" }, TIER_NAME[d.tier] ?? `Tier ${d.tier}`)),
    h("div", { class: "rfbody" },
      h("p", { class: "meta" }, d.question),
      h("div", { class: "evsides" },
        h("p", { class: d.ruling === "A" ? "win" : "" }, h("b", {}, "A: "), d.claim_a),
        h("p", { class: d.ruling === "B" ? "win" : "" }, h("b", {}, "B: "), d.claim_b)),
      h("p", { class: `rflabel ev-r-${d.ruling}` }, RULING_TEXT[d.ruling] ?? d.ruling),
      h("p", { class: "meta decided" }, decidedLine(d)),
      d.reason ? h("p", { class: "reason" }, d.reason) : null,
      (d.evidence ?? []).length
        ? h("div", {}, h("h4", { class: "evh" }, "Evidence links"), h("ul", { class: "evlist" }, d.evidence.map(evidenceItem)))
        : null,
      h("p", { class: "meta" }, "GenLayer validators each fetched every link and re-ran the jury; they had to agree on the ruling and on every link's label.")));
  return card;
}

