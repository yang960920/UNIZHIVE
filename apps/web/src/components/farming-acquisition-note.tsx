import type { FarmingAcquisitionGuide } from "../lib/map-farming-acquisition";
import styles from "./farming-acquisition-note.module.css";

export function FarmingAcquisitionNote({ guide }: { guide: FarmingAcquisitionGuide | null }) {
  if (!guide) return null;
  return (
    <div className={styles.note}>
      <div className={styles.heading}>
        <strong>획득 안내</strong>
        {guide.scopeLabel && <span>{guide.scopeLabel}</span>}
      </div>
      <p>{guide.summary}</p>
      <div className={styles.sources} aria-label="획득 안내 출처">
        {guide.sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            title={source.title}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.label} ↗
          </a>
        ))}
        {guide.location && guide.locationUrl && (
          <a href={guide.locationUrl} target="_blank" rel="noopener noreferrer">
            {guide.location.label} ↗
          </a>
        )}
      </div>
    </div>
  );
}
