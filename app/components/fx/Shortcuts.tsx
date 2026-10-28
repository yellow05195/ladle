"use client";

import { useEffect } from "react";

/**
 * Keyboard shortcuts: E focuses the main action (the enter button, or the
 * live panel), ? opens the first question of the FAQ and scrolls to it,
 * Esc closes any open FAQ item and blurs. Ignored while typing in a field.
 */
export function Shortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "e" || e.key === "E") {
        const btn = document.querySelector<HTMLElement>("[data-enter]") ?? document.querySelector<HTMLElement>("#live");
        if (!btn) { window.location.assign("/#live"); return; }
        btn.scrollIntoView({ block: "center" });
        btn.focus();
        e.preventDefault();
      } else if (e.key === "?") {
        const faq = document.querySelector<HTMLElement>("#faq");
        if (!faq) return;
        const first = faq.querySelector<HTMLDetailsElement>("details");
        if (first) first.open = true;
        faq.scrollIntoView({ block: "start" });
        e.preventDefault();
      } else if (e.key === "Escape") {
        document.querySelectorAll<HTMLDetailsElement>("#faq details[open]").forEach((d) => { d.open = false; });
        (document.activeElement as HTMLElement | null)?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
