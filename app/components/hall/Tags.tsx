"use client";

/**
 * The name tags (v20). The tags themselves are DOM pills projected from the
 * 3D each frame by Cast.tsx into #hall-tags (the canvas and the tags are
 * aria-hidden). This list mirrors the players of the round in focus, in
 * arrival order, for screen readers.
 */
import { useT } from "../../i18n/client";
import { useLive } from "../live/LiveProvider";
import { hallBus } from "./store";
import { solShort, ladle, roundNum } from "./fmt";

export function TagsList() {
  const t = useT();
  const { w } = useLive();
  if (!w) return null;
  const settled = (w.phase === "settled" || w.phase === "sold") && !!w.settlement;
  return (
    <ol className="sr-list" aria-label={`${t("h.room.round", { n: roundNum(w.id) })} · ${t("h.res.players")}`}>
      {w.entries.map((e) => (
        <li key={e.index}>{e.mine ? `${t("h.res.you")} · ${hallBus.myName}` : e.label} · {solShort(e.amount)} SOL{settled && e.share !== undefined ? ` · ${ladle(e.share)} LADLE` : ""}</li>
      ))}
    </ol>
  );
}
