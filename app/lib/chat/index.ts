"use client";

/**
 * Chat and presence (v21): one shared room. Everyone sees the same lines
 * and the same crowd; lines starting with "!" are commands and stay on the
 * viewer's page (useRoundChat answers them, the chain carries entries to
 * everyone), everything else is talk between people.
 *
 * Source, chosen at build time:
 *   NEXT_PUBLIC_LADLE_CHAT_URL set     -> live: the relay in chat/ over WebSocket
 *   unset, NEXT_PUBLIC_DATA_SOURCE demo -> demo: a simulated room of about fifty
 *   unset, chain data                   -> none: reading only, talk is off (no fake room next to real data)
 *
 * The wallet UI hands over who the viewer is and how their wallet signs:
 *   setChatProfile(chatProfileOf(profile) | null), setChatSigner(wallet.signMessage | null)
 * The game hands over the viewer's seat: setChatSeat("stage" | "stands").
 */
import { useSyncExternalStore } from "react";
import { DATA_SOURCE } from "../data";
import { scarfHex, type Profile } from "../profile";
import { demoSource } from "./demo";
import { liveSource } from "./live";
import { MAX_TEXT } from "./protocol";
import type { RoomSource } from "./source";
import { RoomStore } from "./store";
import { charCount, classify, hintFor, looksLikeLink, type FailReason } from "./text";
import type { ChatProfile, ChatSigner, ChatSnapshot, Presence, SendResult } from "./types";

export type * from "./types";
export { classify, cleanText, hintFor, roomNicknameOk, COMMANDS, type Classified, type CommandName } from "./text";
export { MAX_TEXT } from "./protocol";
export { useRoomLog, type RoomLogItem } from "./merge";

export const CHAT_URL = process.env.NEXT_PUBLIC_LADLE_CHAT_URL ?? "";
export const CHAT_SOURCE: "demo" | "live" | "none" = CHAT_URL ? "live" : DATA_SOURCE === "demo" ? "demo" : "none";

const INITIAL: ChatSnapshot = {
  status: CHAT_SOURCE === "demo" ? "demo" : CHAT_SOURCE === "live" ? "connecting" : "offline",
  lines: [], present: [], online: 0, me: null, signed: false, slowMs: null,
};

/** No relay on a chain site: the room is read-only and empty, and says so. */
function noneSource(store: RoomStore): RoomSource {
  const off = (): SendResult => ({ ok: false, reason: "offline", hint: "Talk is off on this site: no room relay is set up. Commands still work." });
  return {
    kind: "none",
    start() { store.set({ status: "offline" }); },
    stop() {},
    async say() { return off(); },
    setProfile(p) { store.setMe(p, false); },
    setSigner() {},
    setSeat() {},
    async signIn() { return off(); },
  };
}

let store: RoomStore | null = null;
let source: RoomSource | null = null;
let started = false;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
const wanted: { profile: ChatProfile | null; signer: ChatSigner | null; seat: "stage" | "stands" } = { profile: null, signer: null, seat: "stands" };

function room(): { store: RoomStore; source: RoomSource } {
  if (!store || !source) {
    store = new RoomStore(INITIAL);
    source = CHAT_SOURCE === "live" ? liveSource(store, CHAT_URL) : CHAT_SOURCE === "demo" ? demoSource(store) : noneSource(store);
    source.setSigner(wanted.signer);
    source.setProfile(wanted.profile);
    source.setSeat(wanted.seat);
  }
  return { store, source };
}

/** Starts the source with the first subscriber; stops it 15 s after the last one leaves (a route change keeps the socket). */
function subscribe(listener: () => void): () => void {
  const r = room();
  const off = r.store.subscribe(listener);
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
  if (!started) { started = true; r.source.start(); }
  return () => {
    off();
    if (r.store.size > 0) return;
    stopTimer = setTimeout(() => {
      stopTimer = null;
      if (r.store.size === 0 && started) { started = false; r.source.stop(); }
    }, 15_000);
  };
}

const getSnapshot = () => room().store.get();
const getServerSnapshot = () => INITIAL;
const getPresent = () => room().store.get().present;
const getServerPresent = () => INITIAL.present;

/** The room: lines, crowd, status; `send` routes a typed line (see sendText). */
export function useChat(): ChatSnapshot & { send(text: string): Promise<SendResult> } {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...s, send: sendText };
}

/** The crowd only: re-renders when someone arrives, leaves or changes seat, not on talk. */
export function usePresence(): Presence[] {
  return useSyncExternalStore(subscribe, getPresent, getServerPresent);
}

const fail = (reason: FailReason, extra: Parameters<typeof hintFor>[1] = {}): SendResult => ({ ok: false, reason, hint: hintFor(reason, extra) });

/**
 * One typed line, routed:
 *   "!scoop 0.25", "!odds"... -> { ok: true, kind: "command" }: the caller hands the text to useRoundChat's send
 *   "!nope"                    -> unknown-command (with the list of commands as hint)
 *   talk                       -> checked here (empty, length, links), then sent to the room
 * Talk needs a profile; on the live room the first line asks the wallet for one signature.
 */
export async function sendText(text: string): Promise<SendResult> {
  const c = classify(text);
  if (c.kind === "empty") return fail("empty");
  if (c.kind === "command") return c.known ? { ok: true, kind: "command" } : fail("unknown-command", { cmd: c.text });
  const n = charCount(c.text);
  if (n > MAX_TEXT) return fail("too-long", { chars: n });
  if (looksLikeLink(c.text)) return fail("blocked");
  return room().source.say(c.text);
}

/** Who the viewer is in the room (null: a spectator). Call it whenever the profile or the wallet changes. */
export function setChatProfile(p: ChatProfile | null): void {
  const same = JSON.stringify(p) === JSON.stringify(wanted.profile);
  wanted.profile = p;
  if (!same) source?.setProfile(p);
}

/** How the viewer's wallet signs a message (wallet-adapter's signMessage), or null (demo wallet, no signMessage). */
export function setChatSigner(s: ChatSigner | null): void {
  wanted.signer = s;
  source?.setSigner(s);
}

/** "stage" while the viewer's entry is in the current round, "stands" otherwise. */
export function setChatSeat(seat: "stage" | "stands"): void {
  wanted.seat = seat;
  source?.setSeat(seat);
}

/** Asks for the wallet signature now (a "Join the talk" button), instead of at the first line. */
export function signInToChat(): Promise<SendResult> {
  return room().source.signIn();
}

/** The room's view of a saved profile (lib/profile.ts). */
export function chatProfileOf(p: Pick<Profile, "pubkey" | "nickname" | "species" | "scarf" | "genesis">): ChatProfile {
  return { id: p.pubkey, nickname: p.nickname, species: p.species, scarf: scarfHex(p.scarf), genesis: p.genesis };
}
