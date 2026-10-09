import { hasGravityContent, type OperationType, type TrancePhenomenon } from "@uniz/domain";

export const PARTY_CONTENTS = [
  { key: "endless-deep", label: "무깊", type: "RAID" },
  { key: "endless-kin", label: "무킨", type: "RAID" },
  { key: "endless-shallow", label: "무얕", type: "RAID" },
  { key: "gravity-condenser", label: "응축기", type: "RAID" },
  { key: "prime-war", label: "프라임 워", type: "PRIME_WAR" },
  { key: "raid", label: "레이드", type: "RAID" },
  { key: "farm", label: "파밍", type: "FARM" },
  { key: "exploration", label: "탐험", type: "EXPLORATION" },
  { key: "other", label: "기타", type: "OTHER" },
] as const satisfies readonly { key: string; label: string; type: OperationType }[];
export type PartyContentKey = (typeof PARTY_CONTENTS)[number]["key"];
export function getPartyContent(key: unknown) {
  return PARTY_CONTENTS.find((item) => item.key === key) ?? null;
}
export function getPartyContentOptions(input: {
  scenarioSlug: string;
  trancePhenomenon?: TrancePhenomenon;
  gravityContentEnabled?: boolean;
}) {
  return PARTY_CONTENTS.filter((item) =>
    item.key.startsWith("endless-")
      ? input.scenarioSlug === "endless-dream"
      : item.key === "gravity-condenser"
        ? hasGravityContent(input.trancePhenomenon, input.gravityContentEnabled)
        : true,
  );
}
