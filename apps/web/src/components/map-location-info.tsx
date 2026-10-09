import type { LocationDropGuide, MapLocation } from "../lib/map-locations";
import type { ReactNode } from "react";
import { DUNGEON_COMMON_RULES } from "../lib/map-location-dungeon-rules";
import styles from "./map-location-info.module.css";

const evidenceLabels = {
  OFFICIAL: "공식",
  COMMUNITY: "이용자 사례",
  REFERENCE: "공략 참고",
  UNVERIFIED: "미확인",
} as const;

export function MapLocationInfo({
  location,
  guide,
  children,
}: {
  location: MapLocation;
  guide: LocationDropGuide;
  children?: ReactNode;
}) {
  return (
    <aside className={styles.panel} aria-label={`${location.label} 장소·보상 안내`}>
      {children}
      <header>
        <span>{location.categoryLabel}</span>
        <h2>{location.label}</h2>
        <p className={styles.scope}>{guide.scopeLabel}</p>
      </header>
      <p>{guide.summary}</p>
      {location.markerNote && <p className={styles.markerNote}>{location.markerNote}</p>}
      <h3>보상·획득 정보</h3>
      {guide.rewards.length > 0 ? (
        <ul className={styles.rewards}>
          {guide.rewards.map((reward, index) => (
            <li key={`${reward.kind}-${index}`}>
              <div className={styles.rewardHeading}>
                <span>{reward.kind}</span>
                <small>{evidenceLabels[reward.evidence]}</small>
              </div>
              <strong>{reward.label}</strong>
              <p>{reward.condition}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>이 유형에 공통으로 적용되는 고정 드랍표는 확인되지 않았습니다.</p>
      )}
      {guide.conditions.length > 0 && (
        <section>
          <h3>확인할 조건</h3>
          <ul className={styles.conditions}>
            {guide.conditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        </section>
      )}
      {location.group === "DUNGEON" && (
        <details className={styles.dungeonRules}>
          <summary>던전 공통 보상 규칙 · 2026년 기준</summary>
          <p>
            현재 보상 수령에 제어기는 필요하지 않습니다. 모듈 레벨 범위는 공식 난이도 표 기준이며,
            각 던전에 모든 난이도가 있다는 뜻은 아닙니다.
          </p>
          <table>
            <caption>모듈 레벨 범위</caption>
            <thead>
              <tr>
                <th>난이도</th>
                <th>레벨</th>
              </tr>
            </thead>
            <tbody>
              {DUNGEON_COMMON_RULES.modLevelRanges.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>
                    {row.min}–{row.max}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className={styles.conditions}>
            {DUNGEON_COMMON_RULES.guide.rewards
              .filter((reward) => reward.label !== "제어기 불필요")
              .map((reward) => (
                <li key={reward.label}>
                  <strong>{reward.kind}</strong> · {reward.condition}
                </li>
              ))}
            {DUNGEON_COMMON_RULES.guide.conditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
          {DUNGEON_COMMON_RULES.guide.sources.map((source) => (
            <a
              className={styles.ruleSource}
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {source.label} ↗
            </a>
          ))}
        </details>
      )}
      <footer aria-label="장소·보상 출처">
        {guide.sources.map((source) => (
          <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
            {source.label} ↗
          </a>
        ))}
      </footer>
    </aside>
  );
}
