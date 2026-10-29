"use client";

/**
 * Chain mode (v21.3), when rounds cannot be read at all: the build's
 * configuration is incomplete, the market does not exist on the cluster, or
 * the RPC did not answer before the first snapshot. One plain plate where
 * the dock sits (phones: the dock's place under the hall band), with the
 * source's own sentence, never a page that waits forever. The source keeps
 * retrying an RPC failure, and the page reads again as soon as it answers.
 */
import { useT } from "../../../i18n/client";

export function ChainDown({ error, phone = false }: { error: string | null; phone?: boolean }) {
  const t = useT();
  return (
    <section className={phone ? "pdock" : "dock hud-pane hud-in"} aria-live="polite">
      <p className="line" role="status">{t("h.down.title")}</p>
      {error ? <p className="fine">{error}</p> : null}
    </section>
  );
}
