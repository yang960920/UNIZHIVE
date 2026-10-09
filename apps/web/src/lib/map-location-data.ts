import type { MapLocation } from "./map-locations";
import { ACTIVITY_LOCATIONS } from "./map-location-activity-data";
import { DUNGEON_LOCATIONS } from "./map-location-dungeon-data";
import { MONOLITH_LOCATIONS } from "./map-location-monolith-data";
import { withVerifiedLocationCamera } from "./map-location-camera-data";

const mapKeys = ["MANIBUS", "WINTER", "ENDLESS_DREAM", "DEVIATION"] as const;
const source = {
  label: "공식 던전·감염물 경로 (2025.03)",
  url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
};
const categories: readonly MapLocation[] = [
  { key: "locations-silos", label: "사일로", type: "securementsilos" },
  { key: "locations-monoliths", label: "모노리스 · 전체", type: "juxie" },
  { key: "locations-lea", label: "LEA 연구소 · 위치", type: "raidlea" },
].map(({ key, label, type }) => ({
  key,
  label,
  group: "DUNGEON",
  categoryLabel: "던전 · 장소 유형",
  markerTypes: Object.fromEntries(mapKeys.map((map) => [map, [type]])),
  markerNote:
    "장소 유형의 위치를 표시합니다. 필터 지원은 이 시나리오의 실제 던전 존재·동일 보상 풀을 보장하지 않습니다.",
  guide: {
    summary:
      "장소마다 보상이 다릅니다. 사일로는 이 안내의 개별 목록에서 이름을 클릭하면 해당 위치로 이동하고 확인된 보상과 획득 조건을 볼 수 있습니다.",
    scopeLabel: "전체 위치 필터 · 던전별 보상 확인 필요",
    rewards: [],
    conditions: [
      "동일한 사일로 이름도 땃쥐·혹독한 겨울·무한의 꿈의 보상이 다를 수 있습니다.",
      "일반 보스와 히든 구역 보상을 구분하고 현재 서버의 입장·난이도 조건을 확인하세요.",
    ],
    sources: [source],
  },
  verifiedGuideScenarios: mapKeys,
}));

/** Curated location rewards and provider filter IDs are backed by the outputs/map-location-* research. */
export const MAP_LOCATIONS: readonly MapLocation[] = [
  ...DUNGEON_LOCATIONS.map(withVerifiedLocationCamera),
  ...MONOLITH_LOCATIONS.map(withVerifiedLocationCamera),
  ...categories,
  ...ACTIVITY_LOCATIONS,
];
