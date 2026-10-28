/**
 * Borsh decoders for the four program accounts, hand-written against
 * `state.rs` (no IDL file needed). Anchor account discriminator =
 * sha256("account:<Name>")[..8].
 */
import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { Entry, Integration, Market, Window, WindowState } from "./types.ts";

export function accountDiscriminator(name: string): Uint8Array {
  return sha256(new TextEncoder().encode(`account:${name}`)).slice(0, 8);
}

export const DISCRIMINATORS = {
  Integration: accountDiscriminator("Integration"),
  Market: accountDiscriminator("Market"),
  Window: accountDiscriminator("Window"),
  Entry: accountDiscriminator("Entry"),
} as const;

/** `8 + INIT_SPACE` of each account (fixed sizes; strings use their max_len). */
export const ACCOUNT_SIZES = {
  Integration: 8 + 32 + 2 + 1,
  Market: 8 + 32 * 5 + 16 + 8 + 8 + 8 + 2 + 8 + 8 + 8 + 1 + 8 + 32 + 32 + 1 + (4 + 32) + (4 + 10) + (4 + 200),
  Window: 8 + 32 + 8 + 1 + 8 + 8 + 8 + 8 + 4 + 32 + 32 + 1 + 8 + 32 + 64 + 16 + 4 + 4 + 32 + 8 + 8 + 8 + 8 + 32 + 1 + 32 + 4,
  Entry: 8 + 32 + 32 + 4 + 8 + 8 + 8 + 8 + 1 + 1,
} as const;

/** Byte offsets used for `memcmp` filters. */
export const OFFSETS = {
  /** `Window.market` */
  windowMarket: 8,
  /** `Entry.window` */
  entryWindow: 8,
  /** `Entry.owner` */
  entryOwner: 8 + 32,
  /** `Market.token_mint` */
  marketTokenMint: 8 + 32,
} as const;

/* ------------------------------ reader ------------------------------ */

export class ByteReader {
  private off = 0;
  private readonly buf: Uint8Array;
  constructor(buf: Uint8Array) { this.buf = buf; }

  get offset(): number { return this.off; }
  get remaining(): number { return this.buf.length - this.off; }

  private need(n: number) {
    if (this.off + n > this.buf.length) throw new Error(`borsh: unexpected end of data at ${this.off} (+${n})`);
  }
  u8(): number { this.need(1); return this.buf[this.off++]!; }
  bool(): boolean { const b = this.u8(); if (b > 1) throw new Error("borsh: bad bool"); return b === 1; }
  u16(): number { this.need(2); const v = this.buf[this.off]! | (this.buf[this.off + 1]! << 8); this.off += 2; return v; }
  u32(): number {
    this.need(4);
    const v = (this.buf[this.off]! | (this.buf[this.off + 1]! << 8) | (this.buf[this.off + 2]! << 16)) + this.buf[this.off + 3]! * 0x1000000;
    this.off += 4;
    return v;
  }
  uN(bytes: number): bigint {
    this.need(bytes);
    let v = 0n;
    for (let i = bytes - 1; i >= 0; i--) v = (v << 8n) | BigInt(this.buf[this.off + i]!);
    this.off += bytes;
    return v;
  }
  u64(): bigint { return this.uN(8); }
  u128(): bigint { return this.uN(16); }
  bytes(n: number): Uint8Array { this.need(n); const out = this.buf.slice(this.off, this.off + n); this.off += n; return out; }
  pubkey(): PublicKey { return new PublicKey(this.bytes(32)); }
  string(): string { const len = this.u32(); return new TextDecoder().decode(this.bytes(len)); }
}

function checkDisc(data: Uint8Array, name: keyof typeof DISCRIMINATORS) {
  if (!isAccountOf(data, name)) throw new Error(`${name}: discriminator mismatch or data too short`);
}

export function isAccountOf(data: Uint8Array, name: keyof typeof DISCRIMINATORS): boolean {
  if (data.length < 8) return false;
  const d = DISCRIMINATORS[name];
  for (let i = 0; i < 8; i++) if (data[i] !== d[i]) return false;
  return true;
}

/* ----------------------------- decoders ----------------------------- */

export function decodeIntegration(data: Uint8Array): Integration {
  checkDisc(data, "Integration");
  const r = new ByteReader(data.subarray(8));
  return { host: r.pubkey(), hostFeeBps: r.u16(), bump: r.u8() };
}

