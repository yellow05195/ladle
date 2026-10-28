/**
 * The room as an external store for useSyncExternalStore. Sources write to
 * a draft; the draft is published (new snapshot object, listeners called)
 * at most every FLUSH_MS, so a busy room with fifty people moving and
 * talking re-renders the chat a few times a second, not once per frame of
 * the socket. `present` and `lines` keep their identity until they change,
 * so usePresence() does not re-render on talk and the 3D crowd does not
 * rebuild on every line.
 */
import type { ChatLine, ChatProfile, ChatSnapshot, Presence } from "./types";

const FLUSH_MS = 50;
export const MAX_LINES = 200;

export class RoomStore {
  private published: ChatSnapshot;
  private draft: ChatSnapshot;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(initial: ChatSnapshot) {
    this.published = initial;
    this.draft = initial;
  }

  get = (): ChatSnapshot => this.published;
  /** the latest state, published or not (for the sources' own logic) */
  peek(): ChatSnapshot { return this.draft; }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };

  get size(): number { return this.listeners.size; }

  set(patch: Partial<ChatSnapshot>): void {
    this.draft = { ...this.draft, ...patch };
    if (this.timer === null) this.timer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  addLines(lines: ChatLine[], reset = false): void {
    if (!lines.length && !reset) return;
    const all = reset ? lines : [...this.draft.lines, ...lines];
    this.set({ lines: all.length > MAX_LINES ? all.slice(-MAX_LINES) : all });
  }

  setPresent(present: Presence[]): void { this.set({ present }); }

  setMe(me: ChatProfile | null, signed: boolean): void { this.set({ me, signed }); }

  flush(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    if (this.published === this.draft) return;
    this.published = this.draft;
    for (const l of this.listeners) l();
  }
}

/** Stage first, then the stands; inside each, who came first. */
export function sortPresence(list: Iterable<Presence>): Presence[] {
  return [...list].sort((a, b) => (a.seat === b.seat ? a.since - b.since : a.seat === "stage" ? -1 : 1));
}
