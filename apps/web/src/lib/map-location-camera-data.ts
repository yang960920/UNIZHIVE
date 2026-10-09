import type { OnceHumanMapKey } from "@uniz/integrations";
import type { MapLocation } from "./map-locations";

/** Cameras copied after selecting each named place in TH.GL's Korean UI, 2026-10-08.
 * Source: outputs/map-location-camera-research.json; these are provider coordinates, not game coordinates.
 */
export const LOCATION_CAMERAS: Readonly<
  Record<
    string,
    Partial<Record<OnceHumanMapKey, { center: readonly [number, number]; zoom: number }>>
  >
> = {
  "silo-theta-manibus": {
    MANIBUS: { center: [-509.55, 5493.05], zoom: 4 },
    ENDLESS_DREAM: { center: [-509.55, 5493.05], zoom: 4 },
  },
  "silo-alpha-manibus": {
    MANIBUS: { center: [-3630.22, 148.98], zoom: 4 },
    ENDLESS_DREAM: { center: [-3630.22, 148.98], zoom: 4 },
  },
  "silo-phi-manibus": {
    MANIBUS: { center: [-2885.87, 5254.19], zoom: 4 },
    ENDLESS_DREAM: { center: [-2885.87, 5254.19], zoom: 4 },
  },
  "silo-ex1-manibus": {
    MANIBUS: { center: [-6483.76, 2156.97], zoom: 4 },
    ENDLESS_DREAM: { center: [-6483.76, 2156.97], zoom: 4 },
  },
  "silo-sigma-manibus": {
    MANIBUS: { center: [-5422.81, 4897.58], zoom: 4 },
    ENDLESS_DREAM: { center: [-5422.81, 4897.58], zoom: 4 },
  },
  "silo-psi-manibus": {
    MANIBUS: { center: [-2673.73, 2501.23], zoom: 4 },
    ENDLESS_DREAM: { center: [-2673.73, 2501.23], zoom: 4 },
  },
  "silo-delta-winter": {
    WINTER: { center: [4187.88, 5189.03], zoom: 4 },
    ENDLESS_DREAM: { center: [4187.88, 5189.03], zoom: 4 },
  },
  "silo-taurus-winter": {
    WINTER: { center: [4541.19, -7150.98], zoom: 4 },
    ENDLESS_DREAM: { center: [4541.19, -7150.98], zoom: 4 },
  },
  "silo-psi-winter": {
    WINTER: { center: [6209.85, 585.53], zoom: 4 },
    ENDLESS_DREAM: { center: [6209.85, 585.53], zoom: 4 },
  },
  "silo-ex1-winter": {
    WINTER: { center: [4641.6, 3662.75], zoom: 4 },
    ENDLESS_DREAM: { center: [4641.6, 3662.75], zoom: 4 },
  },
};

export const BOSS_LOCATION_CAMERAS: typeof LOCATION_CAMERAS = {
  "monolith-ravenous-hunter": {
    ENDLESS_DREAM: {
      center: [-4647.59, 5901.94],
      zoom: 4,
    },
    MANIBUS: {
      center: [-4647.59, 5901.94],
      zoom: 4,
    },
  },
  "monolith-shadow-hound": {
    ENDLESS_DREAM: {
      center: [-4726.72, 1642.68],
      zoom: 4,
    },
    MANIBUS: {
      center: [-4726.72, 1642.68],
      zoom: 4,
    },
  },
  "monolith-secret-servitor": {
    ENDLESS_DREAM: {
      center: [4431.84, 2440.85],
      zoom: 4,
    },
    WINTER: {
      center: [4431.84, 2440.85],
      zoom: 4,
    },
  },
  "monolith-forsaken-giant": {
    MANIBUS: {
      center: [-1499.17, 1988.32],
      zoom: 4,
    },
  },
};

export function withVerifiedLocationCamera(location: MapLocation): MapLocation {
  const cameras = LOCATION_CAMERAS[location.key] ?? BOSS_LOCATION_CAMERAS[location.key];
  if (!cameras) return location;
  return {
    ...location,
    cameras,
    markerNote: location.key.startsWith("silo-")
      ? "주변 사일로 입구도 표시됩니다. 선택한 사일로를 중심으로 이동하며, 아래 드랍표는 선택한 장소의 안내입니다."
      : "선택한 모노리스의 대표 지역을 중심으로 표시합니다. 같은 보스의 다른 출현 지점은 획득 안내와 현재 서버 조건을 확인하세요.",
  };
}
