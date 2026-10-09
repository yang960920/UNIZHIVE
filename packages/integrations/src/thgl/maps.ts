/** Names and URLs copied from TH.GL's Korean Embed dialogs on 2026-10-08. */
const mapDefinitions = [
  { key: "DEVIATION", label: "비정상수용 (Deviation)", mapName: "Deviation Secure" },
  { key: "MANIBUS", label: "땃쥐 (Manibus)", mapName: "터치 오브 스카이&진화의 부름" },
  { key: "WINTER", label: "설산 (The Way of Winter)", mapName: "혹독한 겨울" },
  { key: "ENDLESS_DREAM", label: "무한의 꿈 (Endless Dream)", mapName: "무한한 꿈" },
] as const;

export type OnceHumanMapKey = (typeof mapDefinitions)[number]["key"];

export const ONCE_HUMAN_MAPS = mapDefinitions.map((map) => ({
  ...map,
  embedUrl: `https://oncehuman.th.gl/ko/embed/maps/${encodeURIComponent(map.mapName)}`,
  originalUrl: `https://oncehuman.th.gl/ko/maps/${encodeURIComponent(map.mapName)}`,
}));
