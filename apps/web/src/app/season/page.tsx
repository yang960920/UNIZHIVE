import type { Metadata } from "next";
import { SeasonHub } from "@/components/season/season-hub";
import { getCurrentAuthState } from "@/lib/auth";
import { getOperationalPageData } from "@/lib/server/operational-repository";
import { LiveSeasonHub, OperationalAccessNotice } from "@/components/live-operations";
import { canViewMemberDirectory } from "@uniz/domain";
import {
  getSeasonParticipationData,
  SeasonParticipationError,
} from "@/lib/server/season-participation";
import { RegisteredSeasons } from "./seasons-list";
import "../admin/administration.css";

export const metadata: Metadata = {
  title: "Season Hub",
  description:
    "시즌이 바뀌어도 하이브는 남는다. 현재 시즌, 이동 준비, 다음 시나리오 투표와 시즌 기록.",
};

export default async function SeasonPage() {
  const { user, status, retryAfterSeconds } = await getCurrentAuthState();
  if (status === "AUTHENTICATED" && user && !user.isMock && canViewMemberDirectory(user)) {
    let data;
    try {
      data = await getSeasonParticipationData();
    } catch (error) {
      return (
        <OperationalAccessNotice
          mode={
            error instanceof SeasonParticipationError && error.code === "FORBIDDEN"
              ? "PENDING"
              : "ERROR"
          }
          season
          retryAfterSeconds={retryAfterSeconds}
        />
      );
    }
    return <RegisteredSeasons data={data} />;
  }
  const provider = await getOperationalPageData(user, status, retryAfterSeconds);
  if (provider.mode === "LIVE") return <LiveSeasonHub data={provider.data} role={provider.role} />;
  if (provider.mode !== "DEMO")
    return (
      <OperationalAccessNotice
        mode={provider.mode}
        season
        retryAfterSeconds={provider.mode === "ERROR" ? provider.retryAfterSeconds : undefined}
      />
    );
  return <SeasonHub userId={user?.id} role={user?.role ?? "GUEST"} />;
}
