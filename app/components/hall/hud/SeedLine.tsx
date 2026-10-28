"use client";

import Link from "next/link";
import { useT } from "../../../i18n/client";

/** A round's seed (v21, `.seed`): grouped by 4, tabular, it opens the round's recompute. */
export function SeedLine({ seedHex, id }: { seedHex: string; id: string; reduced?: boolean }) {
  const t = useT();
  const grouped = `${seedHex.slice(0, 4)} ${seedHex.slice(4, 8)} … ${seedHex.slice(-4)}`;
  return <Link className="seed act sm" href={`/window/${id}#recompute`}>{t("h.res.seed", { seed: grouped })}</Link>;
}
