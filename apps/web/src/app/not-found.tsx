import Link from "next/link";
import { EmptyState, PageHeader } from "@uniz/ui";
export default function NotFound() {
  return (
    <>
      <PageHeader eyebrow="404 · LOST SIGNAL" title="길을 잃으셨나요?" />
      <EmptyState
        title="이 페이지를 찾을 수 없습니다"
        description="주소를 확인하거나 하이브 대시보드로 돌아가세요."
        action={
          <Link className="button button-primary" href="/">
            홈으로 돌아가기
          </Link>
        }
      />
    </>
  );
}
