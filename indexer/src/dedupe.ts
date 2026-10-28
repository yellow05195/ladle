/**
 * Exactly-once accounting of legs.
 *
 * Key = (signature, outerIndex, innerIndex). The same transaction ingested
 * twice (re-sync, overlapping signature pages, websocket + backfill) adds
 * nothing; two legs of one route through the same pool have different inner
 * indices and are both counted.
 */
import { legKey, type VolumeLeg } from "./parse.ts";

export interface PoolTotal {
  program: string;
  programName: string;
  pool: string;
  volume: bigint;
  legs: number;
}

export class Deduper {
  private readonly seen = new Set<string>();
  private readonly seenTx = new Set<string>();
  private readonly totals = new Map<string, PoolTotal>();
  private readonly byProgram = new Map<string, bigint>();

  /** Add legs; returns the ones that were new. */
  add(legs: readonly VolumeLeg[]): VolumeLeg[] {
    const fresh: VolumeLeg[] = [];
    for (const l of legs) {
      const k = legKey(l);
      if (this.seen.has(k)) continue;
      this.seen.add(k);
      this.seenTx.add(l.signature);
      fresh.push(l);
      const pk = `${l.program}:${l.pool}`;
      const t = this.totals.get(pk) ?? { program: l.program, programName: l.programName, pool: l.pool, volume: 0n, legs: 0 };
      t.volume += l.volume;
      t.legs += 1;
      this.totals.set(pk, t);
      this.byProgram.set(l.programName, (this.byProgram.get(l.programName) ?? 0n) + l.volume);
    }
    return fresh;
  }

  hasTransaction(signature: string): boolean { return this.seenTx.has(signature); }
  hasLeg(leg: Pick<VolumeLeg, "signature" | "outerIndex" | "innerIndex">): boolean { return this.seen.has(legKey(leg)); }
  get legCount(): number { return this.seen.size; }

  pools(): PoolTotal[] { return [...this.totals.values()]; }
  programs(): Record<string, bigint> { return Object.fromEntries(this.byProgram); }

  /** Total of every leg of one program (units of that program's legs). */
  totalFor(programName: string): bigint { return this.byProgram.get(programName) ?? 0n; }
}
