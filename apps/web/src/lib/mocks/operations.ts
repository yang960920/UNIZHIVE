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

export const operationRoles: OperationRole[] = [
  { id: "op-tank", operationId: nextOperation.id, name: "Tank", capacity: 2 },
  { id: "op-dps", operationId: nextOperation.id, name: "DPS", capacity: 10 },
  { id: "op-support", operationId: nextOperation.id, name: "Support", capacity: 4 },
  { id: "op-gatherer", operationId: nextOperation.id, name: "Gatherer", capacity: 2 },
  { id: "op-driver", operationId: nextOperation.id, name: "Driver", capacity: 2 },
];

export const operationParticipants: OperationParticipant[] = mockMembers
  .slice(0, 21)
  .map((member, index) => ({
    id: `participant-${member.userId}`,
    operationId: nextOperation.id,
    userId: member.userId,
    roleId: operationRoles.find((role) => role.name === member.combatRole)?.id ?? null,
    status: index < 14 ? "GOING" : index < 18 ? "MAYBE" : "UNAVAILABLE",
    createdAt: DEMO_NOW,
    updatedAt: DEMO_NOW,
  }));
