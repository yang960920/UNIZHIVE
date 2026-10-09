"use client";

import { useState, type FormEvent } from "react";
import {
  emptyPartyContribution,
  type PartyContribution,
  type PartyContributionKey,
  type RSVPStatus,
} from "@uniz/domain";
import {
  PARTY_CONTRIBUTIONS,
  PARTY_SYNERGY_GUIDE,
  PARTY_VULNERABILITY_CAP,
  summarizePartySynergy,
} from "@/lib/party-synergy";
import "./party-synergy.css";

const vulnerabilityTypes = [
  { key: "weapon", label: "총기 취약" },
  { key: "status", label: "트랜스 취약" },
  { key: "melee", label: "근접 취약" },
] as const;

function percent(value: number): string {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
}

export function PartyContributionTags({
  keys,
  emptyLabel,
}: {
  keys: readonly PartyContributionKey[];
  emptyLabel?: string;
}) {
  if (!keys.length)
    return emptyLabel ? <span className="party-synergy-empty">{emptyLabel}</span> : null;
  return (
    <div className="party-synergy-tags">
      {PARTY_CONTRIBUTIONS.filter((item) => keys.includes(item.key)).map((item) => (
        <span className="party-synergy-tag" key={item.key}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function PartyRequestedContributions({
  initial = [],
}: {
  initial?: readonly PartyContributionKey[];
}) {
  return (
    <fieldset className="party-synergy-fieldset">
      <legend>함께 준비할 효과 · 선택</legend>
      <p className="party-synergy-note">
        선택하지 않으면 자유 모집입니다. 필요한 효과를 여러 개 고를 수 있으며 참가 조건이나 인원
        제한으로 사용하지 않습니다.
      </p>
      <div className="party-synergy-options">
        {PARTY_CONTRIBUTIONS.map((item) => (
          <label className="party-synergy-choice" key={item.key}>
            <input
              type="checkbox"
              name="requestedContributions"
              value={item.key}
              defaultChecked={initial.includes(item.key)}
            />
            <span>
              <strong>{item.label}</strong>
              <small>{item.examples}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PartyContributionEditor({
  initial = emptyPartyContribution(),
  disabled,
  pending,
  onSave,
}: {
  initial?: PartyContribution;
  disabled: boolean;
  pending: boolean;
  onSave: (contribution: PartyContribution) => void;
}) {
  const [keys, setKeys] = useState(initial.keys);
  const [loadoutNote, setLoadoutNote] = useState(initial.loadoutNote);
  const [vulnerability, setVulnerability] = useState({
    weapon: initial.vulnerability.weapon?.toString() ?? "",
    status: initial.vulnerability.status?.toString() ?? "",
    melee: initial.vulnerability.melee?.toString() ?? "",
  });
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending) return;
    onSave({
      keys,
      loadoutNote: loadoutNote.trim(),
      vulnerability: {
        weapon: vulnerability.weapon.trim() ? Number(vulnerability.weapon) : null,
        status: vulnerability.status.trim() ? Number(vulnerability.status) : null,
        melee: vulnerability.melee.trim() ? Number(vulnerability.melee) : null,
      },
    });
  }
  return (
    <details className="party-my-contribution">
      <summary>
        내 세팅·협동 효과 {initial.keys.length ? `· ${initial.keys.length}개 선택` : "· 선택"}
      </summary>
      <form className="party-contribution-form" onSubmit={save}>
        <fieldset className="party-synergy-fieldset" disabled={disabled || pending}>
          <legend>사용할 협동 효과</legend>
          <div className="party-synergy-options">
            {PARTY_CONTRIBUTIONS.map((item) => (
              <label className="party-synergy-choice" key={item.key}>
                <input
                  type="checkbox"
                  value={item.key}
                  checked={keys.includes(item.key)}
                  onChange={(event) =>
                    setKeys(
                      event.target.checked
                        ? [...keys, item.key]
                        : keys.filter((key) => key !== item.key),
                    )
                  }
                />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </label>
            ))}
          </div>
          <label className="party-synergy-input">
            감염물·장비와 사용 방법 · 선택
            <textarea
              rows={3}
              maxLength={240}
              value={loadoutNote}
              onChange={(event) => setLoadoutNote(event.target.value)}
              placeholder="예: 저주 인형 X 사용 / 포트리스 영역 설치 / 닥터 테디 회복·부활"
            />
          </label>
          <div className="party-vulnerability-inputs">
            {vulnerabilityTypes.map((item) => (
              <label className="party-synergy-input" key={item.key}>
                {item.label} (%)
                <input
                  type="number"
                  min={0}
                  max={PARTY_VULNERABILITY_CAP}
                  step="0.01"
                  value={vulnerability[item.key]}
                  placeholder="미입력"
                  onChange={(event) =>
                    setVulnerability({ ...vulnerability, [item.key]: event.target.value })
                  }
                />
              </label>
            ))}
          </div>
          <p className="party-synergy-note">
            취약 수치는 선택 사항입니다. 본인이 동시에 유지할 수 있는 수치를 유형별로 적고, 알 수
            없으면 비워두세요. 개인 피해 증가와 진형 버프는 제외합니다. 헌터 마크는 실제로 적에게
            부여하는 취약 효과만 포함하고, 같은 효과를 중복 입력하지 마세요. 위 효과 선택과 별도로
            수치를 입력할 수 있습니다.
          </p>
          <button type="submit" className="button button-quiet" disabled={disabled || pending}>
            {pending ? "저장 중…" : "내 세팅 저장"}
          </button>
        </fieldset>
        {disabled && (
          <p className="party-synergy-note">
            참가 또는 미정으로 응답한 뒤, 신청 마감 전에 내 세팅을 저장할 수 있습니다.
          </p>
        )}
      </form>
    </details>
  );
}

export function PartyAttendeeContribution({ contribution }: { contribution: PartyContribution }) {
  const values = vulnerabilityTypes.filter((item) => contribution.vulnerability[item.key] !== null);
  return (
    <div className="party-attendee-contribution">
      <PartyContributionTags keys={contribution.keys} emptyLabel="협동 효과 미입력" />
      {contribution.loadoutNote && <p>{contribution.loadoutNote}</p>}
      {values.length > 0 && (
        <small>
          {values
            .map((item) => `${item.label} ${percent(contribution.vulnerability[item.key]!)}%`)
            .join(" · ")}
        </small>
      )}
    </div>
  );
}

export function PartySynergySummary({
  attendees,
  requestedContributions,
}: {
  attendees: { status: RSVPStatus; contribution: PartyContribution }[];
  requestedContributions: readonly PartyContributionKey[];
}) {
  const summary = summarizePartySynergy(attendees);
  return (
    <div className="party-synergy-summary">
      <h2>함께 준비하는 효과</h2>
      <p className="party-synergy-note">
        현재 명단의 참가 확정 멤버 {summary.goingCount}명 기준입니다. 선택한 세팅을 공유하는
        안내이며 실제 전투 수치를 계산하지 않습니다.
      </p>
      {requestedContributions.length > 0 && (
        <div className="party-requested-summary">
          <span>모집자가 요청한 효과</span>
          <PartyContributionTags keys={requestedContributions} />
        </div>
      )}
      {summary.contributions.some((item) => item.count > 0) ? (
        <ul className="party-contribution-counts">
          {summary.contributions
            .filter((item) => item.count > 0)
            .map((item) => (
              <li key={item.key}>
                <span>{PARTY_CONTRIBUTIONS.find((entry) => entry.key === item.key)?.label}</span>
                <strong>{item.count}명</strong>
              </li>
            ))}
        </ul>
      ) : (
        <p className="party-synergy-empty">
          등록된 협동 효과가 없습니다. 자유롭게 참가하고 사용할 세팅을 공유해주세요.
        </p>
      )}
      <div className="party-vulnerability-summary" aria-label="참가 확정 멤버의 취약 합산">
        {vulnerabilityTypes.map((item) => {
          const value = summary.vulnerability[item.key];
          return (
            <div key={item.key}>
              <span>{item.label}</span>
              <strong>{value.enteredCount ? `${percent(value.cappedTotal)}%` : "미입력"}</strong>
              <small>
                {value.enteredCount
                  ? `${value.enteredCount}명 입력${value.rawTotal > PARTY_VULNERABILITY_CAP ? ` · 입력 합계 ${percent(value.rawTotal)}%` : ""}`
                  : "수치를 입력한 멤버 없음"}
              </small>
            </div>
          );
        })}
      </div>
      <p className="party-synergy-note">
        각 취약 유형은 참가 확정 멤버의 입력값을 합산해 최대 {PARTY_VULNERABILITY_CAP}%로
        표시합니다. 일부 멤버만 입력한 경우 실제 전체 효과와 다를 수 있습니다. 적용 범위·지속
        시간·콘텐츠 조건도 함께 확인해주세요.
      </p>
    </div>
  );
}

export function PartySynergyGuide() {
  return (
    <details className="party-synergy-guide">
      <summary>협동 효과와 적용 조건 알아보기</summary>
      <div className="party-synergy-guide-content">
        <p className="party-synergy-note">
          협동 효과는 자유롭게 준비할 수 있습니다. 취약은 유형별 합산 최대 {PARTY_VULNERABILITY_CAP}
          % 기준으로 표시하며, 이는 커뮤니티 운용 기준입니다. 장비의 개인 효과와 아군에게 공유되는
          효과를 구분해주세요.
        </p>
        {PARTY_SYNERGY_GUIDE.map((item) => (
          <article key={item.id}>
            <div>
              <h3>{item.title}</h3>
              <span>
                {item.confidence === "OFFICIAL"
                  ? "공식 자료"
                  : item.confidence === "GUIDE"
                    ? "공략 자료"
                    : "참고 자료"}
              </span>
            </div>
            <p>{item.summary}</p>
            <dl>
              <div>
                <dt>적용</dt>
                <dd>{item.scope}</dd>
              </div>
              <div>
                <dt>확인</dt>
                <dd>{item.caution}</dd>
              </div>
            </dl>
            <div className="party-synergy-sources">
              {item.sources.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.label} ↗
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}
