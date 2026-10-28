"use client";

/**
 * The hall canvas (v20): fixed, full viewport, mounted once by the (hall)
 * layout and kept while navigating between / and /play (each route is a
 * camera shot, never a remount). Picks the quality tier, mirrors the live
 * window into the scene's bus, and falls back to the poster when WebGL is
 * missing. A CSS vignette sits over the canvas; the veil above it is dimmed
 * by the home's scroll tour (v21) for its last stop; the DOM name tags are
 * projected into #hall-tags.
 */
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLive } from "../live/LiveProvider";
import { useProfile } from "./profile/ProfileProvider";
import { hall, hallBus, useHall, type Quality } from "./store";
import { stage } from "./stage";
import { scarfHex } from "../../lib/profile";
import { TagsList } from "./Tags";
import { usePresence } from "../../lib/chat";
import { getDataSource } from "../../lib/data";

const HallWorld = dynamic(() => import("./HallWorld"), { ssr: false });

export function detectQuality(): Quality {
  try {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q === "high" || q === "mid" || q === "low" || q === "none") return q;
  } catch { /* no URL */ }
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "none";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    if (/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(r)) return "low";
    const phone = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4;
    return phone ? "mid" : "high";
  } catch { return "none"; }
}

/** Mirrors the live window and the viewer's identity into the scene. */
function HallBridge() {
  const { w } = useLive();
  const { profile } = useProfile();
  useEffect(() => {
    hallBus.myName = profile?.nickname ?? "you";
    stage.sim.nameOf = (l, m) => (m ? hallBus.myName : l);
    stage.sim.myColor = profile ? scarfHex(profile.scarf) : null;
    hall.set({ me: profile ? { pubkey: profile.pubkey, nickname: profile.nickname, species: profile.species, scarf: scarfHex(profile.scarf), genesis: profile.genesis } : null });
  }, [profile]);
  useEffect(() => {
    if (!w) return;
    hallBus.w = w;
    hallBus.version++;
    hall.markLoaded("data");
  }, [w]);
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
  const scroll = useHall((s) => s.scroll);
  const visibleH = useHall((s) => s.visibleH);
  const path = usePathname();
  const route = compact ? "embed" : path?.startsWith("/play") ? "play" : "home";

  useEffect(() => {
    let quality = detectQuality();
    if (compact && quality === "high") quality = "mid";
    if (compact && window.innerWidth < 360) quality = "none";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stage.reduced = reduced;
    hall.set({ quality, reduced });
    setQ(quality);
    setPhone(window.innerWidth < 768);
    if (quality === "none") { hall.markLoaded("env"); hall.markLoaded("shell"); hall.markLoaded("cradle"); hall.markLoaded("cast"); }
    const onResize = () => setPhone(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    // the scroll state: 1 below 40 % of the viewport, 2 past two viewport heights (read once per frame, never inside the event)
    let raf = 0;
    const read = () => {
      raf = 0;
      const y = window.scrollY, h = window.innerHeight;
      hall.set({ scroll: y > h * 2 ? 2 : y > h * 0.4 ? 1 : 0 });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  return (
    <>
    <TagsList />
    <div className={`hall-stage ${compact ? "compact" : ""}`} data-scroll={scroll} data-route={route} aria-hidden="true">
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
