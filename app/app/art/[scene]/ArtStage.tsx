"use client";

/**
 * Dev only (v20): the hall rendered at a fixed size on a demo round, for the
 * stills and posters (scripts/render-art.mjs captures the canvas). Every
 * still is the real scene, never a generated picture.
 *   poster, poster-mobile   the home shot, an open round
 *   join                    entries tossing their balls in
 *   seal                    the latch down, the cage braking
 *   draw                    the seed in, the decisive turn
 *   serve                   the ladle serving the balls in arrival order
 */
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { plan } from "../../../lib/data/demo-plan";
import { settle, multiplierOf } from "../../../lib/law-settle";
import { DEMO_LEDGER_CURVE } from "../../../lib/data/momentum";
import { toHex } from "../../../lib/format";
import type { LiveWindow } from "../../../lib/data/types";
import { hall, hallBus } from "../../../components/hall/store";
import { stage, T_SERVE } from "../../../components/hall/stage";

const HallWorld = dynamic(() => import("../../../components/hall/HallWorld"), { ssr: false });

export type ArtName = "poster" | "poster-mobile" | "join" | "seal" | "draw" | "serve";
export const SIZES: Record<ArtName, [number, number]> = { poster: [1600, 900], "poster-mobile": [750, 1000], join: [960, 600], seal: [960, 600], draw: [960, 600], serve: [960, 600] };

function demoWindow(phase: LiveWindow["phase"], count: number): LiveWindow {
  const pl = plan(1077);
  const entries = pl.entries.slice(0, count).map((e, i) => ({ index: i, owner: e.owner, label: e.label, amount: e.amount, mine: false, arrivedAt: i * 1500 }));
  const total = entries.reduce((a, e) => a + e.amount, 0n);
  const s = settle(pl.seed, entries.map((e) => ({ owner: e.owner, index: e.index, amount: e.amount })), DEMO_LEDGER_CURVE, 0n);
  const settled = phase === "settled";
  if (settled || phase === "seeded") entries.forEach((e, i) => { (e as { roll?: bigint }).roll = s.rolls[i]; if (settled) (e as { share?: bigint }).share = s.shares[i]; });
  void multiplierOf;
  return {
    id: `demo-art-${phase}`, mint: "DEMO", source: "demo", phase, openedAt: Date.now() - 12_000, closeAt: Date.now() + 8000, slotsTotal: 92,
    slotsRemaining: phase === "open" ? 40 : 0, slotMs: 217, slotsSinceSeal: 3, seedDelayMs: 2000, capBps: 2000n, hostFeeBps: 0n,
    entries, total, mineIndex: null, seedHex: phase === "open" || phase === "sealed" ? null : toHex(pl.seed), vrfAccount: null,
    settlement: settled ? { tokensOut: s.tokensOut, platformFee: s.platform, hostFee: s.host, toCurve: s.toCurve, myMultiplier: null, myShare: null, mySellBack: null, curveAfter: s.curveAfter } : null,
    soldFor: null, sibling: null,
  };
}

export function ArtStage({ name }: { name: ArtName }) {
  const [w, h] = SIZES[name];
  useEffect(() => {
    const shot = name === "poster" || name === "poster-mobile" ? "home" : name === "join" ? "room" : "reveal";
    hall.set({ lit: true, shot, quality: "high", reduced: false });
    const count = Math.min(plan(1077).entries.length, name === "poster" ? 14 : name === "poster-mobile" ? 8 : 10);
    const push = (win: LiveWindow) => { hallBus.w = win; hallBus.version++; };
    const done = () => { (window as unknown as { __artReady?: boolean }).__artReady = true; };
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    push(demoWindow("open", 1));
    // the timeline starts once the hall, the cradle and the cast are in (SwiftShader is slow)
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      if (name === "join" || name === "poster" || name === "poster-mobile") {
        const first = name === "join" ? count - 3 : count;
        push(demoWindow("open", first));
        const ready = () => {
          if (stage.castReady < first) { at(200, ready); return; }
          if (name === "join") { at(1500, () => { push(demoWindow("open", count)); at(420, done); }); return; }
          at(4200, done);
        };
        at(400, ready);
        return;
      }
      push(demoWindow("open", count));
      at(1800, () => push(demoWindow("sealed", count)));
      if (name === "seal") { at(1800 + 500, done); return; }
      at(2600, () => push(demoWindow("seeded", count)));
      at(3200, () => push(demoWindow("settled", count)));
      at(name === "draw" ? 3200 + 520 : 3200 + T_SERVE + 380, done);
    };
    const check = () => { const l = hall.get().loaded; if (l.shell && l.cradle && l.cast) start(); };
    const off = hall.subscribe(check);
    check();
    at(15000, start);
        return () => { off(); timers.forEach(clearTimeout); };
  }, [name]);
  return (
    <div style={{ width: w, height: h, position: "relative", background: "#0d0a08" }} data-art={name}>
      <HallWorld quality="high" phone={name === "poster-mobile"} />
    </div>
  );
}
