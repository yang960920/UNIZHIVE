import type { Announcement } from "@uniz/domain";
import { DEMO_NOW } from "./current-season";

export interface MockAnnouncement extends Announcement {
  tag: "SEASON" | "OPS" | "RULE";
}

export const mockAnnouncements: MockAnnouncement[] = [
  {
    id: "migration-notice",
    tag: "SEASON",
    title: "S14 이동 일정 및 사전 등록 안내",
    content:
      "다음 시나리오 사전 투표는 10월 12일 23:59 KST에 마감됩니다. 참가 상태를 확인해 주세요. 서버와 이동 일정은 최종 선택 후 확정됩니다.",
    authorId: "demo-officer",
    isPinned: true,
    publishedAt: new Date("2026-10-05T19:00:00+09:00"),
    createdAt: new Date("2026-10-05T19:00:00+09:00"),
    updatedAt: DEMO_NOW,
  },
  {
    id: "raid-roster",
    tag: "OPS",
    title: "레이드 역할 배정 규칙 개정",
    content:
      "오늘 레이드는 21:00 KST입니다. 참가 여부를 선택하고 Support 역할 두 자리를 확인해 주세요.",
    authorId: "demo-officer",
    isPinned: false,
    publishedAt: new Date("2026-10-03T20:00:00+09:00"),
    createdAt: new Date("2026-10-03T20:00:00+09:00"),
    updatedAt: DEMO_NOW,
  },
  {
    id: "storage-rules",
    tag: "RULE",
    title: "하이브 창고 사용 규칙",
    content: "공용 물품 사용 후 기록을 남겨 주세요. 정산 전 보관함을 함께 정리합니다.",
    authorId: "demo-admin",
    isPinned: false,
    publishedAt: new Date("2026-09-28T18:00:00+09:00"),
    createdAt: new Date("2026-09-28T18:00:00+09:00"),
    updatedAt: DEMO_NOW,
  },
];
