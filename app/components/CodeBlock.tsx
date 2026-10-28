"use client";

/**
 * A code well (v21.1, §7.23): the deepest ground on a cream-plate radius,
 * the system monospace at 14/22 in --ink-2 (the one place monospace is
 * used), and a 36 px copy key at the top right that says "Copied" for
 * 1.2 s. No rule, no border.
 */
import { useState } from "react";
import { HIcon } from "./ui/icons";

export function CodeBlock({ code, lang, className = "" }: { code: string; lang?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {}); };
  return (
    <div className={`code-well pg-code ${className}`}>
      <pre data-lang={lang}><code>{code}</code></pre>
      <button type="button" className="icon-btn round" aria-label="Copy the code" onClick={copy}><HIcon name={copied ? "check" : "copy"} size={18} /></button>
      {copied ? <span className="label copied" role="status">Copied</span> : null}
    </div>
  );
}
