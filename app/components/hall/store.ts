"use client";

/**
 * The hall's shared state (v20): one small external store read by the 3D
 * scene (in useFrame, without re-rendering) and by the DOM HUD (through
 * useHall). The live window itself is NOT here: it comes from LiveProvider
 * and is mirrored into `hallBus` for the scene.
 */
import { useSyncExternalStore } from "react";
import type { LiveWindow } from "../../lib/data/types";
import type { Species } from "../../lib/profile";
import type { Presence } from "../../lib/chat/types";

export type Shot = "emblem" | "home" | "seat" | "room" | "reveal";
export type Quality = "high" | "mid" | "low" | "none";
export type LoadKey = "fonts" | "env" | "shell" | "cradle" | "cast" | "data";

export const LOAD_WEIGHTS: Record<LoadKey, number> = { fonts: 0.1, env: 0.2, shell: 0.25, cradle: 0.15, cast: 0.15, data: 0.15 };

export interface Me { pubkey: string; nickname: string; species: Species; scarf: string; genesis: number | null }

export interface RevealState {
  /** the window id being revealed */
  id: string;
  /** performance.now() at the decisive turn */
  t0: number;
  /** entry indexes whose tag has flipped (arrival order) */
  flipped: number;
  done: boolean;
}

export interface HallState {
  shot: Shot;
  quality: Quality;
  loaded: Record<LoadKey, boolean>;
  dataFailed: boolean;
  glReady: boolean;
  /** the loader has finished (lights up) */
  lit: boolean;
  /** 0 at the top, 1 when scrolled past 40 % of the viewport, 2 past two viewport heights */
  scroll: 0 | 1 | 2;
  /** a modal with its own canvas is open: the hall pauses */
  paused: boolean;
  me: Me | null;
  /** my character is walking in (seat step) */
  arriving: number;
  reveal: RevealState | null;
  reduced: boolean;
  /** phone layout: px of canvas visible above the bottom sheet (0 = full) */
  visibleH: number;
  /** the bear waves (a counter: every change plays the clip once) */
  wave: number;
  /** spotlight boost for the served glow (performance.now() of the glow) */
  glowAt: number;
  /** the loader's SVG mark on screen: the emblem shot is solved so the 3D ladle takes its place */
  emblem: { cy: number; h: number } | null;
  /** v21 §7.5: the camera's horizontal framing, a fraction of the viewport width (positive moves the drum right); set by the HUD */
  viewShift: number;
  /** v21: px the scene is raised on screen (the /play dock keeps the floor under the drum clear) */
  viewLift: number;
  /** v21: px from the top where the visible band of canvas starts (phones and the stacked home; 0 = the top) */
  visibleTop: number;
  /** v21 §7.4: the screen box (CSS px) of the cage, cradle, hopper, chute and the ladle; published by the hall */
  drumRect: { x: number; y: number; w: number; h: number } | null;
  /** v21: the home's scroll tour is mounted (the hall keeps its full frame rate below the fold) */
  tour: boolean;
}

const initial: HallState = {
  shot: "home",
  quality: "high",
  loaded: { fonts: false, env: false, shell: false, cradle: false, cast: false, data: false },
  dataFailed: false,
  glReady: false,
  lit: false,
  scroll: 0,
  paused: false,
  me: null,
  arriving: 0,
  reveal: null,
  reduced: false,
  visibleH: 0,
  wave: 0,
  glowAt: 0,
  emblem: null,
  viewShift: 0,
  viewLift: 0,
  visibleTop: 0,
  drumRect: null,
  tour: false,
};

let state: HallState = initial;
const listeners = new Set<() => void>();

export const hall = {
  get: () => state,
  set(patch: Partial<HallState> | ((s: HallState) => Partial<HallState>)) {
    const p = typeof patch === "function" ? patch(state) : patch;
    let changed = false;
    for (const k in p) if ((p as Record<string, unknown>)[k] !== (state as unknown as Record<string, unknown>)[k]) { changed = true; break; }
    if (!changed) return;
    state = { ...state, ...p };
    listeners.forEach((l) => l());
  },
  markLoaded(k: LoadKey) {
    if (state.loaded[k]) return;
    hall.set({ loaded: { ...state.loaded, [k]: true } });
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export function progressOf(s: HallState): number {
  let p = 0;
  for (const k of Object.keys(LOAD_WEIGHTS) as LoadKey[]) if (s.loaded[k]) p += LOAD_WEIGHTS[k];
  return Math.min(1, p + 1e-9);
}

export function useHall<T>(sel: (s: HallState) => T): T {
  return useSyncExternalStore(hall.subscribe, () => sel(state), () => sel(initial));
}

/** The live window and the room's presence, mirrored for the scene (written by HallBridge, read in useFrame). */
export const hallBus: { w: LiveWindow | null; myName: string; version: number; present: Presence[]; presentVersion: number } = { w: null, myName: "you", version: 0, present: [], presentVersion: 0 };

/** Name shown for an entry: the viewer's nickname for their own entry, the pseudonym otherwise. */
export function entryName(label: string, mine: boolean): string {
  return mine ? hallBus.myName : label;
}

// dev captures read the hall state (scripts/shoot-v20.mjs)
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") Object.assign(window as unknown as Record<string, unknown>, { __hall: hall, __hallBus: hallBus });
