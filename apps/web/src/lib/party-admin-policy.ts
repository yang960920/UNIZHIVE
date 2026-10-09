import { z } from "zod";
import type { CurrentUser } from "./auth-policy";
import { getPartyContentOptions, PARTY_CONTENTS } from "./party-content";
import { partyContributionKeysSchema } from "./party-synergy";

export class PartyAdministrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartyAdministrationError";
  }
}
const date = z.iso.datetime({ offset: true });
export const partySaveSchema = z
  .object({
    id: z.uuid().optional(),
    expectedUpdatedAt: date.optional(),
    seasonId: z.uuid(),
    contentKey: z.enum(PARTY_CONTENTS.map((item) => item.key)),
    title: z.string().trim().min(2).max(120),
    meetingPoint: z.string().trim().max(240),
    description: z.string().trim().max(5000),
    requestedContributions: partyContributionKeysSchema.default([]),
    startsAt: date,
    endsAt: date.nullable(),
    capacity: z.number().int().min(1).max(10000),
    status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]),
  })
  .strict()
  .refine((value) => Boolean(value.id) === Boolean(value.expectedUpdatedAt), {
    message: "최신 모집 정보로 다시 저장해 주세요.",
  });
export type PartySaveInput = z.infer<typeof partySaveSchema>;
export const partyParticipantSchema = z
  .object({
    operationId: z.uuid(),
    userId: z.uuid(),
    expectedUpdatedAt: date,
    action: z.enum(["SET_STATUS", "REMOVE"]),
    status: z.enum(["GOING", "MAYBE", "UNAVAILABLE"]).optional(),
  })
  .strict()
  .refine((value) => value.action === "REMOVE" || Boolean(value.status));

export function requirePartyActor(actor: CurrentUser | null): CurrentUser {
  if (!actor || actor.isMock || !["MEMBER", "OFFICER", "ADMIN"].includes(actor.role))
    throw new PartyAdministrationError("승인된 Discord 멤버로 로그인해 주세요.");
  return actor;
}
export function mayManageParty(
  actor: CurrentUser,
  createdById: string,
  enrolled: boolean,
): boolean {
  return (
    actor.role === "ADMIN" ||
    actor.role === "OFFICER" ||
    (actor.role === "MEMBER" && enrolled && actor.id === createdById)
  );
}
export function assertPartyContent(
  key: string,
  scenarioSlug: string,
  gravityContentEnabled: boolean,
) {
  const content = getPartyContentOptions({ scenarioSlug, gravityContentEnabled }).find(
    (item) => item.key === key,
  );
  if (!content) throw new PartyAdministrationError("선택한 시즌에서 사용할 수 없는 콘텐츠입니다.");
  return content;
}
