/// <reference lib="webworker" />
/**
 * The simulator's worker: receives a SimInput (bigints as strings), runs the
 * Monte Carlo with the real law (lib/sim.ts) and posts the result. One job at
 * a time; a newer request supersedes an older one by its `id`.
 */
import { simulate, type SimInput } from "./sim";

export interface SimRequest { id: number; stake: string; total: string; biggestShare: number; hostFeeBps: string; windows: number; seed: number }

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const r = e.data;
  const input: SimInput = { stake: BigInt(r.stake), total: BigInt(r.total), biggestShare: r.biggestShare, hostFeeBps: BigInt(r.hostFeeBps), windows: r.windows, seed: r.seed };
  const out = simulate(input);
  const msg = { id: r.id, ...out, fees: { platform: out.fees.platform.toString(), host: out.fees.host.toString(), toCurve: out.fees.toCurve.toString() } };
  self.postMessage(msg, [out.mults.buffer]);
};
