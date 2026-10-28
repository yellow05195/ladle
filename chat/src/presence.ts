/**
 * Who is in the room. One member per wallet (two tabs of the same wallet are
 * one person) and one per spectator connection. At most `cap` members are
 * listed with their profile; everyone counts. Signed members take a listed
 * place before spectators: when the list is full, a signed arrival bumps the
 * most recent listed spectator back to the count.
 *
 * Changes are not sent one by one: `drain()` compares what the clients were
 * last told with the list now and returns one diff (joins are upserts, a
 * leave of an unknown id is a no-op), so a burst of arrivals is one frame.
 */
import type { Seat, WirePresence, WireProfile } from "./protocol.ts";

interface Member { profile: WireProfile; since: number; seat: Seat; conns: number; signed: boolean; rev: number }

export interface PresenceDiff { join: WirePresence[]; leave: string[]; seat: Array<[string, Seat]>; count: number }

export class Roster {
  readonly cap: number;
  private readonly members = new Map<string, Member>();
  private readonly listed = new Set<string>();
  private readonly listedGuests = new Set<string>();
  private readonly waitingSigned = new Set<string>();
  private readonly waitingGuests = new Set<string>();
  private readonly told = new Map<string, { seat: Seat; rev: number }>();
  private dirty = false;
  private toldCount = 0;

  constructor(cap: number) { this.cap = cap; }

  get count(): number { return this.members.size; }
  get listedCount(): number { return this.listed.size; }
  has(id: string): boolean { return this.members.has(id); }
  isListed(id: string): boolean { return this.listed.has(id); }

  /** A connection of `profile.id` arrives. Same id again: one more connection (and the newest profile). */
  add(profile: WireProfile, signed: boolean, now = Date.now()): void {
    const m = this.members.get(profile.id);
    if (m) {
      m.conns++;
      if (JSON.stringify(m.profile) !== JSON.stringify(profile)) { m.profile = profile; m.rev++; this.dirty = true; }
      return;
    }
    this.members.set(profile.id, { profile, since: now, seat: "stands", conns: 1, signed, rev: 0 });
    this.dirty = true;
    this.place(profile.id);
  }

  /** A connection leaves. True when it was the member's last one. */
  remove(id: string): boolean {
    const m = this.members.get(id);
    if (!m) return false;
    if (--m.conns > 0) return false;
    this.members.delete(id);
    this.dirty = true;
    if (this.listed.has(id)) { this.unlist(id); this.promote(); }
    else { this.waitingSigned.delete(id); this.waitingGuests.delete(id); }
    return true;
  }

  setSeat(id: string, seat: Seat): boolean {
    const m = this.members.get(id);
    if (!m || m.seat === seat) return false;
    m.seat = seat;
    this.dirty = true;
    return true;
  }

  snapshot(): { list: WirePresence[]; count: number } {
    const list: WirePresence[] = [];
    for (const id of this.listed) list.push(this.presenceOf(this.members.get(id)!));
    return { list, count: this.count };
  }

  /** The change since the last drain, or null when nothing a client shows has changed. */
  drain(): PresenceDiff | null {
    if (!this.dirty) return null;
    this.dirty = false;
    const join: WirePresence[] = [];
    const seat: Array<[string, Seat]> = [];
    const leave: string[] = [];
    for (const id of this.listed) {
      const m = this.members.get(id)!;
      const t = this.told.get(id);
      if (!t || t.rev !== m.rev) join.push(this.presenceOf(m));
      else if (t.seat !== m.seat) seat.push([id, m.seat]);
      this.told.set(id, { seat: m.seat, rev: m.rev });
    }
    for (const id of this.told.keys()) if (!this.listed.has(id)) { leave.push(id); this.told.delete(id); }
    if (!join.length && !seat.length && !leave.length && this.toldCount === this.count) return null;
    this.toldCount = this.count;
    return { join, leave, seat, count: this.count };
  }

  private presenceOf(m: Member): WirePresence {
    return { profile: m.profile, since: m.since, seat: m.seat };
  }

  private place(id: string): void {
    const m = this.members.get(id)!;
    if (this.listed.size < this.cap) { this.list(id); return; }
    if (m.signed && this.listedGuests.size) {
      let last = "";
      for (const g of this.listedGuests) last = g;
      this.unlist(last);
      this.waitingGuests.add(last);
      this.list(id);
      return;
    }
    (m.signed ? this.waitingSigned : this.waitingGuests).add(id);
  }

  private list(id: string): void {
    this.listed.add(id);
    if (!this.members.get(id)!.signed) this.listedGuests.add(id);
  }

  private unlist(id: string): void {
    this.listed.delete(id);
    this.listedGuests.delete(id);
  }

  private promote(): void {
    while (this.listed.size < this.cap) {
      const next = first(this.waitingSigned) ?? first(this.waitingGuests);
      if (next === undefined) return;
      this.waitingSigned.delete(next);
      this.waitingGuests.delete(next);
      this.list(next);
    }
  }
}

function first(s: Set<string>): string | undefined {
  for (const v of s) return v;
  return undefined;
}
