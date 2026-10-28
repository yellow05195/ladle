/**
 * Ladle room protocol, version 1. JSON objects in WebSocket text frames,
 * the type in `t`. The app keeps a copy of the shapes and of the sign-in
 * text in app/lib/chat/protocol.ts; test/parity.test.ts checks both agree.
 *
 *   client                                   relay
 *   ------                                   -----
 *   hello {v, resume?, since?}         ->
 *                                      <-    welcome {nonce, you, signed, history, presence, limits, slowMs}
 *   signin {address, nonce, signature, profile}
 *                                      ->
 *                                      <-    signed {you, resume, nonce}   |  error {code, nonce}
 *   say {text, cid}                    ->
 *                                      <-    ack {cid, ok, id | reason}
 *                                      <-    line {line}            (to everyone, the sender too)
 *   seat {seat}                        ->    (presence diff to everyone)
 *   signout                            ->    (back to a spectator)
 *   ping                               ->
 *                                      <-    pong {at}
 *                                      <-    presence {join, leave, seat, count}   (batched diffs)
 *                                      <-    slow {ms | null}
 *                                      <-    hb {at, count}         (every heartbeat)
 *                                      <-    bye {reason}           (before a restart)
 *                                      <-    many {m: [...]}        (several of the above from one tick, in order)
 *
 * Commands ("!scoop 0.25", "!odds"...) never travel here: entries come from
 * the chain, read-only answers are computed by each player's own page.
 */

export const PROTOCOL = 1;
/** characters (code points) of one talk line after cleaning */
export const MAX_TEXT = 160;
export const HISTORY_SIZE = 100;
export const PRESENCE_CAP = 300;
/** a sign-in nonce is good for this long, and for one attempt */
export const NONCE_TTL_MS = 5 * 60_000;

export const SPECIES = ["fox", "cat", "bunny", "panda", "penguin", "koala", "polar", "chick", "pig", "cow", "elephant", "bee"] as const;
export type Species = (typeof SPECIES)[number];

export type Seat = "stage" | "stands";
export type LineKind = "talk" | "command" | "system" | "notice";

export interface WireProfile {
  /** wallet address (base58), or "guest:<hex>" for a spectator */
  id: string;
  nickname: string;
  species: Species;
  /** hex of one of the six identity colours */
  scarf: string;
  genesis: number | null;
}

export interface WirePresence { profile: WireProfile; since: number; seat: Seat }

export interface WireLine {
  /** "<boot>.<seq>": boot changes when the relay restarts */
  id: string;
  at: number;
  kind: LineKind;
  from: WireProfile | null;
  text: string;
}

export interface Limits {
  maxText: number;
  /** talk token bucket per wallet */
  burst: number;
  everyMs: number;
}

/** The exact text a wallet signs to talk. LF separators, no trailing newline. */
export function signInMessage(p: { address: string; nonce: string; host: string }): string {
  return [
    "Ladle chat sign-in",
    `wallet: ${p.address}`,
    `relay: ${p.host}`,
    `nonce: ${p.nonce}`,
    "This signature lets you talk in the Ladle room. It moves no SOL and is not a transaction.",
  ].join("\n");
}

/* ------------------------------------------------------------------ client -> relay */

export interface ProfileInput { nickname?: unknown; species?: unknown; scarf?: unknown; genesis?: unknown }

export type ClientMsg =
  | { t: "hello"; v: number; resume?: string; since?: string }
  | { t: "signin"; address: string; nonce: string; signature: string; profile: ProfileInput }
  | { t: "say"; text: string; cid?: string }
  | { t: "seat"; seat: Seat }
  | { t: "signout" }
  | { t: "ping" };

/* ------------------------------------------------------------------ relay -> client */

export type SayReason = "no-profile" | "rate-limited" | "too-long" | "empty" | "blocked" | "muted" | "command";
export type SignInError = "bad-nonce" | "bad-address" | "bad-signature" | "bad-profile" | "nickname-reserved" | "rate-limited";

export type ServerMsg =
  | { t: "welcome"; v: number; nonce: string; host: string; you: WireProfile; signed: boolean; resume?: string; history: WireLine[]; reset: boolean; presence: { list: WirePresence[]; count: number }; limits: Limits; slowMs: number | null; at: number }
  | { t: "signed"; you: WireProfile; resume: string; nonce: string }
  | { t: "signedout"; you: WireProfile; nonce: string }
  | { t: "error"; code: SignInError | "protocol" | "flood" | "hello-timeout"; message?: string; nonce?: string }
  | { t: "ack"; cid?: string; ok: true; id: string }
  | { t: "ack"; cid?: string; ok: false; reason: SayReason; retryMs?: number }
  | { t: "line"; line: WireLine }
  | { t: "presence"; join: WirePresence[]; leave: string[]; seat: Array<[string, Seat]>; count: number }
  | { t: "slow"; ms: number | null }
  | { t: "hb"; at: number; count: number }
  | { t: "pong"; at: number }
  | { t: "bye"; reason: string }
  | { t: "many"; m: ServerMsg[] };

const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

/** Parses and shape-checks one client frame. Returns null for anything malformed. */
export function parseClient(raw: string): ClientMsg | null {
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case "hello":
      if (typeof o.v !== "number") return null;
      if (o.resume !== undefined && !str(o.resume, 2048)) return null;
      if (o.since !== undefined && !str(o.since, 64)) return null;
      return { t: "hello", v: o.v, resume: o.resume as string | undefined, since: o.since as string | undefined };
    case "signin":
      if (!str(o.address, 64) || !str(o.nonce, 64) || !str(o.signature, 200)) return null;
      if (!o.profile || typeof o.profile !== "object" || Array.isArray(o.profile)) return null;
      return { t: "signin", address: o.address, nonce: o.nonce, signature: o.signature, profile: o.profile as ProfileInput };
    case "say":
      // the length is judged after cleaning; this bound only stops oversized frames
      if (!str(o.text, 2000)) return null;
      if (o.cid !== undefined && !str(o.cid, 40)) return null;
      return { t: "say", text: o.text, cid: o.cid as string | undefined };
    case "seat":
      if (o.seat !== "stage" && o.seat !== "stands") return null;
      return { t: "seat", seat: o.seat };
    case "signout": return { t: "signout" };
    case "ping": return { t: "ping" };
    default: return null;
  }
}
