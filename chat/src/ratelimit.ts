/**
 * Rate limits: token buckets per wallet and per IP (talk), one per
 * connection (every frame), and the room-wide slow mode that switches on
 * when the whole room talks faster than people can read.
 */

export interface BucketSpec { capacity: number; refillMs: number }

export class TokenBucket {
  private readonly spec: BucketSpec;
  private tokens: number;
  private last: number;
  constructor(spec: BucketSpec, now = Date.now()) {
    this.spec = spec;
    this.tokens = spec.capacity;
    this.last = now;
  }
  private refill(now: number): void {
    if (now <= this.last) return;
    this.tokens = Math.min(this.spec.capacity, this.tokens + (now - this.last) / this.spec.refillMs);
    this.last = now;
  }
  /** Takes one token; when empty, says how long until the next one. */
  take(now = Date.now()): { ok: true } | { ok: false; retryMs: number } {
    this.refill(now);
    if (this.tokens >= 1) { this.tokens -= 1; return { ok: true }; }
    return { ok: false, retryMs: Math.ceil((1 - this.tokens) * this.spec.refillMs) };
  }
  /** Gives back a token taken by a check that a later check refused. */
  refund(): void { this.tokens = Math.min(this.spec.capacity, this.tokens + 1); }
  full(now = Date.now()): boolean { this.refill(now); return this.tokens >= this.spec.capacity; }
}

/** Buckets by key (wallet, IP). Full buckets are dropped on sweep, so memory follows the active talkers. */
export class KeyedLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly spec: BucketSpec;
  private readonly maxKeys: number;
  constructor(spec: BucketSpec, maxKeys = 100_000) { this.spec = spec; this.maxKeys = maxKeys; }
  bucket(key: string, now = Date.now()): TokenBucket {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) this.sweep(now);
      b = new TokenBucket(this.spec, now);
      this.buckets.set(key, b);
    }
    return b;
  }
  take(key: string, now = Date.now()) { return this.bucket(key, now).take(now); }
  sweep(now = Date.now()): void { for (const [k, b] of this.buckets) if (b.full(now)) this.buckets.delete(k); }
  get size(): number { return this.buckets.size; }
}

export interface SlowSpec {
  /** sliding window over which the room's talk rate is measured */
  windowMs: number;
  /** lines in the window above which slow mode switches on */
  above: number;
  /** while on: at least this long between two lines of the same wallet */
  ms: number;
  /** stays on until the rate has been under half the threshold for this long */
  coolMs: number;
}

export class SlowMode {
  private readonly times: number[] = [];
  private quietSince: number | null = null;
  private readonly lastBy = new Map<string, number>();
  on = false;
  readonly spec: SlowSpec;
  constructor(spec: SlowSpec) { this.spec = spec; }

  private trim(now: number): void {
    const from = now - this.spec.windowMs;
    let i = 0;
    while (i < this.times.length && this.times[i]! < from) i++;
    if (i) this.times.splice(0, i);
  }

  /** May this wallet talk now? (always yes while slow mode is off) */
  check(key: string, now = Date.now()): { ok: true } | { ok: false; retryMs: number } {
    if (!this.on) return { ok: true };
    const last = this.lastBy.get(key);
    if (last !== undefined && now - last < this.spec.ms) return { ok: false, retryMs: this.spec.ms - (now - last) };
    return { ok: true };
  }

  /** Records an accepted line. Returns the new state when it flips. */
  record(key: string, now = Date.now()): boolean | null {
    this.times.push(now);
    this.lastBy.set(key, now);
    return this.update(now);
  }

  /** Re-evaluates the state (also called on a timer, so it switches off in a quiet room). */
  update(now = Date.now()): boolean | null {
    this.trim(now);
    const n = this.times.length;
    if (!this.on && n > this.spec.above) { this.on = true; this.quietSince = null; return true; }
    if (this.on) {
      if (n <= this.spec.above / 2) {
        this.quietSince ??= now;
        if (now - this.quietSince >= this.spec.coolMs) { this.on = false; this.quietSince = null; this.lastBy.clear(); return false; }
      } else this.quietSince = null;
    }
    if (!this.on && this.lastBy.size > 10_000) this.lastBy.clear();
    return null;
  }
}
