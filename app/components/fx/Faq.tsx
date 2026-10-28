/**
 * Questions (v21.1, §7.20): native <details>, each a charcoal plate 8 px
 * from the next; the question as a title, at the right a 28 px well circle
 * holding a 2 px chevron that turns 180° in 240 ms; the answer as body
 * text. No rules, no plus icons. (`plain` is accepted from older callers.)
 */
export function Faq({ items, id = "faq" }: { items: Array<{ q: string; a: string }>; id?: string; plain?: boolean }) {
  return (
    <div className="pg-qa" id={id}>
      {items.map((it, i) => (
        <details key={i}>
          <summary>
            <span className="q">{it.q}</span>
            <span className="chev" aria-hidden="true">
              <svg viewBox="0 0 12 12" width="12" height="12" focusable="false"><path d="M2 4.25 6 8.25 10 4.25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="butt" strokeLinejoin="round" /></svg>
            </span>
          </summary>
          <p className="body">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
