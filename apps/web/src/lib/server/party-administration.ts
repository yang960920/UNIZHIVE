import "server-only";
import {
  accounts,
  and,
  auditLogs,
  desc,
  eq,
  getDb,
  operations,
  operationParticipants,
  scenarios,
  seasonMemberships,
  seasons,
  servers,
  sql,
  users,
} from "@uniz/db";
import { hasGravityContent, type PartyContributionKey, type SeasonStatus } from "@uniz/domain";
import { getCurrentAuthState } from "../auth";
import type { CurrentUser } from "../auth-policy";
import {
  assertOperationSaveAllowed,
  OperationAdministrationError,
} from "../operation-admin-policy";
import { OperationalPolicyError, requireOpenOperation } from "../operational-policy";
import { getSessionGuildEligibilityState } from "./discord-authorization";
import {
  assertPartyContent,
  mayManageParty,
  PartyAdministrationError,
  partyParticipantSchema,
  partySaveSchema,
  requirePartyActor,
} from "../party-admin-policy";
import { getPartyContent, type PartyContentKey } from "../party-content";

export { PartyAdministrationError } from "../party-admin-policy";
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
const AUTHORIZATION_LOCK = 912743110;
export interface PartySeasonOption {
  id: string;
  name: string;
  serverAddress: string;
  scenarioSlug: string;
  gravityContentEnabled: boolean;
  startsAt: string;
  settlementAt: string | null;
  status: SeasonStatus;
}
export interface PartyEditorInitial {
  id: string;
  seasonId: string;
  title: string;
  contentKey: PartyContentKey;
  meetingPoint: string;
  description: string;
  requestedContributions: PartyContributionKey[];
  startsAt: string;
  endsAt: string | null;
  capacity: number;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  updatedAt: string;
  createdById: string;
}
export interface PartyEditorData {
  seasons: PartySeasonOption[];
  initial?: PartyEditorInitial;
}

async function sessionActor() {
  const state = await getCurrentAuthState();
  if (state.status === "UNAVAILABLE")
    throw new PartyAdministrationError("로그인은 유지됩니다. 연결 확인 후 다시 시도해 주세요.");
  if (state.status !== "AUTHENTICATED")
    throw new PartyAdministrationError("Discord로 다시 로그인해 주세요.");
  return requirePartyActor(state.user);
}
async function freshActor(transaction: Transaction, actor: CurrentUser, write: boolean) {
  const [row] = await transaction
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, actor.id))
    .for(write ? "update" : "share");
  const fresh = requirePartyActor(row ? { ...row, isMock: false } : null);
  const [account] = await transaction
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, fresh.id), eq(accounts.provider, "discord")))
    .limit(1);
  if (!account)
    throw new PartyAdministrationError("Discord 연결을 확인한 뒤 다시 로그인해 주세요.");
  return fresh;
}
async function isEnrolled(transaction: Transaction, seasonId: string, userId: string) {
  const [membership] = await transaction
    .select({ id: seasonMemberships.id })
    .from(seasonMemberships)
    .where(
      and(
        eq(seasonMemberships.seasonId, seasonId),
        eq(seasonMemberships.userId, userId),
        sql`${seasonMemberships.removedAt} IS NULL`,
      ),
    )
    .limit(1);
  return Boolean(membership);
}
function requireVersion(expected: string, actual: Date) {
  if (new Date(expected).getTime() !== actual.getTime())
    throw new PartyAdministrationError(
      "모집 정보나 참가 명단이 변경되었습니다. 새로고침 후 다시 시도해 주세요.",
    );
}
function nextVersion(actual?: Date) {
  return new Date(Math.max(Date.now(), (actual?.getTime() ?? 0) + 1));
}

