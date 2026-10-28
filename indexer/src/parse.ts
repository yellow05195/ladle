/**
 * Transaction -> volume legs, AMM level only.
 *
 * A "leg" is one swap executed by one pool program, wherever it sits in the
 * transaction: a top-level instruction or an inner instruction (CPI) made by
 * an aggregator such as Jupiter. Aggregator instructions themselves
 * (`route`, `sharedAccountsRoute`, ...) are NEVER counted: the volume they
 * represent is exactly the sum of their inner pool legs, so counting both
 * would double every routed trade.
 *
 * Legs are keyed by (signature, outerIndex, innerIndex). A multi-hop route
 * touching the same pool twice produces two legs with different inner
 * indices, both counted; the same transaction ingested twice produces the
 * same keys and is counted once (see dedupe.ts).
 *
 * Input shape: `ParsedTransactionWithMeta` from web3.js `getParsedTransaction`
 * (jsonParsed encoding). Only the fields used here are typed.
 */
import { PublicKey } from "@solana/web3.js";
import { PULLED_PROGRAM_ID, parseEventsFromLogs } from "@pulled/sdk";

/* ------------------------------ programs ------------------------------ */

/** Aggregators / routers: their outer instructions are never volume. */
export const AGGREGATOR_PROGRAMS: Record<string, string> = {
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "jupiter-v6",
  JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: "jupiter-v4",
  JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph: "jupiter-v3",
  DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23M: "jupiter-dca",
  jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu: "jupiter-limit-v2",
};

/** Pool programs whose swap instructions ARE legs. */
export const AMM_PROGRAMS: Record<string, string> = {
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "raydium-amm-v4",
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "raydium-clmm",
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: "raydium-cpmm",
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "orca-whirlpool",
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": "orca-token-swap-v2",
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: "meteora-dlmm",
  Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB: "meteora-dynamic-amm",
  cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG: "meteora-damm-v2",
};

/** The PULLED program's own curve is an AMM: Sold / SoldBack / WindowTallied are legs. */
export const PULLED_PROGRAM = PULLED_PROGRAM_ID.toBase58();

const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

/* ------------------------------- shapes ------------------------------- */

export interface ParsedIx {
  programId: string | PublicKey;
  program?: string;
  parsed?: { type?: string; info?: Record<string, unknown> } | unknown;
  accounts?: (string | PublicKey)[];
  data?: string;
}

export interface InnerIxGroup { index: number; instructions: ParsedIx[] }

export interface TokenBalance { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string; decimals: number } }

export interface ParsedTx {
  transaction: {
    signatures: string[];
    message: { accountKeys: ({ pubkey: string | PublicKey } | string | PublicKey)[]; instructions: ParsedIx[] };
  };
  meta: {
    err: unknown;
    innerInstructions?: InnerIxGroup[] | null;
    logMessages?: string[] | null;
    preTokenBalances?: TokenBalance[] | null;
    postTokenBalances?: TokenBalance[] | null;
  } | null;
  slot?: number;
  blockTime?: number | null;
}

/** One counted swap. */
export interface VolumeLeg {
  signature: string;
  /** Top-level instruction index. */
  outerIndex: number;
  /** Inner instruction index within the group, or -1 for a top-level swap. */
  innerIndex: number;
  /** Base58 program id of the pool program (or the PULLED program). */
  program: string;
  programName: string;
  /** Pool account (first writable non-token account of the swap, best effort) or window/market for PULLED. */
  pool: string;
  /** Amount of the tracked mint that moved in this leg (base units). */
  volume: bigint;
  /** Which side the tracked mint was on, when known. */
  direction: "in" | "out" | "unknown";
  slot?: number;
  blockTime?: number | null;
}

export function legKey(l: Pick<VolumeLeg, "signature" | "outerIndex" | "innerIndex">): string {
  return `${l.signature}:${l.outerIndex}:${l.innerIndex}`;
}

/* -------------------------------- parse -------------------------------- */

const pk = (k: string | PublicKey): string => (typeof k === "string" ? k : k.toBase58());

function accountKeyAt(tx: ParsedTx, i: number): string | null {
  const k = tx.transaction.message.accountKeys[i];
  if (k === undefined) return null;
  if (typeof k === "string" || k instanceof PublicKey) return pk(k);
  return pk(k.pubkey);
}

/** token account -> mint, from pre/post token balances. */
function tokenAccountMints(tx: ParsedTx): Map<string, string> {
  const m = new Map<string, string>();
  for (const b of [...(tx.meta?.preTokenBalances ?? []), ...(tx.meta?.postTokenBalances ?? [])]) {
    const acc = accountKeyAt(tx, b.accountIndex);
    if (acc) m.set(acc, b.mint);
  }
  return m;
}

interface Transfer { mint: string | null; amount: bigint; source: string; destination: string }

function parseTransfer(ix: ParsedIx, mints: Map<string, string>): Transfer | null {
  const pid = pk(ix.programId);
  if (!TOKEN_PROGRAMS.has(pid)) return null;
  const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> } | undefined;
  if (!parsed || typeof parsed !== "object" || !parsed.info) return null;
  const info = parsed.info;
  if (parsed.type === "transfer") {
    const amount = BigInt(String(info.amount ?? "0"));
    const source = String(info.source ?? ""), destination = String(info.destination ?? "");
    return { mint: mints.get(source) ?? mints.get(destination) ?? null, amount, source, destination };
  }
  if (parsed.type === "transferChecked") {
    const ta = info.tokenAmount as { amount?: string } | undefined;
    const amount = BigInt(String(ta?.amount ?? "0"));
    return { mint: String(info.mint ?? "") || null, amount, source: String(info.source ?? ""), destination: String(info.destination ?? "") };
  }
  return null;
}

