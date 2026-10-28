/**
 * PDAs and seed derivations. Every derivation here mirrors the Rust source:
 * `consts.rs` (seeds), `state.rs` (VRF seed + entries commitment),
 * `vrf.rs` (ORAO addresses).
 */
import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

/** PLACEHOLDER program id (see programs/pulled/src/lib.rs and Anchor.toml). */
export const PULLED_PROGRAM_ID = new PublicKey("85ig2nch9XBAeGbdhj613vipBufxsw1eWH4Eyw7QbgFj");
/** PLACEHOLDER platform treasury (consts.rs). */
export const PLATFORM_TREASURY = new PublicKey("A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat");

/** ORAO VRF program (devnet and mainnet). */
export const ORAO_VRF_ID = new PublicKey("VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y");
export const ORAO_NETWORK_STATE_SEED = "orao-vrf-network-configuration";
export const ORAO_RANDOMNESS_SEED = "orao-vrf-randomness-request";

export { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID };

export const INTEGRATION_SEED = "integration";
export const MARKET_SEED = "market";
export const WINDOW_SEED = "window";
export const ENTRY_SEED = "entry";

/** Domain tag of the VRF seed derivation (`VRF_SEED_DOMAIN`). */
export const VRF_SEED_DOMAIN = "ladle:vrf:v1";

/* ------------------------------ constants ------------------------------ */

export const MAX_PAGE = 48;
export const MAX_ENTRIES_PER_WINDOW = 2048;
export const TOKEN_DECIMALS = 6;
export const TOKEN_SUPPLY = 1_000_000_000n * 1_000_000n;
export const INITIAL_VIRTUAL_X = 30n * 1_000_000_000n;
export const INITIAL_VIRTUAL_Y = TOKEN_SUPPLY;
export const MARKET_CREATION_FEE_LAMPORTS = 50_000_000n;
export const MIN_WINDOW_SLOTS = 25n;
export const MAX_WINDOW_SLOTS = 600n;
export const MIN_VRF_TIMEOUT_SLOTS = 150n;
export const KEEPER_BOUNTY_BPS_OF_PLATFORM_FEE = 1_000n;

/**
 * Measured defaults for `create_market` (research/G6.md, research/G2.md):
 * 92 slots is ~20 s at 217 ms/slot; 900 slots is ~3.3 min, well above the
 * ORAO request->value latency measured on mainnet (n=314: median 4 s,
 * p90 72 s, p99 113 s, max 158 s).
 */
export const DEFAULT_WINDOW_SLOTS = 92n;
export const DEFAULT_VRF_TIMEOUT_SLOTS = 900n;

/**
 * Slot duration used for the seconds ESTIMATE shown next to slot counts.
 * Measured on mainnet-beta on 2026-10-23 (research/G6.md): 216.6 ms over the
 * 200 ms-target regime, 212 ms after Alpenglow. The program never uses wall
 * clock time; this number is for display only and will drift.
 */
export const ESTIMATED_MS_PER_SLOT = 217;

/* ------------------------------ encoders ------------------------------ */

export function u64Le(n: bigint | number): Uint8Array {
  let v = BigInt(n);
  if (v < 0n || v > 0xffff_ffff_ffff_ffffn) throw new Error("u64 out of range");
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
}

export function u32Le(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff_ffff) throw new Error("u32 out of range");
  const out = new Uint8Array(4);
  out[0] = n & 0xff; out[1] = (n >>> 8) & 0xff; out[2] = (n >>> 16) & 0xff; out[3] = (n >>> 24) & 0xff;
  return out;
}

export function u16Le(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new Error("u16 out of range");
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
}

const enc = new TextEncoder();

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* -------------------------------- PDAs -------------------------------- */

export function integrationPda(host: PublicKey, programId = PULLED_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([enc.encode(INTEGRATION_SEED), host.toBytes()], programId);
}

export function marketPda(tokenMint: PublicKey, programId = PULLED_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([enc.encode(MARKET_SEED), tokenMint.toBytes()], programId);
}

export function windowPda(market: PublicKey, index: bigint | number, programId = PULLED_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([enc.encode(WINDOW_SEED), market.toBytes(), u64Le(index)], programId);
}

