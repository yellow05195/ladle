"use client";

/**
 * The hall canvas (v20): fixed, full viewport, mounted once by the (hall)
 * layout and kept while navigating between / and /play (each route is a
 * camera shot, never a remount). Picks the quality tier, mirrors the live
 * window into the scene's bus, and falls back to the poster when WebGL is
 * missing (perf v21.4: or the GPU is a software one, quality.ts). A CSS
 * vignette sits over the canvas; the veil above it is the scroll tour's (a
 * cut behind it on a long jump, its dip under reduced motion: TourDriver;
 * never the scroll's speed); the DOM name tags are projected into #hall-tags.
 *
 * v21.3: nothing here re-renders on a scroll or a live tick. The scroll state
 * (0 at the top, 1 past 40 % of the viewport, 2 past two heights) comes from
 * the hall's one scroll reader (tour/scroll.ts) into the store and onto the
 * stage's data-scroll directly; the live window is mirrored into the scene's
 * bus by a subscription, not a render. A re-render here used to re-render
 * the whole 3D tree and reset its pixel ratio.
 */
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLiveEffect } from "../live/LiveProvider";
import { useProfile } from "./profile/ProfileProvider";
import { hall, hallBus, useHall, type Quality } from "./store";
import { stage } from "./stage";
import { scarfHex } from "../../lib/profile";
import { TagsList } from "./Tags";
import { usePresence } from "../../lib/chat";
import { getDataSource } from "../../lib/data";
import { onScrollY, scrollState } from "./tour/scroll";
import { detectQuality, preloadQuality } from "./quality";

const HallWorld = dynamic(() => import("./HallWorld"), { ssr: false });

// fix:1 (T7): the GPU is asked from this module's load (beside the hydration), not from the effect below (after it)
preloadQuality();

/** Mirrors the live window and the viewer's identity into the scene. */
function HallBridge() {
  const { profile } = useProfile();
  useEffect(() => {
    hallBus.myName = profile?.nickname ?? "you";
    stage.sim.nameOf = (l, m) => (m ? hallBus.myName : l);
    stage.sim.myColor = profile ? scarfHex(profile.scarf) : null;
    hall.set({ me: profile ? { pubkey: profile.pubkey, nickname: profile.nickname, species: profile.species, scarf: scarfHex(profile.scarf), genesis: profile.genesis } : null });
  }, [profile]);
  // every live window, into the scene's bus (no render)
  useLiveEffect((w) => {
    if (!w) return;
    hallBus.w = w;
    hallBus.version++;
    hall.markLoaded("data");
  });
  // dev captures enter a round through the data source (screenshots/v21/hall/shoot-you.mjs)
  useEffect(() => { if (process.env.NODE_ENV !== "production") (window as unknown as { __ds?: unknown }).__ds = getDataSource(); }, []);
  // the room's spectators (lib/chat), seated in the stands by Cast
  const present = usePresence();
  useEffect(() => {
    hallBus.present = present;
    hallBus.presentVersion++;
  }, [present]);
  return null;
}

export function HallCanvas({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState<Quality | null>(null);
  const [phone, setPhone] = useState(false);
  const glReady0 = useHall((s) => s.glReady);
  // v21 fix: the embed has no loader in front of it: it keeps its poster until the room is dressed (the environment,
  // the cradle and the first characters), then cross-fades the canvas in, never a bare cage over a grey floor
  const dressed = useHall((s) => s.loaded.env && s.loaded.cradle && s.loaded.cast);
  const glReady = glReady0 && (!compact || dressed);
  const visibleH = useHall((s) => s.visibleH);
  const path = usePathname();
  const route = compact ? "embed" : path?.startsWith("/play") ? "play" : "home";
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stage.reduced = reduced;
    hall.set({ reduced });
    setPhone(window.innerWidth < 768);
    // perf v21.4 (F5): the GPU is asked in a worker (quality.ts): a software renderer gets the poster, never a second context
    void detectQuality().then((q0) => {
      if (!alive) return;
      if (process.env.NODE_ENV !== "production") performance.mark("hall:quality");
      let quality = q0;
      if (compact && quality === "high") quality = "mid";
      if (compact && window.innerWidth < 360) quality = "none";
      hall.set({ quality });
      setQ(quality);
      if (quality === "none") { hall.markLoaded("env"); hall.markLoaded("shell"); hall.markLoaded("cradle"); hall.markLoaded("cast"); }
    });
    const onResize = () => setPhone(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    // the scroll state: 1 below 40 % of the viewport, 2 past two viewport heights (from the one scroll reader: no layout
    // read, no React render; the stage's data-scroll is written here, the store only changes at a threshold)
    const off = onScrollY((y) => {
      const h = scrollState.vh || 800;
      const v = y > h * 2 ? 2 : y > h * 0.4 ? 1 : 0;
      const el = stageRef.current;
      if (el && el.dataset.scroll !== String(v)) el.dataset.scroll = String(v);
      hall.set({ scroll: v });
    });
    return () => { alive = false; window.removeEventListener("resize", onResize); off(); };
  }, []);
  // v25.1: the paced low tier gives up on a machine that cannot hold it (HallWorld FrameDriver sets the store's quality
  // to none): the poster, and the canvas with its context goes
  const fellBack = useHall((s) => s.quality === "none");
  useEffect(() => { if (fellBack && q && q !== "none") setQ("none"); }, [fellBack, q]);

  return (
    <>
    <TagsList />
    <div ref={stageRef} className={`hall-stage ${compact ? "compact" : ""}`} data-scroll="0" data-route={route} aria-hidden="true">
      <HallBridge />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`hall-poster ${glReady && q !== "none" ? "gone" : ""}`} src={phone ? "/hall-poster-mobile.webp" : "/hall-poster.webp"} alt="" decoding="async" style={phone && visibleH ? { height: visibleH, objectPosition: "50% 40%" } : undefined} />
      {q && q !== "none" ? <div className={`hall-canvas ${glReady ? "on" : ""}`}><HallWorld quality={q} phone={phone} compact={compact} /></div> : null}
      <div className="hall-vignette" />
      <div className="hall-scrims"><i className="s-top" /><i className="s-home" /><i className="s-chat" /><i className="s-instr" /><i className="s-bottom" /></div>
      <div id="hall-tags" className="hall-tags" />
      <div className="hall-veil" />
    </div>
    </>
  );
}
