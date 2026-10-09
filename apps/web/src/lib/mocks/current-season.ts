import type { Scenario, Season, SeasonPhase, Server } from "@uniz/domain";

/** Fixed product-demo clock. None of these dates describe a live game server. */
export const DEMO_NOW = new Date("2026-10-06T18:00:00+09:00");
export const DEMO_DATE_LABEL = "2026.10.06 18:00 KST";
export const MOCK_SOURCE = "MOCK" as const;

export const mockScenarios: Scenario[] = [
  {
    id: "endless-dream",
    slug: "endless-dream",
    name: "Endless Dream",
    description: "함께 탐사하고, 함께 다음 시즌을 준비합니다.",
    imageUrl: null,
  },
  {
    id: "isles",
    slug: "isles-of-the-abyss",
    name: "Isles of the Abyss",
    description: "바다 너머의 새로운 여정. 탐사 중심 후보 시나리오입니다.",
    imageUrl: null,
  },
  {
    id: "winter",
    slug: "the-way-of-winter",
    name: "The Way of Winter",
    description: "지난 시즌의 경험을 바탕으로 다시 도전하는 혹한의 생존.",
    imageUrl: null,
  },
  {
    id: "manibus",
    slug: "manibus",
    name: "Manibus",
    description: "신규 멤버와 함께 시작하는 익숙한 모험.",
    imageUrl: null,
  },
];

export const mockServers: Server[] = mockScenarios.map((scenario) => ({
  id: `server-${scenario.id}`,
  scenarioId: scenario.id,
  name: "KR-XXXX",
  region: "KR",
}));

export const currentSeason: Season & { settlementAt: Date } = {
  id: "season-13",
  seasonNumber: 13,
  scenarioId: "endless-dream",
  serverId: "server-endless-dream",
  name: "UNIZ Season 13",
  status: "ACTIVE",
  startsAt: new Date("2026-08-20T00:00:00+09:00"),
  settlementAt: new Date("2026-10-24T00:00:00+09:00"),
  currentPhaseId: "s13-phase-3",
  voteClosesAt: new Date("2026-10-12T23:59:00+09:00"),
  createdAt: new Date("2026-08-15T00:00:00+09:00"),
  updatedAt: DEMO_NOW,
};

/** Five fixture records, not a fixed phase-count model or official game schedule. */
export const currentSeasonPhases: SeasonPhase[] = [
  {
    id: "s13-phase-1",
    seasonId: currentSeason.id,
    name: "출발",
    order: 1,
    startsAt: currentSeason.startsAt,
    endsAt: new Date("2026-09-03T00:00:00+09:00"),
  },
  {
    id: "s13-phase-2",
    seasonId: currentSeason.id,
    name: "확장",
    order: 2,
    startsAt: new Date("2026-09-03T00:00:00+09:00"),
    endsAt: new Date("2026-10-01T00:00:00+09:00"),
  },
  {
    id: "s13-phase-3",
    seasonId: currentSeason.id,
    name: "연대",
    order: 3,
    startsAt: new Date("2026-10-01T00:00:00+09:00"),
    endsAt: new Date("2026-10-15T00:00:00+09:00"),
  },
  {
    id: "s13-phase-4",
    seasonId: currentSeason.id,
    name: "이동 준비",
    order: 4,
    startsAt: new Date("2026-10-15T00:00:00+09:00"),
    endsAt: currentSeason.settlementAt,
  },
  {
    id: "s13-phase-settlement",
    seasonId: currentSeason.id,
    name: "정산",
    order: 5,
    startsAt: currentSeason.settlementAt,
    endsAt: null,
  },
];

export const seasonLifecycle = [
  { id: "current", label: "현재 시즌", description: "Phase 3 진행 중", status: "CURRENT" },
  { id: "settlement", label: "정산", description: "10.24 예정", status: "UPCOMING" },
  { id: "scenario", label: "다음 Scenario", description: "사전 투표 진행 중", status: "UPCOMING" },
  { id: "server", label: "Server 선택", description: "시나리오 결정 후", status: "UPCOMING" },
  {
    id: "participation",
    label: "멤버 참가 여부",
    description: "참가 의사 확인",
    status: "UPCOMING",
  },
  { id: "preparation", label: "이동 준비", description: "사전 등록 · 정리", status: "UPCOMING" },
  { id: "next", label: "다음 시즌 시작", description: "함께 다시 시작", status: "UPCOMING" },
] as const;

export interface SeasonHistoryEntry {
  season: Season;
  scenario: Scenario;
  server: Server;
  memberCount: number;
  majorOperations: string;
  topBuild: string;
  imageUrl: string | null;
}

export const seasonHistory: SeasonHistoryEntry[] = [
  {
    season: {
      ...currentSeason,
      id: "season-11",
      seasonNumber: 11,
      name: "UNIZ Season 11",
      scenarioId: "manibus",
      serverId: "server-manibus",
      status: "ARCHIVED",
      startsAt: new Date("2026-04-02T00:00:00+09:00"),
      settlementAt: new Date("2026-05-21T00:00:00+09:00"),
      currentPhaseId: null,
      voteClosesAt: null,
      createdAt: new Date("2026-04-02T00:00:00+09:00"),
      updatedAt: new Date("2026-05-21T00:00:00+09:00"),
    },
    scenario: mockScenarios[3]!,
    server: mockServers[3]!,
    memberCount: 24,
    majorOperations: "Raid 11 · Boss 6",
    topBuild: "화상 저격",
    imageUrl: null,
  },
  {
    season: {
      ...currentSeason,
      id: "season-12",
      seasonNumber: 12,
      name: "UNIZ Season 12",
      scenarioId: "winter",
      serverId: "server-winter",
      status: "ARCHIVED",
      startsAt: new Date("2026-06-04T00:00:00+09:00"),
      settlementAt: new Date("2026-08-06T00:00:00+09:00"),
      currentPhaseId: null,
      voteClosesAt: null,
      createdAt: new Date("2026-06-04T00:00:00+09:00"),
      updatedAt: new Date("2026-08-06T00:00:00+09:00"),
    },
    scenario: mockScenarios[2]!,
    server: mockServers[2]!,
    memberCount: 28,
    majorOperations: "Raid 14 · Migration 1",
    topBuild: "탱커 실드",
    imageUrl: null,
  },
  {
    season: currentSeason,
    scenario: mockScenarios[0]!,
    server: mockServers[0]!,
    memberCount: 31,
    majorOperations: "Raid 7 · Farm 12",
    topBuild: "부식 연사",
    imageUrl: null,
  },
];

export function formatKstDate(value: Date, includeTime = false): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}.${part("month")}.${part("day")}${includeTime ? ` ${part("hour")}:${part("minute")} KST` : ""}`;
}
