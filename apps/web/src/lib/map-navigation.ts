import { buildTHGLEmbedUrl, ONCE_HUMAN_MAPS, type OnceHumanMapKey } from "@uniz/integrations";
import { getFarmingTarget } from "./map-farming";
import { getFarmingAcquisition } from "./map-farming-acquisition";
import { getLocationGuide, getMapLocation } from "./map-locations";
import { getFarmingSites } from "./map-farming-sites";

export interface MapQuery {
  scenario?: unknown;
  share?: unknown;
  target?: unknown;
  location?: unknown;
}

function firstString(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim() : "";
}

export function mapHref(
  scenario: OnceHumanMapKey,
  shareCode?: string | null,
  targetKey?: string | null,
  locationKey?: string | null,
): string {
  const query = new URLSearchParams({ scenario });
  if (locationKey && getMapLocation(locationKey)) query.set("location", locationKey);
  else if (targetKey && getFarmingTarget(targetKey)) query.set("target", targetKey);
  else if (shareCode && /^[a-zA-Z0-9_-]{1,128}$/.test(shareCode)) query.set("share", shareCode);
  return `/map?${query}`;
}

export function getMapView(query: MapQuery = {}) {
  const requested = firstString(query.scenario);
  const map =
    ONCE_HUMAN_MAPS.find((item) => item.key === requested) ??
    ONCE_HUMAN_MAPS.find((item) => item.key === "MANIBUS")!;
  const suppliedShare = firstString(query.share);
  const invalidShare = Boolean(suppliedShare && !/^[a-zA-Z0-9_-]{1,128}$/.test(suppliedShare));
  const suppliedTarget = firstString(query.target);
  const suppliedLocation = firstString(query.location);
  const requestedLocation = getMapLocation(suppliedLocation);
  const invalidLocation = Boolean(suppliedLocation && !requestedLocation);
  const locationTypes = requestedLocation?.markerTypes[map.key];
  const mapLocation = locationTypes?.length ? requestedLocation : null;
  const requestedTarget = suppliedLocation ? null : getFarmingTarget(suppliedTarget);
  const invalidTarget = Boolean(!suppliedLocation && suppliedTarget && !requestedTarget);
  const farmingTypes = requestedTarget?.markerTypes[map.key];
  const farmingTarget = farmingTypes?.length ? requestedTarget : null;
  const farmingGuide = farmingTarget ? getFarmingAcquisition(farmingTarget.key, map.key) : null;
  const farmingSites = farmingTarget ? getFarmingSites(farmingTarget.key, map.key) : [];
  const farmingSite = farmingSites.length === 1 ? farmingSites[0]! : null;
  const markerTypes = mapLocation
    ? locationTypes
    : farmingTarget
      ? [
          ...new Set([
            ...(farmingTypes ?? []),
            ...(farmingGuide?.location?.markerTypes ?? []),
            ...(farmingSite?.markerTypes[map.key] ?? []),
          ]),
        ]
      : null;
  const camera = mapLocation?.cameras?.[map.key] ?? farmingSite?.cameras?.[map.key];
  // A place/target selection excludes unrelated shared drawings.
  const shareOverridden = Boolean(
    (requestedLocation || requestedTarget) && suppliedShare && !invalidShare,
  );
  const shareCode =
    invalidShare || suppliedTarget || suppliedLocation ? null : suppliedShare || null;
  const registry = Object.fromEntries(ONCE_HUMAN_MAPS.map((item) => [item.key, item.embedUrl]));
  const embedUrl = buildTHGLEmbedUrl(
    {
      map: map.key,
      ...(shareCode ? { shareCode } : {}),
      ...(markerTypes ? { markerTypes } : {}),
      ...(camera ?? {}),
    },
    registry,
  )!;
  const original = new URL(map.originalUrl);
  if (shareCode) original.searchParams.set("share", shareCode);
  if (markerTypes) original.searchParams.set("types", markerTypes.join(","));
  if (camera) {
    original.searchParams.set("center", camera.center.join(","));
    original.searchParams.set("zoom", String(camera.zoom));
  }
  return {
    map,
    shareCode,
    invalidShare,
    requestedTarget,
    farmingTarget,
    farmingSites,
    farmingSite,
    farmingSiteGuide: farmingSite ? getLocationGuide(farmingSite, map.key) : null,
    farmingGuide,
    invalidTarget,
    requestedLocation,
    mapLocation,
    locationGuide: mapLocation ? getLocationGuide(mapLocation, map.key) : null,
    invalidLocation,
    hasVerifiedLocationCamera: Boolean(camera),
    shareOverridden,
    embedUrl,
    originalUrl: original.toString(),
    href: mapHref(map.key, shareCode, requestedTarget?.key, requestedLocation?.key),
  };
}

export type MapView = ReturnType<typeof getMapView>;
