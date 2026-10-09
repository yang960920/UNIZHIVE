"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, PageHeader } from "@uniz/ui";
import "./auth-retry-notice.css";

function retryDelay(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.ceil(value) : 5;
}

export function AuthRetryNotice({
  retryAfterSeconds,
  onRetry,
}: {
  retryAfterSeconds?: number;
  onRetry?: () => void;
}) {
  const seconds = retryDelay(retryAfterSeconds);
  return <RetryCountdown key={seconds} seconds={seconds} onRetry={onRetry} />;
}

function RetryCountdown({ seconds, onRetry }: { seconds: number; onRetry?: () => void }) {
  const router = useRouter();
  const hintId = useId();
  const [remaining, setRemaining] = useState(seconds);
  const [retryAt, setRetryAt] = useState(() => Date.now() + seconds * 1000);
  const [pending, startTransition] = useTransition();
  const waiting = remaining > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt, waiting]);
  function retry() {
    if (waiting || pending) return;
    // If the same error returns, start a new pause instead of allowing rapid repeated requests.
    setRemaining(seconds);
    setRetryAt(Date.now() + seconds * 1000);
    startTransition(() => {
      if (onRetry) onRetry();
      else router.refresh();
    });
  }
  return (
    <div className="auth-retry-notice">
      <PageHeader
        eyebrow="CONNECTION CHECK"
        title="연결을 잠시 확인하고 있어요."
        description="잠시 후 현재 화면을 다시 불러와주세요."
      />
      <Card>
        <h2>잠시 기다려주세요.</h2>
        <p id={hintId}>
          {pending
            ? "현재 화면의 연결을 다시 확인하고 있습니다."
            : waiting
              ? `${remaining}초 뒤에 다시 확인할 수 있습니다.`
              : "현재 화면을 다시 확인할 수 있습니다."}
        </p>
        <button
          type="button"
          className="button button-primary"
          disabled={waiting || pending}
          aria-describedby={hintId}
          onClick={retry}
        >
          {pending ? "연결 확인 중…" : waiting ? `${remaining}초 후 다시 확인` : "다시 확인"}
        </button>
      </Card>
    </div>
  );
}
