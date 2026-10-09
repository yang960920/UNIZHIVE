import "server-only";
import { and, desc, eq, getDb, scenarios, seasons, sql } from "@uniz/db";
import type { CurrentAuthState } from "../auth-policy";
import { scenarioSlugToMap } from "../map-preferences";

export async function getCurrentPreferredMap(state: CurrentAuthState) {
  const user = state.user;
  if (
    state.status !== "AUTHENTICATED" ||
    !user ||
    !["MEMBER", "OFFICER", "ADMIN"].includes(user.role) ||
    user.isMock
  )
    return "MANIBUS" as const;
  const [current] = await getDb()
    .select({ slug: scenarios.slug })
    .from(seasons)
    .innerJoin(scenarios, eq(scenarios.id, seasons.scenarioId))
    .where(
      and(
        eq(seasons.approvalStatus, "APPROVED"),
        sql`${seasons.status} in ('ACTIVE', 'SETTLEMENT')`,
      ),
    )
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);
  return scenarioSlugToMap(current?.slug ?? null);
}
