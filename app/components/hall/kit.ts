/**
 * The low-poly construction kit of the square (v19, the hall shell in v20), after Ponsdonate's
 * engine/kit.js: coloured primitives placed by their bottom-centre, merged
 * into ONE flat-shaded geometry with vertex colours (no textures anywhere).
 * A whole static scene is one or two draw calls.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const tmp = new THREE.Color();

export interface PlaceOpts { rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number; pivot?: "bottom" | "center"; seg?: number; ws?: number; hs?: number; detail?: number }

/** Fills a geometry's colour attribute with one flat colour (sRGB hex, stored linear). */
export function paint(geo: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  tmp.set(color);
  const n = geo.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b; }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(arr, 3));
  return geo;
}

/** A triangular prism (a roof): width w along x, height h, depth d along z, ridge along z. */
function prism(w: number, h: number, d: number): THREE.BufferGeometry {
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const a = [x0, 0, z0], b = [x1, 0, z0], c = [x1, 0, z1], e = [x0, 0, z1], t0 = [0, h, z0], t1 = [0, h, z1];
  const tris = [[a, t0, b], [c, t1, e], [a, e, t1], [a, t1, t0], [b, t0, t1], [b, t1, c], [a, b, c], [a, c, e]];
  const pos: number[] = [];
  for (const t of tris) for (const v of t) pos.push(...(v as number[]));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export class Builder {
  geos: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, o: PlaceOpts = {}): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    g.deleteAttribute("uv");
    g.deleteAttribute("normal");
    if (o.pivot !== "center") { g.computeBoundingBox(); g.translate(0, -g.boundingBox!.min.y, 0); }
    if (o.sx !== undefined || o.sy !== undefined || o.sz !== undefined) g.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    if (o.rx || o.ry || o.rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)));
    g.translate(x, y, z);
    this.geos.push(paint(g, color));
    return this;
  }

  box(w: number, h: number, d: number, c: string, x = 0, y = 0, z = 0, o?: PlaceOpts) { return this.add(new THREE.BoxGeometry(w, h, d), c, x, y, z, o); }
  cyl(rt: number, rb: number, h: number, c: string, x = 0, y = 0, z = 0, o: PlaceOpts = {}) { return this.add(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 8), c, x, y, z, o); }
  cone(r: number, h: number, c: string, x = 0, y = 0, z = 0, o: PlaceOpts = {}) { return this.add(new THREE.ConeGeometry(r, h, o.seg ?? 8), c, x, y, z, o); }
  sphere(r: number, c: string, x = 0, y = 0, z = 0, o: PlaceOpts = {}) { return this.add(new THREE.SphereGeometry(r, o.ws ?? 8, o.hs ?? 6), c, x, y, z, o); }
  rock(r: number, c: string, x = 0, y = 0, z = 0, o: PlaceOpts = {}) { return this.add(new THREE.IcosahedronGeometry(r, o.detail ?? 0), c, x, y, z, o); }
  /** A flat ring lying on the ground (torus laid down). */
  ring(r: number, t: number, c: string, x = 0, y = 0, z = 0, o: PlaceOpts = {}) { return this.add(new THREE.TorusGeometry(r, t, 4, o.seg ?? 16), c, x, y, z, { ...o, pivot: "center", rx: Math.PI / 2 }); }
  /** A horizontal quad facing up. */
  slab(w: number, d: number, c: string, x = 0, y = 0, z = 0, o: PlaceOpts = {}) { return this.add(new THREE.PlaneGeometry(w, d), c, x, y, z, { ...o, pivot: "center", rx: -Math.PI / 2 + (o.rx ?? 0) }); }
  prism(w: number, h: number, d: number, c: string, x = 0, y = 0, z = 0, o?: PlaceOpts) { return this.add(prism(w, h, d), c, x, y, z, o); }
  lathe(points: Array<[number, number]>, c: string, x = 0, y = 0, z = 0, o: PlaceOpts = {}) {
    return this.add(new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), o.seg ?? 12), c, x, y, z, { ...o, pivot: o.pivot ?? "center" });
  }

  /** Merges another builder's parts into this one, rotated about y then moved. */
  include(other: Builder, x = 0, y = 0, z = 0, ry = 0, s = 1): this {
    const m = new THREE.Matrix4().makeRotationY(ry);
    if (s !== 1) m.multiply(new THREE.Matrix4().makeScale(s, s, s));
    m.setPosition(x, y, z);
    for (const g of other.geos) this.geos.push(g.clone().applyMatrix4(m));
    return this;
  }

  /** One merged, non-indexed geometry with flat normals and vertex colours. */
  geometry(): THREE.BufferGeometry {
    if (!this.geos.length) return new THREE.BufferGeometry();
    const g = mergeGeometries(this.geos, false)!;
    g.computeVertexNormals();
    return g;
  }
  mesh(material: THREE.Material): THREE.Mesh { return new THREE.Mesh(this.geometry(), material); }
  tris(): number { return this.geos.reduce((n, g) => n + g.attributes.position!.count / 3, 0); }
}

/** A small deterministic PRNG (the scenery is the same on every visit). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
}
