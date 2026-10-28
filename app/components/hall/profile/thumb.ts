import { scarfIdOf, type Species } from "../../../lib/profile";

/**
 * v21.1 (§7.14): the 64 px portrait thumbs (scripts/make-pet-thumbs.mjs), so a
 * chat of 200 rows decodes at most 72 small files. `scarf` is a scarf id or
 * its hex.
 */
export const thumbUrl = (species: Species, scarf: string) => `/assets/pets/thumb/${species}-${scarfIdOf(scarf)}.webp`;
