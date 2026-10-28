/**
 * The room relay's protocol v1, as the page speaks it. The relay's own copy
 * is chat/src/protocol.ts; chat/test/parity.test.ts imports both and fails
 * when the sign-in text, the limits or the frame shapes drift apart.
 *
 * No imports here on purpose: Node's test runner loads this file as is.
 */

export const PROTOCOL = 1;
export const MAX_TEXT = 160;
export const HISTORY_SIZE = 100;
export const PRESENCE_CAP = 300;

/** The relay refuses nicknames containing these (posing as the house or its staff), and any starting with "guest". */
export const POSES_AS = ["ladle", "admin", "support", "official", "moderator", "staff", "helpdesk"];

export type WireSeat = "stage" | "stands";

export interface WireProfile { id: string; nickname: string; species: string; scarf: string; genesis: number | null }
export interface WirePresence { profile: WireProfile; since: number; seat: WireSeat }
export interface WireLine { id: string; at: number; kind: "talk" | "command" | "system" | "notice"; from: WireProfile | null; text: string }
export interface WireLimits { maxText: number; burst: number; everyMs: number }

export type WireSayReason = "no-profile" | "rate-limited" | "too-long" | "empty" | "blocked" | "muted" | "command";
export type WireSignInError = "bad-nonce" | "bad-address" | "bad-signature" | "bad-profile" | "nickname-reserved" | "rate-limited";

export type ClientFrame =
  | { t: "hello"; v: number; resume?: string; since?: string }
  | { t: "signin"; address: string; nonce: string; signature: string; profile: { nickname: string; species: string; scarf: string; genesis: number | null } }
  | { t: "say"; text: string; cid: string }
  | { t: "seat"; seat: WireSeat }
  | { t: "signout" }
  | { t: "ping" };

export type ServerFrame =
  | { t: "welcome"; v: number; nonce: string; host: string; you: WireProfile; signed: boolean; resume?: string; history: WireLine[]; reset: boolean; presence: { list: WirePresence[]; count: number }; limits: WireLimits; slowMs: number | null; at: number }
  | { t: "signed"; you: WireProfile; resume: string; nonce: string }
  | { t: "signedout"; you: WireProfile; nonce: string }
  | { t: "error"; code: WireSignInError | "protocol" | "flood" | "hello-timeout"; message?: string; nonce?: string }
  | { t: "ack"; cid?: string; ok: true; id: string }
  | { t: "ack"; cid?: string; ok: false; reason: WireSayReason; retryMs?: number }
  | { t: "line"; line: WireLine }
  | { t: "presence"; join: WirePresence[]; leave: string[]; seat: Array<[string, WireSeat]>; count: number }
  | { t: "slow"; ms: number | null }
  | { t: "hb"; at: number; count: number }
  | { t: "pong"; at: number }
  | { t: "bye"; reason: string }
  /** several frames from one relay tick, in order */
  | { t: "many"; m: ServerFrame[] };

/** The exact text a wallet signs to talk. LF separators, no trailing newline. Same bytes as the relay's. */
export function signInMessage(p: { address: string; nonce: string; host: string }): string {
  return [
    "Ladle chat sign-in",
    `wallet: ${p.address}`,
    `relay: ${p.host}`,
    `nonce: ${p.nonce}`,
    "This signature lets you talk in the Ladle room. It moves no SOL and is not a transaction.",
  ].join("\n");
}
