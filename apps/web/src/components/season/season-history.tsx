import { Camera, History } from "lucide-react";
import { Badge } from "@uniz/ui";
import { getSeasonServerTypeLabel, getTrancePhenomenonLabel } from "@uniz/domain";
import { seasonHistory } from "@/lib/mocks/current-season";

export function SeasonHistory() {
  return (
    <section className="season-history" aria-labelledby="history-title">
      <div className="season-section-header">
        <div>
          <span className="eyebrow">OUR SHARED HISTORY</span>
          <h2 id="history-title">함께 지나온 시즌</h2>
        </div>
        <span>
          <History size={14} aria-hidden="true" />
          기록은 계속됩니다
        </span>
      </div>
      <div className="season-history-grid">
        {seasonHistory.map(
          ({ season, scenario, server, memberCount, majorOperations, topBuild }) => (
            <article
              key={season.id}
              className={`season-history-card ${season.status === "ACTIVE" ? "is-current" : ""}`}
            >
              <div
                className="season-history-art"
                role="img"
                aria-label={`시즌 ${season.seasonNumber} 대표 이미지 자리`}
              >
                <span className="history-season-ghost mono" aria-hidden="true">
                  {season.seasonNumber}
                </span>
                <span className="history-photo-label">
                  <Camera size={14} aria-hidden="true" />
                  대표 스크린샷 자리
                </span>
                <div>
                  <span className="mono">S{season.seasonNumber}</span>
                  <Badge tone={season.status === "ACTIVE" ? "primary" : "default"}>
                    {season.status === "ACTIVE" ? "진행 중" : "ARCHIVED"}
                  </Badge>
                </div>
              </div>
              <div className="season-history-content">
                <h3>{scenario.name}</h3>
                <p>
                  {getSeasonServerTypeLabel(season.serverType)} · 트랜스 현상:{" "}
                  {getTrancePhenomenonLabel(season.trancePhenomenon)}
                </p>
                <dl>
                  <div>
                    <dt>SERVER</dt>
                    <dd className="mono">{server.name}</dd>
                  </div>
                  <div>
                    <dt>MEMBERS</dt>
                    <dd>{memberCount}명</dd>
                  </div>
                  <div>
                    <dt>MAJOR OPS</dt>
                    <dd>{majorOperations}</dd>
                  </div>
                  <div>
                    <dt>TOP BUILD</dt>
                    <dd>{topBuild}</dd>
                  </div>
                </dl>
              </div>
            </article>
          ),
        )}
      </div>
      <p className="season-card-note">
        시즌과 빌드 이름은 화면 구성을 위한 예시입니다. 이전 시즌의 참가 기록과 빌드 버전은
        보관합니다.
      </p>
    </section>
  );
}
