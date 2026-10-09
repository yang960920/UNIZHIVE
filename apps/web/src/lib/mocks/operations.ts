import type { Operation, OperationParticipant, OperationRole } from "@uniz/domain";
import { currentSeason, DEMO_NOW } from "./current-season";
import { mockMembers } from "./members";

export const nextOperation: Operation = {
  id: "prime-war-1006",
  seasonId: currentSeason.id,
  title: "Prime War 보스 레이드",
  type: "PRIME_WAR",
  description: "Endless Dream · Blackheart Region · #하이브-보이스-1",
  startsAt: new Date("2026-10-06T21:00:00+09:00"),
  endsAt: new Date("2026-10-06T22:30:00+09:00"),
  capacity: 20,
  createdById: "demo-officer",
  status: "SCHEDULED",
  createdAt: new Date("2026-10-03T00:00:00+09:00"),
  updatedAt: DEMO_NOW,
};

export const operationRoles: OperationRole[] = [];

export const operationParticipants: OperationParticipant[] = mockMembers
  .slice(0, 21)
  .map((member, index) => ({
    id: `participant-${member.userId}`,
    operationId: nextOperation.id,
    userId: member.userId,
    roleId: null,
    status: index < 14 ? "GOING" : index < 18 ? "MAYBE" : "UNAVAILABLE",
    createdAt: DEMO_NOW,
    updatedAt: DEMO_NOW,
  }));
