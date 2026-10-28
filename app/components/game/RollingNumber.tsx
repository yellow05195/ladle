"use client";

import { RollingFigure } from "../ui/house";

/**
 * A whole number whose digits roll (kept as a wrapper of RollingFigure,
 * v21 §8.25): padded to `minDigits`, every digit column one measured width.
 */
export function RollingNumber({ value, minDigits = 1, className = "" }: { value: number; minDigits?: number; className?: string }) {
  const s = String(Math.max(0, Math.floor(value))).padStart(minDigits, "0");
  return <RollingFigure text={s} className={className} />;
}
