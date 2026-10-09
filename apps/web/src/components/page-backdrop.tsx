"use client";

import type { CSSProperties, ReactNode } from "react";
import { usePathname } from "next/navigation";
import styles from "./page-backdrop.module.css";

const sceneRoutes = [
  ["/season", "season"],
  ["/members", "members"],
  ["/ops", "ops"],
  ["/map", "map"],
  ["/lab", "lab"],
  ["/community", "community"],
  ["/announcements", "community"],
  ["/db", "db"],
  ["/search", "db"],
  ["/login", "auth"],
  ["/onboarding", "auth"],
  ["/settings", "workspace"],
  ["/admin", "workspace"],
] as const;

type BackdropStyle = CSSProperties & { "--page-background-image": string };

export function PageBackdrop({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scene =
    sceneRoutes.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ??
    "home";
  const subdued =
    scene === "auth" ||
    scene === "workspace" ||
    pathname === "/about" ||
    pathname.endsWith("/new") ||
    pathname.endsWith("/edit") ||
    (scene === "lab" && pathname !== "/lab");
  const style: BackdropStyle = {
    "--page-background-image": `url("/backgrounds/hive-${scene}.webp")`,
  };

  return (
    <div
      className={styles.shell}
      data-background-scene={scene}
      data-background-subdued={subdued ? "true" : undefined}
      style={style}
    >
      <div className={styles.scene} aria-hidden="true" />
      {children}
    </div>
  );
}
