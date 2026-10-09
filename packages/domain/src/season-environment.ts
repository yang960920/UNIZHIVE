export const SEASON_SERVER_TYPES = ["UNKNOWN", "SEASONAL", "PERMANENT"] as const;
export type SeasonServerType = (typeof SEASON_SERVER_TYPES)[number];

export const TRANCE_PHENOMENA = [
  "UNKNOWN",
  "NONE",
  "LUNAR_ORACLE",
  "STARFALL_INVERSION",
  "LUNAR_REVELRY",
  "ABERRANT_PROGENY",
  "GRAVITY_ABYSS",
] as const;
export type TrancePhenomenon = (typeof TRANCE_PHENOMENA)[number];

const serverTypeLabels: Record<SeasonServerType, string> = {
  UNKNOWN: "미확인(기존 기록)",
  SEASONAL: "일반(시즌제)",
  PERMANENT: "영구",
};

const trancePhenomenonLabels: Record<TrancePhenomenon, string> = {
  UNKNOWN: "미확인(기존 기록)",
  NONE: "없음",
  LUNAR_ORACLE: "달의 징조",
  STARFALL_INVERSION: "역행하는 별",
  LUNAR_REVELRY: "달빛의 향연",
  ABERRANT_PROGENY: "뒤틀린 공존",
  GRAVITY_ABYSS: "중력의 심연",
};

export function getSeasonServerTypeLabel(serverType?: SeasonServerType | null): string {
  return serverTypeLabels[serverType ?? "UNKNOWN"];
}

export function getTrancePhenomenonLabel(phenomenon?: TrancePhenomenon | null): string {
  return trancePhenomenonLabels[phenomenon ?? "UNKNOWN"];
}

/** Preserve a legacy content setting only until the server's phenomenon is confirmed. */
export function hasGravityContent(
  phenomenon?: TrancePhenomenon | null,
  legacyFlag = false,
): boolean {
  if (phenomenon === undefined || phenomenon === null || phenomenon === "UNKNOWN")
    return legacyFlag;
  return phenomenon === "STARFALL_INVERSION" || phenomenon === "GRAVITY_ABYSS";
}
