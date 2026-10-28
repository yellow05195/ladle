/** What every room source (demo, live, none) offers the hooks in index.ts. */
import type { ChatProfile, ChatSigner, SendResult } from "./types";

export interface RoomSource {
  readonly kind: "demo" | "live" | "none";
  /** begins (timers, socket); called when the first component subscribes */
  start(): void;
  /** ends; called a little after the last component unsubscribes */
  stop(): void;
  /** talk only: the line is already cleaned and is not a command */
  say(text: string): Promise<SendResult>;
  setProfile(p: ChatProfile | null): void;
  setSigner(s: ChatSigner | null): void;
  /** the viewer's seat: "stage" while their entry is in the current round */
  setSeat(seat: "stage" | "stands"): void;
  /** asks for the wallet signature now instead of at the first line */
  signIn(): Promise<SendResult>;
}

/** A token bucket for the instant "one line every 1.5 s" hint (the relay keeps the real one). */
export class LocalBucket {
  private tokens: number;
  private last = 0;
  capacity: number;
  everyMs: number;
  constructor(capacity: number, everyMs: number) { this.capacity = capacity; this.everyMs = everyMs; this.tokens = capacity; }
  take(now = Date.now()): { ok: true } | { ok: false; retryMs: number } {
    if (this.last) this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) / this.everyMs);
    this.last = now;
    if (this.tokens >= 1) { this.tokens -= 1; return { ok: true }; }
    return { ok: false, retryMs: Math.ceil((1 - this.tokens) * this.everyMs) };
  }
  refund(): void { this.tokens = Math.min(this.capacity, this.tokens + 1); }
}