export async function getPartyEditorData(id?: string): Promise<PartyEditorData> {
  if (id && !partySaveSchema.shape.id.safeParse(id).success)
    throw new PartyAdministrationError("모집을 찾을 수 없습니다.");
  const session = await sessionActor();
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
    const actor = await freshActor(transaction, session, false);
    const rows = await transaction
      .select({ season: seasons, scenario: scenarios, server: servers })
      .from(seasons)
      .innerJoin(scenarios, eq(scenarios.id, seasons.scenarioId))
      .innerJoin(servers, eq(servers.id, seasons.serverId))
      .where(
        and(eq(seasons.approvalStatus, "APPROVED"), sql`${seasons.status} IN ('PLANNED','ACTIVE')`),
      )
      .orderBy(desc(seasons.startsAt));
    const options: PartySeasonOption[] = [];
    const memberships = await transaction
      .select({ seasonId: seasonMemberships.seasonId })
      .from(seasonMemberships)
      .where(
        and(eq(seasonMemberships.userId, actor.id), sql`${seasonMemberships.removedAt} IS NULL`),
      );
    const enrolledIds = new Set(memberships.map((membership) => membership.seasonId));
    for (const row of rows) {
      if (actor.role === "MEMBER" && !enrolledIds.has(row.season.id)) continue;
      options.push({
        id: row.season.id,
        name: row.season.name,
        serverAddress: row.server.name,
        scenarioSlug: row.scenario.slug,
        gravityContentEnabled: hasGravityContent(
          row.season.trancePhenomenon,
          row.season.gravityContentEnabled,
        ),
        startsAt: row.season.startsAt.toISOString(),
        settlementAt: row.season.settlementAt?.toISOString() ?? null,
        status: row.season.status,
      });
    }
    if (!id) return { seasons: options };
    const [party] = await transaction.select().from(operations).where(eq(operations.id, id));
    if (!party) throw new PartyAdministrationError("모집을 찾을 수 없습니다.");
    if (!party.seasonId)
      throw new PartyAdministrationError(
        "하이브 공통 작전은 기존 작전 관리 화면에서 수정해 주세요.",
      );
    if (
      !mayManageParty(
        actor,
        party.createdById,
        await isEnrolled(transaction, party.seasonId, actor.id),
      )
    )
      throw new PartyAdministrationError("이 모집을 수정할 권한이 없습니다.");
    if (!options.some((option) => option.id === party.seasonId))
      throw new PartyAdministrationError(
        "종료되었거나 승인되지 않은 시즌의 모집은 수정할 수 없습니다.",
      );
    const genericKey = party.type === "PRIME_WAR" ? "prime-war" : party.type.toLowerCase();
    const contentKey =
      getPartyContent(party.contentKey)?.key ?? getPartyContent(genericKey)?.key ?? "other";
    return {
      seasons: options,
      initial: {
        id: party.id,
        seasonId: party.seasonId,
        title: party.title,
        contentKey,
        meetingPoint: party.meetingPoint,
        description: party.description,
        requestedContributions: party.requestedContributions,
        startsAt: party.startsAt.toISOString(),
        endsAt: party.endsAt?.toISOString() ?? null,
        capacity: party.capacity,
        status: party.status,
        updatedAt: party.updatedAt.toISOString(),
        createdById: party.createdById,
      },
    };
  });
}

