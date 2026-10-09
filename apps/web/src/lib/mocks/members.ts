import type { HiveRole, PublicMemberProfile, SeasonMembership } from "@uniz/domain";
import { currentSeason, DEMO_NOW } from "./current-season";

export interface MockMember extends PublicMemberProfile {
  role: HiveRole;
  online: boolean;
}

const names = [
  "Kiri",
  "Moss",
  "Yun",
  "Haru",
  "Sol",
  "Jin",
  "Nari",
  "Rin",
  "Aru",
  "Bora",
  "Ciel",
  "Dawn",
  "Eden",
  "Fern",
  "Gale",
  "Haze",
  "Iris",
  "Jade",
  "Kai",
  "Luna",
  "Miri",
  "Noa",
  "Owl",
  "Pine",
  "Rune",
  "Sora",
  "Tori",
  "Uri",
  "Vale",
  "Wisp",
  "Zin",
];
export const mockMembers: MockMember[] = names.map((name, index) => ({
  id: `profile-${name.toLowerCase()}`,
  userId:
    index === 0
      ? "demo-member"
      : index === 1
        ? "demo-officer"
        : index === 2
          ? "demo-admin"
          : `mock-${name.toLowerCase()}`,
  handle: name.toLowerCase(),
  displayName: name,
  onceHumanNickname: name,
  bio: null,
  role: index === 1 ? "OFFICER" : index === 2 ? "ADMIN" : "MEMBER",
  online: index < 12,
  joinedAt: new Date("2026-08-20T00:00:00+09:00"),
  createdAt: new Date("2026-08-20T00:00:00+09:00"),
  updatedAt: DEMO_NOW,
}));

/** Ready includes READY + MIGRATED: 18 + 5 = 23 of 31. */
export const mockSeasonMemberships: SeasonMembership[] = mockMembers.map((member, index) => ({
  id: `membership-${currentSeason.id}-${member.userId}`,
  seasonId: currentSeason.id,
  userId: member.userId,
  migrationStatus:
    index === 0 || (index >= 24 && index <= 26)
      ? "PRE_REGISTERED"
      : index >= 29
        ? "UNDECIDED"
        : index >= 27
          ? "JOINING"
          : index >= 19 && index <= 23
            ? "MIGRATED"
            : "READY",
  joinedAt: currentSeason.startsAt,
  createdAt: currentSeason.startsAt,
  updatedAt: DEMO_NOW,
}));
