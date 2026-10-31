// Thin wrapper over genlayer-js for the JudgeRouter contract (ChainPort).
//
// API verified against the PUBLISHED genlayer-js 1.1.8 type declarations
// (node_modules/genlayer-js/dist/index-*.d.ts), not the repo main branch:
//   createClient({ chain, account, endpoint })      createAccount(privateKey)
//   client.writeContract({ address, functionName, args, value }) -> tx hash
//   client.readContract({ address, functionName, args })
//   client.getTransaction({ hash }) -> GenLayerTransaction (see finality.ts)
//   client.getContractCode(address) -> string (gen_getContractCode, base64-decoded)
//   chains: localnet, studionet, testnetAsimov, testnetBradbury ("genlayer-js/chains")
// Docs: https://docs.genlayer.com/api-references/genlayer-js

import { createAccount, createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";
import type { Config } from "../config.js";
import type { TxLike } from "./finality.js";
import type { WriteFn } from "./journal.js";
import { UnsupportedRpc } from "./pinning.js";

type Client = ReturnType<typeof createClient>;
type CalldataArg = NonNullable<Parameters<Client["writeContract"]>[0]["args"]>;

export type CaseStatus = "pending" | "judged" | "appealed" | "final" | "revoked" | "stale";

export interface CaseView {
  id: number;
  surface: string;
  rubric: string;
  entries: string[];
  creator: string;
  status: CaseStatus;
  tier: number;
  jurors: number;
  winner_index: number;
  scores: number[];
  juror_votes: number[];
  split: string;
  reason: string;
  history: unknown[];
  created_at: string;
  updated_at: string;
  package_digest: string;
  request_key: string;
  provenance: Array<{ entry_source: string; assurance: string }>;
  appeal_deadline: string;
  revoked_by: number;
  /** Highest tier the relayer attested FINALIZED_SUCCESS on-chain (confirm_verdict). */
  confirmed_tier: number;
}

export interface RefLookup {
  case_id: number;
  package_digest: string;
  status: string;
}

/** Everything the relayer needs from the chain. Writes only via broadcast(). */
export interface ChainPort {
  readonly relayerAddress: `0x${string}`;
  broadcast(fn: WriteFn, args: Array<string | number>): Promise<string>;
  getTransaction(hash: string): Promise<TxLike | null>;
  getCase(id: number): Promise<CaseView>;
  getCaseByRequestKey(requestKey: string): Promise<RefLookup>;
  listRecent(limit: number, surface: string): Promise<unknown[]>;
  getContractCode(): Promise<string>;
}

const CHAINS = { localnet, studionet, testnetAsimov, testnetBradbury } as const;

/** genlayer-js decodes calldata maps as JS Map; normalise to plain JSON. */
export function toPlain(v: unknown): unknown {
  if (v instanceof Map) {
    const o: Record<string, unknown> = {};
    for (const [k, val] of v.entries()) o[String(k)] = toPlain(val);
    return o;
  }
  if (Array.isArray(v)) return v.map(toPlain);
  if (typeof v === "bigint") {
    return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(v) : v.toString();
  }
  return v;
}

export class JudgeRouterClient implements ChainPort {
  private readonly client: Client;
  readonly relayerAddress: `0x${string}`;
  private readonly cfg: Config;

  constructor(cfg: Config) {
    this.cfg = cfg;
    const account = createAccount(cfg.relayerPrivateKey);
    this.relayerAddress = account.address;
    this.client = createClient({ chain: CHAINS[cfg.network], account, ...(cfg.rpcUrl ? { endpoint: cfg.rpcUrl } : {}) });
  }

  private async read(functionName: string, args: CalldataArg = []): Promise<unknown> {
    return toPlain(await this.client.readContract({ address: this.cfg.contractAddress, functionName, args }));
  }

  async broadcast(fn: WriteFn, args: Array<string | number>): Promise<string> {
    if (this.cfg.mode !== "live") throw new Error("refusing to broadcast in shadow mode"); // defence in depth
    const hash = await this.client.writeContract({
      address: this.cfg.contractAddress,
      functionName: fn,
      args,
      value: 0n, // never any value: no money is ever at stake
    });
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]+$/.test(hash)) throw new Error("writeContract returned no tx hash");
    return hash;
  }

  async getTransaction(hash: string): Promise<TxLike | null> {
    return (await this.client.getTransaction({ hash: hash as TransactionHash })) ?? null;
  }

  async getCase(id: number): Promise<CaseView> {
    return (await this.read("get_case", [id])) as CaseView;
  }

  async getCaseByRequestKey(requestKey: string): Promise<RefLookup> {
    return (await this.read("get_case_by_request_key", [this.relayerAddress, requestKey])) as RefLookup;
  }

  async listRecent(limit: number, surface: string): Promise<unknown[]> {
    return (await this.read("list_recent", [limit, surface])) as unknown[];
  }

  async getContractCode(): Promise<string> {
    try {
      return await this.client.getContractCode(this.cfg.contractAddress);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/method not found|not supported|does not exist|-32601/i.test(msg)) throw new UnsupportedRpc(msg);
      throw e;
    }
  }
}
