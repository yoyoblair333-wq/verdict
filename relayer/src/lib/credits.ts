import { createHash } from "node:crypto";
import { JournalCorrupt, JsonlFile } from "./journal.js";

// Prepaid appeal credits (one pricing policy, used everywhere):
//   - every user gets FREE_APPEALS_PER_DAY free appeal(s) per UTC day (default 1);
//   - further appeals spend prepaid credit: $1.99 for Tier 2 (Appeals Court),
//     $4.99 for Tier 3 (Supreme Court). Credits are bought in packs, off-relayer
//     (Stripe checkout), and granted here by the payment webhook.
//   - Credits have no cash value. Nothing is ever paid out, refunded or
//     rewarded because of how a verdict comes out. The only refund is
//     technical: if the appeal transaction itself fails, the free appeal or
//     credit is returned, whatever the case's outcome would have been.
//
// In-memory reference ledger; back it with the user DB in production.

export interface CreditStore {
  balance(user: string): number;
  /** Deduct `cents`; returns false (and changes nothing) if the balance is short. */
  spend(user: string, cents: number): boolean;
  /** Add credit (pack purchase via payment webhook, or a technical refund). */
  grant(user: string, cents: number): void;
}

export class InMemoryCredits implements CreditStore {
  private readonly ledger = new Map<string, number>();

  balance(user: string): number {
    return this.ledger.get(user) ?? 0;
  }

  spend(user: string, cents: number): boolean {
    const b = this.balance(user);
    if (b < cents) return false;
    this.ledger.set(user, b - cents);
    return true;
  }

  grant(user: string, cents: number): void {
    if (!Number.isInteger(cents) || cents <= 0) throw new Error("grant must be a positive integer of cents");
    this.ledger.set(user, this.balance(user) + cents);
  }
}

/** Durable ledger: append-only JSONL of {u: sha256(user), d: delta}. User ids
 * (API keys / IPs in this reference relayer) are not written in clear, but an
 * unsalted sha256 is NOT anonymisation: an `ip:<IPv4>` id reverses by brute
 * force in seconds. Treat the file as personal data; an HMAC with a server
 * secret (V-PRIV-09) and signed-in payer ids are still to do (audit P2-8). */
export class FileCredits implements CreditStore {
  private readonly ledger = new Map<string, number>();
  private readonly log: JsonlFile;

  constructor(file: string) {
    this.log = new JsonlFile(file);
    for (const r of this.log.readAll() as Array<{ u: string; d: number }>) {
      if (typeof r?.u !== "string" || !Number.isSafeInteger(r.d)) throw new JournalCorrupt(`${file}: malformed credit record`);
      this.ledger.set(r.u, (this.ledger.get(r.u) ?? 0) + r.d);
    }
  }

  private key(user: string): string {
    return createHash("sha256").update(user).digest("hex");
  }

  balance(user: string): number {
    return this.ledger.get(this.key(user)) ?? 0;
  }

  spend(user: string, cents: number): boolean {
    if (!Number.isInteger(cents) || cents <= 0) throw new Error("spend must be a positive integer of cents");
    const b = this.balance(user);
    if (b < cents) return false;
    this.log.append({ u: this.key(user), d: -cents }); // durable before the balance changes
    this.ledger.set(this.key(user), b - cents);
    return true;
  }

  grant(user: string, cents: number): void {
    if (!Number.isInteger(cents) || cents <= 0) throw new Error("grant must be a positive integer of cents");
    this.log.append({ u: this.key(user), d: cents });
    this.ledger.set(this.key(user), this.balance(user) + cents);
  }
}
