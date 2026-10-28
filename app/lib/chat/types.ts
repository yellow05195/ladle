/**
 * The room's chat and presence (v21): one shared room where every visitor
 * sees the same lines and the same crowd. Lines starting with "!" are
 * commands (!scoop 0.25, !odds, !pot, !verify, !sell); everything else is
 * talk between people. Reading is open to everyone; talking needs a profile
 * (a wallet-signed nickname).
 *
 * The demo source simulates the room; the live source speaks to the relay
 * in chat/ (NEXT_PUBLIC_LADLE_CHAT_URL).
 */
import type { Species } from "../profile";

export interface ChatProfile {
  /** wallet address (base58), or "guest:<id>" for a spectator without a profile */
  id: string;
  nickname: string;
  species: Species;
  /** hex of the profile's identity colour */
  scarf: string;
  genesis: number | null;
}

export interface Presence {
  profile: ChatProfile;
  /** ms epoch when this visitor entered the room */
  since: number;
  /** "stage" while their entry is in the current round, "stands" otherwise */
  seat: "stage" | "stands";
}

export type ChatLineKind = "talk" | "command" | "system" | "notice";

export interface ChatLine {
  id: string;
  at: number;
  kind: ChatLineKind;
  from: ChatProfile | null;
  text: string;
}

export type ChatStatus = "demo" | "connecting" | "live" | "offline";

export interface ChatSnapshot {
  status: ChatStatus;
  lines: ChatLine[];
  present: Presence[];
  /** everyone connected, including those not listed in `present` */
  online: number;
  /** v21 (additive): the viewer as the room sees them once they can talk, else null */
  me?: ChatProfile | null;
  /** v21 (additive): true once the viewer can talk (demo: a profile is set; live: the relay checked the wallet's signature) */
  signed?: boolean;
  /** v21 (additive): ms between two lines of one player while the room's slow mode is on, else null */
  slowMs?: number | null;
}

/** Why a line was not sent. The first six are the v21 contract; "blocked", "muted" and "not-signed" were added with the relay. */
export type SendFailReason = "no-profile" | "rate-limited" | "too-long" | "empty" | "unknown-command" | "offline" | "blocked" | "muted" | "not-signed";

export type SendResult =
  | { ok: true; kind: "talk" | "command" }
  | { ok: false; reason: SendFailReason; hint?: string; retryMs?: number };

/** The wallet's signMessage, handed over by the wallet UI (setChatSigner). Returns the 64-byte ed25519 signature. */
export type ChatSigner = (message: Uint8Array) => Promise<Uint8Array>;
