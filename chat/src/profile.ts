/**
 * Profiles as the relay accepts them. The rule mirrors app/lib/profile.ts
 * (checkNickname, SPECIES, SCARVES, RESERVED); test/parity.test.ts reads
 * that file and fails when the two drift apart.
 *
 * On top of the app's rule, the room refuses nicknames that pose as the
 * house or its staff ("ladle_support", "admin2", "guest_..."): in a chat
 * the first scam is someone pretending to help.
 */
import { createHash } from "node:crypto";
import { SPECIES, type Species, type WireProfile, type ProfileInput } from "./protocol.ts";

export const SCARVES = [
  { id: "teal", hex: "#2EC4B6" },
  { id: "sky", hex: "#5AA9FF" },
  { id: "mint", hex: "#7ED957" },
  { id: "plum", hex: "#C77DFF" },
  { id: "tomato", hex: "#FF5A36" },
  { id: "saffron", hex: "#FFB21A" },
] as const;

export const RESERVED = ["ladle", "ladlefun", "you", "host", "bot", "house", "admin", "mod", "system"];
/** contained anywhere in a nickname: refused in the room (impersonation) */
export const POSES_AS = ["ladle", "admin", "support", "official", "moderator", "staff", "helpdesk"];
export const GENESIS_CAP = 1000;

export type NickVerdict = "ok" | "empty" | "chars" | "short" | "reserved";

export function checkNickname(nick: string): NickVerdict {
  if (!nick) return "empty";
  if (!/^[a-z0-9_]*$/.test(nick)) return "chars";
  if (nick.length < 3) return "short";
  if (nick.length > 16) return "chars";
  if (RESERVED.includes(nick)) return "reserved";
  if (POSES_AS.some((w) => nick.includes(w)) || nick.startsWith("guest")) return "reserved";
  return "ok";
}

export function scarfHexOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = SCARVES.find((x) => x.id === v || x.hex.toLowerCase() === v.toLowerCase());
  return s ? s.hex : null;
}

export type ProfileVerdict = { ok: true; profile: WireProfile } | { ok: false; code: "bad-profile" | "nickname-reserved" };

/** Validates what a client claims for its wallet. Genesis numbers are kept only when the relay is told to trust them. */
export function validateProfile(address: string, p: ProfileInput, trustGenesis: boolean): ProfileVerdict {
  const nickname = typeof p.nickname === "string" ? p.nickname : "";
  const n = checkNickname(nickname);
  if (n === "reserved") return { ok: false, code: "nickname-reserved" };
  if (n !== "ok") return { ok: false, code: "bad-profile" };
  if (typeof p.species !== "string" || !(SPECIES as readonly string[]).includes(p.species)) return { ok: false, code: "bad-profile" };
  const scarf = scarfHexOf(p.scarf);
  if (!scarf) return { ok: false, code: "bad-profile" };
  let genesis: number | null = null;
  if (trustGenesis && typeof p.genesis === "number" && Number.isInteger(p.genesis) && p.genesis >= 1 && p.genesis <= GENESIS_CAP) genesis = p.genesis;
  return { ok: true, profile: { id: address, nickname, species: p.species as Species, scarf, genesis } };
}

/** A spectator without a profile: a stable look from its id, a "guest_xxxx" tag. */
export function guestProfile(id: string): WireProfile {
  const h = createHash("sha256").update(id).digest();
  return {
    id,
    nickname: `guest_${id.slice(-4)}`,
    species: SPECIES[h[0]! % SPECIES.length]!,
    scarf: SCARVES[h[1]! % SCARVES.length]!.hex,
    genesis: null,
  };
}
