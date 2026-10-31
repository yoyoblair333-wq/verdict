// Global monthly publish budget and FIFO queue (ADR-022).
//
// Free publishes are paid by VERDICT. Each one reserves an estimated fee from
// one global monthly budget (operator setting PUBLISH_BUDGET_CENTS_MONTH,
// default $500, hard ceiling $1,000). When the month's budget is spent, new
// publishes wait in a first-in, first-out queue that rolls over to the next
// month. Paid appeals and API calls never touch this budget and never queue.
// The month is the Los Angeles calendar month, like every consumer allowance.
// State (month, spent, queue) is persisted in the durable state store.

import { laDay } from "./rateLimit.js";

export const PUBLISH_BUDGET_DEFAULT_CENTS = 50_000;
export const PUBLISH_BUDGET_CEILING_CENTS = 100_000;
export const QUEUED_MESSAGE = "You're in line to be checked by the network. Your preview stays private until then.";

export interface QueueEntry {
  quickId: string;
  /** Side that tapped Publish. */
  side: number;
  /** HMAC account key of the requester (for the per-user cap refund). Never a raw IP or key. */
  account: string;
  queuedAt: string;
}

export interface BudgetSnapshot {
  month: string;
  spentCents: number;
  queue: QueueEntry[];
}

export const laMonth = (now: Date): string => laDay(now).slice(0, 7);

export class PublishBudget {
  private s: BudgetSnapshot;
  constructor(
    private readonly o: {
      capCents: number;
      estimateCents: number;
      clock: () => Date;
      load?: () => BudgetSnapshot | undefined;
      save?: (s: BudgetSnapshot) => void;
    },
  ) {
    const loaded = o.load?.();
    this.s = loaded && Array.isArray(loaded.queue) ? { month: loaded.month, spentCents: loaded.spentCents, queue: [...loaded.queue] } : { month: laMonth(o.clock()), spentCents: 0, queue: [] };
    this.roll();
  }

  private persist(): void {
    this.o.save?.({ month: this.s.month, spentCents: this.s.spentCents, queue: [...this.s.queue] });
  }

  /** New LA month: the budget resets; the queue carries over. */
  private roll(): void {
    const m = laMonth(this.o.clock());
    if (m !== this.s.month) {
      this.s.month = m;
      this.s.spentCents = 0;
      this.persist();
    }
  }

  get capCents(): number {
    return this.o.capCents;
  }

  status(): { month: string; spent_cents: number; cap_cents: number; estimate_cents: number; queued: number } {
    this.roll();
    return { month: this.s.month, spent_cents: this.s.spentCents, cap_cents: this.o.capCents, estimate_cents: this.o.estimateCents, queued: this.s.queue.length };
  }

  private fits(): boolean {
    return this.s.spentCents + this.o.estimateCents <= this.o.capCents;
  }

  /** Reserve one publish's estimated fee. False when the month's budget can't cover it.
   * Never jumps the queue: while anyone is waiting, new publishes queue behind them. */
  tryReserve(): boolean {
    this.roll();
    if (this.s.queue.length > 0 || !this.fits()) return false;
    this.s.spentCents += this.o.estimateCents;
    this.persist();
    return true;
  }

  /** Technical refund: the publish never reached the network. */
  release(): void {
    this.s.spentCents = Math.max(0, this.s.spentCents - this.o.estimateCents);
    this.persist();
  }

  /** Join the queue (idempotent per preview). Returns the 1-based position. */
  enqueue(e: QueueEntry): number {
    const at = this.position(e.quickId);
    if (at > 0) return at;
    this.s.queue.push(e);
    this.persist();
    return this.s.queue.length;
  }

  /** 1-based place in line, or 0 if not queued. */
  position(quickId: string): number {
    return this.s.queue.findIndex((x) => x.quickId === quickId) + 1;
  }

  /** Leave the queue. Returns the removed entry, if any. */
  cancel(quickId: string): QueueEntry | undefined {
    const i = this.s.queue.findIndex((x) => x.quickId === quickId);
    if (i < 0) return undefined;
    const [e] = this.s.queue.splice(i, 1);
    this.persist();
    return e;
  }

  /** Pop the head of the queue with its fee reserved, if the budget now covers it (FIFO). */
  takeNext(): QueueEntry | undefined {
    this.roll();
    if (this.s.queue.length === 0 || !this.fits()) return undefined;
    const e = this.s.queue.shift()!;
    this.s.spentCents += this.o.estimateCents;
    this.persist();
    return e;
  }

  /** Put an entry back at the head (its dispatch failed for a technical reason). */
  requeueFront(e: QueueEntry): void {
    this.s.queue.unshift(e);
    this.release();
  }
}