/**
 * Entry PDA: ["entry", window, owner]. One entry per wallet per window; the
 * entry's index is assigned by the program in arrival order, so a wallet's
 * entry address is known without reading the window, and any number of
 * wallets entering in the same slot do not collide.
 */
export function entryPda(window: PublicKey, owner: PublicKey, programId = PULLED_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([enc.encode(ENTRY_SEED), window.toBytes(), owner.toBytes()], programId);
}

/** Associated token account; `allowOwnerOffCurve` so PDAs (market, window) work. */
export function ata(mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey = TOKEN_PROGRAM_ID): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
}

/** `market.token_vault`: the market PDA's ATA for the launched token (classic SPL Token). */
export function tokenVaultAta(market: PublicKey, tokenMint: PublicKey): PublicKey {
  return ata(tokenMint, market, TOKEN_PROGRAM_ID);
}

/** `market.quote_vault`: the market PDA's ATA for the quote mint under its token program. */
export function quoteVaultAta(market: PublicKey, quoteMint: PublicKey, quoteProgram: PublicKey): PublicKey {
  return ata(quoteMint, market, quoteProgram);
}

/** `window.escrow`: the window PDA's ATA for the quote mint. */
export function escrowAta(window: PublicKey, quoteMint: PublicKey, quoteProgram: PublicKey): PublicKey {
  return ata(quoteMint, window, quoteProgram);
}

/** Platform treasury's ATA for a quote mint (`platform_quote_account`). */
export function platformQuoteAta(quoteMint: PublicKey, quoteProgram: PublicKey): PublicKey {
  return ata(quoteMint, PLATFORM_TREASURY, quoteProgram);
}

/* -------------------------------- ORAO -------------------------------- */

/** Metaplex Token Metadata (same id on mainnet and devnet). */
export const MPL_TOKEN_METADATA_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/** The Metaplex metadata PDA of a mint: ["metadata", MPL, mint]. Written once by create_market, immutable. */
export function tokenMetadataPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([enc.encode("metadata"), MPL_TOKEN_METADATA_ID.toBytes(), mint.toBytes()], MPL_TOKEN_METADATA_ID);
}

export function oraoNetworkStatePda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([enc.encode(ORAO_NETWORK_STATE_SEED)], ORAO_VRF_ID);
}

/** ORAO randomness request PDA for a 32-byte seed. */
export function oraoRandomnessPda(seed: Uint8Array): [PublicKey, number] {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  return PublicKey.findProgramAddressSync([enc.encode(ORAO_RANDOMNESS_SEED), seed], ORAO_VRF_ID);
}

/* ------------------------- VRF seed derivation ------------------------- */

/** `sha256(prev || owner || amount LE u64 || index LE u32)` - folded once per `enter`. */
export function foldEntryCommitment(prev: Uint8Array, owner: PublicKey, amount: bigint, index: number): Uint8Array {
  if (prev.length !== 32) throw new Error("prev must be 32 bytes");
  return sha256(concatBytes(prev, owner.toBytes(), u64Le(amount), u32Le(index)));
}

/** Commitment of a whole entry list, from the all-zero start. */
export function entriesCommitment(entries: readonly { owner: PublicKey; amount: bigint; index: number }[]): Uint8Array {
  let c: Uint8Array = new Uint8Array(32);
  for (const e of entries) c = foldEntryCommitment(c, e.owner, e.amount, e.index);
  return c;
}

/** `sha256("ladle:vrf:v1" || window || close_slot LE u64 || entry_count LE u32 || entries_commitment)`. */
export function deriveVrfSeed(window: PublicKey, closeSlot: bigint, entryCount: number, commitment: Uint8Array): Uint8Array {
  if (commitment.length !== 32) throw new Error("commitment must be 32 bytes");
  return sha256(concatBytes(enc.encode(VRF_SEED_DOMAIN), window.toBytes(), u64Le(closeSlot), u32Le(entryCount), commitment));
}

/** The ORAO request account a window will use, from the window's public fields. */
export function vrfRequestForWindow(window: PublicKey, closeSlot: bigint, entryCount: number, commitment: Uint8Array): PublicKey {
  return oraoRandomnessPda(deriveVrfSeed(window, closeSlot, entryCount, commitment))[0];
}
