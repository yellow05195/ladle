/**
 * Anchor event decoding from program logs.
 *
 * `emit!` writes `Program data: <base64>` where the payload is
 * sha256("event:<Name>")[..8] followed by the borsh-encoded fields
 * (`programs/pulled/src/events.rs`). Logs are attributed to the program that
 * is on top of the invoke stack when the line appears, so events of other
 * programs in the same transaction are never mistaken for ours.
 */
import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ByteReader } from "./accounts.ts";
import { PULLED_PROGRAM_ID } from "./pda.ts";
import type { PulledEvent, PulledEventName } from "./types.ts";

export function eventDiscriminator(name: string): Uint8Array {
  return sha256(new TextEncoder().encode(`event:${name}`)).slice(0, 8);
}

export const EVENT_NAMES: readonly PulledEventName[] = [
  "WindowOpened", "Entered", "WindowSealed", "VrfRequested", "WindowDrawn", "WindowTallied",
  "EntrySettled", "WindowSettled", "Claimed", "SoldBack", "Sold", "WindowRefunding", "EntryRefunded",
  "EntryClosed", "WindowClosed",
];

const EVENT_DISC = new Map<string, PulledEventName>(
  EVENT_NAMES.map((n) => [Buffer.from(eventDiscriminator(n)).toString("hex"), n]),
);

/** Decode one event payload (discriminator + borsh body). Returns null for unknown discriminators. */
export function decodeEvent(payload: Uint8Array): PulledEvent | null {
  if (payload.length < 8) return null;
  const name = EVENT_DISC.get(Buffer.from(payload.subarray(0, 8)).toString("hex"));
  if (!name) return null;
  const r = new ByteReader(payload.subarray(8));
  switch (name) {
    case "WindowOpened":
      return { name, market: r.pubkey(), window: r.pubkey(), index: r.u64(), openSlot: r.u64(), closeSlot: r.u64() };
    case "Entered":
      return { name, window: r.pubkey(), index: r.u32(), owner: r.pubkey(), amount: r.u64(), totalAfter: r.u64(), slot: r.u64() };
    case "WindowSealed":
      return { name, window: r.pubkey(), index: r.u64(), totalAmount: r.u64(), entryCount: r.u32(), sealedSlot: r.u64(), empty: r.bool(), vrfSeed: r.bytes(32) };
    case "VrfRequested":
      return { name, window: r.pubkey(), request: r.pubkey(), seed: r.bytes(32) };
    case "WindowDrawn":
      return { name, window: r.pubkey(), seed: r.bytes(64) };
    case "WindowTallied":
      return { name, window: r.pubkey(), index: r.u64(), total: r.u64(), rollSum: r.u128(), tokensOut: r.u64(), toCurve: r.u64(), feePlatform: r.u64(), feeHost: r.u64(), keeperBounty: r.u64() };
    case "EntrySettled":
      return { name, window: r.pubkey(), index: r.u32(), roll: r.u64(), share: r.u64() };
    case "WindowSettled":
      return { name, window: r.pubkey(), index: r.u64(), tokensOut: r.u64(), total: r.u64() };
    case "Claimed":
      return { name, window: r.pubkey(), index: r.u32(), owner: r.pubkey(), amount: r.u64() };
    case "SoldBack":
      return { name, window: r.pubkey(), index: r.u32(), owner: r.pubkey(), amountTokens: r.u64(), quoteOut: r.u64() };
    case "Sold":
      return { name, market: r.pubkey(), seller: r.pubkey(), amountTokens: r.u64(), quoteOut: r.u64() };
    case "WindowRefunding":
      return { name, window: r.pubkey(), index: r.u64(), slot: r.u64() };
    case "EntryRefunded":
      return { name, window: r.pubkey(), index: r.u32(), owner: r.pubkey(), amount: r.u64() };
    case "EntryClosed":
      return { name, window: r.pubkey(), index: r.u32(), owner: r.pubkey() };
    case "WindowClosed":
      return { name, window: r.pubkey(), index: r.u64(), opener: r.pubkey(), dustSwept: r.u64() };
  }
}

const INVOKE_RE = /^Program (\w+) invoke \[(\d+)\]$/;
const END_RE = /^Program (\w+) (success|failed.*)$/;
const DATA_PREFIX = "Program data: ";

/** An event together with where it was emitted in the log stream. */
export interface LoggedEvent {
  event: PulledEvent;
  /** 0-based position of the log line. */
  line: number;
  /** Invocation depth of the emitting program (1 = top-level instruction). */
  depth: number;
  /** 0-based index of the top-level instruction the log belongs to (counted from `invoke [1]` lines). */
  topLevelIndex: number;
}

/**
 * Walk the transaction logs and return the PULLED events emitted by
 * `programId` (whatever depth it ran at, including CPI from a host program).
 */
export function parseEventsFromLogs(logs: readonly string[], programId: PublicKey = PULLED_PROGRAM_ID): LoggedEvent[] {
  const pid = programId.toBase58();
  const stack: string[] = [];
  const out: LoggedEvent[] = [];
  let topLevel = -1;
  logs.forEach((line, i) => {
    const inv = INVOKE_RE.exec(line);
    if (inv) {
      if (inv[2] === "1") topLevel++;
      stack.push(inv[1]!);
      return;
    }
    if (END_RE.test(line)) {
      const m = END_RE.exec(line)!;
      // pop to the matching program (logs are well nested)
      for (let j = stack.length - 1; j >= 0; j--) if (stack[j] === m[1]) { stack.length = j; break; }
      return;
    }
    if (line.startsWith(DATA_PREFIX) && stack[stack.length - 1] === pid) {
      const b64 = line.slice(DATA_PREFIX.length).trim();
      let payload: Uint8Array;
      try { payload = new Uint8Array(Buffer.from(b64, "base64")); } catch { return; }
      const event = decodeEvent(payload);
      if (event) out.push({ event, line: i, depth: stack.length, topLevelIndex: topLevel });
    }
  });
  return out;
}

/** Convenience: just the events. */
export function eventsFromLogs(logs: readonly string[], programId: PublicKey = PULLED_PROGRAM_ID): PulledEvent[] {
  return parseEventsFromLogs(logs, programId).map((e) => e.event);
}

/** Does this event concern `window`? (Sold is per market, see `eventMarket`). */
export function eventWindow(e: PulledEvent): PublicKey | null {
  return "window" in e ? e.window : null;
}
