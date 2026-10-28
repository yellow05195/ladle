/**
 * The cast (v20): Kenney Cube Pets (CC0), 12 launch species, each with a
 * procedural scarf in the player's identity colour. Species and colour are
 * identities (a hash of the owner, or the profile's choice), never a result.
 */
import { SPECIES, type Species } from "../../lib/profile";
import { M } from "./assets";

export { SPECIES };
export type { Species };

export const petUrl = (s: Species) => M(`kenney-cube-pets/animal-${s}.glb`);

/** Scarf seam height as a fraction of the character's height (the body cube's lower third, under the face). */
export const SCARF_Y: Partial<Record<Species, number>> = { fox: 0.3, chick: 0.3, bee: 0.32, penguin: 0.32, elephant: 0.3, pig: 0.3, koala: 0.3, panda: 0.33, polar: 0.31, cow: 0.29, bunny: 0.3, cat: 0.32 };
export const scarfY = (s: Species) => SCARF_Y[s] ?? 0.32;

/** FNV-1a: a stable species for a wallet that has no profile here. */
export function speciesOf(owner: Uint8Array | string): Species {
  let h = 0x811c9dc5;
  if (typeof owner === "string") for (let i = 0; i < owner.length; i++) { h ^= owner.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  else for (let i = 0; i < owner.length; i++) { h ^= owner[i]!; h = Math.imul(h, 0x01000193); }
  return SPECIES[(h >>> 0) % SPECIES.length]!;
}

/** A seeded number in [0, 1) from an owner (idle phase and pace). */
export function seed01(key: string, salt = 0): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ((h >>> 0) % 10007) / 10007;
}

export const portraitUrl = (s: Species, scarfId: string) => `/assets/pets/${s}-${scarfId}.webp`;
