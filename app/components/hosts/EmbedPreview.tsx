"use client";

/**
 * The live embed on /integrate, shown at a size it is built for. The embed
 * is laid out for 360 to 420 px; a phone column is narrower (343 px at
 * 375), where its round band would clip. So the iframe is always rendered
 * at a real width between 360 and 420 px and scaled down to the column,
 * the box keeping the embed's 9:15 shape. Measured by a ResizeObserver,
 * never on scroll. Before the first measure it simply fills the box.
 */
import { useEffect, useRef, useState } from "react";

const MIN = 360, MAX = 420, RATIO = 15 / 9;

export function EmbedPreview({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ w: number; s: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      if (!cw) return;
      const w = Math.min(MAX, Math.max(MIN, cw));
      const s = Math.min(1, cw / w);
      setFit((f) => (f && f.w === w && Math.abs(f.s - s) < 0.001 ? f : { w, s }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="pg-embed-box">
      <iframe
        className="pg-embed"
        src={src}
        title={title}
        loading="lazy"
        style={fit ? { width: fit.w, height: Math.round(fit.w * RATIO), transform: fit.s < 1 ? `scale(${fit.s.toFixed(4)})` : undefined } : undefined}
      />
    </div>
  );
}
