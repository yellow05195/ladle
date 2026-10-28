/**
 * The page kit (v21.1, "type and UI from the wordmark", §7.17 to §7.23):
 * the section frame, the numbered section head (a cream disc and a
 * Display M title), the inner-page head, steps on plates, definition lists,
 * the demo line, the command glossary and the link arrow. One family
 * (Figtree), one roman voice; plates, wells and space instead of rules.
 * Server-safe (no hooks), so server and client pages share it.
 */
import type { ReactNode } from "react";
import { DATA_SOURCE } from "../../../lib/data";
import { DEMO_HOSTS } from "../../../lib/demo-hosts";
import { P } from "./copy";

/** The arrow after a navigation link (§7.2): its own span, so it can sit in --ink-3 and move 2 px on hover. */
export function Arr({ c = "→" }: { c?: "→" | "↗" | "↓" }) {
  return <span className="arr" aria-hidden="true">{c}</span>;
}

/** A section of an inner page: the 1200 px frame, 96 px of space after it, no rule. */
export function Sec({ id, children, labelledBy, className = "" }: { id?: string; children: ReactNode; labelledBy?: string; className?: string }) {
  return (
    <section id={id} className={`pg-sec ${className}`} aria-labelledby={labelledBy}>
      <div className="in">{children}</div>
    </section>
  );
}

/** A section head: the 44 px cream disc with its Figtree 900 numeral (it replaces the Roman folio), then the Display M title. */
export function SecHead({ n, id, children, sub }: { n?: number; id?: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className={`pg-sh ${n == null ? "bare" : ""}`}>
      {n != null ? <span className="disc cream" aria-hidden="true">{n}</span> : null}
      <div className="pg-sh-t">
        <h2 id={id} className="display-m">{children}</h2>
        {sub ? <p className="body">{sub}</p> : null}
      </div>
    </div>
  );
}

/** A tour chapter's headline (Display L), one roman sentence over at most two lines. */
export function Head2({ id, l1, l2 }: { id?: string; l1: ReactNode; l2?: ReactNode }) {
  return <h2 id={id} className="display-l pg-h">{l1}{l2 ? <>{" "}{l2}</> : null}</h2>;
}

/** §7.23 page head: the page's name as a label, the Display XL headline in one roman voice, the lede. */
export function PageHead({ label, title, lede, children }: { label: ReactNode; title: ReactNode; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="pg-head">
      <div className="in">
        <span className="label">{label}</span>
        <h1 className="display-xl">{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
        {children}
      </div>
    </header>
  );
}

/**
 * A true sequence on an inner page (the law's clauses, the round's four
 * instructions): one plate per step, a 44 px disc with its numeral, a title,
 * one sentence and an optional timing note. The disc is cream where the
 * sequence opens its page with no section disc above it (/odds), a well
 * otherwise. The tour's beats are their own, smaller kind (Chapters.tsx).
 */
export function Steps({ rows, className = "", cream = false }: { rows: ReadonlyArray<{ t: ReactNode; b?: ReactNode; note?: ReactNode }>; className?: string; cream?: boolean }) {
  return (
    <ol className={`pg-steps ${cream ? "cream" : ""} ${className}`}>
      {rows.map((r, i) => (
        <li key={i}>
          <span className={`disc ${cream ? "cream" : ""}`} aria-hidden="true">{i + 1}</span>
          <div className="tx">
            <h3 className="pg-h3">{r.t}</h3>
            {r.b ? <p className="body">{r.b}</p> : null}
            {r.note ? <span className="label">{r.note}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Sentences in no particular order on one plate (what nobody can do, the
 * invariants, the update authority, the risks, the limits, the house
 * rules): zebra rows, no numerals. Numerals belong to section heads and to
 * true sequences (Steps) only.
 */
export function Notes({ items }: { items: ReadonlyArray<ReactNode> }) {
  return (
    <ul className="pg-notes">
      {items.map((s, i) => <li key={i}>{s}</li>)}
    </ul>
  );
}

/** A plain decimal string with thousands commas on its integer part ("3604.014" -> "3,604.014"). */
export function commas(v: string): string {
  const i = v.indexOf(".");
  const int = i < 0 ? v : v.slice(0, i);
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (i < 0 ? "" : v.slice(i));
}

/** Seed grouped by 4 with spaces, shortened in the middle. */
export const seedGroups = (hex: string, head = 4, tail = 2) => {
  const g = hex.match(/.{1,4}/g) ?? [];
  return g.length <= head + tail ? g.join(" ") : `${g.slice(0, head).join(" ")} … ${g.slice(-tail).join(" ")}`;
};

/** §7.18 definition list on a plate: dt as a label, dd as a Figure M (`text` for sentences). */
export function DefList({ rows, className = "", text = false }: { rows: ReadonlyArray<{ k: ReactNode; v: ReactNode; key?: string }>; className?: string; text?: boolean }) {
  return (
    <dl className={`pg-dl ${text ? "text" : ""} ${className}`}>
      {rows.map((r, i) => (
        <div key={r.key ?? i}>
          <dt>{r.k}</dt>
          <dd>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The demo line (§7.9): one fine sentence at the end of a block of demo figures; nothing in chain mode. No dagger. */
export function DemoNote({ className = "" }: { className?: string }) {
  return DATA_SOURCE === "demo" ? <p className={`fine pg-note ${className}`}>{P.demo}</p> : null;
}

/** Commands and what they do: the command as a token well, its meaning beside it. Words (not commands) set `words`. */
export function Glossary({ rows, words = false }: { rows: ReadonlyArray<{ c: string; r: ReactNode }>; words?: boolean }) {
  return (
    <dl className={`pg-gloss ${words ? "words" : ""}`}>
      {rows.map((x) => (
        <div key={x.c}>
          <dt>{words ? x.c : <span className="tok">{x.c}</span>}</dt>
          <dd>{x.r}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The founding hosts in arrival order, on zebra bands: the handle, then its number. */
export function FoundingList() {
  return (
    <ol className="pg-founding">
      {DEMO_HOSTS.map((h, i) => (
        <li key={h}><span className="h">@{h}</span><span className="no">No. {i + 1}</span></li>
      ))}
    </ol>
  );
}
