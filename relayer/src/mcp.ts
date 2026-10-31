// VERDICT MCP server (stdio). Exposes one tool, `judge(rubric, entries)`,
// which calls the relayer's POST /judge (the relayer pays gas; the agent
// never needs a wallet).
//
//   npm run build && VERDICT_API_URL=https://your-relayer VERDICT_API_KEY=... node dist/mcp.js
//
// Claude Desktop / any MCP client config:
//   { "mcpServers": { "verdict": { "command": "node", "args": ["/abs/path/relayer/dist/mcp.js"],
//       "env": { "VERDICT_API_URL": "https://...", "VERDICT_API_KEY": "..." } } } }
//
// SDK: @modelcontextprotocol/sdk 1.32.x (McpServer.registerTool, StdioServerTransport).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = (process.env.VERDICT_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const API_KEY = process.env.VERDICT_API_KEY ?? "";

const server = new McpServer({ name: "verdict", version: "0.1.0" });

server.registerTool(
  "judge",
  {
    title: "VERDICT jury",
    description:
      "Have VERDICT's 5-juror AI panel judge 2-10 short text entries under a rubric. The verdict is computed in a " +
      "GenLayer Intelligent Contract and only stands if GenLayer's independent validators, each running its own AI model, agree. " +
      "Returns winner_index, per-entry scores (0-100), the juror vote split and a one-line reason. " +
      "For fun and subjective comparisons only; not for legal, financial or safety decisions. " +
      "Rubric presets: whos_right, better_roast, pettiest_text, better_comeback, or any custom criterion up to 200 characters. " +
      "Everything sent is published on a public blockchain and cannot be erased: set consent_public=true and " +
      "adult_confirmed=true only if the entry authors agreed and are 18+. Never include names, emails, phone numbers or other personal data. " +
      "Takes 30 seconds to a few minutes (on-chain consensus); returns a verdict only once the transaction is FINALIZED.",
    inputSchema: {
      rubric: z.string().min(1).max(200),
      entries: z.array(z.string().min(1).max(280)).min(2).max(10),
      consent_public: z.literal(true),
      adult_confirmed: z.literal(true),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ rubric, entries, consent_public, adult_confirmed }) => {
    const res = await fetch(`${API_URL}/judge`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(API_KEY ? { "x-api-key": API_KEY } : {}) },
      body: JSON.stringify({ rubric, entries, disclosure: { consent: consent_public, adult_confirmed } }),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const body = await res.text();
    if (!res.ok) {
      return { isError: true, content: [{ type: "text" as const, text: `VERDICT error ${res.status}: ${body.slice(0, 500)}` }] };
    }
    return { content: [{ type: "text" as const, text: body }] };
  },
);

await server.connect(new StdioServerTransport());
