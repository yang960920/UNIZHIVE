import { z } from "zod";
import {
  parsePlannerLoadout,
  PLANNER_MAX_PAYLOAD_BYTES,
  plannerLoadoutSchema,
  gearLoadoutSchema,
  parseGearLoadoutForSave,
  GEAR_SCHEMA_VERSION,
  countGearKeyArmors,
  getGearTraitConflicts,
  getConsumableSlotLimits,
} from "@uniz/build-engine";
import type { CurrentUser } from "./auth-policy";
import type { BuildVisibility } from "./data/build-planner-types";
import { contentPlainText, parseContentDocument, parseYouTubeUrl } from "./content-document";

export const buildPlannerErrors = {
  UNAUTHENTICATED: "Discord로 로그인한 후 빌드를 저장해 주세요.",
  MOCK_ACTOR: "개발 계정은 실제 빌드를 저장하거나 변경할 수 없습니다.",
  FORBIDDEN: "본인이 작성한 빌드는 승인된 멤버 계정으로만 변경할 수 있습니다.",
  PROFILE_REQUIRED: "게임 프로필 등록을 완료한 후 빌드를 저장해 주세요.",
  INVALID_INPUT: "빌드 제목, 구성과 공개 범위를 확인해 주세요.",
  KEY_ARMOR_LIMIT:
    "핵심 방어구는 1개만 장착할 수 있습니다. 추가 핵심 방어구를 변경하거나 해제해 주세요.",
  TRAIT_ICON_LIMIT:
    "같은 아이콘의 감염물 특성은 1개만 등록할 수 있습니다. 중복된 특성을 해제해 주세요.",
  TRAIT_SHINY_LIMIT: "이로치 특성은 1개만 등록할 수 있습니다. 중복된 이로치 특성을 해제해 주세요.",
  CONSUMABLE_LIMIT:
    "셰프는 음식과 음료를 각각 2개, 그 외 직업은 각각 1개까지 선택할 수 있습니다. 추가 도핑을 해제해 주세요.",
  PAYLOAD_TOO_LARGE: "빌드 입력이 너무 큽니다. 구성과 메모를 줄여 주세요.",
  NOT_FOUND: "빌드를 찾을 수 없습니다.",
  CONFLICT: "다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 저장해 주세요.",
  ARCHIVED: "보관한 빌드는 수정할 수 없습니다. 이전 버전은 계속 확인할 수 있습니다.",
  NOT_ARCHIVED: "현재 보관 중인 빌드만 복원할 수 있습니다.",
  VERSION_LIMIT: "더 이상 새 버전 번호를 생성할 수 없습니다.",
  UNAVAILABLE: "지금은 빌드 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
} as const;

export class BuildPlannerError extends Error {
  constructor(public readonly code: keyof typeof buildPlannerErrors) {
    super(buildPlannerErrors[code]);
    this.name = "BuildPlannerError";
  }
}

const visibility = z.enum(["PRIVATE", "HIVE", "PUBLIC"]);
const existing = { buildId: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }) };
export const buildPlannerMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("SAVE_BUILD"),
      buildId: existing.buildId.optional(),
      expectedUpdatedAt: existing.expectedUpdatedAt.optional(),
      title: z.string().trim().min(2).max(100),
      description: z.string().trim().max(5000).default(""),
      visibility,
      loadout: z.union([plannerLoadoutSchema, gearLoadoutSchema]),
      notes: z.string().trim().max(2000).default(""),
      bodyDocument: z.unknown().optional(),
      youtubeUrl: z.string().max(2048).nullable().optional(),
    })
    .strict()
    .superRefine((input, context) => {
      if (Boolean(input.buildId) !== Boolean(input.expectedUpdatedAt)) {
        context.addIssue({
          code: "custom",
          path: ["expectedUpdatedAt"],
          message: buildPlannerErrors.CONFLICT,
        });
      }
    }),
  z.object({ action: z.literal("SET_VISIBILITY"), ...existing, visibility }).strict(),
  z.object({ action: z.literal("ARCHIVE"), ...existing }).strict(),
  z.object({ action: z.literal("RESTORE"), ...existing }).strict(),
]);

export type BuildPlannerMutation = z.infer<typeof buildPlannerMutationSchema>;

