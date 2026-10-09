"use client";
import { EmptyState } from "@uniz/ui";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <EmptyState
      title="연결을 다시 확인하고 있습니다"
      description="잠시 후 다시 시도해 주세요. 문제가 계속되면 서버 실행 상태를 확인하세요."
      action={
        <button className="button button-primary" onClick={retry}>
          다시 시도
        </button>
      }
    />
  );
}
