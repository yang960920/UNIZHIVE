import { ExternalLink, Users } from "lucide-react";
import { Badge, Card } from "@uniz/ui";
import type { SteamOverviewData } from "@/lib/data/steam-overview-types";
import "./steam-overview.css";

const steamNewsUrl = "https://store.steampowered.com/news/app/2139460?l=koreana";
const steamGameUrl = "https://store.steampowered.com/app/2139460/?l=koreana";

function kst(value: string, withTime = false): string {
  return (
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    }).format(new Date(value)) + (withTime ? " KST" : "")
  );
}

export function SteamOverview({ data }: { data?: SteamOverviewData }) {
  const news = data?.news;
  const players = data?.players;
  const hasCount = players?.count !== null && players?.count !== undefined;
  return (
    <Card className="external-status steam-overview-card">
      <div className="panel-heading">
        <h2 className="panel-title">원스휴먼 소식 · Steam</h2>
        <a href={steamNewsUrl} target="_blank" rel="noopener noreferrer">
          원문 <ExternalLink size={12} />
        </a>
      </div>
      <div className="steam-overview-news">
        {news?.items.length ? (
          <ul>
            {news.items.map((item) => (
              <li key={item.id}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  <strong>{item.title}</strong>
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
                <time dateTime={item.publishedAt}>{kst(item.publishedAt)}</time>
                {item.summary && <p>{item.summary}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="steam-overview-note">
            {news?.status === "LIVE"
              ? "최근 공식 소식이 없습니다. Steam에서 전체 소식을 확인해 주세요."
              : "Steam 소식을 잠시 불러오지 못했습니다. 원문에서 확인해 주세요."}
          </p>
        )}
        {news?.status === "STALE" && (
          <p className="steam-overview-note" role="status">
            소식 갱신이 지연되어 마지막으로 확인한 내용을 표시합니다.
          </p>
        )}
        {news?.observedAt && (
          <small className="steam-overview-observed">
            공식 소식 원문 · {kst(news.observedAt, true)} 확인
          </small>
        )}
      </div>
      <div className="steam-overview-players">
        <div className="steam-overview-player-heading">
          <span>
            <Users size={14} /> Steam 현재 접속자
          </span>
          <Badge tone={players?.status === "LIVE" ? "primary" : "default"}>
            {players?.status === "LIVE"
              ? "최근 조회"
              : players?.status === "STALE"
                ? "이전 기록"
                : "확인 대기"}
          </Badge>
        </div>
        <strong className="mono steam-overview-player-count">
          {hasCount ? new Intl.NumberFormat("ko-KR").format(players!.count!) : "—"}
          {hasCount && <span>명</span>}
        </strong>
        {players?.observedAt && (
          <time className="steam-overview-observed" dateTime={players.observedAt}>
            {kst(players.observedAt, true)} 조회
          </time>
        )}
        {players?.status !== "LIVE" && (
          <p className="steam-overview-note" role="status">
            {players?.status === "STALE"
              ? "갱신이 지연되어 이전 조회 수치를 표시합니다."
              : "현재 접속자 수를 확인하지 못했습니다."}
          </p>
        )}
        <a
          className="steam-overview-source"
          href={steamGameUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          출처: Steam · 다른 플랫폼 제외 <ExternalLink size={11} />
        </a>
      </div>
    </Card>
  );
}
