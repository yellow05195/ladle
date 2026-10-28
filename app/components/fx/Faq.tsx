/**
 * Questions (v21.1 §7.20, reworked after the round-2 critique): native
 * <details> as rows, never a stack of plates. Each question is a title row
 * led by a bare 2 px chevron in --ink-3 (no circle) that turns from right to
 * down in 240 ms; an open question and its answer sit on one well band, and
 * only the open one has it. The answer is body text indented under the
 * question. Same rows on the tour's scrim and on /about's ground.
 */
export function Faq({ items, id = "faq" }: { items: ReadonlyArray<{ q: string; a: string }>; id?: string; plain?: boolean }) {
  return (
    <div className="pg-qa" id={id}>
      {items.map((it, i) => (
        <details key={i}>
          <summary>
            <span className="chev" aria-hidden="true">
              <svg viewBox="0 0 12 12" width="14" height="14" focusable="false"><path d="M2 4.25 6 8.25 10 4.25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="butt" strokeLinejoin="round" /></svg>
            </span>
            <span className="q">{it.q}</span>
          </summary>
          <p className="body">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
