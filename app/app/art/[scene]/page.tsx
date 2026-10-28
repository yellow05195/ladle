import { notFound } from "next/navigation";
import { ArtStage, type ArtName } from "./ArtStage";
import { PetSheet } from "./PetSheet";

export const metadata = { robots: { index: false } };

const NAMES: ArtName[] = ["poster", "poster-mobile", "join", "seal", "draw", "serve"];

/** Dev only: the hall stills and the character portraits, captured by scripts/render-art.mjs and render-pets.mjs. 404 in production. */
export default async function ArtPage({ params }: { params: Promise<{ scene: string }> }) {
  const { scene } = await params;
  if (process.env.NODE_ENV === "production") notFound();
  if (scene === "pets") return <PetSheet />;
  if (!NAMES.includes(scene as ArtName)) notFound();
  return <ArtStage name={scene as ArtName} />;
}
