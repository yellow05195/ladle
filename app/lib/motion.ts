/**
 * The one motion system: GSAP + ScrollTrigger. power2.out for 0.5 s, power3.out
 * for 0.9 s, counters count by integers. Everything runs inside gsap.matchMedia
 * so that prefers-reduced-motion cuts it all.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

export const EASE = "power2.out";
export const EASE_SLOW = "power3.out";
/** The one set of durations (v12 §15.4), in seconds; the CSS uses the same values as --dur-1/2/3. */
export const D = { fast: 0.16, base: 0.32, slow: 0.56 } as const;
export const MOTION = "(prefers-reduced-motion: no-preference)";

let registered = false;
export function registerGsap(): void {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger, useGSAP);
  registered = true;
  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __gsap?: unknown; __ST?: unknown }).__gsap = gsap;
    (window as unknown as { __gsap?: unknown; __ST?: unknown }).__ST = ScrollTrigger;
  }
}

/** Runs `fn` only when motion is allowed; returns the matchMedia for cleanup. */
export function withMotion(fn: (ctx: gsap.Context) => void | (() => void)): gsap.MatchMedia {
  registerGsap();
  const mm = gsap.matchMedia();
  mm.add(MOTION, fn);
  return mm;
}

export { gsap, ScrollTrigger, useGSAP };
