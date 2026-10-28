/**
 * The last lines of the room, for whoever arrives. Line ids are
 * "<boot>.<seq>": a page that reconnects says the last id it saw and gets
 * only what it missed, or everything (reset) after a relay restart or when
 * the gap is wider than the ring.
 */
import type { WireLine } from "./protocol.ts";

export class History {
  private readonly ring: WireLine[] = [];
  private seq = 0;
  readonly boot: string;
  readonly size: number;

  constructor(size: number, boot: string) { this.size = size; this.boot = boot; }

  nextId(): string { return `${this.boot}.${++this.seq}`; }

  push(line: WireLine): void {
    this.ring.push(line);
    if (this.ring.length > this.size) this.ring.splice(0, this.ring.length - this.size);
  }

  get length(): number { return this.ring.length; }

  /** Lines after `since` (an id this relay gave out), or the whole ring with reset=true. */
  since(since: string | undefined): { lines: WireLine[]; reset: boolean } {
    if (!since) return { lines: this.ring.slice(), reset: true };
    const dot = since.lastIndexOf(".");
    const boot = since.slice(0, dot);
    const seq = Number(since.slice(dot + 1));
    if (dot <= 0 || boot !== this.boot || !Number.isInteger(seq) || seq > this.seq) return { lines: this.ring.slice(), reset: true };
    const firstSeq = this.ring.length ? seqOf(this.ring[0]!.id) : this.seq + 1;
    // a gap wider than the ring: the page cannot be patched, it starts over
    if (seq < firstSeq - 1) return { lines: this.ring.slice(), reset: true };
    return { lines: this.ring.filter((l) => seqOf(l.id) > seq), reset: false };
  }
}

const seqOf = (id: string) => Number(id.slice(id.lastIndexOf(".") + 1));
