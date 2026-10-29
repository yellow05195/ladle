/**
 * The house's characters on the inner pages (v25.1): the cube pets of the hall, from their own portraits
 * (public/assets/pets: the 3D models rendered with their scarves), standing on a soft floor shadow and breathing a
 * few pixels (none under reduced motion). Pure decoration: aria-hidden, empty alts, lazy, sized (no layout shift).
 * Four ways in, so no page repeats one template: a small cast at the end of a page head, a few peeking over the top
 * edge of the block they wrap, one presenting under a column's copy, and a window onto the hall itself.
 * Server-safe (no hooks): server pages and client components share it. Styles: app/deco.css.
 */
import type { CSSProperties, ReactNode } from "react";
import { SCARVES, SPECIES, type ScarfId } from "../../lib/profile";

export type Species = (typeof SPECIES)[number];
export type PetRef = readonly [Species, ScarfId];

const url = ([s, c]: PetRef) => `/assets/pets/${s}-${c}.webp`;

/** The hall's species for an owner (components/hall/pets.ts speciesOf, FNV-1a over the key's bytes), kept here so a page needs no 3D module. */
export function speciesFor(owner: Uint8Array): Species {
  let h = 0x811c9dc5;
  for (let i = 0; i < owner.length; i++) { h ^= owner[i]!; h = Math.imul(h, 0x01000193); }
  return SPECIES[(h >>> 0) % SPECIES.length]!;
}

/** A player colour (lib/colors: the same six hexes as the scarves) as its scarf. */
export function scarfFor(hex: string): ScarfId {
  return (SCARVES.find((s) => s.hex.toLowerCase() === hex.toLowerCase())?.id ?? "saffron") as ScarfId;
}

function Pet({ p, size, i = 0, flip = false }: { p: PetRef; size: number; i?: number; flip?: boolean }) {
  return (
    <span className="dc-pet" style={{ "--s": `${size}px`, "--i": i } as CSSProperties} data-flip={flip ? "" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url(p)} alt="" width={size} height={size} loading="lazy" decoding="async" />
    </span>
  );
}

/** A cast's heights by distance from its middle: the middle one tallest, the ends smaller (a group, not a row of equals). */
const CAST_SCALE = [1, 0.84, 0.72];

/** A small cast standing on the bottom edge of a page head, at its right end (wide screens; hidden on phones). */
export function HeadCast({ pets, size = 132 }: { pets: readonly PetRef[]; size?: number }) {
  const mid = Math.floor(pets.length / 2);
  return (
    <div className="dc-head" aria-hidden="true">
      {pets.map((p, i) => <Pet key={i} p={p} i={i} size={Math.round(size * (CAST_SCALE[Math.abs(i - mid)] ?? 0.66))} flip={i > mid} />)}
    </div>
  );
}

/** A few characters peeking over the top edge of the block they wrap (they stand behind it). */
export function Peek({ pets, children, at = "right", size = 76 }: { pets: readonly PetRef[]; children: ReactNode; at?: "left" | "right"; size?: number }) {
  return (
    <div className="dc-peek-wrap">
      <div className={`dc-peek ${at}`} aria-hidden="true">
        {pets.map((p, i) => <Pet key={i} p={p} i={i + 1} size={Math.round(size * (i % 2 ? 0.86 : 1))} flip={at === "left" ? i % 2 === 0 : i % 2 === 1} />)}
      </div>
      <div className="dc-peek-body">{children}</div>
    </div>
  );
}

/** One character under a column's copy, turned towards the content. */
export function Presenter({ pet, size = 136, flip = false }: { pet: PetRef; size?: number; flip?: boolean }) {
  return <div className="dc-present" aria-hidden="true"><Pet p={pet} size={size} i={2} flip={flip} /></div>;
}

/** A window onto the hall: one of its renders (public/art), framed like the room's plates. */
export function HallWindow({ src }: { src: "join" | "seal" | "draw" | "serve" | "velvet" }) {
  return (
    <figure className="dc-window" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/art/${src}.webp`} alt="" width={640} height={400} loading="lazy" decoding="async" />
    </figure>
  );
}
