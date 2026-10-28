"use client";

import { usePathname } from "next/navigation";
import { Loader } from "../Loader";

/** The loader on / (it lands on the home shot) and /play (the room shot). */
export function HallLoader() {
  const path = usePathname();
  return <Loader home={path?.startsWith("/play") ? "room" : "home"} />;
}
