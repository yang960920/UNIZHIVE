"use client";
import { useRef, useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { saveReaction } from "../lib/reaction-actions";
import type { ReactionKind } from "../lib/reaction-policy";
import "./like-button.css";

export function LikeButton({
  kind,
  targetId,
  initialCount = 0,
  initialLiked = false,
  canLike = false,
}: {
  kind: ReactionKind;
  targetId: string;
  initialCount?: number;
  initialLiked?: boolean;
  canLike?: boolean;
}) {
  const key = `${kind}:${targetId}:${initialCount}:${initialLiked}`;
  const [saved, setSaved] = useState<{ key: string; count: number; liked: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const count = saved?.key === key ? saved.count : initialCount;
  const liked = saved?.key === key ? saved.liked : initialLiked;
  return (
    <span className="like-control">
      <button
        type="button"
        className="like-button"
        disabled={!canLike || pending}
        aria-pressed={liked}
        aria-label={`${liked ? "좋아요 취소" : "좋아요"} ${count}개`}
        title={
          canLike ? undefined : "승인된 멤버가 현재 공개된 항목에 좋아요를 표시할 수 있습니다."
        }
        onClick={() => {
          if (!canLike || pending || busy.current) return;
          busy.current = true;
          setMessage("");
          startTransition(async () => {
            try {
              const result = await saveReaction({ kind, targetId, liked: !liked });
              if (result.ok && result.likeCount !== undefined && result.likedByMe !== undefined)
                setSaved({ key, count: result.likeCount, liked: result.likedByMe });
              else setMessage(result.message);
            } catch {
              setMessage("연결을 확인한 뒤 다시 눌러 주세요.");
            } finally {
              busy.current = false;
            }
          });
        }}
      >
        <Heart size={16} aria-hidden="true" fill={liked ? "currentColor" : "none"} />
        <span>{count}</span>
        <span className="like-label">좋아요</span>
      </button>
      {message && (
        <span className="like-error" role="alert">
          {message}
        </span>
      )}
    </span>
  );
}
