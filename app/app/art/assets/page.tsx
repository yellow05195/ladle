import { notFound } from "next/navigation";
import { AssetSheet } from "./AssetSheet";

export const metadata = { robots: { index: false } };

/**
 * Dev only: contact sheet of the 3D asset library in public/assets/models
 * (reads public/assets/manifest.json). 404 in production.
 * Query: ?set=pack1,pack2/name (default all) &cols=6 &tile=210 &title=Header
 */
export default async function AssetsSheetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  return <AssetSheet set={sp.set ?? "all"} title={sp.title} cols={Number(sp.cols ?? 6)} tile={Number(sp.tile ?? 210)} />;
}