export async function saveParty(value: unknown): Promise<{ id: string }> {
  const parsed = partySaveSchema.safeParse(value);
  if (!parsed.success)
    throw new PartyAdministrationError("모집 내용, 시간, 정원과 최신 저장 시각을 확인해 주세요.");
  const input = parsed.data;
  const session = await sessionActor();
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(${AUTHORIZATION_LOCK})`);
    const actor = await freshActor(transaction, session, true);
    const [reference] = input.id
      ? await transaction
          .select({ seasonId: operations.seasonId })
          .from(operations)
          .where(eq(operations.id, input.id))
      : [];
    if (input.id && (!reference || !reference.seasonId))
      throw new PartyAdministrationError("이 모집은 기존 작전 관리 화면에서 확인해 주세요.");
    const locked = [];
    for (const seasonId of [
      ...new Set([reference?.seasonId, input.seasonId].filter(Boolean)),
    ].sort()) {
      const [row] = await transaction
        .select({ season: seasons, scenarioSlug: scenarios.slug })
        .from(seasons)
        .innerJoin(scenarios, eq(scenarios.id, seasons.scenarioId))
        .where(eq(seasons.id, seasonId!))
        .for("update", { of: seasons });
      if (row) locked.push(row);
    }
    const target = locked.find((row) => row.season.id === input.seasonId);
    if (!target) throw new PartyAdministrationError("시즌을 찾을 수 없습니다.");
    const [existing] = input.id
      ? await transaction.select().from(operations).where(eq(operations.id, input.id)).for("update")
      : [];
    if (input.id && (!existing || existing.seasonId !== reference?.seasonId))
      throw new PartyAdministrationError("모집 정보가 변경되었습니다. 다시 확인해 주세요.");
    const enrolled = await isEnrolled(transaction, input.seasonId, actor.id);
    if (
      actor.role === "MEMBER" &&
      (!enrolled ||
        (existing &&
          !mayManageParty(
            actor,
            existing.createdById,
            await isEnrolled(transaction, existing.seasonId!, actor.id),
          )))
    )
      throw new PartyAdministrationError(
        "참가 중인 시즌에 모집하거나 본인의 모집만 수정할 수 있습니다.",
      );
    const content =
      existing &&
      input.status === "CANCELLED" &&
      existing.seasonId === input.seasonId &&
      existing.contentKey === input.contentKey
        ? getPartyContent(input.contentKey)!
        : assertPartyContent(
            input.contentKey,
            target.scenarioSlug,
            hasGravityContent(target.season.trancePhenomenon, target.season.gravityContentEnabled),
          );
    const [counts] = existing
      ? await transaction
          .select({
            participants: sql<number>`count(*)::integer`,
            going: sql<number>`count(*) filter (where ${operationParticipants.status}='GOING')::integer`,
          })
          .from(operationParticipants)
          .where(eq(operationParticipants.operationId, existing.id))
      : [];
    try {
      assertOperationSaveAllowed({
        input: { ...input, action: "SAVE_OPERATION", type: content.type },
        existing: existing ?? null,
        currentSeason: locked.find((row) => row.season.id === existing?.seasonId)?.season ?? null,
        targetSeason: target.season,
        participantCount: counts?.participants ?? 0,
        goingCount: counts?.going ?? 0,
        now: new Date(),
      });
    } catch (error) {
      if (error instanceof OperationAdministrationError)
        throw new PartyAdministrationError(error.message);
      throw error;
    }
    const values = {
      seasonId: input.seasonId,
      title: input.title,
      contentKey: content.key,
      type: content.type,
      meetingPoint: input.meetingPoint,
      description: input.description,
      requestedContributions: input.requestedContributions,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      capacity: input.capacity,
      status: input.status,
      updatedAt: nextVersion(existing?.updatedAt),
    };
    const [saved] = existing
      ? await transaction
          .update(operations)
          .set(values)
          .where(eq(operations.id, existing.id))
          .returning({ id: operations.id })
      : await transaction
          .insert(operations)
          .values({ ...values, createdById: actor.id })
          .returning({ id: operations.id });
    if (!saved) throw new PartyAdministrationError("모집을 저장하지 못했습니다.");
    await transaction.insert(auditLogs).values({
      actorId: actor.id,
      action: existing ? "party.updated" : "party.created",
      entityType: "operation",
      entityId: saved.id,
      metadata: { seasonId: input.seasonId, contentKey: content.key, status: input.status },
    });
    return saved;
  });
}

export async function managePartyParticipant(value: unknown): Promise<void> {
  const parsed = partyParticipantSchema.safeParse(value);
  if (!parsed.success)
    throw new PartyAdministrationError("참가자와 최신 모집 정보를 확인해 주세요.");
  const input = parsed.data;
  const session = await sessionActor();
  if (session.role !== "OFFICER" && session.role !== "ADMIN")
    throw new PartyAdministrationError("참가 명단은 운영진만 변경할 수 있습니다.");
  const targetStatus = input.action === "REMOVE" ? "UNAVAILABLE" : input.status!;
  if (targetStatus !== "UNAVAILABLE") {
    const eligibility = await getSessionGuildEligibilityState(input.userId);
    if (eligibility.status !== "MEMBER")
      throw new PartyAdministrationError("참가자의 Discord 서버 가입 상태를 확인해 주세요.");
  }
  await getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(${AUTHORIZATION_LOCK})`);
    const actor = await freshActor(transaction, session, true);
    if (actor.role !== "OFFICER" && actor.role !== "ADMIN")
      throw new PartyAdministrationError("참가 명단은 운영진만 변경할 수 있습니다.");
    const [reference] = await transaction
      .select({ seasonId: operations.seasonId })
      .from(operations)
      .where(eq(operations.id, input.operationId));
    if (!reference?.seasonId) throw new PartyAdministrationError("시즌 모집을 찾을 수 없습니다.");
    const [season] = await transaction
      .select()
      .from(seasons)
      .where(eq(seasons.id, reference.seasonId))
      .for("update");
    const [party] = await transaction
      .select()
      .from(operations)
      .where(eq(operations.id, input.operationId))
      .for("update");
    if (!season || !party || party.seasonId !== reference.seasonId)
      throw new PartyAdministrationError("모집을 찾을 수 없습니다.");
    requireVersion(input.expectedUpdatedAt, party.updatedAt);
    if (season.approvalStatus !== "APPROVED" || !["PLANNED", "ACTIVE"].includes(season.status))
      throw new PartyAdministrationError("이 시즌은 참가 명단을 변경할 수 없습니다.");
    if (party.contentKey && targetStatus !== "UNAVAILABLE") {
      const [scenario] = await transaction
        .select({ slug: scenarios.slug })
        .from(scenarios)
        .where(eq(scenarios.id, season.scenarioId));
      assertPartyContent(
        party.contentKey,
        scenario?.slug ?? "",
        hasGravityContent(season.trancePhenomenon, season.gravityContentEnabled),
      );
    }
    const roster = await transaction
      .select()
      .from(operationParticipants)
      .where(eq(operationParticipants.operationId, party.id));
    const previous = roster.find((entry) => entry.userId === input.userId);
    if (input.action === "REMOVE" && !previous)
      throw new PartyAdministrationError("등록된 참가자를 찾을 수 없습니다.");
    if (targetStatus !== "UNAVAILABLE") {
      const [target] = await transaction
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .for("share");
      const [account] = await transaction
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, input.userId), eq(accounts.provider, "discord")))
        .limit(1);
      if (
        !target ||
        !["MEMBER", "OFFICER", "ADMIN"].includes(target.role) ||
        !account ||
        !(await isEnrolled(transaction, season.id, input.userId))
      )
        throw new PartyAdministrationError("해당 시즌에 등록된 승인 멤버만 참가할 수 있습니다.");
    } else if (!previous) {
      throw new PartyAdministrationError("등록된 참가자를 찾을 수 없습니다.");
    }
    try {
      requireOpenOperation(
        party,
        targetStatus,
        roster.filter((entry) => entry.status === "GOING").length,
        previous?.status ?? null,
        new Date(),
      );
    } catch (error) {
      if (error instanceof OperationalPolicyError)
        throw new PartyAdministrationError(error.message);
      throw error;
    }
    await transaction
      .insert(operationParticipants)
      .values({ operationId: party.id, userId: input.userId, status: targetStatus })
      .onConflictDoUpdate({
        target: [operationParticipants.operationId, operationParticipants.userId],
        set: {
          status: targetStatus,
          ...(input.action === "REMOVE" ? { roleId: null } : {}),
          updatedAt: new Date(),
        },
      });
    await transaction
      .update(operations)
      .set({ updatedAt: nextVersion(party.updatedAt) })
      .where(eq(operations.id, party.id));
    await transaction.insert(auditLogs).values({
      actorId: actor.id,
      action: input.action === "REMOVE" ? "party.participant.removed" : "party.participant.updated",
      entityType: "operation",
      entityId: party.id,
      metadata: {
        userId: input.userId,
        status: targetStatus,
        previousStatus: previous?.status ?? null,
      },
    });
  });
}
