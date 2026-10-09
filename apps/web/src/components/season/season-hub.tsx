"use client";

import Link from "next/link";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import { Badge, PageHeader } from "@uniz/ui";
import { canUpdateOwnMigration, canVoteInSeason, type HiveRole } from "@uniz/domain";
import { useDashboardData } from "@/lib/data";
import { DEMO_DATE_LABEL } from "@/lib/mocks/current-season";
import { CurrentSeasonCard } from "./current-season-card";
import { SeasonLifecycle } from "./lifecycle";
import { MigrationBoard } from "./migration-board";
import { ScenarioVote } from "./scenario-vote";
import { SeasonHistory } from "./season-history";
import "./season.css";

export function SeasonHub({ userId, role }: { userId?: string; role: HiveRole }) {
  const { data, setVote, setMigrationStatus, resetDemo, canInteract, storageAvailable } =
    useDashboardData(userId, role);
  return (
    <div className="season-hub">
      <PageHeader
        eyebrow="SEASON HUB"
        title="서버가 바뀌어도, 우리는 함께."
        description="현재 시즌부터 다음 여정까지. UNIZ의 모든 시즌을 이어갑니다."
        action={
          <Link className="button button-quiet" href="/#next-operation">
            오늘의 오퍼레이션
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        }
      />
      <div className="season-demo-caption">
        <span>
          <Badge>MOCK</Badge> 예시 데이터 · 기준 {DEMO_DATE_LABEL}
        </span>
        {canInteract && (
          <button type="button" onClick={resetDemo}>
            <RotateCcw size={12} aria-hidden="true" />내 데모 초기화
          </button>
        )}
      </div>
      <CurrentSeasonCard season={data.currentSeason} />
      <SeasonLifecycle />
      <div className="season-action-grid">
        <MigrationBoard
          migration={data.migration}
          canEdit={canInteract && canUpdateOwnMigration(role)}
          onStatusChange={setMigrationStatus}
          storageAvailable={storageAvailable}
        />
        <ScenarioVote
          vote={data.vote}
          canVote={canInteract && canVoteInSeason(role)}
          onVote={setVote}
        />
      </div>
      <SeasonHistory />
    </div>
  );
}
