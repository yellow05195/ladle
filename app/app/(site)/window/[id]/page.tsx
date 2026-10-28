import type { Metadata } from "next";
import { WindowDetail } from "../../../../components/WindowDetail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

export default async function WindowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WindowDetail id={id} />;
}
