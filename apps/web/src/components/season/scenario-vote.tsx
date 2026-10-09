"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock3, Vote } from "lucide-react";
import { Badge } from "@uniz/ui";
import type { DashboardData } from "@/lib/mocks/dashboard";
import { formatKstDate } from "@/lib/mocks/current-season";

export function ScenarioVote({
  vote,
  canVote,
  onVote,
}: {
  vote: DashboardData["vote"];
  canVote: boolean;
  onVote: (candidateId: string) => boolean;
}) {
  const [message, setMessage] = useState("");
  function select(id: string, label: string) {
    if (onVote(id)) setMessage(`${label}에 투표했습니다. 마감 전까지 선택을 변경할 수 있습니다.`);
  }
  return (
    <section className="panel scenario-vote" aria-labelledby="vote-title" id="scenario-vote">
      <div className="season-section-header">
        <div>
          <span className="eyebrow">THE NEXT CHAPTER / S{vote.nextSeasonNumber}</span>
          <h2 id="vote-title">다음 시나리오 투표</h2>
        </div>
        <Badge tone="primary">진행 중</Badge>
      </div>
      <p className="vote-intro">다음 여정은 우리가 함께 고릅니다.</p>
      <div className="vote-deadline">
        <Clock3 size={14} aria-hidden="true" />
        <span>
          마감{" "}
          <time dateTime={vote.closesAt.toISOString()}>{formatKstDate(vote.closesAt, true)}</time>
        </span>
      </div>
      <div className="vote-candidates">
        {vote.candidates.map((candidate, index) => (
          <button
            type="button"
            key={candidate.id}
            className={`scenario-vote-card ${candidate.selected ? "is-selected" : ""}`}
            aria-pressed={candidate.selected}
            aria-label={`${candidate.scenario.name}, ${candidate.votes}표${candidate.selected ? ", 내 선택" : ""}`}
            disabled={!canVote}
            onClick={() => select(candidate.id, candidate.label)}
          >
            <span className="vote-card-top">
              <span className="vote-card-number mono">
                {(index + 1).toString().padStart(2, "0")}
              </span>
              <strong>{candidate.scenario.name}</strong>
              <b className="mono">
                {candidate.votes}
                <small>표</small>
              </b>
            </span>
            <span className="vote-card-description">{candidate.scenario.description}</span>
            <span className="vote-card-meter" aria-hidden="true">
              <span style={{ width: `${candidate.percent}%` }} />
            </span>
            <span className="vote-card-bottom">
              <span>
                {candidate.selected ? (
                  <>
                    <Check size={13} aria-hidden="true" />내 선택
                  </>
                ) : canVote ? (
                  "선택하기"
                ) : (
                  "멤버 전용 투표"
                )}
              </span>
              <span className="mono">{candidate.percent}%</span>
            </span>
          </button>
        ))}
      </div>
      <div className="vote-summary">
        <span>
          <Vote size={14} aria-hidden="true" />
          <b className="mono">
            {vote.totalVotes} / {vote.totalEligible}
          </b>{" "}
          참여
        </span>
        <span>1인 1표 · 변경 가능</span>
      </div>
      {!canVote && (
        <Link className="vote-login-link" href="/login">
          로그인하고 다음 시즌 선택하기
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      )}
      <p className="season-live-message" role="status">
        {message}
      </p>
    </section>
  );
}
