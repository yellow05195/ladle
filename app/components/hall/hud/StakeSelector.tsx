"use client";

/**
 * The stake selector (v21.1, §7.4): 0.1 0.25 0.5 1 other, a radiogroup with a
 * roving tab stop (arrows move and select, Home and End jump). Each value is
 * a well; the chosen one is cream. Values above the 20 % cap stay visible,
 * aria-disabled, with the reason. "other" turns into an inline well in place
 * (Enter confirms, Esc reverts).
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "../../../i18n/client";
import { LAMPORTS_PER_SOL } from "../../../lib/format";
import { sol2, solShort } from "../fmt";

export const AMOUNTS = [100_000_000n, 250_000_000n, 500_000_000n, LAMPORTS_PER_SOL];

export function StakeSelector({ value, onChange, max, onHint }: { value: bigint; onChange: (v: bigint) => void; max: bigint; onHint: (h: string | null) => void }) {
  const t = useT();
  const preset = AMOUNTS.includes(value);
  const [other, setOther] = useState(false);
  const [raw, setRaw] = useState("");
  const [peek, setPeek] = useState<number | null>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const input = useRef<HTMLInputElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const sel = other ? 4 : preset ? AMOUNTS.indexOf(value) : 4;
  const capLine = t("h.stake.cap", { max: sol2(max) });

  useEffect(() => {
    const over = peek !== null ? peek < 4 && AMOUNTS[peek]! > max : value > max;
    onHint(over ? capLine : null);
  }, [peek, value, max, capLine, onHint]);

  useEffect(() => { if (other) input.current?.focus(); }, [other]);

  const pick = (i: number) => {
    if (i < 4) { if (AMOUNTS[i]! > max) return; setOther(false); onChange(AMOUNTS[i]!); }
    else { setRaw(preset ? "" : solShort(value)); setOther(true); }
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let j = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = Math.min(4, i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = Math.max(0, i - 1);
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = 4;
    else return;
    e.preventDefault();
    refs.current[j]?.focus();
    if (j < 4 && AMOUNTS[j]! <= max) pick(j);
  };
  const confirm = () => {
    const x = Number(raw.replace(",", "."));
    if (Number.isFinite(x) && x >= 0.01) {
      const l = BigInt(Math.round(x * 1000)) * 1_000_000n;
      onChange(l);
    }
    setOther(false);
  };

  return (
    <div ref={group} className="stakes" role="radiogroup" aria-label={t("h.dock.amountLabel")}>
      {AMOUNTS.map((a, i) => {
        const over = a > max;
        return (
          <button key={String(a)} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" className="stake" aria-checked={sel === i} aria-disabled={over || undefined} tabIndex={sel === i ? 0 : -1}
            onClick={() => pick(i)} onKeyDown={(e) => onKey(e, i)} onMouseEnter={() => setPeek(i)} onMouseLeave={() => setPeek(null)} onFocus={() => setPeek(i)} onBlur={() => setPeek(null)}>
            {solShort(a)}
          </button>
        );
      })}
      {other ? (
        <span className="other-in">
          <input ref={input} inputMode="decimal" aria-label={t("h.stake.otherLabel")} placeholder="0.37" value={raw}
            onChange={(e) => setRaw(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 6))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } else if (e.key === "Escape") { e.preventDefault(); setOther(false); } }}
            onBlur={confirm} />
          <span className="label">SOL</span>
        </span>
      ) : (
        <button ref={(el) => { refs.current[4] = el; }} type="button" role="radio" className="stake other" aria-checked={sel === 4} tabIndex={sel === 4 ? 0 : -1} onClick={() => pick(4)} onKeyDown={(e) => onKey(e, 4)}>
          {sel === 4 && !preset ? solShort(value) : t("h.stake.other")}
        </button>
      )}
    </div>
  );
}
