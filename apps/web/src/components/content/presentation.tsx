"use client";
import { Fragment, useState, type ReactNode } from "react";
import Image from "next/image";
import { ExternalLink, Play } from "lucide-react";
import {
  contentImageUrl,
  parseContentDocument,
  parseYouTubeUrl,
  type ContentBlock,
  type ContentDocument,
  type ContentInline,
} from "@/lib/content-document";
import "./content.css";

function inline(parts: ContentInline[] = []): ReactNode {
  return parts.map((part, index) => {
    if (part.type === "hardBreak") return <br key={index} />;
    let value: ReactNode = part.text;
    for (const mark of part.marks ?? [])
      value =
        mark.type === "bold" ? (
          <strong>{value}</strong>
        ) : mark.type === "italic" ? (
          <em>{value}</em>
        ) : mark.type === "strike" ? (
          <s>{value}</s>
        ) : (
          <code>{value}</code>
        );
    return <Fragment key={index}>{value}</Fragment>;
  });
}
function blocks(items: ContentBlock[]): ReactNode {
  return items.map((block, index) => {
    if (block.type === "paragraph") return <p key={index}>{inline(block.content)}</p>;
    if (block.type === "heading")
      return block.attrs.level === 2 ? (
        <h2 key={index}>{inline(block.content)}</h2>
      ) : (
        <h3 key={index}>{inline(block.content)}</h3>
      );
    if (block.type === "image")
      return (
        <figure key={index}>
          <Image
            src={contentImageUrl(block.attrs.imageId)}
            alt={block.attrs.alt || "본문 이미지"}
            width={1920}
            height={1920}
            unoptimized
            loading="lazy"
          />
          {block.attrs.alt && <figcaption>{block.attrs.alt}</figcaption>}
        </figure>
      );
    if (block.type === "blockquote")
      return <blockquote key={index}>{blocks(block.content)}</blockquote>;
    const children = block.content.map((item, at) => <li key={at}>{blocks(item.content)}</li>);
    return block.type === "orderedList" ? (
      <ol key={index} start={block.attrs.start}>
        {children}
      </ol>
    ) : (
      <ul key={index}>{children}</ul>
    );
  });
}
export function ContentBody({
  document,
  text,
}: {
  document: ContentDocument | null;
  text: string;
}) {
  let value: ContentDocument | null = null;
  try {
    value = parseContentDocument(document);
  } catch {
    /* Preserve readable legacy text if stored metadata is unavailable. */
  }
  return (
    <div className="content-body">
      {value
        ? blocks(value.content)
        : text.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </div>
  );
}
export function VideoReference({ url }: { url: string | null }) {
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  let canonical: string | null;
  try {
    canonical = parseYouTubeUrl(url);
  } catch {
    return null;
  }
  if (!canonical) return null;
  const parsed = new URL(canonical);
  const videoId = parsed.searchParams.get("v")!;
  const start = parseInt(parsed.searchParams.get("t") ?? "0", 10);
  const embed = `https://www.youtube-nocookie.com/embed/${videoId}${start ? `?start=${start}` : ""}`;
  return (
    <section className="content-video" aria-label="참고 유튜브 영상">
      <header>
        <h3>참고 영상</h3>
        <a href={canonical} target="_blank" rel="noopener noreferrer">
          유튜브에서 보기 <ExternalLink size={14} />
        </a>
      </header>
      {activeUrl === canonical ? (
        <iframe
          src={embed}
          title="참고 유튜브 영상"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          className="content-video-activate"
          onClick={() => setActiveUrl(canonical)}
        >
          <Play size={24} />
          <strong>영상 불러오기</strong>
          <span>누르면 유튜브 플레이어에 연결합니다.</span>
        </button>
      )}
    </section>
  );
}
export function YouTubeField({
  name = "youtubeUrl",
  initialUrl = null,
  onChange,
  disabled = false,
}: {
  name?: string;
  initialUrl?: string | null;
  onChange?: (url: string) => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  let error = "";
  try {
    parseYouTubeUrl(url);
  } catch {
    error = "유튜브 영상 링크를 확인해 주세요.";
  }
  return (
    <div className="content-youtube-field">
      <label>
        유튜브 영상 · 선택
        <input
          name={name}
          type="url"
          value={url}
          maxLength={1000}
          placeholder="https://www.youtube.com/watch?v=…"
          disabled={disabled}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setUrl(event.target.value);
            onChange?.(event.target.value);
          }}
        />
      </label>
      <small>영상 한 개의 링크를 넣을 수 있습니다. 입력하지 않아도 글을 저장할 수 있습니다.</small>
      {error && <p role="alert">{error}</p>}
      {url && !error && <VideoReference url={url} />}
    </div>
  );
}
