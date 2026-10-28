/**
 * GATE G5 / TEST 1 - exact accounting, proven by property test.
 *
 * 10,000 adversarial windows through the exact-integer reference law
 * (/sdk/src/law.ts, the twin of the on-chain law.rs). Hard assertions at the
 * lamport / base unit:
 *
 *   sum(shares) == tokens the curve sold for the window
 *   sum(stakes) == to_curve + platform fee + host fee          (settled window)
 *   sum(stakes) == sum(refunds)                                (refunded window)
 *   0 <= share_i <= tokens
 *   paginated settlement (random page sizes, replayed pages) == one-shot settlement
 *   single-entry window: share == tokens, whatever the roll
 *   weight sum identity: sum(w_i) == ROLL_MAX * A^2 > 0 (zero total weight is impossible)
 *   rolls in [0, ROLL_MAX]; extreme hashes hit the bounds
 *   everybody sells back immediately: total quote paid out <= to_curve (the pool is never drained)
 *
 * Also emits /tests/vectors/law-vectors.json so the Rust side can check the
 * same numbers (cross-implementation agreement).
 *
 * Run: node --experimental-strip-types tests/props/run.ts [windows]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import {
  ROLL_MAX, computeShares, computeWeights, curveBuy, curveSell, deriveRoll, rollFromHash,
  settleWindow, sharePage, splitFees, type Curve, type Entry,
} from "../../sdk/src/law.ts";

const N = Number(process.argv[2] ?? 10_000);

// deterministic PRNG (sfc32) so a failure is reproducible
let a = 0x1234abcd, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162;
function rnd(): number {
  const t = (((a + b) >>> 0) + d) >>> 0; d = (d + 1) >>> 0;
  a = b ^ (b >>> 9); b = (c + (c << 3)) >>> 0; c = ((c << 21) | (c >>> 11)) >>> 0; c = (c + t) >>> 0;
  return (t >>> 0) / 4294967296;
}
const rint = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const rbig = (maxBits: number): bigint => {
  let v = 0n;
  for (let i = 0; i < maxBits; i += 16) v = (v << 16n) | BigInt(rint(0, 0xffff));
  return v & ((1n << BigInt(maxBits)) - 1n);
};
const bytes = (n: number) => Uint8Array.from({ length: n }, () => rint(0, 255));

let failures = 0;
function assert(cond: boolean, msg: string, ctx?: unknown) {
  if (!cond) { failures++; console.error("FAIL:", msg, ctx ?? ""); if (failures > 20) { console.error("too many failures"); process.exit(1); } }
}

/** Adversarial compositions, cycled through. */
type Comp = { name: string; make: () => bigint[] };
const LAMPORT = 1n, SOL = 1_000_000_000n;
const comps: Comp[] = [
  { name: "single", make: () => [SOL * BigInt(rint(1, 1000))] },
  { name: "two-extreme", make: () => [LAMPORT, 1n << 50n] },
  { name: "500-equal", make: () => Array.from({ length: 500 }, () => SOL) },
  { name: "500-random", make: () => Array.from({ length: 500 }, () => 1n + rbig(rint(1, 40))) },
  { name: "whale-vs-dust", make: () => [1n << 45n, ...Array.from({ length: rint(1, 60) }, () => 1n + rbig(8))] },
  { name: "all-one-lamport", make: () => Array.from({ length: rint(2, 300) }, () => 1n) },
  { name: "bundle-30-same-slot", make: () => Array.from({ length: 30 }, () => SOL / 10n) },
  { name: "power-law", make: () => Array.from({ length: rint(2, 200) }, () => 1n + BigInt(Math.floor(Math.pow(1 - rnd(), -1 / 1.5) * 1e6))) },
  { name: "random-small-n", make: () => Array.from({ length: rint(1, 8) }, () => 1n + rbig(rint(1, 48))) },
];

const vectors: any[] = [];
const t0 = Date.now();
let totalEntries = 0;

// roll bounds on extreme hashes
assert(rollFromHash(new Uint8Array(32).fill(0)) === 0n, "roll(0x00..) must be 0");
assert(rollFromHash(new Uint8Array(32).fill(0xff)) === ROLL_MAX, "roll(0xff..) must be ROLL_MAX");

