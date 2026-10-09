import Link from "next/link";
import { MapPinned } from "lucide-react";
import type { OnceHumanMapKey } from "@uniz/integrations";
import { getFarmingMapLink } from "@/lib/map-farming";
import { getFarmingItemAcquisition } from "../../lib/map-farming-acquisition";
import { FarmingAcquisitionNote } from "../farming-acquisition-note";
import styles from "./gear-farming-map-link.module.css";

export function GearFarmingMapLink({
  kind,
  id,
  name,
  scenario,
}: {
  kind: "deviant" | "material";
  id: string;
  name?: string;
  scenario?: OnceHumanMapKey | null;
}) {
  const link = getFarmingMapLink({ kind, id, name, scenario });
  if (!link) return null;
  return (
    <div className={styles.root}>
      <Link
        href={link.href}
        className={styles.link}
        target="_blank"
        rel="noopener noreferrer"
        prefetch={false}
        aria-label={`${name ? `${name} · ` : ""}${link.label} · 새 탭에서 열기`}
      >
        <MapPinned size={15} aria-hidden="true" />
        {link.label}
      </Link>
      <FarmingAcquisitionNote guide={getFarmingItemAcquisition({ kind, id, scenario })} />
    </div>
  );
}
