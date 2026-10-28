/**
 * Camera shots (v20): one PerspectiveCamera, five framings. Every route is a
 * shot on the one persistent canvas, never a remount. Starting values from
 * the spec, tuned by capture.
 */
export type ShotName = "emblem" | "home" | "seat" | "room" | "reveal";

export interface ShotDef { pos: [number, number, number]; look: [number, number, number]; fov: number; fovPhone: number; posPhone?: [number, number, number]; lookPhone?: [number, number, number] }

export const SHOTS: Record<ShotName, ShotDef> = {
  emblem: { pos: [0, 5.15, 4.2], look: [0, 5.15, 0], fov: 30, fovPhone: 38 },
  // v21 fix: the home from the front right (the drum and the felt crowd right of the playbill, the left of the frame on the
  // room's dark side; searched on a 50-player room, screenshots/v21/fix-tour3d/home-search.mjs); phones from the front left,
  // closer and lower, so the drum and the crowd fill the band above the playbill (the cage about 40 % of the width)
  home: { pos: [3.94, 5.11, 10.11], look: [-0.52, 2.29, 0.4], fov: 30, fovPhone: 60, posPhone: [-4.24, 4.69, 8.56], lookPhone: [0.42, 2.13, 0.21] },
  seat: { pos: [-1.6, 3.2, 7.6], look: [-1.2, 1.4, 2.6], fov: 30, fovPhone: 44 },
  room: { pos: [0, 5.2, 10.9], look: [0, 1.7, 0], fov: 30, fovPhone: 60 },
  reveal: { pos: [0, 5.1, 10.8], look: [0, 2.75, 0], fov: 30, fovPhone: 60 },
};

/** Phones stand further back so the ring fits the narrow frame. */
/** Phones keep the camera inside the room (the wall is at r 13) and widen the lens instead. */
export const PHONE_PULL: Record<ShotName, number> = { emblem: 1, home: 1, seat: 1.1, room: 1.05, reveal: 1.05 };

/** Transition durations (ms) into a shot. */
export const MOVE_MS: Record<ShotName, number> = { emblem: 0, home: 1200, seat: 1000, room: 1000, reveal: 700 };
