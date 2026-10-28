/**
 * Profiles (v20): one per wallet, kept in this browser.
 *
 *   localStorage["ladle.profile.v1:{pubkey}"]  the profile (below)
 *   localStorage["ladle.nick"]                 the last nickname typed on the home
 *   localStorage["ladle.demoWallet"]           the demo wallet's random seed (demo mode only)
 *   sessionStorage["ladle.loaded"]             the loader has played this session
 *
 * Every read and write is wrapped: a private window may refuse storage, and
 * then the profile lives in memory for the tab. A profile is created by
 * signing a plain message (no transaction, no SOL); a wallet without
 * signMessage, or the demo wallet, saves it unsigned.
 *
 * Genesis numbers are cosmetic: they mark when a profile arrived and carry
 * no reward, allocation or share. Without a profile registry (chain mode
 * with NEXT_PUBLIC_PROFILE_API unset) there is no Genesis number at all.
 */
import { base58 } from "./format";

export const SPECIES = ["fox", "cat", "bunny", "panda", "penguin", "koala", "polar", "chick", "pig", "cow", "elephant", "bee"] as const;
export type Species = (typeof SPECIES)[number];

export const SCARVES = [
  { id: "teal", hex: "#2EC4B6" },
  { id: "sky", hex: "#5AA9FF" },
  { id: "mint", hex: "#7ED957" },
  { id: "plum", hex: "#C77DFF" },
  { id: "tomato", hex: "#FF5A36" },
  { id: "saffron", hex: "#FFB21A" },
] as const;
export type ScarfId = (typeof SCARVES)[number]["id"];
export const scarfHex = (id: string) => SCARVES.find((s) => s.id === id)?.hex ?? id;
export const scarfIdOf = (v: string): ScarfId => (SCARVES.find((s) => s.id === v || s.hex.toLowerCase() === v.toLowerCase())?.id ?? "saffron") as ScarfId;

export type Hat = "none" | "toque" | "bowler" | "cap" | "beanie";

export interface Profile {
  v: 1;
  pubkey: string;
  nickname: string;
  species: Species;
  /** hex of one of the six identity colours */
  scarf: string;
  hat: Hat;
  genesis: number | null;
  ordinal: number | null;
  createdAt: string;
  message: string;
  signature: string | null;
  source: "demo" | "chain";
}

export const GENESIS_CAP = 1000;
export const RESERVED = ["ladle", "ladlefun", "you", "host", "bot", "house", "admin", "mod", "system"];
const KEY = (pk: string) => `ladle.profile.v1:${pk}`;

const memory = new Map<string, string>();
let storageOk: boolean | null = null;

/** Does this browser keep what we store? (false in some private windows) */
export function storageWorks(): boolean {
  if (storageOk !== null) return storageOk;
  try {
    const k = "ladle.__probe";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    storageOk = true;
  } catch { storageOk = false; }
  return storageOk;
}

function get(k: string): string | null {
  try { const v = window.localStorage.getItem(k); if (v !== null) return v; } catch { /* refused */ }
  return memory.get(k) ?? null;
}
function set(k: string, v: string): void {
  memory.set(k, v);
  try { window.localStorage.setItem(k, v); } catch { /* refused: memory keeps it for the tab */ }
}

export function loadProfile(pubkey: string): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = get(KEY(pubkey));
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Profile;
    return p && p.v === 1 && p.pubkey === pubkey ? p : null;
  } catch { return null; }
}

export function saveProfile(p: Profile): void {
  set(KEY(p.pubkey), JSON.stringify(p));
  try { window.dispatchEvent(new CustomEvent("ladle:profile", { detail: p.pubkey })); } catch { /* no window */ }
}

/** Every profile this browser keeps (creation order). */
export function listLocalProfiles(): Profile[] {
  if (typeof window === "undefined") return [];
  const out: Profile[] = [];
  const keys = new Set<string>(memory.keys());
  try { for (let i = 0; i < window.localStorage.length; i++) { const k = window.localStorage.key(i); if (k) keys.add(k); } } catch { /* refused */ }
  for (const k of keys) {
    if (!k.startsWith("ladle.profile.v1:")) continue;
    try { const p = JSON.parse(get(k) ?? "") as Profile; if (p?.v === 1) out.push(p); } catch { /* skip */ }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function countLocalProfiles(): number {
  return listLocalProfiles().filter((p) => p.source === "demo").length;
}

/** The most recently created profile in this browser (the loader's peek). */
export function lastLocalProfile(): Profile | null {
  const all = listLocalProfiles();
  return all.length ? all[all.length - 1]! : null;
}

export function getNick(): string {
  if (typeof window === "undefined") return "";
  return get("ladle.nick") ?? "";
}
export function setNick(n: string): void { set("ladle.nick", n); }

export type NickState = "ok" | "short" | "chars" | "reserved" | "taken" | "empty";

/** `^[a-z0-9_]{3,16}$`, not reserved, not taken by a demo player or another profile of this browser. */
export function checkNickname(nick: string, taken: (n: string) => boolean = () => false): NickState {
  if (!nick) return "empty";
  if (!/^[a-z0-9_]*$/.test(nick)) return "chars";
  if (nick.length < 3) return "short";
  if (nick.length > 16) return "chars";
  if (RESERVED.includes(nick)) return "reserved";
  if (taken(nick)) return "taken";
  return "ok";
}

/** Lower-cases and drops what the rule never accepts (spaces become _). */
export function cleanNickname(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 16);
}

export function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  try { crypto.getRandomValues(b); } catch { for (let i = 0; i < bytes; i++) b[i] = Math.floor(Math.random() * 256); }
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** The exact text a wallet signs to create a profile. */
export function profileMessage(p: { pubkey: string; nickname: string; species: string; scarf: string; hat: string; issued: string; nonce: string }): string {
  return [
    "Ladle profile",
    `wallet: ${p.pubkey}`,
    `nickname: ${p.nickname}`,
    `character: ${p.species} · scarf ${p.scarf} · hat ${p.hat}`,
    `issued: ${p.issued}`,
    `nonce: ${p.nonce}`,
    "This signature creates a profile. It moves no SOL and is not a transaction.",
  ].join("\n");
}

/** The demo wallet: a pubkey-shaped id from a random seed kept in this browser. Nothing on Solana. */
export function demoWalletKey(): string {
  let seed = get("ladle.demoWallet");
  if (!seed || !/^[0-9a-f]{64}$/.test(seed)) { seed = randomHex(32); set("ladle.demoWallet", seed); }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(seed.slice(i * 2, i * 2 + 2), 16);
  return base58(bytes);
}

export function shortPubkey(pk: string): string {
  return pk.length > 9 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}

/** Genesis numbers exist only where a count exists: the demo, or a live profile registry. */
export function genesisAvailable(source: "demo" | "chain"): boolean {
  return source === "demo" || !!process.env.NEXT_PUBLIC_PROFILE_API;
}

export function formatGenesis(n: number): string {
  return `#${String(n).padStart(4, "0")}`;
}
