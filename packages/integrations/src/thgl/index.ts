export { ONCE_HUMAN_MAPS, type OnceHumanMapKey } from "./maps";

export interface UnizMapRoute {
  id: string;
  label: string;
  map: string;
  shareCode: string;
  ownerId?: string;
  verifiedAt?: Date;
}

export interface THGLEmbedOptions {
  map: string;
  shareCode?: string;
  zoom?: number;
  center?: readonly [number, number];
  /** Marker IDs copied from the map's official Embed dialog. */
  markerTypes?: readonly string[];
}

export interface THGLAdapter {
  buildEmbedUrl(options: THGLEmbedOptions): string | null;
}

/** Accept only an official Once Human embed URL manually copied from TH.GL's embed dialog. */
export function validateTHGLEmbedUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "oncehuman.th.gl" ||
      url.port ||
      url.username ||
      url.password
    )
      return null;
    if (!/^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?embed\/maps\/[^/]+$/.test(url.pathname)) return null;
    const allowed = new Set(["center", "zoom", "types", "hide", "share"]);
    for (const key of [...url.searchParams.keys()])
      if (!allowed.has(key)) url.searchParams.delete(key);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Unverified map names have no URL. Verified maps are explicitly configured, never guessed. */
export function buildTHGLEmbedUrl(
  options: THGLEmbedOptions,
  verifiedMaps: Readonly<Record<string, string>> = {},
): string | null {
  const base = validateTHGLEmbedUrl(verifiedMaps[options.map]);
  if (!base) return null;
  const url = new URL(base);
  if (options.shareCode !== undefined) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(options.shareCode)) return null;
    url.searchParams.set("share", options.shareCode);
  }
  if (options.zoom !== undefined) {
    if (!Number.isFinite(options.zoom)) return null;
    url.searchParams.set("zoom", String(options.zoom));
  }
  if (options.center !== undefined) {
    if (!options.center.every(Number.isFinite)) return null;
    url.searchParams.set("center", options.center.join(","));
  }
  if (options.markerTypes !== undefined) {
    if (
      options.markerTypes.length === 0 ||
      options.markerTypes.length > 100 ||
      !options.markerTypes.every((type) => /^[a-zA-Z0-9_.'-]{1,128}$/.test(type))
    )
      return null;
    url.searchParams.set("types", [...new Set(options.markerTypes)].join(","));
  }
  return url.toString();
}

export function createTHGLAdapter(
  verifiedMaps: Readonly<Record<string, string>> = {},
): THGLAdapter {
  return { buildEmbedUrl: (options) => buildTHGLEmbedUrl(options, verifiedMaps) };
}

export const THGL_ORIGINAL_URL = "https://oncehuman.th.gl/";
