import {
  COMMUNITY_CATEGORY_LABELS,
  communityPage,
  normalizeCommunityQuery,
} from "../../lib/community-policy";
import type { CommunitySection } from "../../lib/community-policy";
export const communityCategoryLabels = COMMUNITY_CATEGORY_LABELS;

export function communityReturnFilters(query: Record<string, string | string[] | undefined>) {
  const candidate = Array.isArray(query.category) ? query.category[0] : query.category;
  const section = Array.isArray(query.section) ? query.section[0] : query.section;
  return {
    q: normalizeCommunityQuery(query.q),
    category:
      typeof candidate === "string" && Object.hasOwn(communityCategoryLabels, candidate)
        ? candidate
        : null,
    page: communityPage(query.page),
    ...(section === "SHOWCASE" || candidate === "SHOWCASE" ? { section: "SHOWCASE" as const } : {}),
  };
}

export function communityHref(input: {
  q?: string;
  category?: string | null;
  page?: number;
  admin?: boolean;
  section?: CommunitySection;
}): string {
  const showcase =
    !input.admin &&
    (input.section === "SHOWCASE" || (input.section !== "BOARD" && input.category === "SHOWCASE"));
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.category && !showcase) params.set("category", input.category);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const base = input.admin ? "/admin/community" : showcase ? "/community/showcase" : "/community";
  return params.size ? `${base}?${params}` : base;
}

export function communityDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function communityParagraphs(value: string): string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n[\t ]*\n/)
    .filter((paragraph) => paragraph.trim().length > 0);
}

export function announcementIsScheduled(publishedAt: string, asOf: string): boolean {
  return new Date(publishedAt).getTime() > new Date(asOf).getTime();
}

export function communityPostHref(
  id: string,
  filters: { q?: string; category?: string | null; page?: number; section?: CommunitySection } = {},
): string {
  const params = new URLSearchParams();
  const showcase =
    filters.section === "SHOWCASE" ||
    (filters.section !== "BOARD" && filters.category === "SHOWCASE");
  if (filters.q) params.set("q", filters.q);
  if (filters.category && !showcase) params.set("category", filters.category);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (showcase) params.set("section", "SHOWCASE");
  return `/community/${encodeURIComponent(id)}${params.size ? `?${params}` : ""}`;
}
