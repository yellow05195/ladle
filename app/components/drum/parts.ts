/**
 * The drum's geometry (v16 shapes, shared in v17 by the hero scene and the
 * art stills): the sphere cage, the A-frame stand, the wire chute. Built
 * once, merged, so each is one draw call.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CAGE_Y, CHUTE_Y0, CHUTE_Y1, R, WIRE } from "./drum-sim";

export const LEG_X = 1.2;
export const BASE_TOP = CAGE_Y - 1.36;
export const FLOOR = BASE_TOP - 0.06;


/**
 * The cage (v21): six meridians through the hubs and six latitude hoops. No
 * hoop crosses the top at x = 0, so a ball dropping from the chute falls
 * through a clear gap between the two central hoops instead of through a wire.
 */
export function cageGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) parts.push(new THREE.TorusGeometry(R, WIRE, 6, 112).rotateX((k * Math.PI) / 6));
  for (const s of [-0.86, -0.56, -0.22, 0.22, 0.56, 0.86]) {
    const r = Math.sqrt(R * R - s * s);
    parts.push(new THREE.TorusGeometry(r, WIRE * (Math.abs(s) < 0.3 ? 1.1 : 0.85), 6, 96).rotateY(Math.PI / 2).translate(s, 0, 0));
  }
  for (const sx of [-1, 1]) parts.push(new THREE.CylinderGeometry(0.13, 0.13, 0.035, 40).rotateZ(Math.PI / 2).translate(sx * (R - 0.01), 0, 0));
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  parts.forEach((p) => p.dispose());
  return g;
}

export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 16);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** The stand: two A-frames into their bearings, the chute bracket. Fixed to the rig. */
export function standGeometry(): THREE.BufferGeometry {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    parts.push(rod(V(sx * LEG_X, CAGE_Y, 0), V(sx * (LEG_X + 0.04), BASE_TOP, 0.34), 0.03));
    parts.push(rod(V(sx * LEG_X, CAGE_Y, 0), V(sx * (LEG_X + 0.04), BASE_TOP, -0.34), 0.03));
    parts.push(rod(V(sx * (LEG_X + 0.03), BASE_TOP + 0.32, 0.25), V(sx * (LEG_X + 0.03), BASE_TOP + 0.32, -0.25), 0.018));
    for (const z of [0.34, -0.34]) parts.push(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 24).translate(sx * (LEG_X + 0.04), BASE_TOP + 0.015, z));
  }
  // the chute bracket: up the left leg, across to the chute
  const top = CAGE_Y + CHUTE_Y0 + 0.36;
  parts.push(rod(V(-LEG_X, CAGE_Y + 0.08, 0), V(-LEG_X, top, 0), 0.02));
  parts.push(rod(V(-LEG_X, top, 0), V(-0.22, top, 0), 0.02));
  parts.push(new THREE.SphereGeometry(0.03, 16, 12).translate(-LEG_X, top, 0));
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  parts.forEach((p) => p.dispose());
  return g;
}

/** The chute: two rings and four rods, a funnel ring. Fixed to the rig. */
export function chuteGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const y0 = CAGE_Y + CHUTE_Y0 + 0.02, y1 = CAGE_Y + CHUTE_Y1, cr = 0.21;
  parts.push(new THREE.TorusGeometry(cr, 0.014, 8, 64).rotateX(Math.PI / 2).translate(0, y0, 0));
  parts.push(new THREE.TorusGeometry(cr, 0.014, 8, 64).rotateX(Math.PI / 2).translate(0, y1, 0));
  parts.push(new THREE.TorusGeometry(cr + 0.09, 0.016, 8, 72).rotateX(Math.PI / 2).translate(0, y1 + 0.14, 0));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const c = Math.cos(a), s = Math.sin(a);
    parts.push(rod(new THREE.Vector3(c * cr, y0, s * cr), new THREE.Vector3(c * cr, y1, s * cr), 0.01));
    parts.push(rod(new THREE.Vector3(c * cr, y1, s * cr), new THREE.Vector3(c * (cr + 0.09), y1 + 0.14, s * (cr + 0.09)), 0.01));
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  parts.forEach((p) => p.dispose());
  return g;
}

