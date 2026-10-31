// `make demo` / `npm run demo`: one complete case through the REAL relayer
// (HTTP routes, package canonicalisation, outbox, finality gate, inbox,
// Twitch logic) against the STAND-IN chain. No network, no gas, no keys.
// For the real network, see deploy/STUDIO_DEPLOY.md and docs/LIVE_EVIDENCE.md.

import { verifyInboxChain } from "../../src/lib/journal.js";
import { CONSENT, KEY, harness, tok } from "./harness.js";

const line = (s: string) => console.log(s);
// 60 s Twitch appeal window: the Prediction stays LOCKED until the case is final.
const h = await harness({ twitch: { clientId: "c", broadcasterId: "b", userAccessToken: "demo", predictionWindowSec: 120, appealWindowMs: 60_000 } });
const payer = `key:${KEY["x-api-key"]}`;
try {
  line("VERDICT offline demo (stand-in chain; NOT GenLayer - see docs/LIVE_EVIDENCE.md for real runs)\n");
  const o = await h.post("/cases", {
    rubric: "better_roast",
    entries: ["Your code has more bugs than a picnic.", "Your commit messages are a cry for help."],
    surface: "live",
    twitch: { title: "Who roasted harder?" },
    callback_url: "https://hooks.example.com/verdict",
    disclosure: CONSENT,
  }, KEY);
  line(`1. POST /cases            -> ${o.status} case #${o.json.id}, finality ${o.json.finality}`);
  line(`   receipt number        ${o.json.package_digest}`);
  line(`   provenance            ${o.json.provenance_label}`);
  const [t0, t1] = o.json.side_tokens as string[];
  const j = await h.post(`/cases/${o.json.id}/judge`, {}, tok(t0!));
  line(`2. POST /judge            -> ${j.status} finality ${j.json.finality}, verdict_final=${j.json.verdict_final} (no card yet)`);
  await h.app.idle();
  let g = await h.get(`/cases/${o.json.id}`);
  line(`3. after FINALIZED+SUCCESS -> winner entry ${g.json.case.winner_index}, split ${g.json.case.split}, card=${g.json.card ? "issued" : "none"}, confirmed_tier=${g.json.case.confirmed_tier}`);
  const winner = g.json.case.winner_index as number;
  const loserTok = winner === 0 ? t1! : t0!;
  const winnerTok = winner === 0 ? t0! : t1!;
  line(`4. winner tries to appeal -> ${(await h.post(`/cases/${o.json.id}/appeal`, {}, tok(winnerTok))).status} (losing side only)`);
  line(`   winner tries to revoke -> ${(await h.post(`/cases/${o.json.id}/revoke`, {}, tok(winnerTok))).status} (closed after Tier 1 is final)`);
  const a = await h.post(`/cases/${o.json.id}/appeal`, {}, tok(loserTok));
  line(`5. loser appeals          -> ${a.status} paid_with ${a.json.paid_with}, finality ${a.json.finality}`);
  await h.app.idle();
  g = await h.get(`/cases/${o.json.id}`);
  line(`6. Appeals Court (7)      -> winner entry ${g.json.case.winner_index}, split ${g.json.case.split}, status ${g.json.case.status}`);
  const newLoser = g.json.case.winner_index === 0 ? t1! : t0!;
  h.credits.grant(payer, 499);
  const s = await h.post(`/cases/${o.json.id}/appeal`, {}, tok(newLoser));
  line(`7. Supreme Court appeal   -> ${s.status} paid_with ${s.json.paid_with}`);
  await h.app.idle();
  g = await h.get(`/cases/${o.json.id}`);
  line(`8. Supreme Court (9)      -> winner entry ${g.json.case.winner_index}, split ${g.json.case.split}, status ${g.json.case.status}`);
  line(`   Twitch calls          ${h.twitchCalls.join(", ")}`);
  const inbox = h.inbox.all();
  line(`9. inbox                  ${inbox.length} hash-chained receipts, chain ${verifyInboxChain(inbox) === -1 ? "VALID" : "BROKEN"}`);
  line(`   webhooks              ${h.webhooks.map((w) => w.event).join(", ")}`);
  const ok = g.json.case.status === "final" && verifyInboxChain(inbox) === -1 && inbox.length === 3 && h.twitchCalls.filter((c) => c.startsWith("resolve")).length === 1 && h.twitchCalls.at(-1) === `resolve:pred1:o${g.json.case.winner_index}`;
  line(`\nDEMO: ${ok ? "PASS" : "FAIL"}`);
  process.exitCode = ok ? 0 : 1;
} finally {
  h.close();
}
