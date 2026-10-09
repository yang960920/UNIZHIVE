import { ArrowUpRight, CalendarDays } from "lucide-react";
import { Badge } from "@uniz/ui";
import { getSeasonServerTypeLabel, getTrancePhenomenonLabel } from "@uniz/domain";
import { Logo } from "@/components/logo";
import type { DashboardData } from "@/lib/mocks/dashboard";
import { formatKstDate } from "@/lib/mocks/current-season";

export function CurrentSeasonCard({ season }: { season: DashboardData["currentSeason"] }) {
  const permanent = season.serverType === "PERMANENT";
  return (
    <section className="season-hero" aria-labelledby="current-season-title">
      <div className="season-hero-main">
        <div className="season-hero-kicker">
          <span className="eyebrow">
            SEASON {season.seasonNumber.toString().padStart(2, "0")} / CURRENT
          </span>
          <Badge tone="primary">HIVE ACTIVE</Badge>
        </div>
        <h2 id="current-season-title">{season.scenario.name.toUpperCase()}</h2>
        <p>시즌이 바뀌어도 하이브는 남는다.</p>
        <p>
          {getSeasonServerTypeLabel(season.serverType)} · 트랜스 현상:{" "}
          {getTrancePhenomenonLabel(season.trancePhenomenon)}
        </p>
        <dl className="season-facts">
          <div>
            <dt>SERVER</dt>
            <dd className="mono">{season.server.name}</dd>
          </div>
          <div>
            <dt>{permanent ? "운영 시작" : "SEASON START"}</dt>
            <dd className="mono">{formatKstDate(season.startsAt)}</dd>
          </div>
          {!permanent && (
            <div>
              <dt>SETTLEMENT</dt>
              <dd className="mono">
                {formatKstDate(season.settlementAt)}{" "}
                <span>· D-{season.settlementDaysRemaining}</span>
              </dd>
            </div>
          )}
        </dl>
      </div>
      <div className="season-hero-brand">
        <Logo variant="detail" size="lg" />
        <span className="eyebrow">GROW TOGETHER. GO TOGETHER.</span>
      </div>
      <div className="season-phase-strip">
        <div className="season-phase-label">
          <CalendarDays size={15} aria-hidden="true" />
          {permanent ? (
            <span>영구 운영 · 휴식기</span>
          ) : (
            <>
              <span className="mono">
                PHASE {season.currentPhase.order} / {season.phases.length}
              </span>
              <span>{season.currentPhase.name}</span>
            </>
          )}
        </div>
        {!permanent && (
          <ol className="season-phases" aria-label="현재 시즌의 단계">
            {season.phases.map((phase) => {
              const active = phase.id === season.currentPhase.id;
              const completed = phase.order < season.currentPhase.order;
              return (
                <li
                  key={phase.id}
                  className={active ? "is-current" : completed ? "is-complete" : ""}
                  aria-current={active ? "step" : undefined}
                >
                  <span className="season-phase-bar" />
                  <span>
                    <b className="mono">{phase.order.toString().padStart(2, "0")}</b> {phase.name}
                    {active && <ArrowUpRight size={12} aria-hidden="true" />}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