/** Bound the entire request before recursively validating loadout and catalog references. */
export function parseBuildPlannerMutation(value: unknown): BuildPlannerMutation {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new BuildPlannerError("INVALID_INPUT");
  }
  if (!serialized) throw new BuildPlannerError("INVALID_INPUT");
  if (new TextEncoder().encode(serialized).byteLength > PLANNER_MAX_PAYLOAD_BYTES) {
    throw new BuildPlannerError("PAYLOAD_TOO_LARGE");
  }
  const parsed = buildPlannerMutationSchema.safeParse(value);
  if (!parsed.success) throw new BuildPlannerError("INVALID_INPUT");
  if (parsed.data.action === "SAVE_BUILD") {
    try {
      parsed.data.bodyDocument = parseContentDocument(parsed.data.bodyDocument);
      parsed.data.youtubeUrl = parseYouTubeUrl(parsed.data.youtubeUrl);
      if (parsed.data.bodyDocument) {
        const plain = contentPlainText(parseContentDocument(parsed.data.bodyDocument)!);
        if (plain.length > 5000) throw new Error("Build description too long");
        parsed.data.description = plain;
      }
      parsed.data.loadout =
        parsed.data.loadout.schemaVersion === GEAR_SCHEMA_VERSION
          ? parseGearLoadoutForSave(parsed.data.loadout)
          : parsePlannerLoadout(parsed.data.loadout);
    } catch {
      if (
        parsed.data.loadout.schemaVersion === GEAR_SCHEMA_VERSION &&
        countGearKeyArmors(parsed.data.loadout.slots) > 1
      )
        throw new BuildPlannerError("KEY_ARMOR_LIMIT");
      if (parsed.data.loadout.schemaVersion === GEAR_SCHEMA_VERSION) {
        const consumables = parsed.data.loadout.consumables;
        const limits = getConsumableSlotLimits(parsed.data.loadout.context.characterClass);
        if (
          consumables &&
          (consumables.foodIds.length > limits.food || consumables.drinkIds.length > limits.drink)
        )
          throw new BuildPlannerError("CONSUMABLE_LIMIT");
        const conflicts = parsed.data.loadout.slots.flatMap((selection) =>
          getGearTraitConflicts(selection.traitIds),
        );
        if (conflicts.some((conflict) => conflict.code === "DUPLICATE_SHINY"))
          throw new BuildPlannerError("TRAIT_SHINY_LIMIT");
        if (conflicts.length) throw new BuildPlannerError("TRAIT_ICON_LIMIT");
      }
      throw new BuildPlannerError("INVALID_INPUT");
    }
  }
  return parsed.data;
}

export function isApprovedBuildActor(actor: CurrentUser | null): actor is CurrentUser {
  return Boolean(
    actor &&
    !actor.isMock &&
    !actor.id.startsWith("demo-") &&
    (actor.role === "MEMBER" || actor.role === "OFFICER" || actor.role === "ADMIN"),
  );
}

export function requireBuildActor(actor: CurrentUser | null): CurrentUser {
  if (!actor) throw new BuildPlannerError("UNAUTHENTICATED");
  if (actor.isMock || actor.id.startsWith("demo-")) throw new BuildPlannerError("MOCK_ACTOR");
  if (!isApprovedBuildActor(actor)) throw new BuildPlannerError("FORBIDDEN");
  return actor;
}

export function canReadPlannerBuild(
  actor: CurrentUser | null,
  build: {
    ownerId: string;
    visibility: BuildVisibility;
    archivedAt: Date | null;
    approvedVisibility?: "HIVE" | "PUBLIC" | null;
  },
): boolean {
  const owner = isApprovedBuildActor(actor) && actor.id === build.ownerId;
  if (build.archivedAt) return owner;
  return (
    build.approvedVisibility === "PUBLIC" ||
    owner ||
    (build.approvedVisibility === "HIVE" && isApprovedBuildActor(actor))
  );
}

export function assertBuildOwner(
  actor: CurrentUser,
  build: { ownerId: string; archivedAt: Date | null; updatedAt: Date },
  expectedUpdatedAt: string,
  allowArchived = false,
): void {
  requireBuildActor(actor);
  // Administrative roles do not grant access to someone else's private build.
  if (actor.id !== build.ownerId) throw new BuildPlannerError("FORBIDDEN");
  if (build.archivedAt && !allowArchived) throw new BuildPlannerError("ARCHIVED");
  if (new Date(expectedUpdatedAt).getTime() !== build.updatedAt.getTime()) {
    throw new BuildPlannerError("CONFLICT");
  }
}

export function nextBuildTimestamp(previous: Date | null, now = new Date()): Date {
  return new Date(Math.max(now.getTime(), (previous?.getTime() ?? 0) + 1));
}