export function decodeMarket(data: Uint8Array): Market {
  checkDisc(data, "Market");
  const r = new ByteReader(data.subarray(8));
  return {
    creator: r.pubkey(),
    tokenMint: r.pubkey(),
    quoteMint: r.pubkey(),
    quoteProgram: r.pubkey(),
    integration: r.pubkey(),
    curve: { x: r.u64(), y: r.u64() },
    windowSlots: r.u64(),
    vrfTimeoutSlots: r.u64(),
    maxEntryAmount: r.u64(),
    maxEntryBps: r.u16(),
    entryFloorAmount: r.u64(),
    windowCount: r.u64(),
    nextSettleIndex: r.u64(),
    hasActiveWindow: r.bool(),
    activeWindow: r.u64(),
    quoteVault: r.pubkey(),
    tokenVault: r.pubkey(),
    bump: r.u8(),
    name: r.string(),
    symbol: r.string(),
    uri: r.string(),
  };
}

export function decodeWindow(data: Uint8Array): Window {
  checkDisc(data, "Window");
  const r = new ByteReader(data.subarray(8));
  const market = r.pubkey();
  const index = r.u64();
  const stateByte = r.u8();
  if (stateByte > 5) throw new Error(`Window: unknown state ${stateByte}`);
  return {
    market,
    index,
    state: stateByte as WindowState,
    openSlot: r.u64(),
    closeSlot: r.u64(),
    sealedSlot: r.u64(),
    totalAmount: r.u64(),
    entryCount: r.u32(),
    entriesCommitment: r.bytes(32),
    vrfSeed: r.bytes(32),
    vrfRequested: r.bool(),
    vrfRequestedSlot: r.u64(),
    vrfRequest: r.pubkey(),
    seed: r.bytes(64),
    rollSum: r.u128(),
    tallyCursor: r.u32(),
    settleCursor: r.u32(),
    cumWeight: r.bytes(32),
    tokensOut: r.u64(),
    feePlatform: r.u64(),
    feeHost: r.u64(),
    toCurve: r.u64(),
    escrow: r.pubkey(),
    bump: r.u8(),
    opener: r.pubkey(),
    closedEntries: r.u32(),
  };
}

export function decodeEntry(data: Uint8Array): Entry {
  checkDisc(data, "Entry");
  const r = new ByteReader(data.subarray(8));
  return {
    window: r.pubkey(),
    owner: r.pubkey(),
    index: r.u32(),
    amount: r.u64(),
    roll: r.u64(),
    share: r.u64(),
    claimed: r.u64(),
    refunded: r.bool(),
    bump: r.u8(),
  };
}

/* ------------------------- ORAO randomness ------------------------- */

const RANDOMNESS_V2_DISC = sha256(new TextEncoder().encode("account:RandomnessV2")).slice(0, 8);
const RANDOMNESS_V1_DISC = sha256(new TextEncoder().encode("account:Randomness")).slice(0, 8);

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Parse an ORAO randomness account exactly like `vrf.rs::parse_randomness`.
 * Returns the 64 bytes when fulfilled, `null` when pending; throws on a
 * wrong layout or a seed that is not `expectedSeed`.
 */
export function parseOraoRandomness(data: Uint8Array, expectedSeed: Uint8Array): Uint8Array | null {
  if (data.length < 8) throw new Error("randomness: data too short");
  const disc = data.subarray(0, 8);
  if (bytesEqual(disc, RANDOMNESS_V2_DISC)) {
    if (data.length < 73) throw new Error("randomness v2: too short");
    const tag = data[8]!;
    if (!bytesEqual(data.subarray(41, 73), expectedSeed)) throw new Error("randomness: seed mismatch");
    if (tag === 0) return null;
    if (tag !== 1) throw new Error("randomness v2: bad tag");
    if (data.length < 73 + 64) throw new Error("randomness v2: too short for fulfilled");
    const r = data.slice(73, 73 + 64);
    return r.every((b) => b === 0) ? null : r;
  }
  if (bytesEqual(disc, RANDOMNESS_V1_DISC)) {
    if (data.length < 104) throw new Error("randomness v1: too short");
    if (!bytesEqual(data.subarray(8, 40), expectedSeed)) throw new Error("randomness: seed mismatch");
    const r = data.slice(40, 104);
    return r.every((b) => b === 0) ? null : r;
  }
  throw new Error("randomness: unknown layout");
}

/** `NetworkState` layout: disc[8] authority[32] treasury[32] ... */
export function parseOraoTreasury(data: Uint8Array): PublicKey {
  const disc = sha256(new TextEncoder().encode("account:NetworkState")).slice(0, 8);
  if (data.length < 8 + 32 + 32 || !bytesEqual(data.subarray(0, 8), disc)) throw new Error("ORAO network state: bad layout");
  return new PublicKey(data.slice(40, 72));
}
