"use client";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import "./dashboard-guide.css";
import { useUserPreferences } from "./user-preferences-provider";

export function DashboardGuide() {
  const { preferences } = useUserPreferences();
  if (!preferences.showGuide) return null;
  return (
    <figure className="dashboard-guide">
      <figcaption className="dashboard-guide-bubble">
        <p>
          원스휴먼의 <strong>최신 공식 소식</strong>을 확인해보세요!
        </p>
        <a
          className="dashboard-guide-link"
          href="https://store.steampowered.com/news/app/2139460?l=koreana"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="원스휴먼 공식 소식 보기 (새 창)"
        >
          공식 소식 보기
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </figcaption>
      <Image
        src="/brand/hive-guide.png"
        alt=""
        width={1448}
        height={1086}
        sizes="(max-width: 540px) calc(100vw - 48px), 360px"
      />
    </figure>
  );
}
