import type { CurrentUser } from "./auth-policy";

export const SEARCH_CATEGORIES = {
  build: "빌드 연구실",
  community: "커뮤니티",
  announcement: "공지",
  party: "파티 모집",
  season: "시즌",
  farming: "파밍 대상",
  location: "장소와 드랍 정보",
  gear: "게임 장비",
  research: "게임 정보",
  news: "공식 소식",
  member: "하이브 멤버",
  menu: "페이지",
} as const;
export type SearchCategory = keyof typeof SEARCH_CATEGORIES;
export interface SearchItem {
  id: string;
  category: SearchCategory;
  title: string;
  excerpt: string;
  href: string;
  detail?: string;
  external?: boolean;
}
export interface SearchGroup {
  category: SearchCategory;
  items: SearchItem[];
  hasMore: boolean;
}
export interface UnifiedSearchData {
  q: string;
  page: number;
  category: SearchCategory | null;
  groups: SearchGroup[];
  mode: "LIVE" | "PUBLIC" | "DEMO" | "LIMITED";
  notice: string | null;
}
export function normalizeSearchQuery(input: unknown): string {
  return typeof input === "string"
    ? Array.from(
        input
          .normalize("NFKC")
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .trim()
          .replace(/\s+/g, " "),
      )
        .slice(0, 80)
        .join("")
    : "";
}
export function compactSearchText(input: string): string {
  return input.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}
export function searchMatches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const compact = compactSearchText(query);
  return Boolean(
    compact && fields.some((value) => value && compactSearchText(value).includes(compact)),
  );
}
export function searchPattern(query: string): string {
  return `%${compactSearchText(query).replace(/[\\%_]/g, "\\$&")}%`;
}
export function searchCategory(input: unknown): SearchCategory | null {
  return typeof input === "string" && Object.hasOwn(SEARCH_CATEGORIES, input)
    ? (input as SearchCategory)
    : null;
}
export function searchPage(input: unknown): number {
  const value = typeof input === "string" && /^\d{1,2}$/.test(input) ? Number(input) : 1;
  return Math.max(1, Math.min(50, value));
}
export function isSearchMember(user: CurrentUser | null | undefined): user is CurrentUser {
  return Boolean(
    user &&
    !user.isMock &&
    !user.id.startsWith("demo-") &&
    ["MEMBER", "OFFICER", "ADMIN"].includes(user.role),
  );
}
export function searchHref(q: string, category?: SearchCategory | null, page = 1): string {
  const params = new URLSearchParams();
  if (q) params.set("q", normalizeSearchQuery(q));
  if (category) params.set("category", category);
  if (page > 1) params.set("page", String(page));
  return `/search${params.size ? `?${params}` : ""}`;
}
export function searchExcerpt(value: string | null | undefined): string {
  const plain = (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(plain);
  return chars.slice(0, 180).join("") + (chars.length > 180 ? "…" : "");
}
