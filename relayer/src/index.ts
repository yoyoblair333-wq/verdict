// VERDICT relayer entry point.
//   node --env-file=.env dist/index.js     (after `npm run build`)
//
// Startup: load config -> contract pin check -> reconcile the outbox (live)
// -> listen. VERDICT_MODE defaults to shadow: nothing is broadcast, no gas,
// no Twitch calls, until VERDICT_MODE=live is set explicitly.

import { existsSync } from "node:fs";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { loadPracticeConfig } from "./lib/practice.js";
import { JudgeRouterClient } from "./lib/genlayer.js";
import { pinAllowsSubmit } from "./lib/pinning.js";
import { TwitchPredictions } from "./twitch/predictions.js";

const cfg = loadConfig();
const chain = new JudgeRouterClient(cfg);
const twitch = new TwitchPredictions(cfg.twitch);
// No Quick Verdict judge provider is wired in this repo (no API keys): the
// Quick Verdict routes answer 503 until a JudgeProvider is passed here.
// The practice rule list is validated at startup; a bad list stops the relayer.
const practice = existsSync(cfg.quick.practiceRulesPath) ? loadPracticeConfig(cfg.quick.practiceRulesPath) : undefined;
const app = buildApp({ cfg, chain, twitch, ...(practice ? { practice } : {}) });

const pin = await app.pipeline.pin();
console.log(`[verdict-relayer] contract pin: ${JSON.stringify(pin)}`);
if (cfg.mode === "live") {
  if (!pinAllowsSubmit(pin, cfg.allowUnverifiedContract)) {
    console.error("[verdict-relayer] deployed contract does not match EXPECTED_CONTRACT_CODE_DIGEST; refusing to start in live mode");
    process.exit(1);
  }
  const report = await app.reconcile();
  if (report.length) console.log(`[verdict-relayer] reconcile: ${JSON.stringify(report)}`);
} else {
  console.log("[verdict-relayer] SHADOW MODE: requests are validated and logged; nothing is submitted, no gas, no Twitch.");
}

const server = app.listen(cfg.port, () => {
  console.log(
    `[verdict-relayer] listening on :${cfg.port} mode=${cfg.mode} network=${cfg.network} contract=${cfg.contractAddress} ` +
      `relayer=${chain.relayerAddress} twitch=${twitch.enabled ? "on" : "off"}`,
  );
});

// GenLayer writes can take tens of seconds to minutes (LLM consensus).
server.requestTimeout = 10 * 60 * 1000;
server.headersTimeout = 10 * 60 * 1000 + 1000;

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
