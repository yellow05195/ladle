/**
 * Priority fee (compute-unit price) for the keeper's transactions.
 *
 * The price is in micro-lamports per compute unit and is charged on the
 * compute-unit LIMIT a transaction requests, not on what it uses: every
 * priced transaction therefore also carries a limit (the measured one from
 * `sdk/src/budget.ts` for pages, a simulated one for the rest).
 *
 *   fee = 5,000 lamports per signature + price * limit / 1,000,000
 *
 * Modes: a fixed price, or `auto` = a percentile of
 * `getRecentPrioritizationFees` over the accounts the transaction writes,
 * raised to a floor. Both are capped. After a transaction expires unconfirmed
 * the price doubles (up to the cap) until one lands again.
 */
import {
  ComputeBudgetProgram,
  Connection,
  PACKET_DATA_SIZE,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";

export interface FeeOptions {
  /** "auto", or a fixed price in micro-lamports per compute unit (0 = no priority fee). */
  price: "auto" | number;
  /** Floor of the auto price (micro-lamports per CU). */
  min: number;
  /** Hard cap, whatever the mode or the boost (micro-lamports per CU). */
  max: number;
  /** Percentile of the recent fees used by `auto` (0..1, default 0.75). */
  percentile?: number;
  /** How long an auto estimate is reused for the same accounts (ms, default 10 s). */
  cacheMs?: number;
}

export const DEFAULT_CU_PRICE_MIN = 1_000;
export const DEFAULT_CU_PRICE_MAX = 100_000;
const MAX_BOOST = 16;

/** Value at percentile `p` (0..1) of `values` (0 when empty). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]!;
}

export class PriorityFees {
  readonly opts: Required<FeeOptions>;
  private readonly connection: Pick<Connection, "getRecentPrioritizationFees">;
  private boost = 1;
  private readonly cache = new Map<string, { at: number; price: number }>();

  constructor(connection: Pick<Connection, "getRecentPrioritizationFees">, opts: FeeOptions) {
    this.connection = connection;
    this.opts = { percentile: 0.75, cacheMs: 10_000, ...opts };
  }

  get enabled(): boolean { return this.opts.price !== 0 && this.opts.max > 0; }

  /** Price for a transaction writing `writable` (micro-lamports per CU, 0 = none). */
  async price(writable: readonly PublicKey[], now = Date.now()): Promise<number> {
    if (!this.enabled) return 0;
    let base: number;
    if (this.opts.price === "auto") {
      const keys = writable.slice(0, 16);
      const ck = keys.map((k) => k.toBase58()).sort().join(",");
      const hit = this.cache.get(ck);
      if (hit && now - hit.at < this.opts.cacheMs) base = hit.price;
      else {
        try {
          const recent = await this.connection.getRecentPrioritizationFees({ lockedWritableAccounts: keys });
          base = percentile(recent.map((r) => r.prioritizationFee), this.opts.percentile);
        } catch {
          base = hit?.price ?? 0; // the estimate is a nicety: never block a send on it
        }
        this.cache.set(ck, { at: now, price: base });
        if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value!);
      }
      base = Math.max(this.opts.min, base);
    } else {
      base = this.opts.price;
    }
    return Math.min(this.opts.max, Math.ceil(base * this.boost));
  }

  /** A transaction expired before it was confirmed: pay more next time. */
  expired(): void { this.boost = Math.min(MAX_BOOST, this.boost * 2); }
  /** A transaction landed: step back towards the base price. */
  landed(): void { this.boost = Math.max(1, this.boost / 2); }
  get currentBoost(): number { return this.boost; }
}

/** True for a `SetComputeUnitLimit` instruction (ComputeBudget discriminator 2). */
export function isComputeUnitLimitIx(ix: TransactionInstruction): boolean {
  return ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 2;
}

/** The compute-unit limit the instructions request (`SetComputeUnitLimit`, u32 LE), or null when none does. */
export function computeUnitLimitOf(ixs: readonly TransactionInstruction[]): number | null {
  const ix = ixs.find(isComputeUnitLimitIx);
  if (!ix || ix.data.length < 5) return null;
  return ix.data.readUInt32LE(1);
}

/**
 * The price (micro-lamports per unit) lowered so that the priority fee of a
 * transaction, `price x limit / 1e6` lamports, stays within `maxFeeLamports`
 * (0 = no priority fee at all). A guard against a cap set in the wrong unit:
 * KEEPER_CU_PRICE_MAX=10000000 would otherwise allow 0.014 SOL per page.
 */
export function capPriceForFee(price: number, units: number, maxFeeLamports: bigint): number {
  if (price <= 0 || units <= 0) return Math.max(0, price);
  const most = Number((maxFeeLamports * 1_000_000n) / BigInt(units));
  return Math.min(price, most);
}

export function computeUnitPriceIx(microLamports: number): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
}

/** Writable accounts other than signers: what a priority-fee estimate should look at. */
export function writableAccounts(ixs: readonly TransactionInstruction[]): PublicKey[] {
  const out = new Map<string, PublicKey>();
  for (const ix of ixs) for (const k of ix.keys) if (k.isWritable && !k.isSigner) out.set(k.pubkey.toBase58(), k.pubkey);
  return [...out.values()];
}

/** Wire size of a legacy transaction with one signer (the fee payer). */
export function legacySize(ixs: readonly TransactionInstruction[], payer: PublicKey): number {
  const tx = new Transaction({ feePayer: payer, blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 0 }).add(...ixs);
  return 1 + 64 * Math.max(1, tx.compileMessage().header.numRequiredSignatures) + tx.serializeMessage().length;
}

export function fitsLegacy(ixs: readonly TransactionInstruction[], payer: PublicKey): boolean {
  return legacySize(ixs, payer) <= PACKET_DATA_SIZE;
}

/** Limit to request from a simulated `unitsConsumed`: 15 % + 5,000 units of margin. */
export function limitFromSimulation(unitsConsumed: number): number {
  return Math.min(1_400_000, Math.ceil(unitsConsumed * 1.15) + 5_000);
}
