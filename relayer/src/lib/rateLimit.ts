// Fixed-window per-UTC-day counters. In-memory: fine for a single relayer
// instance. For more than one instance, swap the Map for Redis INCR + EXPIRE
// behind the same interface.

export const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

const LA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
/** Calendar day in America/Los_Angeles: every game clock resets at 00:00 there (ADR-018 item 3). */
export const laDay = (now: Date): string => LA.format(now);

export class DailyCounter {
  private day = "";
  private readonly counts = new Map<string, number>();

  private readonly cap: number;
  private readonly dayKey: (now: Date) => string;

  /** `dayKey` picks the reset clock: UTC by default; the games use laDay (ADR-018). */
  constructor(cap: number, dayKey: (now: Date) => string = utcDay) {
    this.cap = cap;
    this.dayKey = dayKey;
  }

  private roll(now: Date): void {
    const d = this.dayKey(now);
    if (d !== this.day) {
      this.day = d;
      this.counts.clear();
    }
  }

  /** Returns remaining quota after consuming one unit, or -1 if over cap.
   * A cap of 0 disables the limit. */
  take(key: string, now: Date = new Date()): number {
    if (this.cap === 0) return Number.POSITIVE_INFINITY;
    this.roll(now);
    const used = this.counts.get(key) ?? 0;
    if (used >= this.cap) return -1;
    this.counts.set(key, used + 1);
    return this.cap - used - 1;
  }

  /** Give a unit back (e.g. the request was rejected before any gas was spent). */
  refund(key: string): void {
    const used = this.counts.get(key) ?? 0;
    if (used > 0) this.counts.set(key, used - 1);
  }
}