/**
 * Extract every AMM-level leg of a parsed transaction for `trackedMint`.
 *
 * Rules:
 *  - a top-level instruction of an AGGREGATOR program is skipped (its inner
 *    pool swaps are what counts);
 *  - a top-level instruction of an AMM program is a leg (innerIndex -1), its
 *    token transfers are the inner instructions of the same group;
 *  - an inner instruction of an AMM program is a leg (innerIndex j), its token
 *    transfers are the following token-program inner instructions until the
 *    next non-token instruction;
 *  - PULLED legs come from the program's own events (Sold, SoldBack,
 *    WindowTallied), attributed to the top-level instruction that emitted them.
 */
export function extractLegs(tx: ParsedTx, trackedMint: string): VolumeLeg[] {
  const legs: VolumeLeg[] = [];
  if (!tx.meta || tx.meta.err) return legs;
  const signature = tx.transaction.signatures[0] ?? "";
  const mints = tokenAccountMints(tx);
  const groups = new Map<number, ParsedIx[]>();
  for (const g of tx.meta.innerInstructions ?? []) groups.set(g.index, g.instructions);

  const volumeOf = (transfers: Transfer[]): { volume: bigint; direction: VolumeLeg["direction"] } => {
    // the tracked mint moves exactly once per swap leg (in or out of the pool);
    // take the largest single transfer of it so a fee transfer of the same mint is not added on top
    let best = 0n;
    for (const t of transfers) if (t.mint === trackedMint && t.amount > best) best = t.amount;
    return { volume: best, direction: "unknown" };
  };

  const poolOf = (ix: ParsedIx): string => {
    const accs = (ix.accounts ?? []).map(pk);
    return accs[1] ?? accs[0] ?? "";
  };

  tx.transaction.message.instructions.forEach((outer, i) => {
    const pid = pk(outer.programId);
    const inner = groups.get(i) ?? [];

    if (AGGREGATOR_PROGRAMS[pid]) {
      // never count the route itself; count each pool CPI inside it
      for (let j = 0; j < inner.length; j++) {
        const ix = inner[j]!;
        const ipid = pk(ix.programId);
        if (!AMM_PROGRAMS[ipid]) continue;
        const transfers: Transfer[] = [];
        for (let k = j + 1; k < inner.length; k++) {
          const t = parseTransfer(inner[k]!, mints);
          if (!t) break;
          transfers.push(t);
        }
        const { volume, direction } = volumeOf(transfers);
        if (volume > 0n) legs.push({ signature, outerIndex: i, innerIndex: j, program: ipid, programName: AMM_PROGRAMS[ipid]!, pool: poolOf(ix), volume, direction, slot: tx.slot, blockTime: tx.blockTime });
      }
      return;
    }

    if (AMM_PROGRAMS[pid]) {
      const transfers = inner.map((ix) => parseTransfer(ix, mints)).filter((t): t is Transfer => t !== null);
      const { volume, direction } = volumeOf(transfers);
      if (volume > 0n) legs.push({ signature, outerIndex: i, innerIndex: -1, program: pid, programName: AMM_PROGRAMS[pid]!, pool: poolOf(outer), volume, direction, slot: tx.slot, blockTime: tx.blockTime });
      return;
    }

    // any other program (a host program CPI-ing into a pool, for instance): count inner pool swaps
    for (let j = 0; j < inner.length; j++) {
      const ix = inner[j]!;
      const ipid = pk(ix.programId);
      if (!AMM_PROGRAMS[ipid]) continue;
      const transfers: Transfer[] = [];
      for (let k = j + 1; k < inner.length; k++) {
        const t = parseTransfer(inner[k]!, mints);
        if (!t) break;
        transfers.push(t);
      }
      const { volume, direction } = volumeOf(transfers);
      if (volume > 0n) legs.push({ signature, outerIndex: i, innerIndex: j, program: ipid, programName: AMM_PROGRAMS[ipid]!, pool: poolOf(ix), volume, direction, slot: tx.slot, blockTime: tx.blockTime });
    }
  });

  // PULLED curve legs from events (the curve is the AMM here)
  const logs = tx.meta.logMessages ?? [];
  if (logs.length) {
    for (const e of parseEventsFromLogs(logs, PULLED_PROGRAM_ID)) {
      if (e.event.name === "Sold") {
        legs.push({ signature, outerIndex: e.topLevelIndex, innerIndex: -2 - e.line, program: PULLED_PROGRAM, programName: "ladle-curve", pool: e.event.market.toBase58(), volume: e.event.quoteOut, direction: "out", slot: tx.slot, blockTime: tx.blockTime });
      } else if (e.event.name === "SoldBack") {
        legs.push({ signature, outerIndex: e.topLevelIndex, innerIndex: -2 - e.line, program: PULLED_PROGRAM, programName: "ladle-curve", pool: e.event.window.toBase58(), volume: e.event.quoteOut, direction: "out", slot: tx.slot, blockTime: tx.blockTime });
      } else if (e.event.name === "WindowTallied") {
        legs.push({ signature, outerIndex: e.topLevelIndex, innerIndex: -2 - e.line, program: PULLED_PROGRAM, programName: "ladle-curve", pool: e.event.window.toBase58(), volume: e.event.toCurve, direction: "in", slot: tx.slot, blockTime: tx.blockTime });
      }
    }
  }
  return legs;
}

// PULLED event volume is in QUOTE units (the curve's quote side), while AMM
// legs above are in units of the tracked mint. Callers aggregate per program,
// so the two never mix; see README "Units".