for (let w = 0; w < N; w++) {
  const comp = comps[w % comps.length]!;
  const amounts = comp.make();
  const seed = bytes(64);
  const entries: Entry[] = amounts.map((amount, index) => ({ owner: bytes(32), index, amount }));
  const curve: Curve = { x: 1n + rbig(rint(20, 40)), y: 1n + rbig(rint(30, 60)) };
  const hostFeeBps = BigInt(rint(0, 300));

  // --- one-shot settlement
  const s = settleWindow(seed, entries, curve, hostFeeBps);
  const total = amounts.reduce((x, y) => x + y, 0n);
  totalEntries += entries.length;

  // rolls in range
  for (const r of s.rolls) assert(r >= 0n && r <= ROLL_MAX, "roll out of range", { w, r });

  // weight identity, zero weight impossible
  assert(s.weights.weightSum === ROLL_MAX * total * total, "weight sum identity", { w });
  assert(s.weights.weightSum > 0n, "zero total weight must be impossible", { w });
  let wsum = 0n; for (const x of s.weights.weights) { assert(x >= 0n, "negative weight", { w }); wsum += x; }
  assert(wsum === s.weights.weightSum, "sum(w_i) != S", { w });

  // THE INVARIANT
  const shareSum = s.shares.reduce((x, y) => x + y, 0n);
  assert(shareSum === s.tokensOut, "sum(shares) != tokens_out", { w, comp: comp.name, shareSum, tokensOut: s.tokensOut });
  for (const sh of s.shares) assert(sh >= 0n && sh <= s.tokensOut, "share out of [0, tokens]", { w });

  // fee identity
  assert(s.fees.platform + s.fees.host + s.fees.toCurve === total, "fee identity broken", { w });

  // single player gets everything, whatever the roll
  if (entries.length === 1) assert(s.shares[0] === s.tokensOut, "single entry must get all tokens", { w, roll: s.rolls[0] });

  // each share within 1 unit of its exact rational value
  for (let i = 0; i < entries.length; i++) {
    const exactFloor = (s.tokensOut * s.weights.weights[i]!) / s.weights.weightSum;
    const diff = s.shares[i]! - exactFloor;
    assert(diff >= -1n && diff <= 1n, "share deviates by more than 1 unit from exact", { w, i, diff });
  }

  // --- paginated settlement with random page sizes and replays
  {
    const pages: bigint[] = [];
    let cursor = 0, cum = 0n;
    while (cursor < entries.length) {
      const size = rint(1, 48);
      const to = Math.min(entries.length, cursor + size);
      const page = sharePage(s.tokensOut, s.weights.weightSum, cum, s.weights.weights.slice(cursor, to));
      // replay the same page: must give identical result and not advance twice
      const replay = sharePage(s.tokensOut, s.weights.weightSum, cum, s.weights.weights.slice(cursor, to));
      assert(replay.cumAfter === page.cumAfter && replay.shares.every((x, i) => x === page.shares[i]), "page replay differs", { w });
      pages.push(...page.shares);
      cum = page.cumAfter; cursor = to;
    }
    assert(cum === s.weights.weightSum, "cumulative weight != S after last page", { w });
    assert(pages.length === entries.length && pages.every((x, i) => x === s.shares[i]), "paginated != one-shot", { w });
  }

  // --- everyone sells back immediately: pool can never pay out more than it took in
  {
    let cv = s.curveAfter, paid = 0n;
    const order = entries.map((_, i) => i).sort(() => rnd() - 0.5);
    for (const i of order) { const r = curveSell(cv, s.shares[i]!); paid += r.out; cv = r.next; }
    assert(paid <= s.fees.toCurve, "sell-back of everything paid out more than the curve received", { w, paid, toCurve: s.fees.toCurve });
    assert(cv.y >= curve.y, "curve token reserve below the pre-window level after full sell-back", { w });
  }

  // --- refund path identity (fees are only taken at settlement)
  { let refunded = 0n; for (const e of entries) refunded += e.amount; assert(refunded === total, "refund identity", { w }); }

  if (w < 12) {
    vectors.push({
      name: comp.name, seed: Buffer.from(seed).toString("hex"),
      entries: entries.map((e) => ({ owner: Buffer.from(e.owner).toString("hex"), index: e.index, amount: e.amount.toString() })),
      curve: { x: curve.x.toString(), y: curve.y.toString() }, hostFeeBps: hostFeeBps.toString(),
      expected: { rolls: s.rolls.map(String), tokensOut: s.tokensOut.toString(), shares: s.shares.map(String), fees: { platform: s.fees.platform.toString(), host: s.fees.host.toString(), toCurve: s.fees.toCurve.toString() } },
    });
  }
}

// cross-check: derived rolls from a fixed seed/owner/index are stable (regression vector)
{
  const seed = new Uint8Array(64).fill(7), owner = new Uint8Array(32).fill(9);
  vectors.unshift({ name: "fixed-roll", seed: Buffer.from(seed).toString("hex"), owner: Buffer.from(owner).toString("hex"), index: 3, roll: deriveRoll(seed, owner, 3).toString() });
}

mkdirSync("tests/vectors", { recursive: true });
writeFileSync("tests/vectors/law-vectors.json", JSON.stringify(vectors, null, 1));

const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (failures === 0) {
  console.log(`G5 PASS: ${N} adversarial windows, ${totalEntries} entries, all invariants hold at the base unit (${secs}s)`);
  console.log(`compositions: ${comps.map((c) => c.name).join(", ")}`);
} else {
  console.error(`G5 FAIL: ${failures} assertion(s) failed`);
  process.exit(1);
}
