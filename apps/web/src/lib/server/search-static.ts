import "server-only";
import { GEAR_CATALOG } from "@uniz/build-engine";
import { ONCE_HUMAN_MAPS } from "@uniz/integrations";
import { visibleNavigation, systemNavigation } from "../navigation";
import { FARMING_TARGETS } from "../map-farming-targets";
import { getFarmingAcquisition } from "../map-farming-acquisition";
import { MAP_LOCATIONS, getLocationGuide, mapLocationHref } from "../map-locations";
import { mapHref } from "../map-navigation";
import { searchExcerpt, searchMatches, type SearchItem } from "../unified-search";
import { GAME_INFO_CATEGORIES, gameInfoHref } from "../game-info-examples";
import { getGameInfoRecords } from "./game-info";
import type { CurrentUser } from "../auth-policy";

const gearById = new Map(GEAR_CATALOG.map((item) => [item.id, item]));

export function searchGameInfoExamples(q: string): SearchItem[] {
  if (!q) return [];
  return getGameInfoRecords()
    .filter((record) =>
      searchMatches(
        q,
        record.title,
        record.summary,
        GAME_INFO_CATEGORIES[record.category],
        ...record.tags,
        ...record.conditions.flatMap((condition) => [condition.label, condition.value]),
        ...record.findings,
        ...record.procedure,
        ...record.evidence.flatMap((evidence) => [evidence.label, evidence.description]),
        record.review,
      ),
    )
    .map((record) => ({
      id: `research:${record.category}:${record.slug}`,
      category: "research" as const,
      title: record.title,
      excerpt: searchExcerpt(record.summary),
      detail: "화면 예시 · 실측 아님 · 미검증",
      href: gameInfoHref(record),
    }));
}

export function searchStaticContent(q: string, actor: CurrentUser | null): SearchItem[] {
  const results: SearchItem[] = [];
  for (const item of [...visibleNavigation(actor), ...systemNavigation]) {
    const label = "label" in item && typeof item.label === "string" ? item.label : "";
    if (
      !q ||
      searchMatches(q, item.name, label, item.href, item.href === "/map" ? "파밍 맵" : "")
    ) {
      results.push({
        id: item.href,
        category: "menu",
        title: item.name,
        excerpt: "페이지로 이동",
        href: item.href,
      });
    }
  }
  if (!q) return results;
  results.push(...searchGameInfoExamples(q));
  for (const target of FARMING_TARGETS) {
    const aliases = target.itemIds.flatMap((id) => {
      const item = gearById.get(id);
      return item ? [item.name, ...item.aliases] : [];
    });
    for (const map of ONCE_HUMAN_MAPS) {
      if (!target.markerTypes[map.key]?.length) continue;
      const guide = getFarmingAcquisition(target.key, map.key);
      if (
        !searchMatches(
          q,
          target.label,
          ...aliases,
          target.scopeNote,
          guide?.summary,
          guide?.scopeLabel,
          guide?.location?.label,
        )
      )
        continue;
      results.push({
        id: `${target.key}-${map.key}`,
        category: "farming",
        title: target.label,
        excerpt: searchExcerpt(
          guide?.summary ?? target.scopeNote ?? "지도에서 채집·획득 정보를 확인하세요.",
        ),
        detail: map.label.split(" (")[0],
        href: mapHref(map.key, null, target.key),
      });
    }
  }
  for (const location of MAP_LOCATIONS) {
    for (const map of ONCE_HUMAN_MAPS) {
      if (!location.markerTypes[map.key]?.length) continue;
      const guide = getLocationGuide(location, map.key);
      if (
        !searchMatches(
          q,
          location.label,
          location.categoryLabel,
          guide.summary,
          ...guide.rewards.flatMap((reward) => [reward.label, reward.condition]),
          ...guide.conditions,
        )
      )
        continue;
      results.push({
        id: `${location.key}-${map.key}`,
        category: "location",
        title: location.label,
        excerpt: searchExcerpt(
          [guide.summary, ...guide.rewards.map((reward) => reward.label)].join(" · "),
        ),
        detail: map.label.split(" (")[0],
        href: mapLocationHref(map.key, location.key),
      });
    }
  }
  for (const item of GEAR_CATALOG) {
    if (
      item.legacyOnly ||
      !searchMatches(q, item.name, item.displayName, ...item.aliases, item.description)
    )
      continue;
    results.push({
      id: item.id,
      category: "gear",
      title: item.displayName ?? item.name,
      excerpt: searchExcerpt(item.description),
      href: `/search/items/${encodeURIComponent(item.id)}`,
    });
  }
  // Exact titles first, then prefix matches. Stable source order resolves ties.
  const score = (title: string) =>
    searchMatches(q, title)
      ? title.replace(/\s/g, "").toLowerCase() === q.replace(/\s/g, "").toLowerCase()
        ? 0
        : 1
      : 2;
  return results.sort((left, right) => score(left.title) - score(right.title));
}
